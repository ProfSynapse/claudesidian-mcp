import { App } from 'obsidian';
import { BaseHandler } from '../base/BaseHandler';
import { IAgent } from '../../agents/interfaces/IAgent';
import { ToolNamingService } from '../services/ToolNamingService';
import { generateModeHelp, formatModeHelp } from '../../utils/parameterHintUtils';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Handler for tool-related operations (listing and help)
 * 
 * This handler manages tool registration and help generation.
 * It handles vault-specific tool naming and schema building.
 */
export class ToolHandler extends BaseHandler {
    /**
     * Handle tool listing request with vault-specific naming
     * 
     * @param agents Map of agent names to agent instances
     * @param isVaultEnabled Boolean indicating if vault access is enabled
     * @param app Optional Obsidian app instance for vault naming
     * @returns Promise resolving to an object containing the tools list
     */
    async handleToolList(
        agents: Map<string, IAgent>,
        isVaultEnabled: boolean,
        app?: App
    ): Promise<{ tools: any[] }> {
        try {
            // Return empty list immediately if vault access is disabled
            if (!isVaultEnabled) {
                return { tools: [] };
            }
            
            const tools: any[] = [];
            
            // Process agents with full schema building from each mode
            for (const agent of agents.values()) {
                // Build the tool schema
                const agentSchema = this.buildAgentSchema(agent);
                
                // Generate vault-specific tool name and description
                const toolName = ToolNamingService.generateVaultSpecificToolName(agent.name, app);
                const toolDescription = ToolNamingService.generateVaultSpecificDescription(agent.description, app);
                
                // Register tool with complete schema
                tools.push({
                    name: toolName,
                    description: toolDescription,
                    inputSchema: agentSchema
                });
            }
            
            return { tools };
        } catch (error) {
            this.handleError(error, 'Tool List');
        }
    }
    
    /**
     * Handle tool help request
     * 
     * @param getAgent Function to get agent by name
     * @param request The request object containing the tool name
     * @param parsedArgs The parsed arguments with mode specified
     * @returns Promise resolving to help text for the specified mode
     */
    async handleToolHelp(
        getAgent: (name: string) => IAgent,
        request: any,
        parsedArgs: any
    ): Promise<{ content: { type: string, text: string }[] }> {
        try {
            const params = this.extractParams(request);
            const { name: agentName } = params;
            const { mode } = parsedArgs as { mode: string };
            
            if (!mode) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Missing required parameter: mode for help on agent ${agentName}`
                );
            }
            
            // Get the agent (extract base name if vault-specific)
            const baseAgentName = ToolNamingService.extractAgentNameFromTool(agentName);
            const agent = getAgent(baseAgentName);
            
            // Get the mode
            const modeInstance = agent.getMode(mode);
            
            if (!modeInstance) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Mode ${mode} not found in agent ${baseAgentName}`
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
            this.handleError(error, 'Tool Help');
        }
    }
    
    /**
     * Build agent schema with all mode schemas merged
     * 
     * @param agent The agent to build schema for
     * @returns Complete agent schema
     */
    private buildAgentSchema(agent: IAgent): any {
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
                this.mergeModeSchemma(agentSchema, mode);
            } catch (error) {
                console.error(`Error processing schema for mode ${mode.slug}:`, error);
                // Continue with other modes even if one fails
            }
        }
        
        return agentSchema;
    }
    
    /**
     * Merge a mode's schema into the agent schema
     * 
     * @param agentSchema The agent schema to merge into
     * @param mode The mode whose schema to merge
     */
    private mergeModeSchemma(agentSchema: any, mode: any): void {
        // Get the parameter schema for this mode
        const modeSchema = mode.getParameterSchema();
        
        if (!modeSchema || typeof modeSchema !== 'object') {
            return;
        }
        
        // Create a copy of the schema to avoid modifying the original
        const modeSchemaCopy = JSON.parse(JSON.stringify(modeSchema));
        
        // Remove any mode property from the mode schema to avoid duplication
        if (modeSchemaCopy.properties && modeSchemaCopy.properties.mode) {
            delete modeSchemaCopy.properties.mode;
        }
        
        // Handle conditional requirements
        if (modeSchemaCopy.required && modeSchemaCopy.required.length > 0) {
            const conditionalRequired = modeSchemaCopy.required.filter(
                (prop: string) => prop !== 'mode' && prop !== 'sessionId'
            );
            
            if (conditionalRequired.length > 0) {
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
        
        // Handle conditional validations
        ['allOf', 'anyOf', 'oneOf', 'not'].forEach(validationType => {
            if (modeSchemaCopy[validationType]) {
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
}