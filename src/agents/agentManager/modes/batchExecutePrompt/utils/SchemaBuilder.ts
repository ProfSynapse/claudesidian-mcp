import { LLMProviderManager } from '../../../../../services/LLMProviderManager';
import { StaticModelsService } from '../../../../../services/StaticModelsService';

/**
 * Utility for building JSON schemas for batch execution parameters and results
 * Follows SRP by focusing only on schema generation logic
 */
export class SchemaBuilder {
  constructor(private providerManager?: LLMProviderManager) {}

  /**
   * Get parameter schema for MCP tool definition
   */
  getParameterSchema(): any {
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
              provider: {
                type: 'string',
                description: this.getEnabledProviders().length > 0 
                  ? `Optional provider to use (defaults to settings default). Available providers: ${this.getEnabledProviders().join(', ')}`
                  : 'Optional provider to use (defaults to settings default). No providers are currently enabled. Please configure API keys in settings.',
                ...(this.getEnabledProviders().length > 0 && { 
                  enum: this.getEnabledProviders(),
                  examples: this.getEnabledProviders() 
                })
              },
              model: {
                type: 'string',
                description: this.getAvailableModels().length > 0
                  ? `Optional model to use (defaults to settings default). Available models: ${this.getAvailableModels().slice(0, 3).join(', ')}${this.getAvailableModels().length > 3 ? '...' : ''}`
                  : 'Optional model to use (defaults to settings default). No models available. Please configure provider API keys in settings.',
                ...(this.getAvailableModels().length > 0 && { 
                  enum: this.getAvailableModels(),
                  examples: this.getAvailableModels().slice(0, 5) 
                })
              },
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
              action: this.getActionSchema(),
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
    
    return batchSchema;
  }

  /**
   * Get result schema for MCP tool definition
   */
  getResultSchema(): any {
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
          items: this.getPromptResultSchema()
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

  /**
   * Get action schema for prompt actions
   */
  private getActionSchema(): any {
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
   * Get individual prompt result schema
   */
  private getPromptResultSchema(): any {
    return {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Custom identifier for this prompt'
        },
        prompt: {
          type: 'string',
          description: 'The original prompt text'
        },
        success: {
          type: 'boolean',
          description: 'Whether this individual prompt succeeded'
        },
        response: {
          type: 'string',
          description: 'The LLM response (if successful)'
        },
        provider: {
          type: 'string',
          description: 'The provider that was used'
        },
        model: {
          type: 'string',
          description: 'The model that was used'
        },
        error: {
          type: 'string',
          description: 'Error message (if failed)'
        },
        executionTime: {
          type: 'number',
          description: 'Execution time in milliseconds'
        },
        sequence: {
          type: 'number',
          description: 'Sequence number this prompt was executed in'
        },
        parallelGroup: {
          type: 'string',
          description: 'Parallel group this prompt was executed in'
        },
        agent: {
          type: 'string',
          description: 'The custom agent that was used'
        },
        actionPerformed: {
          type: 'object',
          description: 'Details about any action performed with the response',
          properties: {
            type: {
              type: 'string',
              description: 'Type of action performed'
            },
            targetPath: {
              type: 'string',
              description: 'Target path for the action'
            },
            success: {
              type: 'boolean',
              description: 'Whether the action was successful'
            },
            error: {
              type: 'string',
              description: 'Error message if action failed'
            }
          }
        }
      }
    };
  }

  /**
   * Get enabled providers for schema
   */
  private getEnabledProviders(): string[] {
    if (!this.providerManager) return [];
    
    try {
      const settings = this.providerManager.getSettings();
      return Object.keys(settings.providers)
        .filter(id => settings.providers[id]?.enabled && settings.providers[id]?.apiKey);
    } catch (error) {
      console.warn('Error getting enabled providers:', error);
      return [];
    }
  }

  /**
   * Get all available models from enabled providers
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
          console.warn(`Error getting models for provider ${providerId}:`, error);
        }
      });
      
      return [...new Set(models)]; // Remove duplicates
    } catch (error) {
      console.warn('Error getting available models:', error);
      return [];
    }
  }
}