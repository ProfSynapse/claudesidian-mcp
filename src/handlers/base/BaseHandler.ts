import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../../utils/errorUtils';

/**
 * Base class for all MCP request handlers
 * 
 * This class provides common functionality for handling MCP requests,
 * including standardized error handling and request validation.
 */
export abstract class BaseHandler {
    /**
     * Handle errors in a standardized way
     * 
     * @param error - The error that occurred
     * @param operation - Name of the operation that failed
     * @throws McpError with appropriate error code and message
     */
    protected handleError(error: any, operation: string): never {
        if (error instanceof McpError) {
            throw error;
        }
        
        logger.systemError(error as Error, operation);
        throw new McpError(
            ErrorCode.InternalError, 
            `Failed to ${operation.toLowerCase()}`, 
            error
        );
    }
    
    /**
     * Validate that a request has the required structure
     * 
     * @param request - The request object to validate
     * @throws McpError if request is invalid
     */
    protected validateRequest(request: any): void {
        if (!request) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Request object is required'
            );
        }
        
        if (!request.params) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Request must have params object'
            );
        }
    }
    
    /**
     * Safely extract parameters from request
     * 
     * @param request - The request object
     * @returns The params object
     */
    protected extractParams(request: any): any {
        this.validateRequest(request);
        return request.params;
    }
}