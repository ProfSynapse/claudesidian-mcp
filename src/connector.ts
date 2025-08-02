import { App, Plugin } from 'obsidian';
import ClaudesidianPlugin from './main';
import { MCPServer } from './server';
import { EventManager } from './services/EventManager';
import { AgentManager } from './services/AgentManager';
import { SessionContextManager, WorkspaceContext } from './services/SessionContextManager';
import { SimpleServiceManager } from './services/SimpleServiceManager';
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
import { ToolCallCaptureService } from './services/toolcall-capture/ToolCallCaptureService';

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
    private serviceManager?: SimpleServiceManager;
    private toolCallCaptureService?: ToolCallCaptureService;
    private pendingToolCalls = new Map<string, any>();
    
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
            this.serviceManager ? (toolName: string, params: any) => this.onToolCall(toolName, params) : undefined,
            this.serviceManager ? (toolName: string, params: any, response: any, success: boolean, executionTime: number) => this.onToolResponse(toolName, params, response, success, executionTime) : undefined
        );
        
        // Full initialization deferred to start() method
    }
    
    /**
     * Handle tool call responses - capture completed tool calls
     */
    private async onToolResponse(toolName: string, params: any, response: any, success: boolean, executionTime: number): Promise<void> {
        console.log('[MCPConnector] 🎯 onToolResponse triggered:', toolName, 'success:', success, 'executionTime:', executionTime + 'ms');
        
        try {
            // Find the matching pending tool call
            const pendingEntries = Array.from(this.pendingToolCalls.entries());
            const matchingEntry = pendingEntries.find(([toolCallId, capture]) => {
                return capture.agent === toolName.split('_')[0] && capture.mode === toolName.split('_')[1];
            });
            
            if (matchingEntry) {
                const [toolCallId, captureInfo] = matchingEntry;
                console.log('[MCPConnector] 🎯 MEMORY-TRACE: Capturing tool call response for:', toolCallId);
                
                // Initialize tool call capture service if not already done
                await this.initializeToolCallCaptureService();
                
                if (this.toolCallCaptureService) {
                    // Create response object
                    const toolResponse: any = {
                        result: response,
                        success: success,
                        executionTime: executionTime,
                        timestamp: Date.now(),
                        resultType: this.inferResultType(response),
                        resultSummary: this.generateResultSummary(response),
                        affectedResources: this.extractAffectedResources(response, params)
                    };
                    
                    // Add error information if unsuccessful
                    if (!success && response?.error) {
                        toolResponse.error = {
                            type: 'ExecutionError',
                            message: response.error,
                            code: 'TOOL_EXECUTION_FAILED'
                        };
                    }
                    
                    await this.toolCallCaptureService.captureResponse(toolCallId, toolResponse);
                    console.log('[MCPConnector] 🎯 MEMORY-TRACE: Response captured successfully for toolCallId:', toolCallId);
                    
                    // Remove from pending
                    this.pendingToolCalls.delete(toolCallId);
                } else {
                    console.warn('[MCPConnector] 🚨 ToolCallCaptureService not available for response capture:', toolName);
                }
            } else {
                console.warn('[MCPConnector] 🚨 No matching pending tool call found for response:', toolName);
            }
        } catch (error) {
            console.error('[MCPConnector] Error in onToolResponse capture:', error);
        }
    }
    
    /**
     * Handle tool calls - services now load on demand automatically
     */
    private async onToolCall(toolName: string, params: any): Promise<void> {
        console.log('[MCPConnector] 🎯 onToolCall triggered:', toolName, 'with params:', params);
        
        try {
            // Initialize tool call capture service if not already done
            await this.initializeToolCallCaptureService();
            
            if (this.toolCallCaptureService) {
                // Parse tool name to get agent and mode
                const [agent, mode] = toolName.split('_');
                
                // Generate unique tool call ID
                const toolCallId = this.generateToolCallId();
                
                // Create tool call request
                const request = {
                    toolCallId,
                    agent,
                    mode,
                    params,
                    timestamp: Date.now(),
                    source: 'mcp-client' as const,
                    workspaceContext: this.extractWorkspaceContext(params)
                };
                
                console.log('[MCPConnector] 🎯 MEMORY-TRACE: Capturing tool call request:', toolCallId, agent, mode);
                await this.toolCallCaptureService.captureRequest(request);
                
                // Store for response capture later
                this.pendingToolCalls.set(toolCallId, { agent, mode, params, captureStartTime: Date.now() });
                
            } else {
                console.warn('[MCPConnector] 🚨 ToolCallCaptureService not available for tool call:', toolName);
            }
        } catch (error) {
            console.error('[MCPConnector] Error in onToolCall capture:', error);
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
                    // Wait for service manager to complete initialization, then initialize search service
                    setTimeout(async () => {
                        try {
                            // Check if vector store is ready (don't trigger initialization here)
                            const vectorStore = this.serviceManager?.getIfReady('vectorStore');
                            if (vectorStore && vaultLibrarianAgent) {
                                // Initialize search service in background to avoid blocking
                                vaultLibrarianAgent.initializeSearchService().catch((error: any) => 
                                    console.error('Error initializing VaultLibrarian search service:', error)
                                );
                                
                                // Update VaultLibrarian with memory settings
                                if (memorySettings) {
                                    vaultLibrarianAgent.updateSettings(memorySettings);
                                }
                            } else {
                                console.log('[MCPConnector] Vector store not ready, deferring VaultLibrarian initialization');
                            }
                        } catch (error) {
                            console.error('Error setting up VaultLibrarian search service:', error);
                        }
                    }, 15000); // Wait 15 seconds for service manager to complete
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
            
            // Reinitialize request router with registered agents
            this.server.reinitializeRequestRouter();
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
     * Call a tool using the new agent-mode architecture with integrated tool call capture
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
        const captureStartTime = Date.now();
        let toolCallId: string | undefined;
        let captureContext: any = null;
        
        try {
            const { agent, mode, params: modeParams } = params;
            
            // Initialize tool call capture service if not already done
            console.log('[MCPConnector] 🔍 DIAGNOSTIC: Attempting to initialize ToolCallCaptureService...');
            await this.initializeToolCallCaptureService();
            console.log('[MCPConnector] 🔍 DIAGNOSTIC: ToolCallCaptureService initialization completed, service available:', !!this.toolCallCaptureService);
            
            // Generate unique tool call ID for capture
            toolCallId = this.generateToolCallId();
            
            
            // CAPTURE REQUEST (Non-blocking)
            if (this.toolCallCaptureService) {
                console.log('[MCPConnector] 🎯 CAPTURE DEBUG: ToolCallCaptureService found, capturing request for', agent, mode);
                try {
                    captureContext = await this.toolCallCaptureService.captureRequest({
                        toolCallId,
                        agent,
                        mode,
                        params: modeParams,
                        timestamp: captureStartTime,
                        source: 'mcp-client',
                        workspaceContext: this.extractWorkspaceContext(modeParams)
                    });
                    console.log('[MCPConnector] 🎯 CAPTURE DEBUG: Request captured successfully for toolCallId:', toolCallId);
                } catch (captureError) {
                    // Don't fail the tool call if capture fails
                    console.warn('[MCPConnector] Tool call request capture failed:', captureError);
                }
            } else {
                console.warn('[MCPConnector] 🚨 CAPTURE DEBUG: ToolCallCaptureService NOT FOUND - no capture will happen');
            }
            
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
            const result = await this.server.executeAgentMode(agent, mode, modeParams);
            
            // CAPTURE SUCCESSFUL RESPONSE (Non-blocking)
            if (this.toolCallCaptureService && toolCallId) {
                try {
                    await this.toolCallCaptureService.captureResponse(toolCallId, {
                        result: result,
                        success: true,
                        executionTime: Date.now() - captureStartTime,
                        timestamp: Date.now(),
                        resultType: this.inferResultType(result),
                        resultSummary: this.generateResultSummary(result),
                        affectedResources: this.extractAffectedResources(result, modeParams)
                    });
                } catch (captureError) {
                    // Don't fail the tool call if capture fails
                    console.warn('[MCPConnector] Tool call response capture failed:', captureError);
                }
            }
            
            return result;
            
        } catch (error) {
            // CAPTURE ERROR RESPONSE (Non-blocking)
            if (this.toolCallCaptureService && toolCallId) {
                try {
                    await this.toolCallCaptureService.captureResponse(toolCallId, {
                        result: null,
                        success: false,
                        error: {
                            type: (error as Error).constructor.name,
                            message: (error as Error).message,
                            code: (error as any).code,
                            stack: (error as Error).stack
                        },
                        executionTime: Date.now() - captureStartTime,
                        timestamp: Date.now()
                    });
                } catch (captureError) {
                    // Don't fail the tool call if capture fails
                    console.warn('[MCPConnector] Tool call error capture failed:', captureError);
                }
            }
            
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
     * Initialize the tool call capture service - now guaranteed to be ready immediately
     * @private
     */
    private async initializeToolCallCaptureService(): Promise<void> {
        if (this.toolCallCaptureService) {
            return; // Already initialized
        }
        
        try {
            const plugin = this.plugin as any;
            console.log('[MCPConnector] 🔍 DIAGNOSTIC: Plugin available:', !!plugin);
            console.log('[MCPConnector] 🔍 DIAGNOSTIC: ServiceManager available:', !!plugin.serviceManager);
            
            // With SimpleServiceManager, toolCallCaptureService is immediately available
            if (plugin.serviceManager) {
                const service = plugin.serviceManager.getIfReady('toolCallCaptureService');
                console.log('[MCPConnector] 🔍 DIAGNOSTIC: ToolCallCaptureService from serviceManager:', !!service);
                if (service) {
                    console.log('[MCPConnector] 🎯 ToolCallCaptureService successfully retrieved from SimpleServiceManager');
                    this.toolCallCaptureService = service;
                    return;
                } else {
                    console.warn('[MCPConnector] 🚨 DIAGNOSTIC: ToolCallCaptureService not ready in SimpleServiceManager');
                }
            }
            
            // Fallback: check plugin directly
            if (plugin.toolCallCaptureService) {
                console.log('[MCPConnector] 🔍 DIAGNOSTIC: Using fallback - ToolCallCaptureService from plugin directly');
                this.toolCallCaptureService = plugin.toolCallCaptureService;
                return;
            }
            
            throw new Error('ToolCallCaptureService should be immediately available with SimpleServiceManager');
            
        } catch (error) {
            console.warn('[MCPConnector] Failed to initialize tool call capture service:', error);
            // Don't throw - capture is optional
        }
    }
    
    /**
     * Generate a unique tool call ID
     * @private
     */
    private generateToolCallId(): string {
        return `tool_call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Extract workspace context from parameters
     * @private
     */
    private extractWorkspaceContext(params: any): any {
        // Direct workspace context
        if (params?.workspaceContext) {
            return params.workspaceContext;
        }
        
        // Try to extract from session context
        if (params?.sessionId) {
            return {
                sessionId: params.sessionId,
                workspaceId: 'unknown'
            };
        }
        
        // Extract from file paths
        if (params?.filePath) {
            return {
                workspaceId: this.detectWorkspaceFromPath(params.filePath),
                workspacePath: [params.filePath.split('/')[0]]
            };
        }
        
        // Extract from batch operations
        if (params?.operations && Array.isArray(params.operations)) {
            const firstOperation = params.operations[0];
            if (firstOperation?.params?.filePath) {
                return {
                    workspaceId: this.detectWorkspaceFromPath(firstOperation.params.filePath),
                    workspacePath: [firstOperation.params.filePath.split('/')[0]]
                };
            }
        }
        
        return null;
    }
    
    /**
     * Detect workspace from file path (simple implementation)
     * @private
     */
    private detectWorkspaceFromPath(filePath: string): string {
        // Simple workspace detection - could be enhanced
        return 'default-workspace';
    }
    
    /**
     * Infer the result type from the result object
     * @private
     */
    private inferResultType(result: any): string {
        if (result === null || result === undefined) return 'null';
        if (Array.isArray(result)) return 'array';
        return typeof result;
    }
    
    /**
     * Generate a summary of the result
     * @private
     */
    private generateResultSummary(result: any): string {
        if (!result) return 'no result';
        if (typeof result === 'string') {
            return result.length > 100 ? `${result.substring(0, 100)}...` : result;
        }
        if (typeof result === 'object') {
            if (Array.isArray(result)) {
                return `array with ${result.length} items`;
            }
            const keys = Object.keys(result);
            return `object with ${keys.length} properties (${keys.slice(0, 3).join(', ')})${keys.length > 3 ? '...' : ''}`;
        }
        return String(result);
    }
    
    /**
     * Extract affected resources from result and parameters
     * @private
     */
    private extractAffectedResources(result: any, params: any): string[] {
        const resources: string[] = [];
        
        // From parameters
        if (params?.filePath) resources.push(params.filePath);
        if (params?.paths && Array.isArray(params.paths)) {
            resources.push(...params.paths);
        }
        if (params?.operations && Array.isArray(params.operations)) {
            for (const op of params.operations) {
                if (op.params?.filePath) resources.push(op.params.filePath);
                if (op.path) resources.push(op.path);
            }
        }
        
        // From result
        if (result?.affectedFiles && Array.isArray(result.affectedFiles)) {
            resources.push(...result.affectedFiles);
        }
        if (result?.createdFiles && Array.isArray(result.createdFiles)) {
            resources.push(...result.createdFiles);
        }
        if (result?.modifiedFiles && Array.isArray(result.modifiedFiles)) {
            resources.push(...result.modifiedFiles);
        }
        
        // Remove duplicates
        return Array.from(new Set(resources));
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
