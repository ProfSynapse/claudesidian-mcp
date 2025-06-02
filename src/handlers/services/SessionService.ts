import { 
    formatSessionInstructions, 
    enhanceContextWithSessionInstructions 
} from '../../utils/sessionUtils';
import { SessionContextManager } from '../../services/SessionContextManager';

/**
 * Service for handling session-related operations
 * 
 * This service manages session instructions, context enhancement,
 * and session state tracking for tool execution.
 */
export class SessionService {
    /**
     * Check if session instructions are needed and enhance result accordingly
     * 
     * @param params Tool execution parameters
     * @param result Tool execution result
     * @param sessionContextManager Session context manager instance
     * @returns Enhanced result with session instructions if needed
     */
    static enhanceResultWithSessionInstructions(
        params: any, 
        result: any, 
        sessionContextManager?: SessionContextManager
    ): any {
        const needsInstructions = (params._isNewSession || params._isNonStandardId) && 
                               result && 
                               sessionContextManager && 
                               !sessionContextManager.hasReceivedInstructions(params.sessionId);
        
        if (!needsInstructions) {
            return result;
        }
        
        // Record the session ID we expect to be used
        result.sessionId = params.sessionId;
        
        // Create mandatory session instructions
        const sessionInstructions = formatSessionInstructions(params.sessionId);
        result.sessionInstructions = sessionInstructions;
        
        // Add instructions to the context field which many agents display to the LLM
        if (result.context) {
            result.context = enhanceContextWithSessionInstructions(params.sessionId, result.context);
        } else {
            result.context = sessionInstructions;
        }
        
        // Also add information about this being a new session
        const originalSessionId = params._originalSessionId;
        if (params._isNewSession && !originalSessionId) {
            result.newSessionInfo = {
                sessionId: params.sessionId,
                message: "A new session has been created. This ID must be used for all future requests in this conversation."
            };
        } else if (params._isNonStandardId) {
            result.sessionIdCorrection = {
                originalId: params._originalSessionId,
                correctedId: params.sessionId,
                message: "Your session ID has been standardized. Please use this corrected session ID for all future requests in this conversation."
            };
        }
        
        // Mark this session as having received instructions
        if (sessionContextManager) {
            sessionContextManager.markInstructionsReceived(params.sessionId);
        }
        
        return result;
    }
    
    /**
     * Format response text with session instructions prominently displayed
     * 
     * @param result Tool execution result with session information
     * @param responseText Base response text
     * @returns Formatted response text with session instructions
     */
    static formatResponseWithSessionInfo(result: any, responseText: string): string {
        if (!result.sessionInstructions && !result.sessionIdCorrection && !result.newSessionInfo) {
            return responseText;
        }
        
        let formattedResponse = "";
        
        if (result.sessionIdCorrection) {
            formattedResponse += `🔄 SESSION ID UPDATED: Please use session ID "${result.sessionIdCorrection.correctedId}" for all future requests in this conversation.\n\n`;
        } else if (result.newSessionInfo) {
            formattedResponse += `🆕 SESSION CREATED: Please use session ID "${result.newSessionInfo.sessionId}" for all future requests in this conversation.\n\n`;
        }
        
        formattedResponse += responseText;
        
        return formattedResponse;
    }
    
    /**
     * Update session context manager with result data
     * 
     * @param sessionId Session ID
     * @param result Tool execution result
     * @param sessionContextManager Session context manager instance
     */
    static updateSessionContext(
        sessionId: string,
        result: any,
        sessionContextManager?: SessionContextManager
    ): void {
        if (sessionContextManager && sessionId && result.workspaceContext) {
            sessionContextManager.updateFromResult(sessionId, result);
        }
    }
}