/**
 * AgentExecutionManager - Handles agent execution and session management
 * Follows Single Responsibility Principle by focusing only on agent execution
 */

import { AgentRegistry } from '../services/AgentRegistry';
import { SessionContextManager } from '../../services/SessionContextManager';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../../utils/errorUtils';
import { generateModeHelp, formatModeHelp } from '../../utils/parameterHintUtils';

/**
 * Service responsible for agent execution and session management
 * Follows SRP by focusing only on agent execution operations
 */
export class AgentExecutionManager {
    constructor(
        private agentRegistry: AgentRegistry,
        private sessionContextManager?: SessionContextManager
    ) {}

    /**
     * Execute a mode on an agent
     */
    async executeAgentMode(agentName: string, mode: string, params: any): Promise<any> {
        try {
            // Get the agent
            const agent = this.agentRegistry.validateAndGetAgent(agentName);

            // Process session context
            const processedParams = await this.processSessionContext(params);

            // Execute the mode
            const result = await agent.executeMode(mode, processedParams);

            // Update session context with result
            await this.updateSessionContext(processedParams, result);

            // Add session instructions if needed
            return this.addSessionInstructions(processedParams, result);
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
     * Get detailed help for a specific mode
     */
    getModeHelp(agentName: string, modeName: string): string {
        try {
            // Get the agent
            const agent = this.agentRegistry.validateAndGetAgent(agentName);

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
     * Process session context for parameters
     */
    private async processSessionContext(params: any): Promise<any> {
        if (!this.sessionContextManager || !params.sessionId) {
            return params;
        }

        const originalSessionId = params.sessionId;

        try {
            // DIAGNOSTIC: Track session ID flow
            logger.systemLog(`[SESSION-DEBUG] AgentExecutionManager - Input sessionId: "${params.sessionId}"`);
            
            // Validate session ID - destructure the result to get the actual ID
            const {id: validatedSessionId, created} = await this.sessionContextManager.validateSessionId(params.sessionId);
            
            logger.systemLog(`[SESSION-DEBUG] AgentExecutionManager - validateSessionId returned: id="${validatedSessionId}", created=${created}`);
            
            params.sessionId = validatedSessionId;
            
            logger.systemLog(`[SESSION-DEBUG] AgentExecutionManager - Final sessionId: "${params.sessionId}"`);

            // Apply workspace context
            params = this.sessionContextManager.applyWorkspaceContext(params.sessionId, params);

            return params;
        } catch (error) {
            logger.systemWarn(`Session validation failed: ${getErrorMessage(error)}. Using original ID`);
            return params;
        }
    }

    /**
     * Update session context with execution result
     */
    private async updateSessionContext(params: any, result: any): Promise<void> {
        if (!this.sessionContextManager || !params.sessionId || !result.workspaceContext) {
            return;
        }

        try {
            this.sessionContextManager.updateFromResult(params.sessionId, result);
        } catch (error) {
            logger.systemWarn(`Session context update failed: ${getErrorMessage(error)}`);
        }
    }

    /**
     * Add session instructions to result if needed
     */
    private addSessionInstructions(params: any, result: any): any {
        if (!this.sessionContextManager) {
            return result;
        }

        const needsInstructions = (params._isNewSession || params._isNonStandardId) && 
                               result && 
                               !this.sessionContextManager.hasReceivedInstructions(params.sessionId);

        if (!needsInstructions) {
            return result;
        }

        // Add session instructions
        if (params._isNonStandardId && params._originalSessionId) {
            result.sessionIdCorrection = {
                originalId: params._originalSessionId,
                correctedId: params.sessionId,
                message: "Your session ID has been standardized. Please use this corrected session ID for all future requests in this conversation."
            };
        } else if (params._isNewSession && !params._originalSessionId) {
            result.newSessionInfo = {
                sessionId: params.sessionId,
                message: "A new session has been created. This ID must be used for all future requests in this conversation."
            };
        }

        // Mark instructions as received
        this.sessionContextManager.markInstructionsReceived(params.sessionId);

        return result;
    }

    /**
     * Add auto-generated session info if needed
     */
    private addAutoGeneratedSessionInfo(params: any, result: any): any {
        if (!params._autoGeneratedSessionId || !result || params._originalSessionId) {
            return result;
        }

        result.newSessionId = params.sessionId;
        result.validSessionInfo = {
            originalId: null,
            newId: params.sessionId,
            message: "No session ID was provided. A new session has been created. Please use this session ID for future requests."
        };

        return result;
    }

    /**
     * Get execution statistics
     */
    getExecutionStatistics(): {
        totalAgents: number;
        totalModes: number;
        availableModes: Array<{
            agentName: string;
            modeName: string;
            description: string;
        }>;
        hasSessionManager: boolean;
    } {
        const agentStats = this.agentRegistry.getAgentStatistics();
        const availableModes = this.agentRegistry.getAllAvailableModes();

        return {
            totalAgents: agentStats.totalAgents,
            totalModes: availableModes.length,
            availableModes,
            hasSessionManager: !!this.sessionContextManager
        };
    }

    /**
     * Validate execution parameters
     */
    validateExecutionParameters(agentName: string, mode: string, params: any): {
        isValid: boolean;
        errors: string[];
        warnings: string[];
    } {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate agent name
        if (!agentName || typeof agentName !== 'string') {
            errors.push('Agent name must be a non-empty string');
        } else if (!this.agentRegistry.hasAgent(agentName)) {
            errors.push(`Agent ${agentName} not found`);
        }

        // Validate mode
        if (!mode || typeof mode !== 'string') {
            errors.push('Mode must be a non-empty string');
        } else if (agentName && !this.agentRegistry.agentSupportsMode(agentName, mode)) {
            errors.push(`Agent ${agentName} does not support mode ${mode}`);
        }

        // Validate params
        if (params === null || params === undefined) {
            errors.push('Parameters cannot be null or undefined');
        } else if (typeof params !== 'object') {
            errors.push('Parameters must be an object');
        }

        // Session warnings
        if (params && params.sessionId && !this.sessionContextManager) {
            warnings.push('Session ID provided but no session context manager available');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Execute agent mode with validation
     */
    async executeAgentModeWithValidation(agentName: string, mode: string, params: any): Promise<any> {
        // Validate parameters
        const validation = this.validateExecutionParameters(agentName, mode, params);
        
        if (!validation.isValid) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Invalid execution parameters: ${validation.errors.join(', ')}`
            );
        }

        // Log warnings
        validation.warnings.forEach(warning => {
            logger.systemWarn(warning);
        });

        // Execute with validation passed
        return await this.executeAgentMode(agentName, mode, params);
    }

    /**
     * Get agent mode schema
     */
    getAgentModeSchema(agentName: string, modeName: string): any {
        const agent = this.agentRegistry.validateAndGetAgent(agentName);
        const mode = agent.getMode(modeName);

        if (!mode) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Mode ${modeName} not found in agent ${agentName}`
            );
        }

        return mode.getParameterSchema();
    }

    /**
     * Get execution context info
     */
    getExecutionContextInfo(sessionId?: string): {
        hasSessionManager: boolean;
        sessionContext?: any;
        workspaceContext?: any;
    } {
        const info: any = {
            hasSessionManager: !!this.sessionContextManager
        };

        if (this.sessionContextManager && sessionId) {
            try {
                // Get session context if available
                const sessionContext = (this.sessionContextManager as any).getSessionContext?.(sessionId);
                if (sessionContext) {
                    info.sessionContext = sessionContext;
                }
                
                // Get workspace context if available
                const workspaceContext = (this.sessionContextManager as any).getWorkspaceContext?.(sessionId);
                if (workspaceContext) {
                    info.workspaceContext = workspaceContext;
                }
            } catch (error) {
                logger.systemWarn(`Failed to get execution context: ${getErrorMessage(error)}`);
            }
        }

        return info;
    }
}