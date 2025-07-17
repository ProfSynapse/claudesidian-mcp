/**
 * SchemaBuilder - Handles schema generation for parameters and results
 * Follows Single Responsibility Principle by focusing only on schema operations
 */

import { LLMProviderManager } from '../../../../../services/LLMProviderManager';
import { StaticModelsService } from '../../../../../services/StaticModelsService';
import { mergeWithCommonSchema } from '../../../../../utils/schemaUtils';

/**
 * Service responsible for building parameter and result schemas
 * Follows SRP by focusing only on schema generation operations
 */
export class SchemaBuilder {
    constructor(private providerManager: LLMProviderManager | null) {}

    /**
     * Get parameter schema for the mode
     */
    getParameterSchema(): any {
        // Get dynamic options from provider manager
        const enabledProviders = this.getEnabledProviders();
        const availableModels = this.getAvailableModels();

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
                provider: {
                    type: 'string',
                    description: enabledProviders.length > 0 
                        ? `LLM provider name (optional - uses default if not specified). Available providers: ${enabledProviders.join(', ')}`
                        : 'LLM provider name (optional - uses default if not specified). No providers are currently enabled. Please configure API keys in settings.',
                    ...(enabledProviders.length > 0 && { 
                        enum: enabledProviders,
                        examples: enabledProviders 
                    })
                },
                model: {
                    type: 'string',
                    description: availableModels.length > 0
                        ? `Model name (optional - uses default if not specified). Available models: ${availableModels.slice(0, 3).join(', ')}${availableModels.length > 3 ? '...' : ''}`
                        : 'Model name (optional - uses default if not specified). No models available. Please configure provider API keys in settings.',
                    ...(availableModels.length > 0 && { 
                        enum: availableModels,
                        examples: availableModels.slice(0, 5) // Show first 5 as examples
                    })
                },
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
                action: {
                    type: 'object',
                    properties: {
                        type: {
                            type: 'string',
                            enum: ['create', 'append', 'prepend', 'replace', 'findReplace'],
                            description: 'ContentManager action to perform with LLM response'
                        },
                        targetPath: {
                            type: 'string',
                            description: 'File path where action should be performed'
                        },
                        position: {
                            type: 'number',
                            description: 'Line position for replace action'
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
                    required: ['type', 'targetPath'],
                    description: 'Optional action to perform with the LLM response. For findReplace type, findText is required.'
                }
            },
            required: ['prompt'] // Removed 'agent' from required parameters
        });
    }

    /**
     * Get result schema for the mode
     */
    getResultSchema(): any {
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
            console.warn('SchemaBuilder: Error getting enabled providers:', error);
            return [];
        }
    }

    /**
     * Get all available models from enabled providers
     */
    private getAvailableModels(): string[] {
        if (!this.providerManager) return [];
        
        try {
            const settings = this.providerManager.getSettings();
            const enabledProviders = this.getEnabledProviders();
            const models: string[] = [];
            
            enabledProviders.forEach(providerId => {
                try {
                    if (providerId === 'ollama') {
                        // For Ollama, include the user-configured model
                        if (settings.defaultModel.provider === 'ollama' && settings.defaultModel.model) {
                            models.push(settings.defaultModel.model);
                        }
                    } else {
                        // For other providers, use static models
                        const staticModelsService = StaticModelsService.getInstance();
                        const providerModels = staticModelsService.getModelsForProvider(providerId);
                        models.push(...providerModels.map(m => m.id));
                    }
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
     * Get provider schema information
     */
    getProviderSchemaInfo(): {
        enabledProviders: string[];
        availableModels: string[];
        hasProviderManager: boolean;
    } {
        return {
            enabledProviders: this.getEnabledProviders(),
            availableModels: this.getAvailableModels(),
            hasProviderManager: !!this.providerManager
        };
    }

    /**
     * Build dynamic schema properties
     */
    buildDynamicSchemaProperties(): {
        providerProperty: any;
        modelProperty: any;
    } {
        const enabledProviders = this.getEnabledProviders();
        const availableModels = this.getAvailableModels();

        const providerProperty = {
            type: 'string',
            description: enabledProviders.length > 0 
                ? `LLM provider name (optional - uses default if not specified). Available providers: ${enabledProviders.join(', ')}`
                : 'LLM provider name (optional - uses default if not specified). No providers are currently enabled. Please configure API keys in settings.',
            ...(enabledProviders.length > 0 && { 
                enum: enabledProviders,
                examples: enabledProviders 
            })
        };

        const modelProperty = {
            type: 'string',
            description: availableModels.length > 0
                ? `Model name (optional - uses default if not specified). Available models: ${availableModels.slice(0, 3).join(', ')}${availableModels.length > 3 ? '...' : ''}`
                : 'Model name (optional - uses default if not specified). No models available. Please configure provider API keys in settings.',
            ...(availableModels.length > 0 && { 
                enum: availableModels,
                examples: availableModels.slice(0, 5) // Show first 5 as examples
            })
        };

        return {
            providerProperty,
            modelProperty
        };
    }

    /**
     * Validate schema configuration
     */
    validateSchemaConfiguration(): {
        isValid: boolean;
        errors: string[];
        warnings: string[];
    } {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check if provider manager is available
        if (!this.providerManager) {
            warnings.push('Provider manager not available - schema will not include dynamic provider/model information');
        }

        // Check if providers are configured
        const enabledProviders = this.getEnabledProviders();
        if (enabledProviders.length === 0) {
            warnings.push('No providers are currently enabled - users may not be able to execute prompts');
        }

        // Check if models are available
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
     * Update provider manager
     */
    updateProviderManager(providerManager: LLMProviderManager | null): void {
        this.providerManager = providerManager;
    }

    /**
     * Get schema statistics
     */
    getSchemaStatistics(): {
        hasProviderManager: boolean;
        enabledProvidersCount: number;
        availableModelsCount: number;
        supportsActions: boolean;
    } {
        const enabledProviders = this.getEnabledProviders();
        const availableModels = this.getAvailableModels();

        return {
            hasProviderManager: !!this.providerManager,
            enabledProvidersCount: enabledProviders.length,
            availableModelsCount: availableModels.length,
            supportsActions: true // This mode always supports actions
        };
    }

    /**
     * Test schema building capability
     */
    testSchemaBuilding(): {
        canBuildSchema: boolean;
        error?: string;
    } {
        try {
            // Test building parameter schema
            const paramSchema = this.getParameterSchema();
            if (!paramSchema || typeof paramSchema !== 'object') {
                return {
                    canBuildSchema: false,
                    error: 'Failed to build parameter schema'
                };
            }

            // Test building result schema
            const resultSchema = this.getResultSchema();
            if (!resultSchema || typeof resultSchema !== 'object') {
                return {
                    canBuildSchema: false,
                    error: 'Failed to build result schema'
                };
            }

            return {
                canBuildSchema: true
            };
        } catch (error) {
            return {
                canBuildSchema: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
}