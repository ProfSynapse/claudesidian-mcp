import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { getErrorMessage } from '../../utils/errorUtils';
import { 
    validateParams, 
    formatValidationErrors,
    ValidationError 
} from '../../utils/validationUtils';
import { 
    generateSessionId, 
    isStandardSessionId 
} from '../../utils/sessionUtils';
import { generateHintsForErrors } from '../../utils/parameterHintUtils';
import { logger } from '../../utils/logger';

/**
 * Service for parameter validation and enhancement
 * 
 * This service handles all validation logic including:
 * - Parameter schema validation
 * - Session ID validation and generation
 * - Batch operation validation
 * - Path validation for batch reads
 */
export class ValidationService {
    /**
     * Validate and enhance tool execution parameters
     * 
     * This enhanced version provides more detailed error messages and parameter hints
     * when validation fails, and handles session ID standardization.
     * 
     * @param params Parameters to validate
     * @param schema Optional JSON schema to validate against
     * @returns Enhanced params object with session ID handling
     */
    static validateToolParams(params: any, schema?: any): any {
        // Create a copy of params to avoid mutation issues
        const enhancedParams = { ...params };
        
        // Handle session ID validation and generation
        this.validateAndStandardizeSessionId(enhancedParams);
        
        // Validate against schema if provided
        if (schema) {
            this.validateAgainstSchema(enhancedParams, schema);
        }
        
        // Validate batch operations if they exist
        this.validateBatchOperations(enhancedParams);
        
        // Validate batch read paths if they exist
        this.validateBatchPaths(enhancedParams);
        
        return enhancedParams;
    }
    
    /**
     * Validate and standardize session ID
     * 
     * @param enhancedParams Parameters object to modify
     */
    private static validateAndStandardizeSessionId(enhancedParams: any): void {
        // Validate sessionId is present as a top-level parameter
        if (!enhancedParams.sessionId) {
            // Auto-generate a sessionId if missing using our standardized format
            const newSessionId = generateSessionId();
            enhancedParams.sessionId = newSessionId;
            
            // Mark that this is a brand new session (first request)
            enhancedParams._isNewSession = true;
            
            logger.systemLog(`Created new session with standardized ID: ${enhancedParams.sessionId}`);
        } else if (!isStandardSessionId(enhancedParams.sessionId)) {
            // If the sessionId is not in our standard format, it's likely a Claude-generated ID
            // Store the original ID for reference
            enhancedParams._originalSessionId = enhancedParams.sessionId;
            
            // Replace it with a standardized ID
            enhancedParams.sessionId = generateSessionId();
            
            // Flag this for session instructions to be injected
            enhancedParams._isNonStandardId = true;
            
            logger.systemLog(`Replaced non-standard session ID: ${enhancedParams._originalSessionId} with standardized ID: ${enhancedParams.sessionId}`);
        }
    }
    
    /**
     * Validate parameters against a JSON schema
     * 
     * @param enhancedParams Parameters to validate
     * @param schema JSON schema to validate against
     */
    private static validateAgainstSchema(enhancedParams: any, schema: any): void {
        const validationErrors = validateParams(enhancedParams, schema);
        if (validationErrors.length > 0) {
            // Generate more detailed parameter hints for the validation errors
            const hints = generateHintsForErrors(validationErrors, schema);
            
            // Add parameter hints to the validation errors where applicable
            for (const error of validationErrors) {
                if (error.path.length === 1) {
                    const paramName = error.path[0];
                    if (hints[paramName] && !error.hint) {
                        error.hint = hints[paramName];
                    }
                }
            }
            
            // Add guidance on required parameters
            if (schema.required && Array.isArray(schema.required) && schema.required.length > 0) {
                const missingRequiredParams = schema.required.filter(
                    (param: string) => !enhancedParams[param]
                );
                
                if (missingRequiredParams.length > 0) {
                    const missingParamsInfo = missingRequiredParams.map((param: string) => {
                        const paramSchema = schema.properties[param];
                        return `- ${param}: ${paramSchema?.description || 'No description'}` + 
                               `${paramSchema?.type ? ` (${paramSchema.type})` : ''}`;
                    }).join('\\n');
                    
                    const requiredParamsMessage = `\\nRequired parameters:\\n${missingParamsInfo}`;
                    
                    // Append to the validation error message
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
    
    /**
     * Validate batch operations
     * 
     * @param enhancedParams Parameters to validate
     */
    private static validateBatchOperations(enhancedParams: any): void {
        if (!enhancedParams.operations || !Array.isArray(enhancedParams.operations)) {
            return;
        }
        
        const batchErrors: ValidationError[] = [];
        
        enhancedParams.operations.forEach((operation: any, index: number) => {
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
            
            // Ensure params object exists
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
    
    /**
     * Validate batch read paths
     * 
     * @param enhancedParams Parameters to validate
     */
    private static validateBatchPaths(enhancedParams: any): void {
        if (!enhancedParams.paths) {
            return;
        }
        
        const pathErrors: ValidationError[] = [];
        
        // Ensure paths is an array
        if (!Array.isArray(enhancedParams.paths)) {
            // If paths is a string that looks like an array, try to parse it
            if (typeof enhancedParams.paths === 'string' &&
                enhancedParams.paths.trim().startsWith('[') &&
                enhancedParams.paths.trim().endsWith(']')) {
                try {
                    enhancedParams.paths = JSON.parse(enhancedParams.paths);
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
                    receivedType: typeof enhancedParams.paths,
                    hint: "The 'paths' parameter must be an array of strings specifying the paths to read"
                });
            }
        }
        
        // Validate each path in the batch if paths is an array
        if (Array.isArray(enhancedParams.paths)) {
            enhancedParams.paths.forEach((path: any, index: number) => {
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
}