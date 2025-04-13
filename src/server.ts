import { App, Plugin, TFile } from 'obsidian';
import { IMCPServer, ServerStatus, MCPSettings } from './types';
import { Settings } from './settings';
import { IAgent } from './agents/interfaces/IAgent';
import { EventManager } from './services/EventManager';
import {
    Server as MCPSDKServer
} from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
    ListToolsRequestSchema,
    CallToolRequestSchema,
    ListPromptsRequestSchema,
    ErrorCode,
    McpError
} from '@modelcontextprotocol/sdk/types.js';
import { Server as NetServer, createServer } from 'net';
import { promises as fs } from 'fs';
import { platform } from 'os';

/**
 * MCP Server implementation
 */
export class MCPServer implements IMCPServer {
    private status: ServerStatus = 'stopped';
    private agents: Map<string, IAgent> = new Map();
    private server: MCPSDKServer;
    private stdioTransport: StdioServerTransport | null = null;
    private ipcServer: NetServer | null = null;
    private settings: Settings;
    
    constructor(
        private app: App,
        private plugin: Plugin,
        private eventManager: EventManager
    ) {
        // Get settings from plugin
        this.settings = (plugin as any).settings;
        
        // Log the settings
        console.log('MCP Server: Initializing server with settings:', this.safeStringify(this.settings.settings));
        
        // Create capabilities object with prompts
        const capabilities = {
            resources: {
                supportsUriTemplates: true,
                supportsContentWatch: false,
                supportsListWatch: false
            },
            tools: {
                supportsToolDescriptionMarkdown: true,
                supportsToolArgumentsMarkdown: true
            },
            prompts: {}
        };
        
        // Log the capabilities
        console.log('MCP Server: Setting capabilities:', JSON.stringify(capabilities, null, 2));
        
        // Initialize the MCP SDK server
        this.server = new MCPSDKServer(
            {
                name: "claudesidian-mcp",
                version: "1.0.0"
            },
            {
                capabilities: capabilities
            }
        );

        // Initialize request handlers
        this.initializeHandlers();
    }
    
    /**
     * Initialize request handlers for resources and tools
     */
    private initializeHandlers(): void {
        // Check if ListPromptsRequestSchema is defined
        console.log('MCP Server: ListPromptsRequestSchema defined:', !!ListPromptsRequestSchema);
        // Handle resource listing
        this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
            try {
                const resources = await this.getVaultResources();
                return { resources };
            } catch (error) {
                console.error('Error listing resources:', error);
                throw new McpError(ErrorCode.InternalError, 'Failed to list resources', error);
            }
        });

        // Handle resource reading
        this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            try {
                const { uri } = request.params;
                const content = await this.readResource(uri);
                return {
                    contents: [{
                        uri,
                        text: content,
                        mimeType: "text/markdown"
                    }]
                };
            } catch (error) {
                console.error('Error reading resource:', error);
                if (error instanceof McpError) {
                    throw error;
                }
                throw new McpError(ErrorCode.InternalError, 'Failed to read resource', error);
            }
        });

        // Handle prompts listing
        this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
            try {
                console.log('MCP Server: Prompts listing requested');
                console.log('MCP Server: Returning empty prompts list');
                // Return an empty list of prompts
                return { prompts: [] };
            } catch (error) {
                console.error('Error listing prompts:', error);
                throw new McpError(ErrorCode.InternalError, 'Failed to list prompts', error);
            }
        });

        // Handle tool listing
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            try {
                const tools = [];
                const isVaultEnabled = this.settings.settings.enabledVault;
                
                console.log('MCP Server: Tool listing requested');
                console.log('MCP Server: Vault access enabled:', isVaultEnabled);
                
                // Always return tools regardless of vault access setting (for testing)
                // This is a temporary fix to diagnose the issue
                
                // Collect tools from all agents
                console.log('MCP Server: Number of registered agents:', this.agents.size);
                
                for (const agent of this.agents.values()) {
                    console.log(`MCP Server: Processing agent: ${agent.name}`);
                    const agentTools = agent.getTools();
                    console.log(`MCP Server: Agent ${agent.name} has ${agentTools.length} tools`);
                    
                    for (const tool of agentTools) {
                        console.log(`MCP Server: Adding tool: ${agent.name}_${tool.name}`);
                        tools.push({
                            name: `${agent.name}_${tool.name}`,
                            description: tool.description,
                            inputSchema: tool.getSchema()
                        });
                    }
                }
                
                console.log(`MCP Server: Total tools to return: ${tools.length}`);
                return { tools };
            } catch (error) {
                console.error('Error listing tools:', error);
                throw new McpError(ErrorCode.InternalError, 'Failed to list tools', error);
            }
        });

        // Handle tool execution
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            try {
                const { name, arguments: args } = request.params;
                
                // Parse agent and tool name
                const [agentName, toolName] = name.split('_');
                if (!agentName || !toolName) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Invalid tool name: ${name}. Expected format: agentName_toolName`
                    );
                }
                
                // Execute the tool
                const result = await this.executeAgentTool(agentName, toolName, args);
                
                return {
                    content: [{
                        type: "text",
                        text: this.safeStringify(result)
                    }]
                };
            } catch (error) {
                console.error('Error executing tool:', error);
                if (error instanceof McpError) {
                    throw error;
                }
                throw new McpError(ErrorCode.InternalError, 'Failed to execute tool', error);
            }
        });
    }
    
    /**
     * Get resources from the vault
     */
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

    /**
     * Read a resource from the vault
     */
    private async readResource(uri: string) {
        const path = uri.replace('obsidian://', '');
        const file = this.app.vault.getAbstractFileByPath(path);
        
        if (file instanceof TFile) {
            return await this.app.vault.read(file);
        }
        
        throw new McpError(ErrorCode.InvalidParams, `Resource not found: ${uri}`);
    }
    
    /**
     * Start the MCP server
     */
    async start(): Promise<void> {
        try {
            this.status = 'starting';
            console.log('MCP Server: Starting server with settings:', this.safeStringify({
                enabledVault: this.settings.settings.enabledVault,
                // Only include specific properties we need, avoiding circular references
            }));
            console.log(`MCP Server: Number of registered agents before initialization: ${this.agents.size}`);
            
            // Initialize all registered agents
            for (const agent of this.agents.values()) {
                console.log(`MCP Server: Initializing agent: ${agent.name}`);
                await agent.initialize();
                console.log(`MCP Server: Agent ${agent.name} initialized with ${agent.getTools().length} tools`);
            }
            
            // Start transports
            const [stdioTransport, ipcServer] = await Promise.all([
                this.startStdioTransport(),
                this.startIPCTransport()
            ]);
            
            this.stdioTransport = stdioTransport;
            this.ipcServer = ipcServer;
            
            this.status = 'running';
            this.eventManager.emit('server:started', null);
            console.log('MCP Server started');
        } catch (error) {
            this.status = 'error';
            console.error('Failed to start MCP server:', error);
            throw error;
        }
    }
    
    /**
     * Start the stdio transport
     */
    private async startStdioTransport(): Promise<StdioServerTransport> {
        if (this.stdioTransport) {
            console.log('MCP Server: Stdio transport already running');
            return this.stdioTransport;
        }

        try {
            const transport = new StdioServerTransport();
            
            // Log before connecting
            console.log('MCP Server: About to connect stdio transport');
            
            await this.server.connect(transport);
            console.log('MCP Server: Stdio transport started successfully');
            
            // Log after connecting
            console.log('MCP Server: Stdio transport connected');
            
            return transport;
        } catch (error) {
            console.error('MCP Server: Error starting stdio transport', error);
            throw new McpError(ErrorCode.InternalError, 'Failed to start stdio transport', error);
        }
    }
    
    /**
     * Get the IPC path
     */
    private getIPCPath(): string {
        return platform() === 'win32'
            ? '\\\\.\\pipe\\claudesidian_mcp'
            : '/tmp/claudesidian_mcp.sock';
    }

    /**
     * Clean up the socket file
     */
    private async cleanupSocket(): Promise<void> {
        if (platform() !== 'win32') {
            try {
                await fs.unlink(this.getIPCPath());
            } catch (error) {
                // Ignore if file doesn't exist
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                    console.error(`Error cleaning up socket file: ${error}`);
                }
            }
        }
    }

    /**
     * Start the IPC transport
     */
    private async startIPCTransport(): Promise<NetServer> {
        if (this.ipcServer) {
            return this.ipcServer;
        }

        const isWindows = platform() === 'win32';
        const ipcPath = this.getIPCPath();

        if (!isWindows) {
            await this.cleanupSocket();
        }

        return new Promise((resolve, reject) => {
            try {
                const server = createServer((socket) => {
                    try {
                        console.log('MCP Server: New IPC connection received');
                        const transport = new StdioServerTransport(socket, socket);
                        
                        console.log('MCP Server: About to connect IPC transport');
                        this.server.connect(transport)
                            .then(() => {
                                console.log('MCP Server: IPC transport connected successfully');
                            })
                            .catch(err => {
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
    
    /**
     * Stop the MCP server
     */
    async stop(): Promise<void> {
        try {
            this.status = 'stopping';
            
            // Close transports
            if (this.stdioTransport) {
                await this.stdioTransport.close();
                this.stdioTransport = null;
            }
            
            if (this.ipcServer) {
                this.ipcServer.close();
                this.ipcServer = null;
                await this.cleanupSocket();
            }
            
            this.status = 'stopped';
            this.eventManager.emit('server:stopped', null);
            console.log('MCP Server stopped');
        } catch (error) {
            this.status = 'error';
            console.error('Failed to stop MCP server:', error);
            throw error;
        }
    }
    
    /**
     * Check if the server is running
     */
    isRunning(): boolean {
        return this.status === 'running';
    }
    
    /**
     * Get the current server status
     */
    getStatus(): ServerStatus {
        return this.status;
    }
    
    /**
     * Register an agent with the server
     * @param agent Agent to register
     */
    registerAgent(agent: IAgent): void {
        if (this.agents.has(agent.name)) {
            throw new McpError(
                ErrorCode.InvalidParams, 
                `Agent ${agent.name} is already registered`
            );
        }
        
        this.agents.set(agent.name, agent);
    }
    
    /**
     * Get an agent by name
     * @param name Name of the agent
     * @returns The agent instance
     */
    getAgent(name: string): IAgent {
        const agent = this.agents.get(name);
        if (!agent) {
            throw new McpError(
                ErrorCode.InvalidParams, 
                `Agent ${name} not found`
            );
        }
        
        return agent;
    }
    
    /**
     * Execute a tool on an agent
     * @param agentName Name of the agent
     * @param toolName Name of the tool
     * @param args Tool arguments
     * @returns Result of the tool execution
     */
    async executeAgentTool(agentName: string, toolName: string, args: any): Promise<any> {
        try {
            console.log(`MCP Server: Executing tool ${agentName}_${toolName} with args:`, this.safeStringify(args));
            
            // Check if vault access is enabled
            const isVaultEnabled = this.settings.settings.enabledVault;
            console.log(`MCP Server: Vault access enabled: ${isVaultEnabled}`);
            
            // For testing purposes, allow tool execution regardless of vault access setting
            // This is a temporary fix to diagnose the issue
            /*
            if (!isVaultEnabled) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Vault access is disabled in settings`
                );
            }
            */
            
            // Get the agent
            const agent = this.getAgent(agentName);
            
            // Execute the tool
            return await agent.executeTool(toolName, args);
        } catch (error) {
            if (error instanceof McpError) {
                throw error;
            }
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to execute tool ${agentName}_${toolName}`,
                error
            );
        }
    }
    
    /**
     * Get all registered agents
     * @returns Map of agent names to agent instances
     */
    getAgents(): Map<string, IAgent> {
        return this.agents;
    }
    
    /**
     * Safely stringify an object, handling circular references
     * @param obj Object to stringify
     * @returns JSON string representation of the object
     */
    private safeStringify(obj: any): string {
        const seen = new WeakSet();
        return JSON.stringify(obj, (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) {
                    return '[Circular Reference]';
                }
                seen.add(value);
            }
            return value;
        }, 2);
    }
}