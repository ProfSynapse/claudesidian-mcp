import { BaseToolHandler } from '../base/BaseToolHandler';
import { IAgent } from '../../agents/interfaces/IAgent';
import { SessionContextManager } from '../../services/SessionContextManager';
import { ToolNamingService } from '../services/ToolNamingService';
import { ValidationService } from '../services/ValidationService';
import { SessionService } from '../services/SessionService';
import { HandoffService } from '../services/HandoffService';
import { getErrorMessage } from '../../utils/errorUtils';
import { logger } from '../../utils/logger';
import { safeStringify } from '../../utils/jsonUtils';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Handler for tool execution operations
 * 
 * This handler manages the execution of tools including:
 * - Parameter validation and enhancement
 * - Session context management
 * - Tool execution and handoff processing
 * - Response formatting with session information
 */
export class ToolExecutionHandler extends BaseToolHandler {
    constructor(
        getAgent: (name: string) => IAgent,
        sessionContextManager?: SessionContextManager
    ) {
        super(getAgent, sessionContextManager);
    }
    
    /**
     * Handle tool execution request
     * 
     * @param request The original request object
     * @param parsedArgs The parsed arguments for the tool
     * @returns Promise resolving to the result of the tool execution
     */
    async handleToolExecution(
        request: any,
        parsedArgs: any
    ): Promise<{ content: { type: string; text: string }[] }> {
        try {
            const params = this.extractParams(request);
            const { name: fullToolName } = params;
            
            // Extract base agent name from vault-specific tool name
            const agentName = ToolNamingService.extractAgentNameFromTool(fullToolName);
            
            // Validate arguments
            this.validateArguments(parsedArgs, agentName);
            
            // Extract mode and other parameters
            const { mode, ...toolParams } = parsedArgs as { mode: string; [key: string]: any };
            
            // Perform additional specific validations
            this.performSpecificValidations(agentName, mode, toolParams);
            
            // Get the agent
            const agent = this.validateAndGetAgent(agentName);
            
            // Get and validate the mode
            const modeInstance = this.validateAndGetMode(agent, mode);
            
            // Get parameter schema and validate
            const paramSchema = this.getParameterSchemaSafely(modeInstance, mode);
            const enhancedParams = ValidationService.validateToolParams(toolParams, paramSchema);
            
            // Handle session validation and context
            const processedParams = await this.processSessionContext(enhancedParams);
            
            // Execute the mode on the agent
            const result = await agent.executeMode(mode, processedParams);
            
            // Update session context
            SessionService.updateSessionContext(processedParams.sessionId, result, this.sessionContextManager);
            
            // Handle handoff if specified in the result
            if (result.handoff && result.success) {
                return await HandoffService.executeHandoff(
                    result,
                    processedParams,
                    this.getAgent,
                    this.sessionContextManager
                );
            }
            
            // Enhance result with session instructions if needed
            const enhancedResult = SessionService.enhanceResultWithSessionInstructions(
                processedParams, 
                result, 
                this.sessionContextManager
            );
            
            // Format response with session information if needed
            return this.formatFinalResponse(enhancedResult);
            
        } catch (error) {
            this.handleError(error, 'Tool Execution');
        }
    }
    
    /**
     * Validate that arguments are present and contain required mode
     */
    private validateArguments(parsedArgs: any, agentName: string): void {
        if (!parsedArgs) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Missing arguments for agent ${agentName}`
            );
        }
        
        const { mode } = parsedArgs as { mode: string };
        if (!mode) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Missing required parameter: mode for agent ${agentName}`
            );
        }
    }
    
    /**
     * Perform specific validations for certain agent/mode combinations
     */
    private performSpecificValidations(agentName: string, mode: string, params: any): void {
        // Additional validation for specific modes
        if (agentName === 'projectManager') {
            if (mode === 'createWorkspace') {
                if (!params.name) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: name for createWorkspace mode`
                    );
                }
                if (!params.rootFolder) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: rootFolder for createWorkspace mode`
                    );
                }
            } else if (mode === 'loadWorkspace') {
                if (!params.id) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: id for loadWorkspace mode`
                    );
                }
            }
        } else if (agentName === 'memoryManager') {
            if (mode === 'createState') {
                if (!params.name) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: name for createState mode`
                    );
                }
            }
        } else if (agentName === 'vaultManager') {
            if (mode === 'listFolders' || mode === 'createFolder' || mode === 'listFiles') {
                if (!params.path) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: path for ${mode} mode`
                    );
                }
            }
        } else if (agentName === 'contentManager') {
            if (mode === 'createContent') {
                if (!params.filePath) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: filePath for createContent mode`
                    );
                }
                if (params.content === undefined || params.content === null) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: content for createContent mode`
                    );
                }
            }
        } else if (agentName === 'vaultLibrarian') {
            if (mode === 'search') {
                if (!params.type) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: type for search mode (must be one of: content, tag, property)`
                    );
                }
                
                // Additional validations based on search type
                if (params.type === 'content' && !params.query) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: query for content search`
                    );
                } else if (params.type === 'tag' && !params.tag) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: tag for tag search`
                    );
                } else if (params.type === 'property' && !params.key) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: key for property search`
                    );
                }
            }
        }
    }
    
    /**
     * Safely get parameter schema from mode instance
     */
    private getParameterSchemaSafely(modeInstance: any, mode: string): any {
        let paramSchema;
        
        try {
            if (modeInstance && typeof modeInstance.getParameterSchema === 'function') {
                paramSchema = modeInstance.getParameterSchema();
            }
        } catch (error) {
            logger.systemWarn(`Failed to get parameter schema for mode ${mode}: ${getErrorMessage(error)}`);
        }
        
        return paramSchema;
    }
    
    /**
     * Process session context including validation and workspace application
     */
    private async processSessionContext(enhancedParams: any): Promise<any> {
        let processedParams = { ...enhancedParams };
        
        // Validate session ID if SessionContextManager is available
        let originalSessionId = enhancedParams.sessionId;
        
        if (this.sessionContextManager && enhancedParams.sessionId) {
            try {
                // Process the session ID
                const validatedSessionId = await this.sessionContextManager.validateSessionId(enhancedParams.sessionId);
                
                // Check if the session ID was changed and set appropriate flags
                if (validatedSessionId !== enhancedParams.sessionId) {
                    processedParams._isNonStandardId = true;
                    processedParams._originalSessionId = enhancedParams.sessionId;
                    processedParams.sessionId = validatedSessionId;
                    logger.systemLog(`Session ID standardized from \"${processedParams._originalSessionId}\" to \"${validatedSessionId}\"`);
                }
            } catch (error) {
                logger.systemWarn(`Session validation failed: ${getErrorMessage(error)}. Using original ID`);
            }
        }
        
        // Apply workspace context from SessionContextManager if available
        if (this.sessionContextManager && processedParams.sessionId) {
            // Only apply if no workspaceContext is explicitly provided
            if (!processedParams.workspaceContext || !processedParams.workspaceContext.workspaceId) {
                processedParams = this.sessionContextManager.applyWorkspaceContext(processedParams.sessionId, processedParams);
            }
        }
        
        return processedParams;
    }
    
    /**
     * Format the final response with session information if needed
     */
    private formatFinalResponse(enhancedResult: any): { content: { type: string; text: string }[] } {
        // Check if we need to format the response with session information
        const hasSessionInfo = enhancedResult.sessionInstructions || 
                              enhancedResult.sessionIdCorrection || 
                              enhancedResult.newSessionInfo;
        
        if (hasSessionInfo) {
            const baseResponseText = safeStringify(enhancedResult);
            const responseText = SessionService.formatResponseWithSessionInfo(enhancedResult, baseResponseText);
            
            return {
                content: [{
                    type: "text",
                    text: responseText
                }]
            };
        }
        
        return {
            content: [{
                type: "text",
                text: safeStringify(enhancedResult)
            }]
        };
    }
}