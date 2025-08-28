import { App, Plugin } from 'obsidian';
import ClaudesidianPlugin from './main';
import { EventManager } from './services/EventManager';
import { SessionContextManager, WorkspaceContext } from './services/SessionContextManager';
import type { ServiceManager } from './core/ServiceManager';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { logger } from './utils/logger';
import { CustomPromptStorageService } from "./agents/agentManager/services/CustomPromptStorageService";
import { ToolCallCaptureService } from './services/toolcall-capture/ToolCallCaptureService';

// Extracted services
import { MCPConnectionManager, MCPConnectionManagerInterface } from './services/mcp/MCPConnectionManager';
import { ToolCallRouter, ToolCallRouterInterface } from './services/mcp/ToolCallRouter';
import { AgentRegistrationService, AgentRegistrationServiceInterface } from './services/agent/AgentRegistrationService';

// Type definitions
import { AgentModeParams } from './types/agent/AgentTypes';
import { VaultLibrarianAgent } from './agents';
import { MemoryManagerAgent } from './agents';


/**
 * MCP Connector
 * Orchestrates MCP server operations through extracted services:
 * - MCPConnectionManager: Handles server lifecycle
 * - ToolCallRouter: Routes tool calls to agents/modes  
 * - AgentRegistrationService: Manages agent initialization and registration
 */
export class MCPConnector {
    private connectionManager: MCPConnectionManagerInterface;
    private toolRouter: ToolCallRouterInterface;
    private agentRegistry: AgentRegistrationServiceInterface;
    private eventManager: EventManager;
    private sessionContextManager: SessionContextManager;
    private customPromptStorage?: CustomPromptStorageService;
    private serviceManager?: ServiceManager;
    private toolCallCaptureService?: ToolCallCaptureService;
    private pendingToolCalls = new Map<string, any>();
    
    constructor(
        private app: App,
        private plugin: Plugin | ClaudesidianPlugin
    ) {
        // Initialize core components
        this.eventManager = new EventManager();
        this.sessionContextManager = new SessionContextManager();
        
        // Get service manager reference
        if (this.plugin && (this.plugin as any).getServiceContainer) {
            this.serviceManager = (this.plugin as any).getServiceContainer();
        }
        
        // Initialize custom prompt storage if possible
        // Note: Settings might not be fully loaded yet, so we'll check again during initialization
        const pluginSettings = this.plugin && (this.plugin as any).settings;
        if (pluginSettings) {
            try {
                this.customPromptStorage = new CustomPromptStorageService(pluginSettings);
                logger.systemLog('CustomPromptStorageService initialized successfully');
            } catch (error) {
                logger.systemError(error as Error, 'CustomPromptStorageService Initialization');
                this.customPromptStorage = undefined;
            }
        } else {
            logger.systemWarn('Plugin settings not available during MCPConnector construction - will retry during initialization');
        }
        
        // Initialize extracted services
        this.connectionManager = new MCPConnectionManager(
            this.app,
            this.plugin,
            this.eventManager,
            this.sessionContextManager,
            this.customPromptStorage,
            (toolName: string, params: any) => this.onToolCall(toolName, params),
            (toolName: string, params: any, response: any, success: boolean, executionTime: number) => this.onToolResponse(toolName, params, response, success, executionTime)
        );
        
        this.toolRouter = new ToolCallRouter();
        
        this.agentRegistry = new AgentRegistrationService(
            this.app,
            this.plugin,
            this.eventManager,
            this.serviceManager,
            this.customPromptStorage
        );
    }
    
    /**
     * Handle tool call responses - capture completed tool calls
     */
    private async onToolResponse(toolName: string, params: any, response: any, success: boolean, executionTime: number): Promise<void> {
        
        try {
            // Find the matching pending tool call
            const pendingEntries = Array.from(this.pendingToolCalls.entries());
            const matchingEntry = pendingEntries.find(([toolCallId, capture]) => {
                return capture.agent === toolName.split('_')[0] && capture.mode === toolName.split('_')[1];
            });
            
            if (matchingEntry) {
                const [toolCallId, captureInfo] = matchingEntry;
                
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
     * Initialize all agents - delegates to AgentRegistrationService
     */
    public async initializeAgents(): Promise<void> {
        try {
            // Ensure customPromptStorage is available if settings are now loaded
            if (!this.customPromptStorage) {
                const pluginSettings = this.plugin && (this.plugin as any).settings;
                if (pluginSettings) {
                    try {
                        this.customPromptStorage = new CustomPromptStorageService(pluginSettings);
                        
                        // Update the agent registry with the new storage service
                        this.agentRegistry = new AgentRegistrationService(
                            this.app,
                            this.plugin,
                            this.eventManager,
                            this.serviceManager,
                            this.customPromptStorage
                        );
                        
                        logger.systemLog('CustomPromptStorageService initialized during agent initialization');
                    } catch (error) {
                        logger.systemError(error as Error, 'Late CustomPromptStorageService Initialization');
                    }
                }
            }
            
            // Initialize connection manager first
            await this.connectionManager.initialize();
            
            // Set up tool router with server reference
            const server = this.connectionManager.getServer();
            if (server) {
                this.toolRouter.setServer(server);
            }
            
            // Initialize all agents through the registration service
            await this.agentRegistry.initializeAllAgents();
            
            // Register agents with server through the registration service
            this.agentRegistry.registerAgentsWithServer((agent: any) => {
                if (server) {
                    server.registerAgent(agent);
                }
            });
            
            // Reinitialize request router with registered agents
            this.connectionManager.reinitializeRequestRouter();
            
            // Inject session service into SessionContextManager for database validation
            if (this.serviceManager) {
                try {
                    const sessionService = await this.serviceManager.getService<any>('sessionService');
                    if (sessionService) {
                        this.sessionContextManager.setSessionService(sessionService);
                    } else {
                        logger.systemWarn('SessionService not found in service manager');
                    }
                } catch (error) {
                    logger.systemWarn(`Failed to inject SessionService: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            
            logger.systemLog('Agent initialization completed successfully');
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
     * Call a tool using the new agent-mode architecture with integrated tool call capture
     * Now delegates to ToolCallRouter service for validation and execution
     */
    /**
     * Get available tools for ChatService
     */
    getAvailableTools(): any[] {
        const tools: any[] = [];
        
        if (!this.agentRegistry) {
            console.warn('[MCPConnector] No agent registration service available for tool manifest');
            return [];
        }

        const registeredAgents = this.agentRegistry.getAllAgents();
        
        for (const [agentName, agent] of registeredAgents) {
            const modes = (agent as any).getModes?.() || [];
            
            // getModes returns an array, so iterate directly over modes
            for (const mode of modes) {
                const modeInstance = mode as any;
                if (modeInstance && typeof modeInstance.getParameterSchema === 'function') {
                    try {
                        const paramSchema = modeInstance.getParameterSchema();
                        const modeName = modeInstance.slug || modeInstance.name || 'unknown';
                        tools.push({
                            name: `${agentName}.${modeName}`,
                            description: modeInstance.description || `Execute ${modeName} on ${agentName}`,
                            inputSchema: paramSchema
                        });
                    } catch (error) {
                        const modeName = modeInstance.slug || modeInstance.name || 'unknown';
                        console.warn(`[MCPConnector] Failed to get schema for ${agentName}.${modeName}:`, error);
                    }
                }
            }
        }
        
        console.log(`[MCPConnector] Generated ${tools.length} tools for ChatService`);
        return tools;
    }

    async callTool(params: AgentModeParams): Promise<any> {
        const captureStartTime = Date.now();
        let toolCallId: string | undefined;
        
        try {
            const { agent, mode, params: modeParams } = params;
            
            // Initialize tool call capture service if not already done
            await this.initializeToolCallCaptureService();
            
            // Generate unique tool call ID for capture
            toolCallId = this.generateToolCallId();
            
            // CAPTURE REQUEST (Non-blocking)
            if (this.toolCallCaptureService) {
                try {
                    await this.toolCallCaptureService.captureRequest({
                        toolCallId,
                        agent,
                        mode,
                        params: modeParams,
                        timestamp: captureStartTime,
                        source: 'mcp-client',
                        workspaceContext: this.extractWorkspaceContext(modeParams)
                    });
                } catch (captureError) {
                    console.warn('[MCPConnector] Tool call request capture failed:', captureError);
                }
            }
            
            // Delegate validation and execution to ToolCallRouter
            this.toolRouter.validateBatchOperations(modeParams);
            const result = await this.toolRouter.executeAgentMode(agent, mode, modeParams);
            
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
                    console.warn('[MCPConnector] Tool call error capture failed:', captureError);
                }
            }
            
            if (error instanceof McpError) {
                throw error;
            }
            throw new McpError(
                ErrorCode.InvalidParams,
                (error as Error).message || 'Failed to call tool',
                error
            );
        }
    }
    
    
    /**
     * Initialize the tool call capture service using Direct Property Access pattern
     * @private
     */
    private async initializeToolCallCaptureService(): Promise<void> {
        if (this.toolCallCaptureService) {
            return; // Already initialized
        }
        
        try {
            const plugin = this.plugin as any;
            
            // Use Direct Property Access pattern (fastest, no async needed)
            const service = plugin.toolCallCaptureService;
            if (service) {
                this.toolCallCaptureService = service;
                return;
            }
            
            // Fallback: Try async service access if direct access fails
            if (plugin.getService) {
                const asyncService = await plugin.getService('toolCallCaptureService');
                if (asyncService) {
                    this.toolCallCaptureService = asyncService;
                    return;
                }
            }
            
            console.warn('[MCPConnector] ToolCallCaptureService not available - capture will be disabled');
            
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
     * Start the MCP server - delegates to MCPConnectionManager
     */
    async start(): Promise<void> {
        console.log('[MCP Debug] MCPConnector.start() called - ACTUAL METHOD');
        logger.systemLog('[MCP Debug] MCPConnector.start() called - ACTUAL METHOD');
        
        console.log('[MCP Debug] connectionManager exists:', !!this.connectionManager);
        console.log('[MCP Debug] connectionManager type:', typeof this.connectionManager);
        
        try {
            console.log('[MCP Debug] About to call connectionManager.start()');
            logger.systemLog('[MCP Debug] About to call connectionManager.start()');
            await this.connectionManager.start();
            console.log('[MCP Debug] connectionManager.start() completed successfully');
            logger.systemLog('[MCP Debug] connectionManager.start() completed successfully');
        } catch (error) {
            console.error('[MCP Debug] MCPConnector.start() failed:', error);
            logger.systemError(error as Error, '[MCP Debug] MCPConnector.start() failed');
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
     * Stop the MCP server - delegates to MCPConnectionManager
     */
    async stop(): Promise<void> {
        try {
            await this.connectionManager.stop();
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
     * Get the MCP server instance - delegates to MCPConnectionManager
     */
    getServer(): any {
        return this.connectionManager.getServer();
    }
    
    /**
     * Get the connection manager instance
     */
    getConnectionManager(): MCPConnectionManagerInterface {
        return this.connectionManager;
    }
    
    /**
     * Get the tool router instance
     */
    getToolRouter(): ToolCallRouterInterface {
        return this.toolRouter;
    }
    
    /**
     * Get the agent registry instance
     */
    getAgentRegistry(): AgentRegistrationServiceInterface {
        return this.agentRegistry;
    }
    
    /**
     * Get the event manager instance
     */
    getEventManager(): EventManager {
        return this.eventManager;
    }
    
    /**
     * Get the vault librarian instance - delegates to AgentRegistrationService
     */
    getVaultLibrarian(): VaultLibrarianAgent | null {
        return this.agentRegistry.getAgent('vaultLibrarian') as VaultLibrarianAgent | null;
    }
    
    /**
     * Get the memory manager instance - delegates to AgentRegistrationService
     */
    getMemoryManager(): MemoryManagerAgent | null {
        return this.agentRegistry.getAgent('memoryManager') as MemoryManagerAgent | null;
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
