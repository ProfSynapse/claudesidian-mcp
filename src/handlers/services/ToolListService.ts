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
    allOf: any[];
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
            required: ['mode', 'sessionId'],
            allOf: []
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
                    
                    if (modeSchemaCopy.properties && modeSchemaCopy.properties.mode) {
                        delete modeSchemaCopy.properties.mode;
                    }
                    
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
                    
                    if (modeSchemaCopy.properties) {
                        for (const [propName, propSchema] of Object.entries(modeSchemaCopy.properties)) {
                            if (propName !== 'mode' && propName !== 'sessionId') {
                                agentSchema.properties[propName] = propSchema;
                            }
                        }
                    }
                    
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
            } catch (error) {
                logger.systemError(error as Error, `Error processing schema for mode ${mode.slug}`);
            }
        }
        
        return agentSchema;
    }
}