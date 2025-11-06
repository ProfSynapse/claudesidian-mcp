import { App, Plugin } from 'obsidian';
import ClaudesidianPlugin from './main';
import { EventManager } from './services/EventManager';
import { SessionContextManager, WorkspaceContext } from './services/SessionContextManager';
import type { ServiceManager } from './core/ServiceManager';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { logger } from './utils/logger';
import { CustomPromptStorageService } from "./agents/agentManager/services/CustomPromptStorageService";
import { generateSessionId, formatSessionInstructions, isStandardSessionId } from './utils/sessionUtils';
import { getContextSchema } from './utils/schemaUtils';
// ToolCallCaptureService removed in simplified architecture

// Extracted services
import { MCPConnectionManager, MCPConnectionManagerInterface } from './services/mcp/MCPConnectionManager';
import { ToolCallRouter, ToolCallRouterInterface } from './services/mcp/ToolCallRouter';
import { AgentRegistrationService, AgentRegistrationServiceInterface } from './services/agent/AgentRegistrationService';

// Type definitions
import { AgentModeParams } from './types/agent/AgentTypes';
import { VaultLibrarianAgent } from './agents';
import { MemoryManagerAgent } from './agents';
import { AGENTS } from './config/agentConfigs';


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
    private sessionContextManager: SessionContextManager | null = null;
    private customPromptStorage?: CustomPromptStorageService;
    private serviceManager?: ServiceManager;

    constructor(
        private app: App,
        private plugin: Plugin | ClaudesidianPlugin
    ) {
        // Initialize core components
        this.eventManager = new EventManager();
        // SessionContextManager will be retrieved from ServiceManager via lazy getter

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
        // Note: SessionContextManager will be retrieved lazily from ServiceManager when needed
        this.connectionManager = new MCPConnectionManager(
            this.app,
            this.plugin,
            this.eventManager,
            this.serviceManager,
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
     * Lazy getter for SessionContextManager from ServiceManager
     * Ensures we use the properly initialized instance with SessionService injected
     */
    private getSessionContextManagerFromService(): SessionContextManager {
        if (!this.sessionContextManager) {
            if (!this.serviceManager) {
                throw new Error('[MCPConnector] ServiceManager not available - cannot get SessionContextManager');
            }

            this.sessionContextManager = this.serviceManager.getServiceIfReady('sessionContextManager');

            if (!this.sessionContextManager) {
                throw new Error('[MCPConnector] SessionContextManager not available from ServiceManager');
            }
        }
        return this.sessionContextManager;
    }

    /**
     * Handle tool call responses - now handled by ToolCallTraceService via MCPConnectionManager
     */
    private async onToolResponse(toolName: string, params: any, response: any, success: boolean, executionTime: number): Promise<void> {
        // Tool call tracing is now handled by ToolCallTraceService
        // This callback is kept for backward compatibility
    }

    /**
     * Handle tool calls - now handled by ToolCallTraceService via MCPConnectionManager
     */
    private async onToolCall(toolName: string, params: any): Promise<void> {
        // Tool call tracing is now handled by ToolCallTraceService
        // This callback is kept for backward compatibility
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
     * Get available tools for ChatService - Bounded Context Discovery
     * Returns single get_tools meta-tool instead of all 46 tools
     */
    getAvailableTools(): any[] {
        // Build agent enum values with descriptions
        const agentDescriptions = AGENTS.map(a => `- ${a.name}: ${a.description}`).join('\n');

        // Get standard context schema to ensure sessionId persistence
        const contextSchema = getContextSchema();

        const getToolsTool = {
            name: 'get_tools',
            description: `Discover available tools for specific agents. Each agent represents a bounded context of related operations:\n\n${agentDescriptions}\n\nCall this to get tool schemas for the capabilities you need. You can request multiple agents at once.`,
            inputSchema: {
                type: 'object',
                properties: {
                    agents: {
                        type: 'array',
                        items: {
                            type: 'string',
                            enum: AGENTS.map(a => a.name)
                        },
                        description: 'Array of agent names to retrieve tools for'
                    },
                    ...contextSchema
                },
                required: ['agents', 'context']
            }
        };

        return [getToolsTool];
    }

    /**
     * Get tools for specific agents (called via get_tools meta-tool)
     * Returns clean schemas WITHOUT common parameters to reduce context bloat
     */
    private getToolsForAgents(agentNames: string[]): any[] {
        const tools: any[] = [];

        if (!this.agentRegistry) {
            return [];
        }

        const registeredAgents = this.agentRegistry.getAllAgents();

        // Validate requested agent names
        const validAgentNames = agentNames.filter(name =>
            AGENTS.some(a => a.name === name)
        );

        if (validAgentNames.length === 0) {
            return [];
        }

        for (const [agentName, agent] of registeredAgents) {
            // Only include tools for requested agents
            if (!validAgentNames.includes(agentName)) {
                continue;
            }

            const modes = (agent as any).getModes?.() || [];

            // getModes returns an array, so iterate directly over modes
            for (const mode of modes) {
                const modeInstance = mode as any;
                if (modeInstance && typeof modeInstance.getParameterSchema === 'function') {
                    try {
                        const paramSchema = modeInstance.getParameterSchema();

                        // Strip common parameters to reduce context bloat
                        // The instruction in get_tools result will tell LLM to add them
                        const cleanSchema = this.stripCommonParameters(paramSchema);

                        const modeName = modeInstance.slug || modeInstance.name || 'unknown';
                        tools.push({
                            name: `${agentName}_${modeName}`,
                            description: modeInstance.description || `Execute ${modeName} on ${agentName}`,
                            inputSchema: cleanSchema
                        });
                    } catch (error) {
                        // Skip modes with invalid schemas
                    }
                }
            }
        }

        return tools;
    }

    /**
     * Strip common parameters from tool schema to reduce context bloat
     * Common parameters (context, workspaceContext, sessionId) are documented in get_tools instruction
     */
    private stripCommonParameters(schema: any): any {
        if (!schema || !schema.properties) {
            return schema;
        }

        const { context, workspaceContext, sessionId, ...cleanProperties } = schema.properties;
        const cleanRequired = (schema.required || []).filter(
            (field: string) => field !== 'context' && field !== 'workspaceContext' && field !== 'sessionId'
        );

        return {
            ...schema,
            properties: cleanProperties,
            required: cleanRequired.length > 0 ? cleanRequired : undefined
        };
    }

    async callTool(params: AgentModeParams): Promise<any> {
        try {
            const { agent, mode, params: modeParams } = params;

            // ========================================
            // BOUNDED CONTEXT TOOL DISCOVERY - Intercept get_tools meta-tool
            // ========================================
            if (agent === 'get' && mode === 'tools') {
                // This is a call to the get_tools meta-tool
                const agentNames = modeParams.agents || modeParams.context?.agents || [];

                if (!Array.isArray(agentNames) || agentNames.length === 0) {
                    return {
                        success: false,
                        error: 'agents parameter must be a non-empty array of agent names'
                    };
                }

                const tools = this.getToolsForAgents(agentNames);
                const sessionId = modeParams.context?.sessionId;
                const workspaceId = modeParams.context?.workspaceId || 'default';

                // Instruction for LLM to add common parameters to every tool call
                const instruction = `
IMPORTANT: All ${tools.length} tools returned require a 'context' parameter that was omitted from schemas to reduce token usage.

You MUST add the following 'context' object to EVERY tool call:

{
  "context": {
    "sessionId": "${sessionId || 'REQUIRED'}",
    "workspaceId": "${workspaceId}",
    "sessionDescription": "Brief description of current session (10+ chars)",
    "sessionMemory": "Summary of conversation so far (10+ chars)",
    "toolContext": "Why using this tool now (5+ chars)",
    "primaryGoal": "Overall conversation goal (5+ chars)",
    "subgoal": "What this specific call accomplishes (5+ chars)"
  }
}

All 7 fields in context are REQUIRED for every tool call. Update sessionDescription/sessionMemory as conversation evolves.
Keep sessionId and workspaceId values EXACTLY as shown above throughout the conversation.
`.trim();

                return {
                    success: true,
                    tools: tools,
                    agentNames: agentNames,
                    toolCount: tools.length,
                    instruction: instruction
                };
            }

            // ========================================
            // SESSION VALIDATION & WORKSPACE CONTEXT INJECTION
            // ========================================

            // 1. SESSION ID VALIDATION: Extract and validate/generate sessionId first
            const providedSessionId = modeParams.context?.sessionId || modeParams.sessionId;
            let validatedSessionId: string;
            let isNewSession = false;
            let isNonStandardId = false;

            if (!providedSessionId || !isStandardSessionId(providedSessionId)) {
                // No sessionId or non-standard format - generate a new one
                validatedSessionId = generateSessionId();
                isNewSession = true;
                isNonStandardId = !!providedSessionId; // True if they provided a friendly name
            } else {
                // Valid standard sessionId - use it
                validatedSessionId = providedSessionId;
            }

            // 2. INJECT VALIDATED SESSION ID into all relevant locations
            if (!modeParams.context) {
                modeParams.context = {};
            }
            modeParams.context.sessionId = validatedSessionId;
            modeParams.sessionId = validatedSessionId;

            // 3. WORKSPACE CONTEXT LOOKUP FROM SESSION
            const sessionContextManager = this.getSessionContextManagerFromService();
            const workspaceContext = sessionContextManager.getWorkspaceContext(validatedSessionId);

            if (workspaceContext) {
                // Inject workspace context from session
                modeParams.workspaceContext = workspaceContext;
                modeParams.context.workspaceId = workspaceContext.workspaceId;
            } else {
                // Fallback to default if no session workspace
                if (!modeParams.workspaceContext) {
                    modeParams.workspaceContext = { workspaceId: 'default' };
                } else if (!modeParams.workspaceContext.workspaceId) {
                    modeParams.workspaceContext.workspaceId = 'default';
                }

                if (modeParams.context && !modeParams.context.workspaceId) {
                    modeParams.context.workspaceId = modeParams.workspaceContext.workspaceId;
                }
            }

            // Delegate validation and execution to ToolCallRouter
            this.toolRouter.validateBatchOperations(modeParams);
            const startTime = Date.now();
            const result = await this.toolRouter.executeAgentMode(agent, mode, modeParams);
            const executionTime = Date.now() - startTime;

            // ========================================
            // CAPTURE TOOL CALL TRACE TO WORKSPACE
            // ========================================
            const traceService = this.serviceManager?.getServiceIfReady?.('toolCallTraceService') as any;
            if (traceService && typeof traceService.captureToolCall === 'function') {
                const toolName = `${agent}_${mode}`;
                const success = !result?.error;

                traceService.captureToolCall(
                    toolName,
                    modeParams,
                    result,
                    success,
                    executionTime
                ).catch((err: Error) => {
                    // Silent error handling for tool trace capture
                });
            }

            // ========================================
            // INJECT SESSION ID AND INSTRUCTIONS INTO RESULT
            // ========================================

            // Ensure result has the validated sessionId
            if (result && typeof result === 'object') {
                result.sessionId = validatedSessionId;
                result.workspaceId = modeParams.workspaceContext.workspaceId;

                // Add session instructions if this is a new session or non-standard ID
                if (isNewSession || isNonStandardId) {
                    const instructions = formatSessionInstructions(validatedSessionId);

                    // Add to recommendations array (common pattern in results)
                    if (!result.recommendations) {
                        result.recommendations = [];
                    }
                    result.recommendations.unshift({
                        type: 'session_management',
                        message: instructions
                    });

                    // Also add as a top-level field for visibility
                    result.sessionInstructions = instructions;
                }
            }

            return result;
            
        } catch (error) {
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
     * Start the MCP server - delegates to MCPConnectionManager
     */
    async start(): Promise<void> {
        try {
            // Initialize agents and connection manager first
            await this.initializeAgents();

            // Then start the server
            await this.connectionManager.start();
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
        return this.getSessionContextManagerFromService();
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
        
        this.getSessionContextManagerFromService().setDefaultWorkspaceContext(context);
        return true;
    }

    /**
     * Clear the default workspace context
     */
    clearDefaultWorkspaceContext(): void {
        this.getSessionContextManagerFromService().setDefaultWorkspaceContext(null);
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
        
        this.getSessionContextManagerFromService().setWorkspaceContext(sessionId, context);
        return true;
    }
}
