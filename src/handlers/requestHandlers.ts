import { App } from 'obsidian';
import { TFile } from 'obsidian';
import { IMCPServer } from '../types';
import { safeStringify } from '../utils/jsonUtils';
import { logger } from '../utils/logger';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { IAgent } from '../agents/interfaces/IAgent';
import { sanitizeVaultName } from '../utils/vaultUtils';
import { SessionContextManager } from '../services/SessionContextManager';
import { parseWorkspaceContext } from '../utils/contextUtils';
import { v4 as uuidv4 } from 'uuid';

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
 * @param app Obsidian App instance to get vault information
 * @returns Promise resolving to an object containing the tools list
 */
export async function handleToolList(
    agents: Map<string, IAgent>,
    isVaultEnabled: boolean,
    app: App
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
                                prop => prop !== 'mode' && prop !== 'sessionId'
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
 */
function validateToolParams(params: any) {
    // Validate sessionId is present as a top-level parameter
    if (!params.sessionId) {
        // Auto-generate a sessionId if missing to improve user experience
        const newSessionId = uuidv4();
        params.sessionId = newSessionId;
        
        // Mark that this is an auto-generated ID
        params._autoGeneratedSessionId = true;
        
        logger.systemLog(`Auto-generated sessionId: ${params.sessionId}`);
    }
    
    // Validate batch operations if they exist
    if (params.operations && Array.isArray(params.operations)) {
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
            
            if (!operation.path) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Invalid operation at index ${index} in batch operations: missing 'path' property`
                );
            }
        });
    }

    // Validate batch read paths if they exist
    if (params.paths) {
        // Validate paths parameter
        
        // Ensure paths is an array
        if (!Array.isArray(params.paths)) {
            // If paths is a string that looks like an array, try to parse it
            if (typeof params.paths === 'string' &&
                params.paths.trim().startsWith('[') &&
                params.paths.trim().endsWith(']')) {
                try {
                    params.paths = JSON.parse(params.paths);
                } catch (error) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Invalid paths parameter: must be an array, got ${typeof params.paths}`
                    );
                }
            } else {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Invalid paths parameter: must be an array, got ${typeof params.paths}`
                );
            }
        }
        
        // Validate each path in the batch
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
        
        // Validate common parameters
        validateToolParams(params);
        
        // Execute the agent with the specified mode
        // Get the agent using the base agent name (without vault ID)
        const agent = getAgent(agentName);
        
        // Validate session ID if SessionContextManager is available
        let originalSessionId = params.sessionId;
        let sessionIdChanged = false;
        
        if (sessionContextManager && params.sessionId) {
            try {
                // Process the session ID
                // We no longer generate new IDs for existing session IDs
                // This allows clients to provide their own valid session IDs
                params.sessionId = await sessionContextManager.validateSessionId(params.sessionId);
                // Check if the session ID changed (should only happen if original was empty)
                sessionIdChanged = (originalSessionId !== params.sessionId);
            } catch (error) {
                logger.systemWarn(`Session validation failed: ${error.message}. Using original ID`);
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
            // Get the handoff details
            const { tool, mode: handoffMode, parameters, returnHere } = result.handoff;
            
            try {
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
            } catch (handoffError) {
                // If handoff fails, include the error in the original result
                result.handoffResult = {
                    success: false,
                    error: handoffError.message || "Handoff failed"
                };
                
                return {
                    content: [{
                        type: "text",
                        text: safeStringify(result)
                    }]
                };
            }
        }
        
        // Only add session ID info if a new session was auto-generated from an empty ID
        // Do NOT add session info for existing IDs that weren't in the database
        if (params._autoGeneratedSessionId && result && !originalSessionId) {
            result.newSessionId = params.sessionId;
            result.validSessionInfo = {
                originalId: null,
                newId: params.sessionId,
                message: "No session ID was provided. A new session has been created. Please use this session ID for future requests."
            };
        }
        
        // Regular result with no handoff
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
