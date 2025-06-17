import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { IValidationService } from '../interfaces/IRequestHandlerServices';
import { validateParams, formatValidationErrors, ValidationError } from '../../utils/validationUtils';
import { generateHintsForErrors } from '../../utils/parameterHintUtils';
import { getErrorMessage } from '../../utils/errorUtils';
import { logger } from '../../utils/logger';

export class ValidationService implements IValidationService {
    async validateToolParams(params: any, schema?: any): Promise<any> {
        const enhancedParams = { ...params };
        
        if (schema) {
            await this.validateAgainstSchema(enhancedParams, schema);
        }
        
        if (enhancedParams.operations && Array.isArray(enhancedParams.operations)) {
            await this.validateBatchOperations(enhancedParams.operations);
        }
        
        if (enhancedParams.paths) {
            await this.validateBatchPaths(enhancedParams.paths);
        }
        
        return enhancedParams;
    }

    async validateSessionId(sessionId: string): Promise<string> {
        if (!sessionId || typeof sessionId !== 'string') {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Session ID must be a non-empty string'
            );
        }
        return sessionId;
    }

    async validateBatchOperations(operations: any[]): Promise<void> {
        const batchErrors: ValidationError[] = [];
        
        operations.forEach((operation: any, index: number) => {
            if (!operation || typeof operation !== 'object') {
                batchErrors.push({
                    path: ['operations', index.toString()],
                    message: 'Operation must be an object',
                    code: 'TYPE_ERROR',
                    expectedType: 'object',
                    receivedType: typeof operation
                });
                return;
            }
            
            if (!operation.type) {
                batchErrors.push({
                    path: ['operations', index.toString(), 'type'],
                    message: "Missing 'type' property",
                    code: 'MISSING_REQUIRED',
                    hint: "Each operation must have a 'type' property that specifies the operation type"
                });
            }
            
            if (!operation.params) {
                batchErrors.push({
                    path: ['operations', index.toString(), 'params'],
                    message: "Missing 'params' property",
                    code: 'MISSING_REQUIRED',
                    hint: "Each operation must have a 'params' object containing the operation parameters"
                });
            } else if (typeof operation.params !== 'object' || Array.isArray(operation.params)) {
                batchErrors.push({
                    path: ['operations', index.toString(), 'params'],
                    message: "'params' must be an object",
                    code: 'TYPE_ERROR',
                    expectedType: 'object',
                    receivedType: Array.isArray(operation.params) ? 'array' : typeof operation.params
                });
            }
        });
        
        if (batchErrors.length > 0) {
            throw new McpError(
                ErrorCode.InvalidParams,
                formatValidationErrors(batchErrors)
            );
        }
    }

    async validateBatchPaths(paths: any): Promise<void> {
        const pathErrors: ValidationError[] = [];
        
        if (!Array.isArray(paths)) {
            if (typeof paths === 'string' &&
                paths.trim().startsWith('[') &&
                paths.trim().endsWith(']')) {
                try {
                    JSON.parse(paths);
                    return;
                } catch (error) {
                    pathErrors.push({
                        path: ['paths'],
                        message: `Failed to parse 'paths' as JSON array: ${getErrorMessage(error)}`,
                        code: 'PARSE_ERROR',
                        expectedType: 'array',
                        receivedType: 'string',
                        hint: "The 'paths' parameter must be a valid JSON array of strings"
                    });
                }
            } else {
                pathErrors.push({
                    path: ['paths'],
                    message: `'paths' must be an array`,
                    code: 'TYPE_ERROR',
                    expectedType: 'array',
                    receivedType: typeof paths,
                    hint: "The 'paths' parameter must be an array of strings specifying the paths to read"
                });
            }
        } else {
            paths.forEach((path: any, index: number) => {
                if (typeof path !== 'string') {
                    pathErrors.push({
                        path: ['paths', index.toString()],
                        message: 'Path must be a string',
                        code: 'TYPE_ERROR',
                        expectedType: 'string',
                        receivedType: typeof path,
                        hint: "Each path in the 'paths' array must be a string"
                    });
                }
            });
        }
        
        if (pathErrors.length > 0) {
            throw new McpError(
                ErrorCode.InvalidParams,
                formatValidationErrors(pathErrors)
            );
        }
    }

    private async validateAgainstSchema(params: any, schema: any): Promise<void> {
        const validationErrors = validateParams(params, schema);
        if (validationErrors.length > 0) {
            logger.systemLog('DEBUG: Validation errors found:', JSON.stringify(validationErrors, null, 2));
            logger.systemLog('DEBUG: Schema used for validation:', JSON.stringify(schema, null, 2));
            logger.systemLog('DEBUG: Params being validated:', JSON.stringify(params, null, 2));
            
            const hints = generateHintsForErrors(validationErrors, schema);
            
            for (const error of validationErrors) {
                if (error.path.length === 1) {
                    const paramName = error.path[0];
                    if (hints[paramName] && !error.hint) {
                        error.hint = hints[paramName];
                    }
                }
            }
            
            if (schema.required && Array.isArray(schema.required) && schema.required.length > 0) {
                const missingRequiredParams = schema.required.filter(
                    (param: string) => !params[param]
                );
                
                if (missingRequiredParams.length > 0) {
                    const missingParamsInfo = missingRequiredParams.map((param: string) => {
                        const paramSchema = schema.properties[param];
                        return `- ${param}: ${paramSchema?.description || 'No description'}` + 
                               `${paramSchema?.type ? ` (${paramSchema.type})` : ''}`;
                    }).join('\n');
                    
                    const requiredParamsMessage = `\nRequired parameters:\n${missingParamsInfo}`;
                    
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        formatValidationErrors(validationErrors) + requiredParamsMessage
                    );
                }
            }
            
            throw new McpError(
                ErrorCode.InvalidParams,
                formatValidationErrors(validationErrors)
            );
        }
    }
}