import { IResponseFormatter } from '../interfaces/IRequestHandlerServices';
import { safeStringify } from '../../utils/jsonUtils';
import { 
    formatSessionInstructions,
    enhanceContextWithSessionInstructions 
} from '../../utils/sessionUtils';

export class ResponseFormatter implements IResponseFormatter {
    formatToolExecutionResponse(result: any, sessionInfo?: any): any {
        // Check if result contains an error and format it appropriately
        if (result && !result.success && result.error) {
            return this.formatDetailedError(result, sessionInfo);
        }
        
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

    /**
     * Format detailed error with helpful context
     * Shows the actual error message and any additional context that can help the AI fix the issue
     */
    private formatDetailedError(result: any, sessionInfo?: any): any {
        let errorText = `❌ Error: ${result.error}\n\n`;
        
        // Add parameter-specific hints if available
        if (result.parameterHints) {
            errorText += `💡 Parameter Help:\n${result.parameterHints}\n\n`;
        }
        
        // Add what was provided vs what was expected
        if (result.providedParams) {
            errorText += `📋 Provided Parameters:\n${safeStringify(result.providedParams)}\n\n`;
        }
        
        if (result.expectedParams) {
            errorText += `✅ Expected Parameters:\n${safeStringify(result.expectedParams)}\n\n`;
        }
        
        // Add suggestions for common mistakes
        if (result.suggestions) {
            errorText += `💭 Suggestions:\n`;
            for (const suggestion of result.suggestions) {
                errorText += `  • ${suggestion}\n`;
            }
            errorText += '\n';
        }
        
        // Include the full result object for debugging
        errorText += `🔍 Full Error Details:\n${safeStringify(result)}`;
        
        return {
            content: [{
                type: "text",
                text: errorText
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