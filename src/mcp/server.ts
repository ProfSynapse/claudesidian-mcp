import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { App, TFile } from 'obsidian';
import { 
    ListResourcesRequestSchema, 
    ReadResourceRequestSchema,
    ListToolsRequestSchema,
    CallToolRequestSchema 
} from "@modelcontextprotocol/sdk/types.js";
import { ToolRegistry } from '../tools/ToolRegistry';
import { Server as NetServer, createServer } from 'net';
import { MCPSettings } from '../types';
import { VaultManager } from '../services/VaultManager';

export class BridgeMCPServer {
    private server: Server;
    private app: App;
    private toolRegistry: ToolRegistry;
    private transport: StdioServerTransport | null = null;
    private ipcServer: NetServer | null = null;
    private settings: MCPSettings;
    private vaultManager: VaultManager;

    constructor(app: App, toolRegistry: ToolRegistry, vaultManager: VaultManager, settings: MCPSettings) {
        console.log('BridgeMCPServer: constructor called');
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
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            
            try {
                const result = await this.toolRegistry.executeTool(name, args);
                
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            } catch (error) {
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

            // Create subfolders based on enabled tools
            if (this.settings.enabledMemory) {
                const memoryPath = `${rootPath}/memory`;
                if (!await this.vaultManager.folderExists(memoryPath)) {
                    await this.vaultManager.createFolder(memoryPath);
                }
            }

            if (this.settings.enabledReasoning) {
                const reasoningPath = `${rootPath}/reasoning`;
                if (!await this.vaultManager.folderExists(reasoningPath)) {
                    await this.vaultManager.createFolder(reasoningPath);
                }
            }
        } catch (error) {
            console.error('Error initializing folders:', error);
            throw error;
        }
    }

    public async start() {
        console.log('BridgeMCPServer: Starting server');
        
        try {
            // Remove folder initialization from here
            const [stdioTransport, ipcServer] = await Promise.all([
                this.startStdioTransport(),
                this.startIPCTransport()
            ]);

            this.transport = stdioTransport;
            this.ipcServer = ipcServer;
            
            console.log('BridgeMCPServer: Server started successfully');
        } catch (error) {
            console.error('BridgeMCPServer: Error starting server', error);
            throw error;
        }
    }

    private async startStdioTransport() {
        if (this.transport) {
            console.log('BridgeMCPServer: Stdio transport already running');
            return this.transport;
        }

        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.log('BridgeMCPServer: Stdio transport started successfully');
        return transport;
    }

    private async startIPCTransport(): Promise<NetServer> {
        if (this.ipcServer) {
            console.log('BridgeMCPServer: IPC server already running');
            return this.ipcServer;
        }

        return new Promise((resolve) => {
            const pipeName = '\\\\.\\pipe\\bridge_mcp';
            const server = createServer((socket) => {
                const transport = new StdioServerTransport(socket, socket);
                this.server.connect(transport);
                console.log('IPC connection established');
            });

            server.listen(pipeName, () => {
                console.log(`IPC server listening on ${pipeName}`);
                resolve(server);
            });
        });
    }

    public async stop() {
        console.log('BridgeMCPServer: Stopping server');
        if (this.transport) {
            try {
                await this.transport.close();
                this.transport = null;
                console.log('BridgeMCPServer: Server stopped successfully');
            } catch (error) {
                console.error('BridgeMCPServer: Error stopping server', error);
                throw error;
            }
        }

        if (this.ipcServer) {
            this.ipcServer.close();
            this.ipcServer = null;
        }
    }
}
