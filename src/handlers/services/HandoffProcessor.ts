import { IHandoffProcessor } from '../interfaces/IRequestHandlerServices';
import { IAgent } from '../../agents/interfaces/IAgent';
import { SessionContextManager } from '../../services/SessionContextManager';
import { ModeCall, ModeCallResult } from '../../types';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../../utils/errorUtils';

export class HandoffProcessor implements IHandoffProcessor {
    async processHandoff(
        result: any,
        getAgent: (name: string) => IAgent,
        sessionId: string,
        sessionContextManager?: SessionContextManager
    ): Promise<any> {
        if (!result.handoff || !result.success) {
            return result;
        }

        if (Array.isArray(result.handoff)) {
            return await this.processMultiHandoff(
                result.handoff,
                result,
                sessionId,
                sessionContextManager
            );
        } else {
            return await this.processSingleHandoff(
                result.handoff,
                getAgent,
                sessionId,
                result.workspaceContext,
                sessionContextManager
            );
        }
    }

    async processSingleHandoff(
        handoff: ModeCall,
        getAgent: (name: string) => IAgent,
        sessionId: string,
        workspaceContext?: any,
        sessionContextManager?: SessionContextManager
    ): Promise<any> {
        try {
            const { tool, mode, parameters, returnHere } = handoff;
            
            const handoffAgent = getAgent(tool);
            
            if (workspaceContext) {
                parameters.workspaceContext = workspaceContext;
            }
            
            if (sessionId && !parameters.sessionId) {
                parameters.sessionId = sessionId;
            }
            
            const handoffResult = await handoffAgent.executeMode(mode, parameters);
            
            if (sessionContextManager && parameters.sessionId && handoffResult.workspaceContext) {
                sessionContextManager.updateFromResult(parameters.sessionId, handoffResult);
            }
            
            return {
                handoffResult,
                returnHere
            };
        } catch (error) {
            logger.systemError(error as Error, 'Single Handoff Error');
            return {
                handoffResult: {
                    success: false,
                    error: getErrorMessage(error)
                },
                returnHere: handoff.returnHere
            };
        }
    }

    async processMultiHandoff(
        handoffs: ModeCall[],
        result: any,
        sessionId: string,
        sessionContextManager?: SessionContextManager
    ): Promise<any> {
        try {
            logger.systemLog(`Processing multi-mode handoff with ${handoffs.length} modes`);
            
            if (sessionContextManager && sessionId && result.handoffResults) {
                const lastSuccessfulResult = result.handoffResults
                    .filter((r: ModeCallResult) => r.success && r.workspaceContext)
                    .pop();
                    
                if (lastSuccessfulResult && lastSuccessfulResult.workspaceContext) {
                    sessionContextManager.updateFromResult(
                        sessionId, 
                        lastSuccessfulResult
                    );
                }
            }
            
            return result;
        } catch (error) {
            logger.systemError(error as Error, 'Multi Handoff Error');
            
            result.handoffResults = handoffs.map((call: ModeCall, index: number) => ({
                success: false,
                error: getErrorMessage(error),
                tool: call.tool,
                mode: call.mode,
                callName: call.callName,
                sequence: index,
                sessionId: sessionId
            }));
            
            result.handoffSummary = {
                successCount: 0,
                failureCount: handoffs.length,
                executionStrategy: 'unknown'
            };
            
            return result;
        }
    }
}