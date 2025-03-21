import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { App, TFile } from 'obsidian';
import { 
    ListResourcesRequestSchema, 
    ReadResourceRequestSchema,
    ListToolsRequestSchema,
    CallToolRequestSchema,
    ErrorCode,
    McpError,
    Request
} from "@modelcontextprotocol/sdk/types.js";
import { ToolRegistry } from '../tools/ToolRegistry';
import { Server as NetServer, createServer } from 'net';
import { promises as fs } from 'fs';
import { platform } from 'os';
import { MCPSettings } from '../types';
import { IVaultManager } from '../tools/interfaces/ToolInterfaces';

interface ToolCallRequest extends Request {
    params: {
        name: string;
        arguments?: Record<string, any>;
    };
    headers?: {
        'x-conversation-id'?: string;
    };
}

export class ClaudesidianMCPServer {
    private server: Server;
    private app: App;
    private toolRegistry: ToolRegistry;
    private transport: StdioServerTransport | null = null;
    private ipcServer: NetServer | null = null;
    private settings: MCPSettings;
    private vaultManager: IVaultManager;

    constructor(app: App, toolRegistry: ToolRegistry, vaultManager: IVaultManager, settings: MCPSettings) {
        console.log('ClaudesidianMCPServer: constructor called');
        this.app = app;
        this.toolRegistry = toolRegistry;
        this.vaultManager = vaultManager;
        this.settings = settings;
        this.server = new Server(
            {
                name: "claudesidian-mcp",
                version: "1.0.0"
            },
            {
                capabilities: {
                    resources: {
                        // Add specific resource capabilities
                        supportsUriTemplates: true,
                        supportsContentWatch: false,
                        supportsListWatch: false
                    },  
                    tools: {
                        // Add specific tool capabilities
                        supportsToolDescriptionMarkdown: true,
                        supportsToolArgumentsMarkdown: true
                    }
                }
            }
        );

        this.initializeHandlers();
    }

    private initializeHandlers() {
        // Handle resource listing
        this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
            const resources = await this.getVaultResources();
            return { resources };
        });

        // Handle resource reading
        this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            const { uri } = request.params;
            const content = await this.readResource(uri);
            return {
                contents: [{
                    uri,
                    text: content,
                    mimeType: "text/markdown"
                }]
            };
        });

        // Initialize tool handlers
        this.initializeToolHandlers();
    }

    private async getVaultResources() {
        const resources = [];
        const files = this.app.vault.getMarkdownFiles();
        
        for (const file of files) {
            resources.push({
                uri: `obsidian://${file.path}`,
                name: file.basename,
                mimeType: "text/markdown"
            });
        }
        
        return resources;
    }

    private async readResource(uri: string) {
        const path = uri.replace('obsidian://', '');
        const file = this.app.vault.getAbstractFileByPath(path);
        
        if (file instanceof TFile) {
            return await this.app.vault.read(file);
        }
        
        throw new Error(`Resource not found: ${uri}`);
    }

    private initializeToolHandlers() {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            const tools = this.toolRegistry.getAvailableTools().map(tool => {
                const toolInstance = this.toolRegistry.getTool(tool.name);
                return {
                    name: tool.name,
                    description: tool.description,
                    inputSchema: toolInstance.getSchema() // Use each tool's own schema definition
                };
            });
            
            return { tools };
        });

        // Handle tool execution
        this.server.setRequestHandler(CallToolRequestSchema, async (request: ToolCallRequest) => {
            const { name, arguments: args } = request.params;
            try {
                // Execute the tool
                const result = await this.toolRegistry.executeTool(name, args);
                
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            } catch (error) {
                if (error instanceof McpError) {
                    throw error;
                }
                return {
                    isError: true,
                    content: [{
                        type: "text", 
                        text: error instanceof Error ? error.message : String(error)
                    }]
                };
            }
        });
    }


    private async initializeFolders() {
        try {
            // Create root folder if it doesn't exist
            const rootPath = this.settings.rootPath.replace(/\.md$/, '');
            if (!await this.vaultManager.folderExists(rootPath)) {
                await this.vaultManager.createFolder(rootPath);
            }

        } catch (error) {
            console.error('Error initializing folders:', error);
            throw error;
        }
    }

    public async start() {
        console.log('ClaudesidianMCPServer: Starting server');
        
        try {
            // Remove folder initialization from here
            const [stdioTransport, ipcServer] = await Promise.all([
                this.startStdioTransport(),
                this.startIPCTransport()
            ]);

            this.transport = stdioTransport;
            this.ipcServer = ipcServer;
            
            console.log('ClaudesidianMCPServer: Server started successfully');
        } catch (error) {
            console.error('ClaudesidianMCPServer: Error starting server', error);
            throw error;
        }
    }

    private async startStdioTransport() {
        if (this.transport) {
            console.log('ClaudesidianMCPServer: Stdio transport already running');
            return this.transport;
        }

        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.log('ClaudesidianMCPServer: Stdio transport started successfully');
        return transport;
    }

    private getIPCPath(): string {
        return process.platform === 'win32'
            ? '\\\\.\\pipe\\claudesidian_mcp'
            : '/tmp/claudesidian_mcp.sock';
    }

    private async cleanupSocket(): Promise<void> {
        if (platform() !== 'win32') {
            try {
                await fs.unlink(this.getIPCPath());
            } catch (error) {
                // Ignore if file doesn't exist
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                    process.stderr.write(`Error cleaning up socket file: ${error}\n`);
                }
            }
        }
    }

    private async startIPCTransport(): Promise<NetServer> {
        if (this.ipcServer) {
            return this.ipcServer;
        }

        const isWindows = process.platform === 'win32';
        const ipcPath = this.getIPCPath();

        if (!isWindows) {
            await this.cleanupSocket();
        }

        return new Promise((resolve, reject) => {
            try {
                const server = createServer((socket) => {
                    try {
                        const transport = new StdioServerTransport(socket, socket);
                        this.server.connect(transport).catch(err => {
                            console.error('Error connecting transport:', err);
                        });
                    } catch (error) {
                        console.error('Error creating transport:', error);
                    }
                });

                server.on('error', (error) => {
                    console.error(`IPC server error: ${error}`);
                    if (!isWindows && (error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
                        this.cleanupSocket().then(() => {
                            try {
                                server.listen(ipcPath);
                            } catch (listenError) {
                                console.error('Error listening after cleanup:', listenError);
                                reject(listenError);
                            }
                        }).catch(cleanupError => {
                            console.error('Error cleaning up socket:', cleanupError);
                            reject(cleanupError);
                        });
                    } else {
                        reject(error);
                    }
                });

                server.listen(ipcPath, () => {
                    console.log(`IPC server listening on ${ipcPath}`);
                    if (!isWindows) {
                        fs.chmod(ipcPath, 0o666).catch(error => {
                            console.error(`Error setting socket permissions: ${error}`);
                        });
                    }
                    resolve(server);
                });
            } catch (error) {
                console.error('Error creating IPC server:', error);
                reject(error);
            }
        });
    }

    public async stop() {
        console.log('ClaudesidianMCPServer: Stopping server');
        if (this.transport) {
            try {
                await this.transport.close();
                this.transport = null;
                console.log('ClaudesidianMCPServer: Server stopped successfully');
            } catch (error) {
                console.error('ClaudesidianMCPServer: Error stopping server', error);
                throw error;
            }
        }

        if (this.ipcServer) {
            this.ipcServer.close();
            this.ipcServer = null;
            // Clean up socket file on Unix systems
            await this.cleanupSocket();
        }
    }
}
