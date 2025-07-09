import { App, Plugin } from 'obsidian';
import { IMCPServer, ServerStatus } from './types';
// import { Settings } from './settings';
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
    GetPromptRequestSchema,
    ErrorCode,
    McpError
} from '@modelcontextprotocol/sdk/types.js';
import { Server as NetServer, createServer } from 'net';
import { promises as fs } from 'fs';
import { platform } from 'os';
import { parseJsonArrays } from './utils/jsonUtils';
import { logger } from './utils/logger';
import { getErrorMessage } from './utils/errorUtils';
import { generateModeHelp, formatModeHelp } from './utils/parameterHintUtils';
import { sanitizeVaultName } from './utils/vaultUtils';
import { RequestRouter } from './handlers/RequestRouter';
import { CustomPromptStorageService } from './database/services/CustomPromptStorageService';

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
    private requestRouter!: RequestRouter;
    
    constructor(
        private app: App,
        // Plugin is not directly used but may be needed for type compatibility
        // with external code. Marking with _ and making it non-private
        _plugin: Plugin,
        private eventManager: EventManager,
        private sessionContextManager?: SessionContextManager,
        private serverName?: string,
        private customPromptStorage?: CustomPromptStorageService,
        private onToolCall?: (toolName: string, params: any) => Promise<void>
    ) {
        // Get settings from plugin
        
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
        
        // Initialize the MCP SDK server with vault-specific identifier and extended timeout
        try {
            this.server = new MCPSDKServer(
                {
                    name: serverIdentifier,
                    version: "1.0.0"
                },
                {
                    // Only set the capabilities property which is supported in ServerOptions
                    capabilities: capabilities
                }
            );
        } catch (error) {
            console.error("Error creating MCPSDKServer:", error);
            throw error;
        }

        // Initialize request router
        this.initializeRequestRouter();
        
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
     * Initialize the request router with dependencies
     */
    private initializeRequestRouter(): void {
        try {
            // Get sanitized vault name for multi-vault support
            let sanitizedVaultName = "";
            try {
                const vaultName = this.app.vault.getName();
                sanitizedVaultName = sanitizeVaultName(vaultName);
            } catch (error) {
                logger.systemWarn(`Failed to get vault name for request router: ${getErrorMessage(error)}`);
            }
            
            this.requestRouter = new RequestRouter(
                this.app,
                this.agents,
                true, // isVaultEnabled
                sanitizedVaultName,
                this.sessionContextManager,
                this.customPromptStorage
            );
        } catch (error) {
            logger.systemError(error as Error, 'Request Router Initialization');
            throw error;
        }
    }
    
    /**
     * Initialize request handlers for resources and tools
     */
    private initializeHandlers(): void {
        
        // Set up request handlers using the new RequestRouter
        
        // Handle resource listing
        this.server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
            return await this.requestRouter.handleRequest('resources/list', request);
        });

        // Handle resource reading
        this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            return await this.requestRouter.handleRequest('resources/read', request);
        });

        // Handle prompts listing
        this.server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
            return await this.requestRouter.handleRequest('prompts/list', request);
        });

        // Handle prompts get
        this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
            return await this.requestRouter.handleRequest('prompts/get', request);
        });

        // Handle tool listing
        this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
            try {
                return await this.requestRouter.handleRequest('tools/list', request);
            } catch (error) {
                console.error("Error in tool list handler:", error);
                logger.systemError(error as Error, 'Tool List Handler');
                // Return empty list in case of error to avoid timeout
                return { tools: [] };
            }
        });

        // Handle tool execution
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const parsedArgs = parseJsonArrays(request.params.arguments);
            
            // Trigger tool call hook for lazy loading
            if (this.onToolCall) {
                try {
                    await this.onToolCall(request.params.name, parsedArgs);
                } catch (error) {
                    console.warn('[MCPServer] Tool call hook failed:', error);
                }
            }
            
            // Check if this is a help request
            if (parsedArgs && parsedArgs.help === true) {
                // This is a help request
                return await this.requestRouter.handleRequest('tools/help', {
                    ...request,
                    params: {
                        ...request.params,
                        arguments: parsedArgs
                    }
                });
            }
            
            // Normal execution
            return await this.requestRouter.handleRequest('tools/call', {
                ...request,
                params: {
                    ...request.params,
                    arguments: parsedArgs
                }
            });
        });
        
        // All handlers initialized
    }
    
    /**
     * Start the MCP server
     */
    async start(): Promise<void> {
        try {
            this.status = 'starting';
            
            // Initialize all registered agents
            for (const agent of this.agents.values()) {
                await agent.initialize();
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
        } catch (error) {
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
     * Get detailed help for a specific mode
     * 
     * This method provides detailed documentation for a mode's parameters,
     * including type information, required vs. optional status, and examples.
     * 
     * @param agentName Name of the agent
     * @param modeName Name of the mode
     * @returns Formatted help string for the mode
     */
    getModeHelp(agentName: string, modeName: string): string {
        try {
            // Get the agent
            const agent = this.getAgent(agentName);
            
            // Get the mode
            const mode = agent.getMode(modeName);
            
            if (!mode) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Mode ${modeName} not found in agent ${agentName}`
                );
            }
            
            // Get the mode's parameter schema
            const schema = mode.getParameterSchema();
            
            // Generate mode help
            const help = generateModeHelp(
                modeName,
                mode.description,
                schema
            );
            
            // Format and return the help
            return formatModeHelp(help);
        } catch (error) {
            if (error instanceof McpError) {
                throw error;
            }
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to get help for agent ${agentName} mode ${modeName}`,
                error
            );
        }
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
            const originalSessionId = params.sessionId;
            
            if (this.sessionContextManager && params.sessionId) {
                // Process the session ID
                try {
                    // We no longer generate new IDs for existing session IDs
                    // This allows clients to provide their own valid session IDs
                    params.sessionId = await this.sessionContextManager.validateSessionId(params.sessionId);
                    // Check if the session ID changed (should only happen if original was empty)
                    // sessionId has changed if it's different from the original
                } catch (error) {
                    logger.systemWarn(`Session validation failed: ${getErrorMessage(error)}. Using original ID`);
                }
                
                // Apply workspace context
                params = this.sessionContextManager.applyWorkspaceContext(params.sessionId, params);
            }
            
            // Execute the mode on the agent
            const result = await agent.executeMode(mode, params);
            
            // Update the SessionContextManager with the result's workspace context
            if (this.sessionContextManager && params.sessionId && result.workspaceContext) {
                this.sessionContextManager.updateFromResult(params.sessionId, result);
            }
            
            // Check if we need to add session instructions (same logic as requestHandlers.ts)
            const needsInstructions = (params._isNewSession || params._isNonStandardId) && 
                                   result && 
                                   this.sessionContextManager && 
                                   !this.sessionContextManager.hasReceivedInstructions(params.sessionId);
            
            if (needsInstructions) {
                // Add session instructions to guide the LLM
                if (params._isNonStandardId && params._originalSessionId) {
                    result.sessionIdCorrection = {
                        originalId: params._originalSessionId,
                        correctedId: params.sessionId,
                        message: "Your session ID has been standardized. Please use this corrected session ID for all future requests in this conversation."
                    };
                } else if (params._isNewSession && !originalSessionId) {
                    result.newSessionInfo = {
                        sessionId: params.sessionId,
                        message: "A new session has been created. This ID must be used for all future requests in this conversation."
                    };
                }
                
                // Mark this session as having received instructions
                if (this.sessionContextManager) {
                    this.sessionContextManager.markInstructionsReceived(params.sessionId);
                }
            }
            
            // Only add session ID info if a new session was auto-generated from an empty ID
            // Do NOT add session info for existing IDs that weren't in the database
            if (params._autoGeneratedSessionId && result && !originalSessionId) {
                result.newSessionId = params.sessionId;
                result.validSessionInfo = {
                    originalId: null,
                    newId: params.sessionId,
                    message: "No session ID was provided. A new session has been created. Please use this session ID for future requests."
                };
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
