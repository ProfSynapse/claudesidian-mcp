import { App, Plugin } from 'obsidian';
import ClaudesidianPlugin from './main';
import { MCPServer } from './server';
import { EventManager } from './services/EventManager';
import { AgentManager } from './services/AgentManager';
import { SessionContextManager, WorkspaceContext } from './services/SessionContextManager';
import { LazyServiceManager } from './services/LazyServiceManager';
import {
    ContentManagerAgent,
    CommandManagerAgent,
    VaultManagerAgent,
    VaultLibrarianAgent,
    MemoryManagerAgent,
    AgentManagerAgent
} from './agents';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { logger } from './utils/logger';
import { CustomPromptStorageService } from './database/services/CustomPromptStorageService';
import { LLMProviderManager } from './services/LLMProviderManager';
import { DEFAULT_LLM_PROVIDER_SETTINGS } from './types';
import { LLMValidationService } from './services/LLMValidationService';
import { EmbeddingProviderManager } from './database/services/embedding/EmbeddingProviderManager';

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
    private customPromptStorage?: CustomPromptStorageService;
    private serviceManager?: LazyServiceManager;
    
    constructor(
        private app: App,
        private plugin: Plugin | ClaudesidianPlugin
    ) {
        // Initialize core components only - defer service connections
        this.eventManager = new EventManager();
        this.sessionContextManager = new SessionContextManager();
        this.agentManager = new AgentManager(app, plugin, this.eventManager);
        
        // Get service manager reference but don't connect yet
        if (this.plugin && (this.plugin as any).getServiceManager) {
            this.serviceManager = (this.plugin as any).getServiceManager();
        }
        
        // Initialize custom prompt storage if possible
        const pluginSettings = this.plugin && (this.plugin as any).settings;
        if (pluginSettings) {
            this.customPromptStorage = new CustomPromptStorageService(pluginSettings);
        }
        
        // Create server skeleton - full initialization deferred
        this.server = new MCPServer(
            app, 
            plugin, 
            this.eventManager, 
            this.sessionContextManager, 
            undefined, 
            this.customPromptStorage,
            this.serviceManager ? (toolName: string, params: any) => this.onToolCall(toolName, params) : undefined
        );
        
        // Full initialization deferred to start() method
    }
    
    /**
     * Handle tool calls to trigger lazy loading
     */
    private async onToolCall(toolName: string, params: any): Promise<void> {
        // Trigger vector store loading on any tool call
        if (this.serviceManager) {
            await this.serviceManager.onToolCall();
            
            // If this is a workspace-related operation, trigger workspace caching
            if (this.isWorkspaceOperation(toolName, params)) {
                const workspaceId = this.extractWorkspaceId(params);
                if (workspaceId) {
                    await this.serviceManager.onWorkspaceLoad(workspaceId);
                }
            }
        }
    }
    
    /**
     * Check if this tool call is workspace-related
     */
    private isWorkspaceOperation(toolName: string, params: any): boolean {
        const workspaceTools = [
            'memoryManager.switchWorkspace',
            'memoryManager.createWorkspace',
            'memoryManager.getWorkspace',
            'vaultLibrarian.search'
        ];
        
        return workspaceTools.some(tool => toolName.includes(tool)) || 
               (params && (params.workspaceId || params.workspace));
    }
    
    /**
     * Extract workspace ID from tool parameters
     */
    private extractWorkspaceId(params: any): string | null {
        if (params?.workspaceId) return params.workspaceId;
        if (params?.workspace) return params.workspace;
        if (params?.params?.workspaceId) return params.params.workspaceId;
        return null;
    }
    
    /**
     * Validate embedding provider configuration
     * Uses EmbeddingProviderManager to properly handle providers that don't require API keys (like Ollama)
     */
    private async validateEmbeddingApiKeys(): Promise<boolean> {
        try {
            const memorySettings = this.plugin && (this.plugin as any).settings?.settings?.memory;
            if (!memorySettings?.embeddingsEnabled) {
                return false;
            }

            // Use EmbeddingProviderManager to validate settings (handles Ollama and other providers correctly)
            const embeddingManager = new EmbeddingProviderManager();
            const isValid = embeddingManager['validateProviderSettings'](memorySettings);
            
            return isValid;
        } catch (error) {
            console.error('Error validating embedding provider configuration:', error);
            return false;
        }
    }

    /**
     * Validate API keys for LLM providers used in agent modes
     */
    private async validateLLMApiKeys(): Promise<boolean> {
        try {
            const pluginSettings = (this.plugin as any)?.settings?.settings;
            const llmProviderSettings = pluginSettings?.llmProviders || DEFAULT_LLM_PROVIDER_SETTINGS;
            
            const defaultProvider = llmProviderSettings.defaultModel?.provider;
            if (!defaultProvider) {
                return false;
            }

            const providerConfig = llmProviderSettings.providers?.[defaultProvider];
            if (!providerConfig?.apiKey) {
                return false;
            }

            // Validate the API key
            const validation = await LLMValidationService.validateApiKey(defaultProvider, providerConfig.apiKey);
            return validation.success;
        } catch (error) {
            console.error('Error validating LLM API keys:', error);
            return false;
        }
    }

    /**
     * Initialize all agents - public method to be called from main plugin
     */
    public async initializeAgents(): Promise<void> {
        try {
            // Get memory settings to determine what to enable
            const memorySettings = this.plugin && (this.plugin as any).settings?.settings?.memory;
            const isMemoryEnabled = memorySettings?.enabled && memorySettings?.embeddingsEnabled;
            
            // Validate API keys following the memory pattern
            const hasValidEmbeddingKeys = await this.validateEmbeddingApiKeys();
            const hasValidLLMKeys = await this.validateLLMApiKeys();
            
            // Enable vector modes only if memory is enabled AND valid embedding API keys exist
            const enableVectorModes = isMemoryEnabled && hasValidEmbeddingKeys;
            
            // Enable LLM-dependent modes only if valid LLM API keys exist
            const enableLLMModes = hasValidLLMKeys;
            
            
            // Always register these agents (no vector database dependency)
            const contentManagerAgent = new ContentManagerAgent(
                this.app, 
                this.plugin as ClaudesidianPlugin
            );
            
            // CommandManager with lazy memory service - NON-BLOCKING
            const memoryService = this.serviceManager ? 
                this.serviceManager.getIfReady('memoryService') : null;
            const commandManagerAgent = new CommandManagerAgent(
                this.app, 
                memoryService as any
            );
            
            
            const vaultManagerAgent = new VaultManagerAgent(
                this.app
            );
            
            // Always register AgentManager (prompt management)
            const agentManagerAgent = this.customPromptStorage ? new AgentManagerAgent((this.plugin as any).settings) : null;
            
            // Initialize LLM Provider Manager if AgentManager exists
            if (agentManagerAgent) {
                try {
                    // Get LLM provider settings from plugin settings or use defaults
                    const pluginSettings = (this.plugin as any)?.settings?.settings;
                    const llmProviderSettings = pluginSettings?.llmProviders || DEFAULT_LLM_PROVIDER_SETTINGS;
                    
                    // Debug logging to see what settings we're getting
                    
                    // Create LLM Provider Manager
                    const llmProviderManager = new LLMProviderManager(llmProviderSettings);
                    
                    // Set up the provider manager on the agent
                    agentManagerAgent.setProviderManager(llmProviderManager);
                    
                    // Set the vault adapter for file reading
                    llmProviderManager.setVaultAdapter(this.app.vault.adapter);
                    
                    agentManagerAgent.setParentAgentManager(this.agentManager);
                    
                    // Create and inject LLM usage tracker (non-blocking)
                    import('./services/UsageTracker').then(({ UsageTracker }) => {
                        const llmUsageTracker = new UsageTracker('llm', pluginSettings);
                        agentManagerAgent.setUsageTracker(llmUsageTracker);
                    }).catch(error => {
                        console.error('Failed to load UsageTracker:', error);
                    });
                    
                } catch (error) {
                    console.error('Failed to initialize LLM Provider Manager:', error);
                }
            }
            
            // Always register VaultLibrarian (has non-vector modes like search)
            let vaultLibrarianAgent: VaultLibrarianAgent | null = null;
            try {
                vaultLibrarianAgent = new VaultLibrarianAgent(
                    this.app,
                    enableVectorModes  // Pass vector modes enabled status (memory + valid API keys)
                );
                
                // If vector modes are enabled, set up lazy initialization of search service
                if (enableVectorModes && this.serviceManager) {
                    // Initialize search service when vector store becomes available
                    this.serviceManager.get('vectorStore').then((vectorStore) => {
                        if (vaultLibrarianAgent) {
                            // Initialize search service in background to avoid blocking
                            vaultLibrarianAgent.initializeSearchService().catch((error: any) => 
                                console.error('Error initializing VaultLibrarian search service:', error)
                            );
                            
                            // Update VaultLibrarian with memory settings
                            if (memorySettings) {
                                vaultLibrarianAgent.updateSettings(memorySettings);
                            }
                        }
                    }).catch((error: any) => {
                        console.warn('Vector store not available for VaultLibrarian:', error);
                    });
                }
            } catch (error) {
                console.error("Error creating VaultLibrarianAgent:", error);
                console.warn("Will continue without VaultLibrarian agent");
                vaultLibrarianAgent = null;
            }
            
            // Initialize memory manager (always available for basic workspace management)
            let memoryManagerAgent;
            try {
                memoryManagerAgent = new MemoryManagerAgent(
                    this.app,
                    this.plugin
                );
            } catch (error) {
                console.error("Error creating MemoryManagerAgent:", error);
                console.warn("Will continue without memory manager");
            }
            
            // Register core agents
            this.agentManager.registerAgent(contentManagerAgent);
            this.agentManager.registerAgent(commandManagerAgent);
            this.agentManager.registerAgent(vaultManagerAgent);
            if (agentManagerAgent) {
                this.agentManager.registerAgent(agentManagerAgent);
            }
            
            // Register VaultLibrarian if created successfully
            if (vaultLibrarianAgent) {
                this.agentManager.registerAgent(vaultLibrarianAgent);
            }
            
            // Register memory manager if created successfully
            if (memoryManagerAgent) {
                this.agentManager.registerAgent(memoryManagerAgent);
            }
            
            // Log conditional mode availability status
            if (!enableVectorModes && !enableLLMModes) {
                console.log("No valid API keys found - modes requiring API keys will be disabled");
            } else {
                if (!enableVectorModes) {
                    console.log("Vector modes disabled - no valid embedding API keys or memory disabled");
                }
                if (!enableLLMModes) {
                    console.log("LLM modes disabled - no valid LLM API keys configured");
                }
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
        try {
            return this.agentManager.getAgent('vaultLibrarian') as VaultLibrarianAgent;
        } catch (error) {
            return null;
        }
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
