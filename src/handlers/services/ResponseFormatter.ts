import { IResponseFormatter } from '../interfaces/IRequestHandlerServices';
import { safeStringify } from '../../utils/jsonUtils';
import { 
    formatSessionInstructions,
    enhanceContextWithSessionInstructions 
} from '../../utils/sessionUtils';

export class ResponseFormatter implements IResponseFormatter {
    formatToolExecutionResponse(result: any, sessionInfo?: any): any {
        if (sessionInfo && this.needsSessionInstructions(sessionInfo, result)) {
            return this.formatWithSessionInstructions(result, sessionInfo);
        }
        
        return {
            content: [{
                type: "text",
                text: safeStringify(result)
            }]
        };
    }

    formatSessionInstructions(sessionId: string, result: any): any {
        result.sessionId = sessionId;
        
        const sessionInstructions = formatSessionInstructions(sessionId);
        result.sessionInstructions = sessionInstructions;
        
        if (result.context) {
            result.context = enhanceContextWithSessionInstructions(sessionId, result.context);
        } else {
            result.context = sessionInstructions;
        }
        
        return result;
    }

    formatHandoffResponse(result: any, handoffResult: any, returnHere: boolean): any {
        if (returnHere) {
            result.handoffResult = handoffResult;
            return {
                content: [{
                    type: "text",
                    text: safeStringify(result)
                }]
            };
        } else {
            return {
                content: [{
                    type: "text",
                    text: safeStringify(handoffResult)
                }]
            };
        }
    }

    formatErrorResponse(error: Error): any {
        return {
            content: [{
                type: "text",
                text: `Error: ${error.message}`
            }]
        };
    }

    private needsSessionInstructions(sessionInfo: any, result: any): boolean {
        return (sessionInfo.isNewSession || sessionInfo.isNonStandardId) &&
               result &&
               sessionInfo.shouldInjectInstructions;
    }

    private formatWithSessionInstructions(result: any, sessionInfo: any): any {
        this.formatSessionInstructions(sessionInfo.sessionId, result);
        
        if (sessionInfo.isNewSession && !sessionInfo.originalSessionId) {
            result.newSessionInfo = {
                sessionId: sessionInfo.sessionId,
                message: "A new session has been created. This ID must be used for all future requests in this conversation."
            };
        } else if (sessionInfo.isNonStandardId) {
            result.sessionIdCorrection = {
                originalId: sessionInfo.originalSessionId,
                correctedId: sessionInfo.sessionId,
                message: "Your session ID has been standardized. Please use this corrected session ID for all future requests in this conversation."
            };
        }
        
        let responseText = "";
        
        if (result.sessionIdCorrection) {
            responseText += `🔄 SESSION ID UPDATED: Please use session ID "${result.sessionIdCorrection.correctedId}" for all future requests in this conversation.\n\n`;
        } else if (result.newSessionInfo) {
            responseText += `🆕 SESSION CREATED: Please use session ID "${result.newSessionInfo.sessionId}" for all future requests in this conversation.\n\n`;
        }
        
        responseText += safeStringify(result);
        
        return {
            content: [{
                type: "text",
                text: responseText
            }]
        };
    }
}