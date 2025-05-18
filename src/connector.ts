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
    MemoryManagerAgent
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
            console.log("[DIAGNOSTIC] Starting agent initialization");
            
            // Get services from the plugin
            const services = (this.plugin as any).services || {};
            console.log("[DIAGNOSTIC] Plugin services:", Object.keys(services));
            const memoryService = services.memoryService;
            const embeddingService = services.embeddingService;
            const searchService = services.searchService;
            const workspaceService = services.workspaceService;
            
            // Create all agents with services
            console.log("[DIAGNOSTIC] Creating ContentManagerAgent");
            const contentManagerAgent = new ContentManagerAgent(
                this.app, 
                this.agentManager,
                this.plugin as ClaudesidianPlugin
            );
            
            console.log("[DIAGNOSTIC] Creating CommandManagerAgent");
            const commandManagerAgent = new CommandManagerAgent(
                this.app, 
                this.agentManager,
                memoryService
            );
            
            console.log("[DIAGNOSTIC] Creating VaultLibrarianAgent");
            console.log("[DIAGNOSTIC] Creating VaultLibrarianAgent - checking construction");
            const vaultLibrarianAgent = new VaultLibrarianAgent(
                this.app
            );
            console.log("[DIAGNOSTIC] VaultLibrarianAgent created successfully:", 
                vaultLibrarianAgent.name, 
                "modes:", vaultLibrarianAgent.getModes().length);
            
            // Create project manager with services
            console.log("[DIAGNOSTIC] Creating ProjectManagerAgent");
            const projectManagerAgent = new ProjectManagerAgent(
                this.app, 
                this.plugin
            );
            
            console.log("[DIAGNOSTIC] Creating VaultManagerAgent");
            const vaultManagerAgent = new VaultManagerAgent(
                this.app
            );
            
            console.log("[DIAGNOSTIC] Creating MemoryManagerAgent");
            console.log("[DIAGNOSTIC] Creating MemoryManagerAgent - checking construction");
            let memoryManagerAgent;
            try {
                memoryManagerAgent = new MemoryManagerAgent(
                    this.plugin
                );
                console.log("[DIAGNOSTIC] MemoryManagerAgent created successfully:", 
                    memoryManagerAgent.name, 
                    "modes:", memoryManagerAgent.getModes()?.length || 0);
            } catch (error) {
                console.error("[DIAGNOSTIC] Error creating MemoryManagerAgent:", error);
                console.warn("[DIAGNOSTIC] Will continue without memory manager");
                memoryManagerAgent = null;
            }
            
            // Register with agent manager
            console.log("[DIAGNOSTIC] Registering agents with AgentManager");
            this.agentManager.registerAgent(contentManagerAgent);
            this.agentManager.registerAgent(commandManagerAgent);
            this.agentManager.registerAgent(projectManagerAgent);
            this.agentManager.registerAgent(vaultManagerAgent);
            this.agentManager.registerAgent(vaultLibrarianAgent);
            
            // Only register memory manager if it was created successfully
            if (memoryManagerAgent) {
                console.log("[DIAGNOSTIC] Registering memoryManagerAgent");
                this.agentManager.registerAgent(memoryManagerAgent);
            } else {
                console.log("[DIAGNOSTIC] Skipping memoryManagerAgent registration");
            }
            
            // Initialize VaultLibrarian with current settings if available
            const memorySettings = (this.plugin as any).settings?.settings?.memory;
            if (memorySettings) {
                console.log("[DIAGNOSTIC] Updating VaultLibrarian settings");
                vaultLibrarianAgent.updateSettings(memorySettings);
            }
            
            // Check agent registration
            const registeredAgents = this.agentManager.getAgents();
            console.log("[DIAGNOSTIC] Agents registered with AgentManager:", 
                Array.from(registeredAgents.keys()).join(", "), 
                "total:", registeredAgents.size);
            
            // Register all agents from the agent manager with the server
            this.registerAgentsWithServer();
        } catch (error) {
            console.error("[DIAGNOSTIC] Error in initializeAgents:", error);
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
            console.log("[DIAGNOSTIC] Starting registerAgentsWithServer");
            const agents = this.agentManager.getAgents();
            console.log("[DIAGNOSTIC] Number of agents to register with server:", agents.size);
            
            for (const agent of agents) {
                console.log("[DIAGNOSTIC] Registering agent with server:", agent.name);
                this.server.registerAgent(agent);
            }
            
            // Check how many agents are in the server after registration
            const serverAgents = this.server.getAgents();
            console.log("[DIAGNOSTIC] Agents registered in server:", 
                Array.from(serverAgents.keys()).join(", "), 
                "total:", serverAgents.size);
                
            console.log("[DIAGNOSTIC] registerAgentsWithServer completed");
        } catch (error) {
            console.error("[DIAGNOSTIC] Error in registerAgentsWithServer:", error);
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
                error.message || 'Failed to call tool',
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
