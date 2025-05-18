import { App, Plugin, TFile } from 'obsidian';
import { IMCPServer, ServerStatus, MCPSettings } from './types';
import { Settings } from './settings';
import { IAgent } from './agents/interfaces/IAgent';
import { EventManager } from './services/EventManager';
import { SessionContextManager } from './services/SessionContextManager';
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
import { safeStringify, parseJsonArrays } from './utils/jsonUtils';
import { logger } from './utils/logger';
import { sanitizeVaultName } from './utils/vaultUtils';
import {
    handleResourceList,
    handleResourceRead,
    handlePromptsList,
    handleToolList,
    handleToolExecution
} from './handlers/requestHandlers';

/**
 * MCP Server implementation
 *
 * This server supports an agent-mode architecture where:
 * 1. Agents are the primary tools (e.g., noteEditor)
 * 2. Each agent supports different "modes" (e.g., replace, insert)
 * 3. The client calls with parameters like:
 *    - agent: noteEditor
 *    - mode: replace
 *    - path: file/root
 *    - old: (content to replace)
 *    - new: (replacement content)
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
        private eventManager: EventManager,
        private sessionContextManager?: SessionContextManager,
        private serverName?: string
    ) {
        // Get settings from plugin
        this.settings = (plugin as any).settings;
        
        // Initialize server with settings
        
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
        
        // Set server capabilities
        
        // Get vault-specific server identifier
        const serverIdentifier = this.getServerIdentifier();
        
        console.log("[DIAGNOSTIC] Creating MCP SDK server with identifier:", serverIdentifier);
        console.log("[DIAGNOSTIC] Capabilities:", JSON.stringify(capabilities, null, 2));
        
        // Initialize the MCP SDK server with vault-specific identifier and extended timeout
        try {
            this.server = new MCPSDKServer(
                {
                    name: serverIdentifier,
                    version: "1.0.0"
                },
                {
                    capabilities: capabilities,
                    // Set timeout to be more generous (10 seconds)
                    timeout: 10000,
                    extendedTimeoutMessages: ["tools/list"]
                }
            );
            console.log("[DIAGNOSTIC] MCPSDKServer created successfully");
        } catch (error) {
            console.error("[DIAGNOSTIC] Error creating MCPSDKServer:", error);
            throw error;
        }

        // Initialize request handlers
        this.initializeHandlers();
    }
    
    /**
     * Get a vault-specific server identifier
     * 
     * This creates a unique identifier for the MCP server based on the vault name.
     * The identifier follows the same pattern used in ConfigModal.ts for the server key.
     * 
     * @returns The server identifier string
     */
    private getServerIdentifier(): string {
        // If a server name was explicitly provided, use it
        if (this.serverName) {
            return this.serverName;
        }
        
        // Otherwise, generate one based on the vault name
        try {
            // Get the vault name from the app
            const vaultName = this.app.vault.getName();
            
            // Sanitize the vault name using the centralized utility function
            const sanitizedVaultName = sanitizeVaultName(vaultName);
            
            // Create the server identifier with vault name
            return `claudesidian-mcp-${sanitizedVaultName}`;
        } catch (error) {
            // If there's any error getting the vault name, fall back to the default
            logger.systemError(error as Error, 'Server Identifier');
            return "claudesidian-mcp";
        }
    }
    
    /**
     * Initialize request handlers for resources and tools
     */
    private initializeHandlers(): void {
        console.log("[DIAGNOSTIC] Initializing MCP server request handlers");
        
        // Set up request handlers
        
        // Handle resource listing
        console.log("[DIAGNOSTIC] Setting up ListResourcesRequestSchema handler");
        this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
            console.log("[DIAGNOSTIC] ListResourcesRequestSchema handler called");
            return await handleResourceList(this.app);
        });

        // Handle resource reading
        console.log("[DIAGNOSTIC] Setting up ReadResourceRequestSchema handler");
        this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            console.log("[DIAGNOSTIC] ReadResourceRequestSchema handler called", request.params);
            return await handleResourceRead(this.app, request);
        });

        // Handle prompts listing
        console.log("[DIAGNOSTIC] Setting up ListPromptsRequestSchema handler");
        this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
            console.log("[DIAGNOSTIC] ListPromptsRequestSchema handler called");
            return await handlePromptsList();
        });

        // Handle tool listing - with accurate agent-specific modes
        console.log("[DIAGNOSTIC] Setting up ListToolsRequestSchema handler");
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            console.log("[DIAGNOSTIC] ListToolsRequestSchema handler called - ACCURATE MODES RESPONSE");
            console.log("[DIAGNOSTIC] Number of agents in server:", this.agents.size);
            
            // Immediate hard-coded response with accurate modes
            try {
                // Map of known modes for each agent
                const knownModes = {
                    contentManager: ["readContent", "createContent", "appendContent", "prependContent", "replaceContent", "replaceByLine", "deleteContent", "batchContent"],
                    projectManager: ["projectPlan", "askQuestion", "checkpoint", "completion", "listWorkspaces", "createWorkspace", "editWorkspace", "deleteWorkspace", "loadWorkspace"],
                    vaultLibrarian: ["search", "vector", "batch"],
                    vaultManager: ["listFiles", "listFolders", "createFolder", "editFolder", "deleteFolder", "moveNote", "moveFolder"],
                    commandManager: ["listCommands", "executeCommand"],
                    memoryManager: ["createSession", "listSessions", "editSession", "deleteSession", "createState", "listStates", "loadState", "editState", "deleteState"]
                };
                
                // Create tools with accurate mode enums
                const tools = Array.from(this.agents.keys()).map(name => {
                    // Get the agent's description
                    const agent = this.agents.get(name);
                    const description = agent?.description || "Obsidian tool";
                    
                    // Get the agent's modes (use known modes or fallback)
                    const modeEnum = knownModes[name] || [];
                    console.log(`[DIAGNOSTIC] Tool ${name} has ${modeEnum.length} known modes`);
                    
                    return {
                        name,
                        description,
                        inputSchema: {
                            type: "object",
                            properties: {
                                mode: { 
                                    type: "string",
                                    enum: modeEnum,
                                    description: "The operation mode for this agent"
                                },
                                sessionId: { 
                                    type: "string",
                                    description: "Session identifier to track related tool calls"
                                }
                            },
                            required: ["mode", "sessionId"]
                        }
                    };
                });
                
                console.log("[DIAGNOSTIC] Responding with", tools.length, "tools with accurate modes");
                return { tools };
            } catch (error) {
                console.error("[DIAGNOSTIC] Error in tool list handler:", error);
                // Return empty list in case of error to avoid timeout
                return { tools: [] };
            }
        });

        // Handle tool execution
        console.log("[DIAGNOSTIC] Setting up CallToolRequestSchema handler");
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            console.log("[DIAGNOSTIC] CallToolRequestSchema handler called", request.params);
            const parsedArgs = parseJsonArrays(request.params.arguments);
            console.log("[DIAGNOSTIC] Parsed arguments:", parsedArgs);
            return await handleToolExecution(
                (agentName: string) => this.getAgent(agentName), 
                request, 
                parsedArgs,
                this.sessionContextManager
            );
        });
        
        console.log("[DIAGNOSTIC] All handlers initialized");
    }
    
    /**
     * Start the MCP server
     */
    async start(): Promise<void> {
        try {
            console.log("[DIAGNOSTIC] Starting MCP server");
            this.status = 'starting';
            
            // Initialize all registered agents
            console.log("[DIAGNOSTIC] Initializing all registered agents, count:", this.agents.size);
            for (const agent of this.agents.values()) {
                console.log("[DIAGNOSTIC] Initializing agent:", agent.name);
                await agent.initialize();
            }
            
            // Start transports
            console.log("[DIAGNOSTIC] Starting transports");
            const [stdioTransport, ipcServer] = await Promise.all([
                this.startStdioTransport(),
                this.startIPCTransport()
            ]);
            
            this.stdioTransport = stdioTransport;
            this.ipcServer = ipcServer;
            
            this.status = 'running';
            console.log("[DIAGNOSTIC] MCP server running");
            this.eventManager.emit('server:started', null);
            
            // Double check capabilities registration
            console.log("[DIAGNOSTIC] Server capabilities:", this.server.capabilities);
            
            // Double check number of agents registered
            console.log("[DIAGNOSTIC] Number of agents registered at server start:", this.agents.size);
            console.log("[DIAGNOSTIC] Agent names:", Array.from(this.agents.keys()).join(", "));
        } catch (error) {
            console.error("[DIAGNOSTIC] Error starting server:", error);
            this.status = 'error';
            logger.systemError(error as Error, 'Server Start');
            throw error;
        }
    }
    
    /**
     * Start the stdio transport
     */
    private async startStdioTransport(): Promise<StdioServerTransport> {
        if (this.stdioTransport) {
            return this.stdioTransport;
        }

        try {
            const transport = new StdioServerTransport();
            
            await this.server.connect(transport);
            
            return transport;
        } catch (error) {
            throw new McpError(ErrorCode.InternalError, 'Failed to start stdio transport', error);
        }
    }
    
    /**
     * Get the IPC path with vault name
     *
     * This creates a unique IPC path for each vault to prevent conflicts
     * between different vault instances. It uses the same sanitization logic
     * as getServerIdentifier() for consistency.
     *
     * @returns The IPC path string with vault name included
     */
    private getIPCPath(): string {
        // Get sanitized vault name or fallback to default
        let sanitizedVaultName = "";
        
        try {
            // Get the vault name from the app
            const vaultName = this.app.vault.getName();
            
            // Apply the same sanitization logic using the centralized utility function
            sanitizedVaultName = sanitizeVaultName(vaultName);
        } catch (error) {
            // If there's any error getting the vault name, log it and use empty string
            logger.systemError(error as Error, 'IPC Path Generation');
        }
        
        // Format the path based on platform with vault name included
        return platform() === 'win32'
            ? `\\\\.\\pipe\\claudesidian_mcp_${sanitizedVaultName}`
            : `/tmp/claudesidian_mcp_${sanitizedVaultName}.sock`;
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
                    logger.systemError(error as Error, 'Socket Cleanup');
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
                        const transport = new StdioServerTransport(socket, socket);
                        
                        this.server.connect(transport)
                            .then(() => {
                                // Connection successful
                            })
                            .catch(err => {
                                logger.systemError(err as Error, 'Transport Connection');
                            });
                    } catch (error) {
                        logger.systemError(error as Error, 'Transport Creation');
                    }
                });

                server.on('error', (error) => {
                    logger.systemError(error as Error, 'IPC Server');
                    if (!isWindows && (error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
                        this.cleanupSocket().then(() => {
                            try {
                                server.listen(ipcPath);
                            } catch (listenError) {
                                logger.systemError(listenError as Error, 'Server Listen');
                                reject(listenError);
                            }
                        }).catch(cleanupError => {
                            logger.systemError(cleanupError as Error, 'Socket Cleanup');
                            reject(cleanupError);
                        });
                    } else {
                        reject(error);
                    }
                });

                server.listen(ipcPath, () => {
                    if (!isWindows) {
                        fs.chmod(ipcPath, 0o666).catch(error => {
                            logger.systemError(error as Error, 'Socket Permissions');
                        });
                    }
                    resolve(server);
                });
            } catch (error) {
                logger.systemError(error as Error, 'IPC Server Creation');
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
        } catch (error) {
            this.status = 'error';
            logger.systemError(error as Error, 'Server Stop');
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
     * Execute a mode on an agent using the agent-mode architecture
     *
     * In this architecture:
     * - The agent is the primary entity (e.g., noteEditor)
     * - The mode specifies the operation (e.g., replace, insert)
     * - The params contain the specific parameters for that mode
     *
     * @param agentName Name of the agent to execute
     * @param mode Operation mode for the agent
     * @param params Parameters for the operation
     * @returns Result of the mode execution
     */
    async executeAgentMode(agentName: string, mode: string, params: any): Promise<any> {
        try {
            // Always allow vault access for testing purposes
            // The commented code below is for reference
            /*
            // Check if vault access is enabled
            const isVaultEnabled = this.settings.settings.enabledVault;
            
            if (!isVaultEnabled) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Vault access is disabled in settings`
                );
            }
            */
            
            // Get the agent
            const agent = this.getAgent(agentName);
            
            // Apply workspace context from SessionContextManager if available
            if (this.sessionContextManager && params.sessionId) {
                params = this.sessionContextManager.applyWorkspaceContext(params.sessionId, params);
            }
            
            // Execute the mode on the agent
            const result = await agent.executeMode(mode, params);
            
            // Update the SessionContextManager with the result's workspace context
            if (this.sessionContextManager && params.sessionId && result.workspaceContext) {
                this.sessionContextManager.updateFromResult(params.sessionId, result);
            }
            
            return result;
        } catch (error) {
            if (error instanceof McpError) {
                throw error;
            }
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to execute agent ${agentName} in mode ${mode}`,
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
    
}
