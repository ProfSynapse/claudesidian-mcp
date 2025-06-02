import { safeStringify } from '../../utils/jsonUtils';
import { getErrorMessage } from '../../utils/errorUtils';
import { logger } from '../../utils/logger';
import { IAgent } from '../../agents/interfaces/IAgent';
import { SessionContextManager } from '../../services/SessionContextManager';
import { ModeCall, ModeCallResult } from '../../types';
import { SessionService } from './SessionService';

/**
 * Service for handling tool handoff operations
 * 
 * This service manages both single and multi-mode handoffs,
 * including result processing and context management.
 */
export class HandoffService {
    /**
     * Execute a handoff operation (single or multi-mode)
     * 
     * @param result Original tool result containing handoff information
     * @param processedParams Processed parameters from original execution
     * @param getAgent Function to get agent by name
     * @param sessionContextManager Optional session context manager
     * @returns Formatted response content for the handoff result
     */
    static async executeHandoff(
        result: any,
        processedParams: any,
        getAgent: (name: string) => IAgent,
        sessionContextManager?: SessionContextManager
    ): Promise<{ content: { type: string; text: string }[] }> {
        if (!result.handoff || !result.success) {
            throw new Error('Invalid handoff: result must have handoff property and be successful');
        }
        
        try {
            // Check if this is a multi-mode handoff
            if (Array.isArray(result.handoff)) {
                return await this.executeMultiModeHandoff(
                    result, 
                    processedParams, 
                    sessionContextManager
                );
            } else {
                return await this.executeSingleModeHandoff(
                    result, 
                    processedParams, 
                    getAgent, 
                    sessionContextManager
                );
            }
        } catch (handoffError) {
            logger.systemError(handoffError as Error, 'Handoff Error');
            
            // Handle handoff failure
            if (Array.isArray(result.handoff)) {
                this.handleMultiModeHandoffFailure(result, handoffError, processedParams);
            } else {
                this.handleSingleModeHandoffFailure(result, handoffError);
            }
            
            return {
                content: [{
                    type: "text",
                    text: safeStringify(result)
                }]
            };
        }
    }
    
    /**
     * Execute multi-mode handoff
     */
    private static async executeMultiModeHandoff(
        result: any,
        processedParams: any,
        sessionContextManager?: SessionContextManager
    ): Promise<{ content: { type: string; text: string }[] }> {
        logger.systemLog(`Processing multi-mode handoff with ${result.handoff.length} modes`);
        
        // The actual execution happens in baseAgent, we just need to handle the results here
        // Update context manager with handoff results if they contain workspace context
        if (sessionContextManager && processedParams.sessionId && result.handoffResults) {
            // Update from the last successful result that has workspace context
            const lastSuccessfulResult = result.handoffResults
                .filter((r: ModeCallResult) => r.success && r.workspaceContext)
                .pop();
                
            if (lastSuccessfulResult && lastSuccessfulResult.workspaceContext) {
                SessionService.updateSessionContext(
                    processedParams.sessionId, 
                    lastSuccessfulResult,
                    sessionContextManager
                );
            }
        }
        
        // Return the result with all handoff results included
        return {
            content: [{
                type: "text",
                text: safeStringify(result)
            }]
        };
    }
    
    /**
     * Execute single mode handoff
     */
    private static async executeSingleModeHandoff(
        result: any,
        processedParams: any,
        getAgent: (name: string) => IAgent,
        sessionContextManager?: SessionContextManager
    ): Promise<{ content: { type: string; text: string }[] }> {
        const { tool, mode: handoffMode, parameters, returnHere } = result.handoff as ModeCall;
        
        // Get the agent to hand off to
        const handoffAgent = getAgent(tool);
        
        // Include the workspace context in the handoff parameters if it exists in the original result
        if (result.workspaceContext) {
            parameters.workspaceContext = result.workspaceContext;
        }
        
        // Ensure sessionId is passed to the handoff operation
        if (processedParams.sessionId && !parameters.sessionId) {
            parameters.sessionId = processedParams.sessionId;
        }
        
        // Execute the handoff
        const handoffResult = await handoffAgent.executeMode(handoffMode, parameters);
        
        // Update context manager with handoff result if it contains workspace context
        SessionService.updateSessionContext(
            parameters.sessionId,
            handoffResult,
            sessionContextManager
        );
        
        // If returnHere is true, return combined results
        if (returnHere) {
            result.handoffResult = handoffResult;
            return {
                content: [{
                    type: "text",
                    text: safeStringify(result)
                }]
            };
        } else {
            // Otherwise, return just the handoff result
            return {
                content: [{
                    type: "text",
                    text: safeStringify(handoffResult)
                }]
            };
        }
    }
    
    /**
     * Handle multi-mode handoff failure
     */
    private static handleMultiModeHandoffFailure(
        result: any,
        handoffError: any,
        processedParams: any
    ): void {
        result.handoffResults = result.handoff.map((call: ModeCall, index: number) => ({
            success: false,
            error: getErrorMessage(handoffError),
            tool: call.tool,
            mode: call.mode,
            callName: call.callName,
            sequence: index,
            sessionId: processedParams.sessionId
        }));
        
        result.handoffSummary = {
            successCount: 0,
            failureCount: result.handoff.length,
            executionStrategy: 'unknown'
        };
    }
    
    /**
     * Handle single mode handoff failure
     */
    private static handleSingleModeHandoffFailure(result: any, handoffError: any): void {
        result.handoffResult = {
            success: false,
            error: getErrorMessage(handoffError)
        };
    }
}