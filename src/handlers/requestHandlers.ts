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

/**
 * Request handler implementations for the MCP server
 * This module contains all the request handlers for various MCP operations
 * including resource management, prompts, and tool execution.
 */

/**
 * Get resources from the vault
 */
async function getVaultResources(app: App) {
    const resources = [];
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
 * Handle tool listing request
 *
 * This function returns a list of available tools, with each tool name
 * including the vault identifier to ensure uniqueness across vaults.
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
        const tools: any[] = [];
        
        // Get the vault name for appending to tool names
        const vaultName = app.vault.getName();
        
        // Sanitize the vault name using the centralized utility function
        const sanitizedVaultName = sanitizeVaultName(vaultName);
        
        for (const agent of agents.values()) {
            
            // Create a schema that includes the mode parameter and combines all tool schemas
            const agentSchema: AgentSchema = {
                type: 'object',
                properties: {
                    mode: {
                        type: 'string',
                        enum: [] as string[],
                        description: 'The operation mode for this agent'
                    }
                },
                required: ['mode'],
                allOf: []
            };
            
            // Get all modes for this agent
            const agentModes = agent.getModes();
            
            // Add each mode
            for (const mode of agentModes) {
                agentSchema.properties.mode.enum.push(mode.slug);
                const modeSchema = mode.getParameterSchema();
                
                agentSchema.allOf.push({
                    if: {
                        properties: { mode: { enum: [mode.slug] } },
                        required: ['mode']
                    },
                    then: {
                        properties: modeSchema.properties || {},
                        required: modeSchema.required || []
                    }
                });
            }
            
            // Append vault ID to the tool name to ensure uniqueness
            const toolName = `${agent.name}_${sanitizedVaultName}`;
            
            tools.push({
                name: toolName,
                description: agent.description,
                inputSchema: agentSchema
            });
        }
        return { tools };
    } catch (error) {
        throw new McpError(ErrorCode.InternalError, 'Failed to list tools', error);
    }
}

/**
 * Validate tool execution parameters
 */
function validateToolParams(params: any) {
    // Validate sessionId is present as a top-level parameter
    if (!params.sessionId) {
        throw new McpError(
            ErrorCode.InvalidParams,
            `Missing required parameter: sessionId`
        );
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
        
        // Extract the actual agent name by removing the vault ID suffix
        // The format is expected to be {agentName}_{vaultID}
        const agentName = fullToolName.split('_')[0];
        
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
        
        // Validate parameters
        validateToolParams(params);
        
        // Execute the agent with the specified mode
        // Get the agent using the base agent name (without vault ID)
        const agent = getAgent(agentName);
        
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
