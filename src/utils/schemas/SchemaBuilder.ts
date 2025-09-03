/**
 * SchemaBuilder - Unified schema building system for all agent modes
 * Location: /src/utils/schemas/SchemaBuilder.ts
 * 
 * This file consolidates 4 duplicate schema builders into a single, unified system:
 * - agentManager/modes/batchExecutePrompt/utils/SchemaBuilder.ts
 * - agentManager/modes/execute/services/SchemaBuilder.ts  
 * - contentManager/modes/batch/schemas/SchemaBuilder.ts
 * - memoryManager/modes/session/create/services/SessionSchemaBuilder.ts
 * 
 * Used by all agent modes requiring schema generation for MCP tool definitions.
 */

import { 
  SchemaType, 
  SchemaContext, 
  ISchemaBuilder,
  ProviderInfo,
  CommonSchemaProperties,
  SchemaValidationResult,
  SchemaStatistics
} from './SchemaTypes';

// Re-export SchemaType for consumers
export { SchemaType } from './SchemaTypes';
import { LLMProviderManager } from '../../services/llm/providers/ProviderManager';
import { StaticModelsService } from '../../services/StaticModelsService';
import { mergeWithCommonSchema } from '../schemaUtils';

/**
 * Unified schema builder that handles all schema generation across the application
 * Eliminates code duplication and provides consistent schema patterns
 */
export class SchemaBuilder {
  private providerManager: LLMProviderManager | null;
  
  constructor(providerManager?: LLMProviderManager | null) {
    this.providerManager = providerManager || null;
  }

  /**
   * Main entry point - builds schema based on type and context
   */
  static buildSchema(type: SchemaType, context: SchemaContext): { 
    parameterSchema: any; 
    resultSchema: any; 
  } {
    const builder = new SchemaBuilder(context.providerManager);
    const concreteBuilder = builder.getBuilder(type);
    
    return {
      parameterSchema: concreteBuilder.buildParameterSchema(context),
      resultSchema: concreteBuilder.buildResultSchema(context)
    };
  }

  /**
   * Instance method for parameter schema building
   */
  buildParameterSchema(type: SchemaType, context: SchemaContext): any {
    const builder = this.getBuilder(type);
    return builder.buildParameterSchema(context);
  }

  /**
   * Instance method for result schema building  
   */
  buildResultSchema(type: SchemaType, context: SchemaContext): any {
    const builder = this.getBuilder(type);
    return builder.buildResultSchema(context);
  }

  /**
   * Get specific builder for schema type
   */
  private getBuilder(type: SchemaType): ISchemaBuilder {
    switch (type) {
      case SchemaType.BatchExecute:
        return new BatchExecuteSchemaBuilder(this.providerManager);
      case SchemaType.Execute:
        return new ExecuteSchemaBuilder(this.providerManager);
      case SchemaType.ContentBatch:
        return new ContentBatchSchemaBuilder();
      case SchemaType.Session:
        return new SessionSchemaBuilder();
      default:
        throw new Error(`Unknown schema type: ${type}`);
    }
  }

  /**
   * Update provider manager instance
   */
  updateProviderManager(providerManager: LLMProviderManager | null): void {
    this.providerManager = providerManager;
  }

  /**
   * Get provider information for schema building
   */
  getProviderInfo(): ProviderInfo {
    if (!this.providerManager) {
      return {
        enabledProviders: [],
        availableModels: [],
        hasProviderManager: false
      };
    }

    return {
      enabledProviders: this.getEnabledProviders(),
      availableModels: this.getAvailableModels(),
      hasProviderManager: true
    };
  }

  /**
   * Build common schema properties used across multiple types
   */
  buildCommonProperties(options: { 
    includeProviders?: boolean; 
    includeActions?: boolean; 
  } = {}): CommonSchemaProperties {
    const properties: CommonSchemaProperties = {};
    
    if (options.includeProviders) {
      const providerInfo = this.getProviderInfo();
      
      const defaultModel = this.getDefaultModel();
      
      properties.provider = {
        type: 'string',
        description: `LLM provider name (optional, defaults to: ${defaultModel?.provider || 'not configured'}). Use listModels to see available providers.`,
        default: defaultModel?.provider
      };

      properties.model = {
        type: 'string',
        description: `Model name (optional, defaults to: ${defaultModel?.model || 'not configured'}). Use listModels to see available models.`,
        default: defaultModel?.model
      };
    }

    if (options.includeActions) {
      properties.action = this.buildActionSchema();
    }

    return properties;
  }

  /**
   * Build action schema for content operations
   */
  private buildActionSchema(): any {
    return {
      type: 'object',
      description: 'Optional action to perform with the LLM response',
      properties: {
        type: {
          type: 'string',
          enum: ['create', 'append', 'prepend', 'replace', 'findReplace'],
          description: 'Type of content action to perform'
        },
        targetPath: {
          type: 'string',
          description: 'Path to the target file for the action'
        },
        position: {
          type: 'number',
          description: 'Line position for replace actions'
        },
        findText: {
          type: 'string',
          description: 'Text to find and replace (required for findReplace action)'
        },
        replaceAll: {
          type: 'boolean',
          description: 'Whether to replace all occurrences (default: false)',
          default: false
        },
        caseSensitive: {
          type: 'boolean',
          description: 'Whether search is case sensitive (default: true)',
          default: true
        },
        wholeWord: {
          type: 'boolean',
          description: 'Whether to match whole words only (default: false)',
          default: false
        }
      },
      required: ['type', 'targetPath']
    };
  }

  /**
   * Get enabled providers from provider manager
   */
  private getEnabledProviders(): string[] {
    if (!this.providerManager) return [];
    
    try {
      const settings = this.providerManager.getSettings();
      return Object.keys(settings.providers)
        .filter(id => settings.providers[id]?.enabled && settings.providers[id]?.apiKey);
    } catch (error) {
      console.warn('SchemaBuilder: Error getting enabled providers:', error);
      return [];
    }
  }

  /**
   * Get available models from enabled providers
   */
  private getAvailableModels(): string[] {
    if (!this.providerManager) return [];
    
    try {
      const staticModelsService = StaticModelsService.getInstance();
      const enabledProviders = this.getEnabledProviders();
      const models: string[] = [];
      
      enabledProviders.forEach(providerId => {
        try {
          const providerModels = staticModelsService.getModelsForProvider(providerId);
          models.push(...providerModels.map((m: any) => m.id));
        } catch (error) {
          console.warn(`SchemaBuilder: Error getting models for provider ${providerId}:`, error);
        }
      });
      
      return [...new Set(models)]; // Remove duplicates
    } catch (error) {
      console.warn('SchemaBuilder: Error getting available models:', error);
      return [];
    }
  }

  /**
   * Get default model from provider manager settings
   */
  private getDefaultModel(): { provider: string; model: string } | null {
    if (!this.providerManager) return null;
    
    try {
      const settings = this.providerManager.getSettings();
      return settings.defaultModel || null;
    } catch (error) {
      console.warn('SchemaBuilder: Error getting default model:', error);
      return null;
    }
  }

  /**
   * Validate schema configuration
   */
  validateConfiguration(): SchemaValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.providerManager) {
      warnings.push('Provider manager not available - schema will not include dynamic provider/model information');
    }

    const enabledProviders = this.getEnabledProviders();
    if (enabledProviders.length === 0) {
      warnings.push('No providers are currently enabled - users may not be able to execute prompts');
    }

    const availableModels = this.getAvailableModels();
    if (availableModels.length === 0) {
      warnings.push('No models are available - users may not be able to execute prompts');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get schema building statistics
   */
  getStatistics(): SchemaStatistics {
    const providerInfo = this.getProviderInfo();
    
    return {
      parameterProperties: 0, // Will be set by concrete implementations
      resultProperties: 0, // Will be set by concrete implementations  
      supportedTypes: Object.values(SchemaType),
      hasProviderManager: !!this.providerManager,
      enabledProvidersCount: providerInfo.enabledProviders.length,
      availableModelsCount: providerInfo.availableModels.length
    };
  }
}

/**
 * Batch Execute Schema Builder - Handles complex batch LLM execution schemas
 */
class BatchExecuteSchemaBuilder implements ISchemaBuilder {
  constructor(private providerManager: LLMProviderManager | null) {}

  buildParameterSchema(context: SchemaContext): any {
    const builder = new SchemaBuilder(this.providerManager);
    const commonProps = builder.buildCommonProperties({ 
      includeProviders: true, 
      includeActions: true 
    });

    const batchSchema = {
      type: 'object',
      title: 'Batch Execute LLM Prompts Parameters',
      description: 'Execute multiple LLM prompts concurrently across different providers with context support.',
      properties: {
        prompts: {
          type: 'array',
          description: 'Array of prompts to execute concurrently',
          items: {
            type: 'object',
            title: 'Individual Prompt Configuration',
            description: 'Configuration for a single LLM prompt execution',
            properties: {
              prompt: {
                type: 'string',
                description: 'The prompt text to send to the LLM',
                examples: [
                  'Summarize this document',
                  'Generate unit tests for this code',
                  'Explain this concept in simple terms'
                ]
              },
              provider: commonProps.provider,
              model: commonProps.model,
              contextFiles: {
                type: 'array',
                description: 'Optional context files to include with this prompt',
                items: { type: 'string' }
              },
              workspace: {
                type: 'string',
                description: 'Optional workspace for context'
              },
              id: {
                type: 'string',
                description: 'Custom identifier for this prompt'
              },
              sequence: {
                type: 'number',
                description: 'Sequence number for ordered execution. Prompts with same sequence run in parallel, sequences execute in numerical order (0, 1, 2, etc.). If not specified, defaults to 0.',
                minimum: 0,
                examples: [0, 1, 2, 3]
              },
              parallelGroup: {
                type: 'string',
                description: 'Parallel group within sequence - prompts with same parallelGroup run together, different groups run sequentially within the sequence',
                examples: ['groupA', 'groupB', 'preprocessing', 'analysis']
              },
              includePreviousResults: {
                type: 'boolean',
                description: 'Whether to include previous sequence results as context for this prompt. Only applies when sequence > 0.',
                default: false
              },
              contextFromSteps: {
                type: 'array',
                description: 'Specific IDs of previous steps to include as context (if not specified, includes all previous results when includePreviousResults is true)',
                items: { type: 'string' }
              },
              action: commonProps.action,
              agent: {
                type: 'string',
                description: 'Optional custom agent/prompt to use for this prompt'
              }
            },
            required: ['prompt']
          },
          minItems: 1,
          maxItems: 100
        },
        mergeResponses: {
          type: 'boolean',
          description: 'Whether to merge all responses into a single result (default: false)',
          default: false
        }
      },
      required: ['prompts'],
      additionalProperties: false
    };
    
    return mergeWithCommonSchema(batchSchema);
  }

  buildResultSchema(context: SchemaContext): any {
    return {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the batch execution was successful'
        },
        results: {
          type: 'array',
          description: 'Individual prompt results (if mergeResponses is false)',
          items: this.buildPromptResultSchema()
        },
        merged: {
          type: 'object',
          description: 'Merged response (if mergeResponses is true)',
          properties: {
            totalPrompts: {
              type: 'number',
              description: 'Total number of prompts executed'
            },
            successfulPrompts: {
              type: 'number',
              description: 'Number of prompts that succeeded'
            },
            combinedResponse: {
              type: 'string',
              description: 'All responses combined into a single string'
            },
            providersUsed: {
              type: 'array',
              description: 'List of providers that were used',
              items: { type: 'string' }
            }
          }
        },
        stats: {
          type: 'object',
          description: 'Execution statistics',
          properties: {
            totalExecutionTimeMS: {
              type: 'number',
              description: 'Total execution time in milliseconds'
            },
            promptsExecuted: {
              type: 'number',
              description: 'Number of prompts executed'
            },
            promptsFailed: {
              type: 'number',
              description: 'Number of prompts that failed'
            },
            avgExecutionTimeMS: {
              type: 'number',
              description: 'Average execution time per prompt'
            },
            tokensUsed: {
              type: 'number',
              description: 'Total tokens used (if available)'
            }
          }
        },
        error: {
          type: 'string',
          description: 'Error message if batch execution failed'
        }
      },
      required: ['success'],
      additionalProperties: false
    };
  }

  private buildPromptResultSchema(): any {
    return {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Custom identifier for this prompt' },
        prompt: { type: 'string', description: 'The original prompt text' },
        success: { type: 'boolean', description: 'Whether this individual prompt succeeded' },
        response: { type: 'string', description: 'The LLM response (if successful)' },
        provider: { type: 'string', description: 'The provider that was used' },
        model: { type: 'string', description: 'The model that was used' },
        error: { type: 'string', description: 'Error message (if failed)' },
        executionTime: { type: 'number', description: 'Execution time in milliseconds' },
        sequence: { type: 'number', description: 'Sequence number this prompt was executed in' },
        parallelGroup: { type: 'string', description: 'Parallel group this prompt was executed in' },
        agent: { type: 'string', description: 'The custom agent that was used' },
        actionPerformed: {
          type: 'object',
          description: 'Details about any action performed with the response',
          properties: {
            type: { type: 'string', description: 'Type of action performed' },
            targetPath: { type: 'string', description: 'Target path for the action' },
            success: { type: 'boolean', description: 'Whether the action was successful' },
            error: { type: 'string', description: 'Error message if action failed' }
          }
        }
      }
    };
  }
}

/**
 * Execute Schema Builder - Handles single prompt execution schemas
 */
class ExecuteSchemaBuilder implements ISchemaBuilder {
  constructor(private providerManager: LLMProviderManager | null) {}

  buildParameterSchema(context: SchemaContext): any {
    const builder = new SchemaBuilder(this.providerManager);
    const commonProps = builder.buildCommonProperties({ 
      includeProviders: true, 
      includeActions: true 
    });

    return mergeWithCommonSchema({
      properties: {
        agent: {
          type: 'string',
          description: 'Custom prompt agent name/id to use as system prompt (optional - if not provided, uses raw prompt only)'
        },
        filepaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional array of file paths to include content as context'
        },
        prompt: {
          type: 'string',
          description: 'User prompt/question to send to the LLM'
        },
        provider: commonProps.provider,
        model: commonProps.model,
        temperature: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Temperature setting for response randomness (0.0-1.0)'
        },
        maxTokens: {
          type: 'number',
          description: 'Maximum tokens to generate'
        },
        action: commonProps.action
      },
      required: ['prompt']
    });
  }

  buildResultSchema(context: SchemaContext): any {
    return {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        error: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            response: { type: 'string' },
            model: { type: 'string' },
            provider: { type: 'string' },
            agentUsed: { type: 'string' },
            usage: {
              type: 'object',
              properties: {
                promptTokens: { type: 'number' },
                completionTokens: { type: 'number' },
                totalTokens: { type: 'number' }
              },
              required: ['promptTokens', 'completionTokens', 'totalTokens']
            },
            cost: {
              type: 'object',
              properties: {
                inputCost: { type: 'number' },
                outputCost: { type: 'number' },
                totalCost: { type: 'number' },
                currency: { type: 'string' }
              },
              required: ['inputCost', 'outputCost', 'totalCost', 'currency']
            },
            filesIncluded: {
              type: 'array',
              items: { type: 'string' }
            },
            actionPerformed: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                targetPath: { type: 'string' },
                success: { type: 'boolean' },
                error: { type: 'string' }
              },
              required: ['type', 'targetPath', 'success']
            }
          },
          required: ['response', 'model', 'provider', 'agentUsed']
        },
        sessionId: { type: 'string' },
        context: { type: 'string' }
      },
      required: ['success', 'sessionId']
    };
  }
}

/**
 * Content Batch Schema Builder - Handles batch content operations
 */
class ContentBatchSchemaBuilder implements ISchemaBuilder {
  buildParameterSchema(context: SchemaContext): any {
    return {
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          description: 'Array of operations to perform',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['read', 'create', 'append', 'prepend', 'replace', 'replaceByLine', 'delete', 'findReplace'],
                description: 'Type of operation'
              },
              params: {
                type: 'object',
                description: 'Operation-specific parameters. IMPORTANT: All operations require a "filePath" parameter.'
              }
            },
            required: ['type', 'params']
          }
        },
        workspaceContext: {
          type: 'object',
          description: 'Workspace context for the operation'
        },
        sessionId: {
          type: 'string',
          description: 'Session identifier for tracking'
        },
      },
      required: ['operations']
    };
  }

  buildResultSchema(context: SchemaContext): any {
    return {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the operation succeeded' },
        error: { type: 'string', description: 'Error message if success is false' },
        data: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              description: 'Array of operation results',
              items: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', description: 'Whether the operation succeeded' },
                  error: { type: 'string', description: 'Error message if success is false' },
                  data: { type: 'object', description: 'Operation-specific result data' },
                  type: { type: 'string', description: 'Type of operation' },
                  filePath: { type: 'string', description: 'File path for the operation' }
                },
                required: ['success', 'type', 'filePath']
              }
            }
          },
          required: ['results']
        },
        workspaceContext: {
          type: 'object',
          properties: {
            workspaceId: { type: 'string', description: 'ID of the workspace' },
            workspacePath: {
              type: 'array',
              items: { type: 'string' },
              description: 'Path of the workspace'
            },
            activeWorkspace: { type: 'boolean', description: 'Whether this is the active workspace' }
          }
        },
      },
      required: ['success']
    };
  }
}

/**
 * Session Schema Builder - Handles session creation schemas
 */
class SessionSchemaBuilder implements ISchemaBuilder {
  buildParameterSchema(context: SchemaContext): any {
    return {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name for the session' },
        description: { type: 'string', description: 'Description of the session purpose' },
        context: {
          type: 'string',
          description: 'Purpose or goal of this session - IMPORTANT: This will be stored with the session and used in memory operations',
          minLength: 1
        },
        generateContextTrace: {
          type: 'boolean',
          description: 'Whether to generate an initial memory trace with session context',
          default: true
        },
        sessionGoal: { type: 'string', description: 'The goal or purpose of this session (for memory context)' },
        previousSessionId: { type: 'string', description: 'Reference to previous session ID to establish continuity' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to associate with this session'
        },
        contextDepth: {
          type: 'string',
          enum: ['minimal', 'standard', 'comprehensive'],
          description: 'How much context to include in the initial memory trace',
          default: 'standard'
        },
        workspaceContext: {
          oneOf: [
            {
              type: 'object',
              properties: {
                workspaceId: { type: 'string', description: 'Workspace identifier (optional - uses default workspace if not provided)' },
                workspacePath: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Path from root workspace to specific phase/task'
                }
              },
              description: 'Optional workspace context object - if not provided, uses a default workspace'
            },
            {
              type: 'string',
              description: 'Optional workspace context as JSON string - must contain workspaceId field'
            }
          ],
          description: 'Optional workspace context - if not provided, uses a default workspace'
        }
      }
    };
  }

  buildResultSchema(context: SchemaContext): any {
    return {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the operation was successful' },
        data: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'ID of the created session' },
            name: { type: 'string', description: 'Name of the created session' },
            workspaceId: { type: 'string', description: 'ID of the workspace' },
            startTime: { type: 'number', description: 'Session start timestamp' },
            previousSessionId: { type: 'string', description: 'ID of the previous session (if continuing)' },
            purpose: { type: 'string', description: 'The purpose of this session extracted from context parameter' },
            context: { type: 'string', description: 'Contextual information about the operation (from CommonResult)' },
            memoryContext: {
              type: 'object',
              description: 'Detailed contextual information about the session',
              properties: {
                summary: { type: 'string', description: 'Summary of the workspace state at session start' },
                purpose: { type: 'string', description: 'The purpose or goal of this session derived from context parameter' },
                relevantFiles: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Key files relevant to this session'
                },
                recentActivities: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      timestamp: { type: 'number', description: 'When the activity occurred' },
                      description: { type: 'string', description: 'Description of the activity' },
                      type: { type: 'string', description: 'Type of activity' }
                    }
                  },
                  description: 'Recent activities in the workspace'
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Tags describing this session'
                }
              },
              required: ['summary', 'tags']
            }
          },
          required: ['sessionId', 'workspaceId', 'startTime']
        },
        error: { type: 'string', description: 'Error message if operation failed' },
        context: { type: 'string', description: 'The purpose and context of this session creation' }
      },
      required: ['success']
    };
  }
}