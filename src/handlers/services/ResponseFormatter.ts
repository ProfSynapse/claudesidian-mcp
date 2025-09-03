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
        return result;
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
        
        let responseText = "";
        
        if (sessionInfo.isNonStandardId) {
            responseText += `🔄 SESSION ID: ${sessionInfo.sessionId} - MANDATORY: Use this ID in all future requests, do NOT use the name.\n\n`;
        } else if (sessionInfo.isNewSession) {
            responseText += `🆕 SESSION ID: ${sessionInfo.sessionId} - MANDATORY: Use this ID in all future requests, do NOT use the name.\n\n`;
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