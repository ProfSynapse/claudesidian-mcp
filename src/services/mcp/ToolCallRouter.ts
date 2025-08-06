import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../../utils/logger';

/**
 * Location: src/services/mcp/ToolCallRouter.ts
 * 
 * This service handles routing tool calls to appropriate agents and modes, including:
 * - Tool call request validation
 * - Agent/mode resolution and execution
 * - Error handling and response formatting
 * - Tool call capture coordination
 * 
 * Used by: MCPConnector
 * Dependencies: Agent implementations, ToolCallCaptureService
 */

export interface AgentModeParams {
    agent: string;
    mode: string;
    params: Record<string, any>;
}

export interface ToolCallRequest {
    params: {
        name: string;
        arguments: Record<string, any>;
    };
    meta?: {
        requestId?: string;
        timestamp?: Date;
        source?: string;
    };
}

export interface ToolCallResponse {
    content: Array<{
        type: 'text' | 'resource';
        text?: string;
        resource?: any;
    }>;
    isError?: boolean;
    error?: {
        code: string;
        message: string;
        data?: any;
    };
}

export interface ToolCallRouterInterface {
    /**
     * Routes tool call request to appropriate agent/mode
     * @param request MCP tool call request
     * @returns Promise resolving to tool call response
     * @throws RoutingError when routing fails
     * @throws ValidationError when request is invalid
     */
    route(request: ToolCallRequest): Promise<ToolCallResponse>;

    /**
     * Executes agent mode directly
     * @param agent Agent name
     * @param mode Mode name
     * @param params Mode parameters
     * @returns Promise resolving to execution result
     */
    executeAgentMode(agent: string, mode: string, params: Record<string, any>): Promise<any>;

    /**
     * Validates tool call request
     * @param request Request to validate
     * @returns Validation result
     */
    validateRequest(request: ToolCallRequest): ValidationResult;

    /**
     * Validates batch operations if present
     * @param params Parameters that may contain batch operations
     * @throws ValidationError when batch operations are invalid
     */
    validateBatchOperations(params: Record<string, any>): void;

    /**
     * Sets the server reference for agent mode execution
     * @param server Server instance that handles agent mode execution
     */
    setServer(server: any): void;
}

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

export class ToolCallRouter implements ToolCallRouterInterface {
    private server: any = null;

    constructor() {}

    /**
     * Routes tool call request to appropriate agent/mode
     */
    async route(request: ToolCallRequest): Promise<ToolCallResponse> {
        try {
            // Validate the request
            const validation = this.validateRequest(request);
            if (!validation.isValid) {
                throw new McpError(
                    ErrorCode.InvalidRequest,
                    `Invalid tool call: ${validation.errors.join(', ')}`
                );
            }

            // Parse tool name to get agent and mode
            const { agentName, modeName } = this.parseToolName(request.params.name);
            
            // Validate batch operations if present
            this.validateBatchOperations(request.params.arguments);

            // Execute the agent mode
            const result = await this.executeAgentMode(
                agentName, 
                modeName, 
                request.params.arguments
            );

            return this.buildSuccessResponse(result);

        } catch (error) {
            return this.buildErrorResponse(error);
        }
    }

    /**
     * Executes agent mode directly
     */
    async executeAgentMode(agent: string, mode: string, params: Record<string, any>): Promise<any> {
        if (!this.server) {
            throw new McpError(
                ErrorCode.InternalError,
                'Server not initialized for tool call routing'
            );
        }

        try {
            // Delegate to server's executeAgentMode method
            return await this.server.executeAgentMode(agent, mode, params);
        } catch (error) {
            if (error instanceof McpError) {
                throw error;
            }
            
            logger.systemError(error as Error, 'Agent Mode Execution');
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to execute ${agent}.${mode}`,
                error
            );
        }
    }

    /**
     * Validates tool call request
     */
    validateRequest(request: ToolCallRequest): ValidationResult {
        const errors: string[] = [];

        if (!request.params?.name) {
            errors.push('Tool name is required');
        }

        if (!request.params?.arguments) {
            errors.push('Tool arguments are required');
        }

        // Validate tool name format
        if (request.params?.name) {
            try {
                this.parseToolName(request.params.name);
            } catch (error) {
                errors.push((error as Error).message);
            }
        }

        return { isValid: errors.length === 0, errors };
    }

    /**
     * Validates batch operations if present in parameters
     */
    validateBatchOperations(params: Record<string, any>): void {
        // Validate batch operations if they exist
        if (params && params.operations && Array.isArray(params.operations)) {
            params.operations.forEach((operation: any, index: number) => {
                if (!operation || typeof operation !== 'object') {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Invalid operation at index ${index} in batch operations: operation must be an object`
                    );
                }

                if (!operation.type) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Invalid operation at index ${index} in batch operations: missing 'type' property`
                    );
                }

                // Check for either filePath in params or path at the operation level
                if ((!operation.params || !operation.params.filePath) && !operation.path) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Invalid operation at index ${index} in batch operations: missing 'filePath' property in params`
                    );
                }
            });
        }

        // Validate batch read paths if they exist
        if (params && params.paths && Array.isArray(params.paths)) {
            params.paths.forEach((path: any, index: number) => {
                if (typeof path !== 'string') {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Invalid path at index ${index} in batch paths: path must be a string`
                    );
                }
            });
        }
    }

    /**
     * Sets the server reference for agent mode execution
     */
    setServer(server: any): void {
        this.server = server;
    }

    /**
     * Parses tool name into agent and mode components
     * @private
     */
    private parseToolName(toolName: string): { agentName: string; modeName: string } {
        const parts = toolName.split('_');
        if (parts.length !== 2) {
            throw new McpError(
                ErrorCode.InvalidRequest,
                `Invalid tool name format: ${toolName}. Expected format: agentName_modeName`
            );
        }

        return { agentName: parts[0], modeName: parts[1] };
    }

    /**
     * Builds successful response
     * @private
     */
    private buildSuccessResponse(result: any): ToolCallResponse {
        return {
            content: [{
                type: 'text',
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            }],
            isError: false
        };
    }

    /**
     * Builds error response
     * @private
     */
    private buildErrorResponse(error: any): ToolCallResponse {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorCode = error instanceof McpError ? error.code : ErrorCode.InternalError;

        return {
            content: [{
                type: 'text',
                text: `Error: ${errorMessage}`
            }],
            isError: true,
            error: {
                code: String(errorCode),
                message: errorMessage,
                data: error instanceof McpError ? error.data : undefined
            }
        };
    }
}