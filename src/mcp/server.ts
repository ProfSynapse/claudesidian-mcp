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
import { MCPSettings, ConversationState } from '../types';
import { VaultManager } from '../services/VaultManager';

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
    private vaultManager: VaultManager;
    private conversations: Map<string, ConversationState>;

    constructor(app: App, toolRegistry: ToolRegistry, vaultManager: VaultManager, settings: MCPSettings) {
        console.log('ClaudesidianMCPServer: constructor called');
        this.conversations = new Map();
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
            const conversationId = request.headers?.['x-conversation-id'] || 'default';
            
            try {
                // Get or initialize conversation state
                let state = this.conversations.get(conversationId);
                if (!state) {
                    state = {
                        hasInitialMemoryReview: false,
                        lastMemoryOperation: 0,
                        pendingMemoryUpdates: false,
                        conversationId
                    };
                    this.conversations.set(conversationId, state);
                }

                // Validate memory workflow
                await this.validateMemoryWorkflow(name, args, state);

                // Execute the tool
                const result = await this.toolRegistry.executeTool(name, args);

                // Update conversation state
                this.updateConversationState(name, args, state);
                
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

    private async validateMemoryWorkflow(name: string, args: any, state: ConversationState) {
        // Only check for initial memory review if it hasn't been done yet
        if (!state.hasInitialMemoryReview && name === 'manageMemory' && args.action === 'reviewIndex') {
            // Mark memory review as complete if this is a reviewIndex action
            state.hasInitialMemoryReview = true;
            return;
        }

        // If ending conversation (detected by special flag in args)
        if (args.endConversation && state.pendingMemoryUpdates) {
            throw new McpError(
                ErrorCode.InvalidRequest,
                'Must create or update memories before ending conversation'
            );
        }
    }

    private updateConversationState(name: string, args: any, state: ConversationState) {
        if (name === 'manageMemory') {
            if (args.action === 'reviewIndex') {
                state.hasInitialMemoryReview = true;
            }
            if (args.action === 'create' || args.action === 'edit') {
                state.pendingMemoryUpdates = false;
            }
            state.lastMemoryOperation = Date.now();
        } else {
            // Any non-memory tool use creates pending updates
            state.pendingMemoryUpdates = true;
        }

        // Clean up conversation if ending
        if (args.endConversation) {
            this.conversations.delete(state.conversationId);
        }
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

    private async startIPCTransport(): Promise<NetServer> {
        if (this.ipcServer) {
            console.log('ClaudesidianMCPServer: IPC server already running');
            return this.ipcServer;
        }

        return new Promise((resolve) => {
            const pipeName = '\\\\.\\pipe\\claudesidian_mcp';
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
        }
    }
}
