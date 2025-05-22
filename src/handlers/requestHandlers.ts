import { App } from 'obsidian';
import { TFile } from 'obsidian';
import { safeStringify } from '../utils/jsonUtils';
import { logger } from '../utils/logger';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { IAgent } from '../agents/interfaces/IAgent';
import { SessionContextManager } from '../services/SessionContextManager';
import { getErrorMessage } from '../utils/errorUtils';
import { ModeCall, ModeCallResult } from '../types';
import { 
    generateSessionId, 
    formatSessionInstructions, 
    enhanceContextWithSessionInstructions,
    isStandardSessionId 
} from '../utils/sessionUtils';
// Import from parameterHintUtils is already included in the imports above
import { 
    validateParams, 
    formatValidationErrors,
    ValidationError 
} from '../utils/validationUtils';
import {
    generateStructuredHints,
    generateHintsForErrors,
    formatModeHelp,
    generateModeHelp
} from '../utils/parameterHintUtils';

/**
 * Request handler implementations for the MCP server
 * This module contains all the request handlers for various MCP operations
 * including resource management, prompts, and tool execution.
 */

/**
 * Get resources from the vault
 */
async function getVaultResources(app: App) {
    interface Resource {
        uri: string;
        name: string;
        mimeType: string;
    }
    
    const resources: Resource[] = [];
    const files = app.vault.getMarkdownFiles();
    
    for (const file of files) {
        resources.push({
            uri: `obsidian://${file.path}`,
            name: file.basename,
            mimeType: "text/markdown"
        });
    }
    
    return resources;
}

/**
 * Read a resource from the vault
 */
async function readResource(app: App, uri: string) {
    const path = uri.replace('obsidian://', '');
    const file = app.vault.getAbstractFileByPath(path);
    
    if (file instanceof TFile) {
        return await app.vault.read(file);
    }
    
    throw new McpError(ErrorCode.InvalidParams, `Resource not found: ${uri}`);
}

/**
 * Handle resource listing request
 */
export async function handleResourceList(app: App) {
    try {
        const resources = await getVaultResources(app);
        return { resources };
    } catch (error) {
        throw new McpError(ErrorCode.InternalError, 'Failed to list resources', error);
    }
}

/**
 * Handle resource reading request
 */
export async function handleResourceRead(app: App, request: any) {
    try {
        const { uri } = request.params;
        const content = await readResource(app, uri);
        return {
            contents: [{
                uri,
                text: content,
                mimeType: "text/markdown"
            }]
        };
    } catch (error) {
        if (error instanceof McpError) {
            throw error;
        }
        throw new McpError(ErrorCode.InternalError, 'Failed to read resource', error);
    }
}

/**
 * Handle prompts listing request
 */
export async function handlePromptsList() {
    try {
        return { prompts: [] };
    } catch (error) {
        throw new McpError(ErrorCode.InternalError, 'Failed to list prompts', error);
    }
}

interface AgentSchema {
    type: string;
    properties: {
        mode: {
            type: string;
            enum: string[];
            description: string;
        };
        [key: string]: any;
    };
    required: string[];
    allOf: any[];
}

/**
 * Handle tool listing request
 */
/**
 * Handle tool listing request with full parameter schemas from each mode
 *
 * @param agents Map of agent names to agent instances
 * @param isVaultEnabled Boolean indicating if vault access is enabled
 * @returns Promise resolving to an object containing the tools list
 */
export async function handleToolList(
    agents: Map<string, IAgent>,
    isVaultEnabled: boolean
): Promise<{ tools: any[] }> {
    try {
        // Return empty list immediately if vault access is disabled
        if (!isVaultEnabled) {
            return { tools: [] };
        }
        
        const tools: any[] = [];
        
        // Process agents with full schema building from each mode
        for (const agent of agents.values()) {
            // Base schema for the agent (common to all modes)
            const agentSchema: AgentSchema = {
                type: 'object',
                properties: {
                    mode: {
                        type: 'string',
                        enum: [] as string[],
                        description: 'The operation mode for this agent'
                    },
                    sessionId: {
                        type: 'string',
                        description: 'Session identifier to track related tool calls'
                    }
                },
                required: ['mode', 'sessionId'],
                allOf: [] // Will contain mode-specific schema requirements
            };
            
            // Get all modes for this agent
            const agentModes = agent.getModes();
            
            // Add each mode to the enum and create conditional schemas
            for (const mode of agentModes) {
                // Add mode to the enum of available modes
                agentSchema.properties.mode.enum.push(mode.slug);
                
                try {
                    // Get the parameter schema for this mode
                    const modeSchema = mode.getParameterSchema();
                    
                    if (modeSchema && typeof modeSchema === 'object') {
                        // Create a copy of the schema to avoid modifying the original
                        const modeSchemaCopy = JSON.parse(JSON.stringify(modeSchema));
                        
                        // Remove any mode property from the mode schema to avoid duplication
                        if (modeSchemaCopy.properties && modeSchemaCopy.properties.mode) {
                            delete modeSchemaCopy.properties.mode;
                        }
                        
                        // If the mode schema has specific required properties, include them 
                        // in a conditional requirement
                        if (modeSchemaCopy.required && modeSchemaCopy.required.length > 0) {
                            // Don't include 'mode' or 'sessionId' in the conditional required list
                            // as they're already in the base schema
                            const conditionalRequired = modeSchemaCopy.required.filter(
                                (prop: string) => prop !== 'mode' && prop !== 'sessionId'
                            );
                            
                            if (conditionalRequired.length > 0) {
                                // Create a conditional schema that applies when this mode is selected
                                agentSchema.allOf.push({
                                    if: {
                                        properties: {
                                            mode: { enum: [mode.slug] }
                                        }
                                    },
                                    then: {
                                        required: conditionalRequired
                                    }
                                });
                            }
                        }
                        
                        // Merge the mode's properties into the agent schema
                        if (modeSchemaCopy.properties) {
                            for (const [propName, propSchema] of Object.entries(modeSchemaCopy.properties)) {
                                // Skip mode and sessionId as they're already in the base schema
                                if (propName !== 'mode' && propName !== 'sessionId') {
                                    agentSchema.properties[propName] = propSchema;
                                }
                            }
                        }
                        
                        // If the mode schema has conditional validations (allOf, anyOf, oneOf, etc.), 
                        // include them in the agent schema
                        ['allOf', 'anyOf', 'oneOf', 'not'].forEach(validationType => {
                            if (modeSchemaCopy[validationType]) {
                                // Create a conditional validation that applies when this mode is selected
                                agentSchema.allOf.push({
                                    if: {
                                        properties: {
                                            mode: { enum: [mode.slug] }
                                        }
                                    },
                                    then: {
                                        [validationType]: modeSchemaCopy[validationType]
                                    }
                                });
                            }
                        });
                    }
                } catch (error) {
                    console.error(`Error processing schema for mode ${mode.slug}:`, error);
                    // Continue with other modes even if one fails
                }
            }
            
            // Register tool with complete schema
            tools.push({
                name: agent.name,
                description: agent.description,
                inputSchema: agentSchema
            });
        }
        
        return { tools };
    } catch (error) {
        console.error("Error in handleToolList:", error);
        throw new McpError(ErrorCode.InternalError, 'Failed to list tools', error);
    }
}

/**
 * Validate tool execution parameters
 * 
 * This enhanced version provides more detailed error messages and parameter hints
 * when validation fails.
 * 
 * @param params Parameters to validate
 * @param schema Optional JSON schema to validate against
 * @returns Enhanced params object with session ID handling
 */
function validateToolParams(params: any, schema?: any): any {
    // Create a copy of params to avoid mutation issues
    const enhancedParams = { ...params };
    
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
    
    // Validate against schema if provided
    if (schema) {
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
                    }).join('\n');
                    
                    const requiredParamsMessage = `\nRequired parameters:\n${missingParamsInfo}`;
                    
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
    
    // Validate batch operations if they exist
    if (enhancedParams.operations && Array.isArray(enhancedParams.operations)) {
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

    // Validate batch read paths if they exist
    if (enhancedParams.paths) {
        // Validate paths parameter
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
    
    return enhancedParams;
}

/**
 * Handle tool help request
 * 
 * This function provides detailed help for a specific agent mode, including
 * parameter descriptions, types, required vs. optional status, and examples.
 * 
 * @param getAgent Function to get an agent by name
 * @param request The request object containing the tool name
 * @param parsedArgs The parsed arguments with mode specified
 * @returns Promise resolving to help text for the specified mode
 */
export async function handleToolHelp(
    getAgent: (name: string) => IAgent,
    request: any,
    parsedArgs: any
): Promise<{ content: { type: string, text: string }[] }> {
    try {
        const { name: agentName } = request.params;
        const { mode } = parsedArgs as { mode: string };
        
        if (!mode) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Missing required parameter: mode for help on agent ${agentName}`
            );
        }
        
        // Get the agent
        const agent = getAgent(agentName);
        
        // Get the mode
        const modeInstance = agent.getMode(mode);
        
        if (!modeInstance) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Mode ${mode} not found in agent ${agentName}`
            );
        }
        
        // Get the mode's parameter schema
        const schema = modeInstance.getParameterSchema();
        
        // Generate mode help
        const help = generateModeHelp(
            mode,
            modeInstance.description,
            schema
        );
        
        // Format and return the help
        const helpText = formatModeHelp(help);
        
        return {
            content: [{
                type: "text",
                text: helpText
            }]
        };
    } catch (error) {
        if (error instanceof McpError) {
            throw error;
        }
        logger.systemError(error as Error, 'Tool Help');
        throw new McpError(ErrorCode.InternalError, 'Failed to get tool help', error);
    }
}

/**
 * Handle tool execution request
 */
/**
 * Handle tool execution request
 *
 * This function executes a tool with the specified parameters. It handles
 * tool names that include vault identifiers by extracting the base agent name.
 * It also handles workspace context and handoff parameters.
 *
 * For session management:
 * - If a sessionId is missing, a new one will be auto-generated
 * - If a sessionId is provided, it will be used regardless of whether it exists in the database
 * - The sessionId is used to persist workspace context across tool calls
 *
 * @param getAgent Function to get an agent by name
 * @param request The original request object
 * @param parsedArgs The parsed arguments for the tool
 * @param sessionContextManager Optional session context manager for workspace persistence
 * @returns Promise resolving to the result of the tool execution
 */
export async function handleToolExecution(
    getAgent: (name: string) => IAgent,
    request: any,
    parsedArgs: any,
    sessionContextManager?: SessionContextManager
) {
    try {
        const { name: fullToolName } = request.params;
        
        // Use the full tool name directly as the agent name (for testing)
        const agentName = fullToolName;
        
        // Extract the mode from the arguments
        if (!parsedArgs) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Missing arguments for agent ${agentName}`
            );
        }
        
        // Extract the mode from the arguments
        const { mode, ...params } = parsedArgs as { mode: string; [key: string]: any };
        if (!mode) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Missing required parameter: mode for agent ${agentName}`
            );
        }
        
        // Additional validation for specific modes
        if (agentName === 'projectManager') {
            if (mode === 'createWorkspace') {
                if (!params.name) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: name for createWorkspace mode`
                    );
                }
                if (!params.rootFolder) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: rootFolder for createWorkspace mode`
                    );
                }
            } else if (mode === 'loadWorkspace') {
                if (!params.id) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: id for loadWorkspace mode`
                    );
                }
            }
        } else if (agentName === 'memoryManager') {
            if (mode === 'createState') {
                if (!params.name) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: name for createState mode`
                    );
                }
            }
        } else if (agentName === 'vaultManager') {
            if (mode === 'listFolders' || mode === 'createFolder' || mode === 'listFiles') {
                if (!params.path) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: path for ${mode} mode`
                    );
                }
            }
        } else if (agentName === 'contentManager') {
            if (mode === 'createContent') {
                if (!params.filePath) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: filePath for createContent mode`
                    );
                }
                if (params.content === undefined || params.content === null) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: content for createContent mode`
                    );
                }
            }
        } else if (agentName === 'vaultLibrarian') {
            if (mode === 'search') {
                if (!params.type) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: type for search mode (must be one of: content, tag, property)`
                    );
                }
                
                // Additional validations based on search type
                if (params.type === 'content' && !params.query) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: query for content search`
                    );
                } else if (params.type === 'tag' && !params.tag) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: tag for tag search`
                    );
                } else if (params.type === 'property' && !params.key) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: key for property search`
                    );
                }
            }
        }
        
        // Execute the agent with the specified mode
        // Get the agent using the base agent name (without vault ID)
        const agent = getAgent(agentName);
        
        // Get the mode's parameter schema for validation
        const modeInstance = agent.getMode(mode);
        let paramSchema;
        
        try {
            if (modeInstance && typeof modeInstance.getParameterSchema === 'function') {
                paramSchema = modeInstance.getParameterSchema();
            }
        } catch (error) {
            logger.systemWarn(`Failed to get parameter schema for mode ${mode}: ${getErrorMessage(error)}`);
        }
        
        // Validate common parameters with enhanced schema-based validation
        const enhancedParams = validateToolParams(params, paramSchema);
        
        // Validate session ID if SessionContextManager is available
        let originalSessionId = params.sessionId;
        
        if (sessionContextManager && params.sessionId) {
            try {
                // Process the session ID
                const validatedSessionId = await sessionContextManager.validateSessionId(params.sessionId);
                
                // Check if the session ID was changed and set appropriate flags
                if (validatedSessionId !== params.sessionId) {
                    params._isNonStandardId = true;
                    params._originalSessionId = params.sessionId;
                    params.sessionId = validatedSessionId;
                    logger.systemLog(`Session ID standardized from "${params._originalSessionId}" to "${validatedSessionId}"`);
                }
            } catch (error) {
                logger.systemWarn(`Session validation failed: ${getErrorMessage(error)}. Using original ID`);
            }
        }
        
        // Apply workspace context from SessionContextManager if available
        let processedParams = { ...params }; // Create a copy of params to avoid mutating the original
        if (sessionContextManager && processedParams.sessionId) {
            // Only apply if no workspaceContext is explicitly provided
            if (!processedParams.workspaceContext || !processedParams.workspaceContext.workspaceId) {
                processedParams = sessionContextManager.applyWorkspaceContext(processedParams.sessionId, processedParams);
            }
        }
        
        // Execute the mode on the agent
        const result = await agent.executeMode(mode, processedParams);
        
        // Update the SessionContextManager with the result's workspace context if present
        if (sessionContextManager && processedParams.sessionId && result.workspaceContext) {
            sessionContextManager.updateFromResult(processedParams.sessionId, result);
        }
        
        // Handle handoff if specified in the result
        if (result.handoff && result.success) {
            try {
                // Check if this is a multi-mode handoff
                if (Array.isArray(result.handoff)) {
                    // Multi-mode execution
                    logger.systemLog(`Processing multi-mode handoff with ${result.handoff.length} modes`);
                    
                    // The actual execution happens in baseAgent, we just need to handle the results here
                    // Update context manager with handoff results if they contain workspace context
                    if (sessionContextManager && processedParams.sessionId && result.handoffResults) {
                        // Update from the last successful result that has workspace context
                        const lastSuccessfulResult = result.handoffResults
                            .filter((r: ModeCallResult) => r.success && r.workspaceContext)
                            .pop();
                            
                        if (lastSuccessfulResult && lastSuccessfulResult.workspaceContext) {
                            sessionContextManager.updateFromResult(
                                processedParams.sessionId, 
                                lastSuccessfulResult
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
                } else {
                    // Single mode handoff (legacy support)
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
                    if (sessionContextManager && parameters.sessionId && handoffResult.workspaceContext) {
                        sessionContextManager.updateFromResult(parameters.sessionId, handoffResult);
                    }
                    
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
            } catch (handoffError) {
                logger.systemError(handoffError as Error, 'Handoff Error');
                
                // Check if this was a multi-mode handoff attempt
                if (Array.isArray(result.handoff)) {
                    // If multi-mode handoff fails, include the error in the original result
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
                } else {
                    // If single handoff fails, include the error in the original result
                    result.handoffResult = {
                        success: false,
                        error: getErrorMessage(handoffError)
                    };
                }
                
                return {
                    content: [{
                        type: "text",
                        text: safeStringify(result)
                    }]
                };
            }
        }
        
        // Check if we need to add session instructions
        const needsInstructions = (params._isNewSession || params._isNonStandardId) && 
                               result && 
                               sessionContextManager && 
                               !sessionContextManager.hasReceivedInstructions(params.sessionId);
        
        if (needsInstructions) {
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
        }
        
        // Regular result with no handoff
        if (needsInstructions && (result.sessionInstructions || result.sessionIdCorrection || result.newSessionInfo)) {
            // Make session instructions prominent at the top of the response
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
        
        return {
            content: [{
                type: "text",
                text: safeStringify(result)
            }]
        };
    } catch (error) {
        if (error instanceof McpError) {
            throw error;
        }
        logger.systemError(error as Error, 'Tool Execution');
        throw new McpError(ErrorCode.InternalError, 'Failed to execute tool', error);
    }
}
