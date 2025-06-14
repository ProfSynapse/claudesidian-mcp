import { App, Plugin } from 'obsidian';
import ClaudesidianPlugin from './main';
import { MCPServer } from './server';
import { EventManager } from './services/EventManager';
import { AgentManager } from './services/AgentManager';
import { SessionContextManager, WorkspaceContext } from './services/SessionContextManager';
import {
    ContentManagerAgent,
    CommandManagerAgent,
    ProjectManagerAgent,
    VaultManagerAgent,
    VaultLibrarianAgent,
    MemoryManagerAgent,
    VectorManagerAgent
} from './agents';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { logger } from './utils/logger';

/**
 * Interface for agent-mode tool call parameters
 */
export interface AgentModeParams {
    agent: string;
    mode: string;
    params: Record<string, any>;
}

/**
 * MCP Connector
 * Connects the plugin to the MCP server and initializes all agents
 */
export class MCPConnector {
    private server: MCPServer;
    private agentManager: AgentManager;
    private eventManager: EventManager;
    private sessionContextManager: SessionContextManager;
    
    constructor(
        private app: App,
        private plugin: Plugin | ClaudesidianPlugin
    ) {
        this.eventManager = new EventManager();
        this.sessionContextManager = new SessionContextManager();
        this.agentManager = new AgentManager(app, plugin, this.eventManager);
        
        // Inject memory service if available
        if (this.plugin && (this.plugin as any).services) {
            const services = (this.plugin as any).services;
            if (services.memoryService) {
                this.sessionContextManager.setMemoryService(services.memoryService);
            }
        }
        
        // Create server with vault-specific identifier
        this.server = new MCPServer(app, plugin, this.eventManager, this.sessionContextManager);
        
        // Initialize agents
        this.initializeAgents();
    }
    
    /**
     * Initialize all agents
     */
    private initializeAgents(): void {
        try {
            // Get services from the plugin if available
            const services = this.plugin && (this.plugin as any).services ? (this.plugin as any).services : {};
            const memoryService = services.memoryService;
            // Get vector store for initialization
            const vectorStore = services.vectorStore;
            
            // Get memory settings to determine what to enable
            const memorySettings = this.plugin && (this.plugin as any).settings?.settings?.memory;
            const isMemoryEnabled = memorySettings?.enabled && memorySettings?.embeddingsEnabled;
            
            console.log(`Memory/embeddings enabled: ${isMemoryEnabled}`);
            
            // Always register these agents (no vector database dependency)
            const contentManagerAgent = new ContentManagerAgent(
                this.app, 
                this.plugin as ClaudesidianPlugin
            );
            
            const commandManagerAgent = new CommandManagerAgent(
                this.app, 
                memoryService
            );
            
            const projectManagerAgent = new ProjectManagerAgent(
                this.app, 
                this.plugin
            );
            
            const vaultManagerAgent = new VaultManagerAgent(
                this.app
            );
            
            // Always register VaultLibrarian (has non-vector modes like search)
            const vaultLibrarianAgent = new VaultLibrarianAgent(
                this.app,
                isMemoryEnabled  // Pass memory enabled status to control mode registration
            );
            
            // If memory is enabled, initialize vector capabilities
            if (isMemoryEnabled && vectorStore) {
                console.log('Setting vector store in VaultLibrarian during initialization');
                vaultLibrarianAgent.initializeSearchService().catch(error => 
                    console.error('Error initializing VaultLibrarian search service:', error)
                );
                
                // Update VaultLibrarian with memory settings
                if (memorySettings) {
                    vaultLibrarianAgent.updateSettings(memorySettings);
                }
            }
            
            // Register core agents
            this.agentManager.registerAgent(contentManagerAgent);
            this.agentManager.registerAgent(commandManagerAgent);
            this.agentManager.registerAgent(projectManagerAgent);
            this.agentManager.registerAgent(vaultManagerAgent);
            this.agentManager.registerAgent(vaultLibrarianAgent);
            
            // Conditionally register memory-only agents
            if (isMemoryEnabled) {
                
                // Initialize memory manager with error handling
                let memoryManagerAgent;
                try {
                    memoryManagerAgent = new MemoryManagerAgent(
                        this.app,
                        this.plugin
                    );
                    this.agentManager.registerAgent(memoryManagerAgent);
                } catch (error) {
                    console.error("Error creating MemoryManagerAgent:", error);
                    console.warn("Will continue without memory manager");
                }
                
                // Initialize vector manager with error handling
                let vectorManagerAgent;
                try {
                    vectorManagerAgent = new VectorManagerAgent(
                        this.plugin
                    );
                    this.agentManager.registerAgent(vectorManagerAgent);
                } catch (error) {
                    console.error("Error creating VectorManagerAgent:", error);
                    console.warn("Will continue without vector manager");
                }
            } else {
                console.log("Memory/embeddings disabled - skipping vector-dependent agents (VaultLibrarian, MemoryManager, VectorManager)");
            }
            
            // Register all agents from the agent manager with the server
            this.registerAgentsWithServer();
        } catch (error) {
            if (error instanceof McpError) {
                throw error;
            }
            logger.systemError(error as Error, 'Agent Initialization');
            throw new McpError(
                ErrorCode.InternalError,
                'Failed to initialize agents',
                error
            );
        }
    }
    
    /**
     * Register all agents from the agent manager with the server
     */
    private registerAgentsWithServer(): void {
        try {
            const agents = this.agentManager.getAgents();
            
            for (const agent of agents) {
                this.server.registerAgent(agent);
            }
        } catch (error) {
            if (error instanceof McpError) {
                throw error;
            }
            logger.systemError(error as Error, 'Agent Registration');
            throw new McpError(
                ErrorCode.InternalError,
                'Failed to register agents with server',
                error
            );
        }
    }
    
    /**
     * Call a tool using the new agent-mode architecture
     *
     * @param params The agent, mode, and parameters for the tool call
     * @returns Promise that resolves with the result of the tool call
     *
     * @example
     * // Call the contentManager agent in replaceContent mode
     * connector.callTool({
     *   agent: "contentManager",
     *   mode: "replaceContent",
     *   params: {
     *     filePath: "file/root",
     *     search: "old text",
     *     replace: "new text"
     *   }
     * });
     */
    async callTool(params: AgentModeParams): Promise<any> {
        try {
            const { agent, mode, params: modeParams } = params;
            
            // Validate batch operations if they exist
            if (modeParams && modeParams.operations && Array.isArray(modeParams.operations)) {
                // Validate each operation in the batch
                modeParams.operations.forEach((operation: any, index: number) => {
                    if (!operation || typeof operation !== 'object') {
                        throw new McpError(
                            ErrorCode.InvalidParams,
                            `Invalid operation at index ${index} in batch operations: operation must be an object`
                        );
                    }
                    
                    if (!operation.type) {
                        throw new McpError(
                            ErrorCode.InvalidParams,
                            `Invalid operation at index ${index} in batch operations: missing 'type' property`
                        );
                    }
                    
                    // Check for either filePath in params or path at the operation level
                    if ((!operation.params || !operation.params.filePath) && !operation.path) {
                        throw new McpError(
                            ErrorCode.InvalidParams,
                            `Invalid operation at index ${index} in batch operations: missing 'filePath' property in params`
                        );
                    }
                });
            }
            
            // Validate batch read paths if they exist
            if (modeParams && modeParams.paths && Array.isArray(modeParams.paths)) {
                // Validate each path in the batch
                modeParams.paths.forEach((path: any, index: number) => {
                    if (typeof path !== 'string') {
                        throw new McpError(
                            ErrorCode.InvalidParams,
                            `Invalid path at index ${index} in batch paths: path must be a string`
                        );
                    }
                });
            }
            
            // Execute the mode using the server's executeAgentMode method
            return await this.server.executeAgentMode(agent, mode, modeParams);
        } catch (error) {
            if (error instanceof McpError) {
                throw error;
            }
            // Remove operational logging to avoid console noise
            throw new McpError(
                ErrorCode.InvalidParams,
                (error as Error).message || 'Failed to call tool',
                error
            );
        }
    }
    
    
    /**
     * Start the MCP server
     */
    async start(): Promise<void> {
        try {
            await this.server.start();
        } catch (error) {
            if (error instanceof McpError) {
                throw error;
            }
            logger.systemError(error as Error, 'Server Start');
            throw new McpError(
                ErrorCode.InternalError,
                'Failed to start MCP server',
                error
            );
        }
    }
    
    /**
     * Stop the MCP server
     */
    async stop(): Promise<void> {
        try {
            await this.server.stop();
        } catch (error) {
            if (error instanceof McpError) {
                throw error;
            }
            logger.systemError(error as Error, 'Server Stop');
            throw new McpError(
                ErrorCode.InternalError,
                'Failed to stop MCP server',
                error
            );
        }
    }
    
    /**
     * Get the MCP server instance
     */
    getServer(): MCPServer {
        return this.server;
    }
    
    /**
     * Get the agent manager instance
     */
    getAgentManager(): AgentManager {
        return this.agentManager;
    }
    
    /**
     * Get the event manager instance
     */
    getEventManager(): EventManager {
        return this.eventManager;
    }
    
    
    /**
     * Get the vault librarian instance
     */
    getVaultLibrarian(): VaultLibrarianAgent | null {
        return this.agentManager.getAgent('vaultLibrarian') as VaultLibrarianAgent;
    }
    
    /**
     * Get the memory manager instance
     */
    getMemoryManager(): MemoryManagerAgent | null {
        try {
            return this.agentManager.getAgent('memoryManager') as MemoryManagerAgent;
        } catch (error) {
            return null;
        }
    }
    
    /**
     * Get the vector manager instance
     */
    getVectorManager(): VectorManagerAgent | null {
        try {
            return this.agentManager.getAgent('vectorManager') as VectorManagerAgent;
        } catch (error) {
            return null;
        }
    }
    
    /**
     * Get the session context manager instance
     */
    getSessionContextManager(): SessionContextManager {
        return this.sessionContextManager;
    }
    
    /**
     * Set default workspace context for all new sessions
     * The default context will be used when a session doesn't have an explicit workspace context
     * 
     * @param workspaceId Workspace ID 
     * @param workspacePath Optional hierarchical path within the workspace
     * @returns True if successful
     */
    setDefaultWorkspaceContext(workspaceId: string, workspacePath?: string[]): boolean {
        if (!workspaceId) {
            logger.systemWarn('Cannot set default workspace context with empty workspaceId');
            return false;
        }
        
        const context: WorkspaceContext = {
            workspaceId,
            workspacePath,
            activeWorkspace: true
        };
        
        this.sessionContextManager.setDefaultWorkspaceContext(context);
        return true;
    }
    
    /**
     * Clear the default workspace context
     */
    clearDefaultWorkspaceContext(): void {
        this.sessionContextManager.setDefaultWorkspaceContext(null);
    }
    
    /**
     * Set workspace context for a specific session
     * 
     * @param sessionId Session ID
     * @param workspaceId Workspace ID
     * @param workspacePath Optional hierarchical path within the workspace
     * @returns True if successful
     */
    setSessionWorkspaceContext(sessionId: string, workspaceId: string, workspacePath?: string[]): boolean {
        if (!sessionId || !workspaceId) {
            logger.systemWarn('Cannot set session workspace context with empty sessionId or workspaceId');
            return false;
        }
        
        const context: WorkspaceContext = {
            workspaceId,
            workspacePath,
            activeWorkspace: true
        };
        
        this.sessionContextManager.setWorkspaceContext(sessionId, context);
        return true;
    }
}
