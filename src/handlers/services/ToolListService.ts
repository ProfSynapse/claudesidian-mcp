import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { IToolListService } from '../interfaces/IRequestHandlerServices';
import { IAgent } from '../../agents/interfaces/IAgent';
import { logger } from '../../utils/logger';

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
    // Removed allOf to avoid Claude Code compatibility issues
}

export class ToolListService implements IToolListService {
    async generateToolList(
        agents: Map<string, IAgent>,
        isVaultEnabled: boolean,
        vaultName?: string
    ): Promise<{ tools: any[] }> {
        try {
            if (!isVaultEnabled) {
                return { tools: [] };
            }
            
            const tools: any[] = [];
            
            for (const agent of agents.values()) {
                const agentSchema = this.buildAgentSchema(agent);
                this.mergeModeSchemasIntoAgent(agent, agentSchema);
                
                const toolName = vaultName ? `${agent.name}_${vaultName}` : agent.name;
                
                // Removed verbose debug logging for VaultLibrarian schema
                
                tools.push({
                    name: toolName,
                    description: agent.description,
                    inputSchema: agentSchema
                });
            }
            
            return { tools };
        } catch (error) {
            logger.systemError(error as Error, "Error in generateToolList");
            throw new McpError(ErrorCode.InternalError, 'Failed to list tools', error);
        }
    }

    buildAgentSchema(agent: IAgent): AgentSchema {
        return {
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
            required: ['mode', 'sessionId']
        };
    }

    mergeModeSchemasIntoAgent(agent: IAgent, agentSchema: AgentSchema): any {
        const agentModes = agent.getModes();
        
        for (const mode of agentModes) {
            agentSchema.properties.mode.enum.push(mode.slug);
            
            try {
                const modeSchema = mode.getParameterSchema();
                
                if (modeSchema && typeof modeSchema === 'object') {
                    const modeSchemaCopy = JSON.parse(JSON.stringify(modeSchema));
                    
                    // Remove mode and sessionId as they're already in base schema
                    if (modeSchemaCopy.properties && modeSchemaCopy.properties.mode) {
                        delete modeSchemaCopy.properties.mode;
                    }
                    if (modeSchemaCopy.properties && modeSchemaCopy.properties.sessionId) {
                        delete modeSchemaCopy.properties.sessionId;
                    }
                    
                    // Flatten and merge properties directly to avoid unsupported schema constructs
                    if (modeSchemaCopy.properties) {
                        for (const [propName, propSchema] of Object.entries(modeSchemaCopy.properties)) {
                            if (propName !== 'mode' && propName !== 'sessionId') {
                                // Flatten complex schemas to simple ones
                                agentSchema.properties[propName] = this.flattenSchemaProperty(propSchema as any);
                            }
                        }
                    }
                    
                    // Merge required fields (but make them all optional to avoid complex conditional logic)
                    // This is a simplification for Claude Code compatibility
                    if (modeSchemaCopy.required && modeSchemaCopy.required.length > 0) {
                        const additionalRequired = modeSchemaCopy.required.filter(
                            (prop: string) => prop !== 'mode' && prop !== 'sessionId'
                        );
                        
                        // Add note in description about when fields are required
                        if (additionalRequired.length > 0) {
                            for (const requiredProp of additionalRequired) {
                                if (agentSchema.properties[requiredProp]) {
                                    const currentDesc = agentSchema.properties[requiredProp].description || '';
                                    agentSchema.properties[requiredProp].description = 
                                        `${currentDesc} (Required when mode is '${mode.slug}')`.trim();
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                logger.systemError(error as Error, `Error processing schema for mode ${mode.slug}`);
            }
        }
        
        return agentSchema;
    }

    /**
     * Flatten complex schema properties to be compatible with Claude Code
     * @param schema The schema property to flatten
     * @returns Flattened schema property
     */
    private flattenSchemaProperty(schema: any): any {
        if (!schema || typeof schema !== 'object') {
            return schema;
        }

        // Handle oneOf, anyOf, allOf by taking the first valid option or creating a generic object
        if (schema.oneOf && Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
            // For oneOf, take the most permissive option or create a union description
            const types = schema.oneOf.map((option: any) => option.type).filter(Boolean);
            const uniqueTypes = [...new Set(types)];
            
            if (uniqueTypes.length === 1) {
                // All options have the same type, use the first one as base
                return this.flattenSchemaProperty(schema.oneOf[0]);
            } else if (uniqueTypes.includes('string')) {
                // If string is an option, prefer it for simplicity
                const stringOption = schema.oneOf.find((option: any) => option.type === 'string');
                return this.flattenSchemaProperty(stringOption);
            } else {
                // Create a generic description
                return {
                    type: 'string',
                    description: schema.description || 'Multiple formats accepted - see documentation'
                };
            }
        }

        if (schema.anyOf && Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
            // For anyOf, use the first option
            return this.flattenSchemaProperty(schema.anyOf[0]);
        }

        if (schema.allOf && Array.isArray(schema.allOf) && schema.allOf.length > 0) {
            // For allOf, merge all properties
            const merged: any = { type: 'object', properties: {} };
            for (const subSchema of schema.allOf) {
                if (subSchema.properties) {
                    Object.assign(merged.properties, subSchema.properties);
                }
                if (subSchema.type && !merged.type) {
                    merged.type = subSchema.type;
                }
                if (subSchema.description) {
                    merged.description = subSchema.description;
                }
            }
            return merged;
        }

        // Recursively flatten nested properties
        if (schema.properties) {
            const flattened = { ...schema };
            flattened.properties = {};
            for (const [key, value] of Object.entries(schema.properties)) {
                flattened.properties[key] = this.flattenSchemaProperty(value);
            }
            return flattened;
        }

        // Return as-is if no complex constructs found
        return schema;
    }
}