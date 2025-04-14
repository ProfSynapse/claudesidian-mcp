import { App } from 'obsidian';
import { TFile } from 'obsidian';
import { IMCPServer } from '../types';
import { safeStringify } from '../utils/jsonUtils';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { IAgent } from '../agents/interfaces/IAgent';

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
        console.error('Error listing resources:', error);
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
        console.error('Error reading resource:', error);
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
        console.error('Error listing prompts:', error);
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
export async function handleToolList(agents: Map<string, IAgent>, isVaultEnabled: boolean): Promise<{ tools: any[] }> {
    try {
        const tools: any[] = [];
        
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
            tools.push({
                name: agent.name,
                description: agent.description,
                inputSchema: agentSchema
            });
        }
        return { tools };
    } catch (error) {
        console.error('Error listing tools:', error);
        throw new McpError(ErrorCode.InternalError, 'Failed to list tools', error);
    }
}

/**
 * Validate tool execution parameters
 */
function validateToolParams(params: any) {
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
                    console.error('Error parsing paths string:', error);
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
export async function handleToolExecution(
    getAgent: (name: string) => IAgent,
    request: any,
    parsedArgs: any
) {
    try {
        const { name: agentName } = request.params;
        
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
        // Get the agent
        const agent = getAgent(agentName);
        
        // Execute the mode on the agent
        const result = await agent.executeMode(mode, params);
        
        return {
            content: [{
                type: "text",
                text: safeStringify(result)
            }]
        };
    } catch (error) {
        console.error('Error executing tool:', error);
        if (error instanceof McpError) {
            throw error;
        }
        throw new McpError(ErrorCode.InternalError, 'Failed to execute tool', error);
    }
}
