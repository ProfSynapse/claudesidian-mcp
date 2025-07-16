/**
 * SettingsValidator - Handles settings validation and normalization
 * Follows Single Responsibility Principle by focusing only on settings validation
 */

import { EmbeddingProviderRegistry } from '../../../../database/providers/registry/EmbeddingProviderRegistry';

export interface ValidationResult {
    isValid: boolean;
    error?: string;
}

/**
 * Service responsible for validating and normalizing settings
 * Follows SRP by focusing only on settings validation operations
 */
export class SettingsValidator {
    /**
     * Ensure provider settings structure exists
     */
    ensureProviderSettings(settings: any): void {
        if (!settings.providerSettings) {
            settings.providerSettings = {};
        }
    }

    /**
     * Initialize provider settings if not exists
     */
    initializeProviderSettings(settings: any, providerId: string): void {
        this.ensureProviderSettings(settings);
        
        if (!settings.providerSettings[providerId]) {
            const provider = EmbeddingProviderRegistry.getProvider(providerId);
            if (provider && provider.models.length > 0) {
                settings.providerSettings[providerId] = {
                    apiKey: '',
                    model: provider.models[0].id,
                    dimensions: provider.models[0].dimensions
                };
            }
        }
    }

    /**
     * Validate API key for provider
     */
    validateApiKey(settings: any, providerId: string): ValidationResult {
        const provider = EmbeddingProviderRegistry.getProvider(providerId);
        
        if (!provider) {
            return {
                isValid: false,
                error: `Unknown provider: ${providerId}`
            };
        }

        // Skip validation for providers that don't require API key
        if (!provider.requiresApiKey) {
            return { isValid: true };
        }

        const providerSettings = settings.providerSettings?.[providerId];
        
        if (!providerSettings?.apiKey || providerSettings.apiKey.trim() === '') {
            return {
                isValid: false,
                error: `API Key is required for ${provider.name}`
            };
        }

        return { isValid: true };
    }

    /**
     * Validate model selection
     */
    validateModel(settings: any, providerId: string): ValidationResult {
        const provider = EmbeddingProviderRegistry.getProvider(providerId);
        
        if (!provider) {
            return {
                isValid: false,
                error: `Unknown provider: ${providerId}`
            };
        }

        const providerSettings = settings.providerSettings?.[providerId];
        
        if (!providerSettings?.model) {
            return {
                isValid: false,
                error: `Model selection is required for ${provider.name}`
            };
        }

        const modelExists = provider.models.some(m => m.id === providerSettings.model);
        
        if (!modelExists) {
            return {
                isValid: false,
                error: `Invalid model selection: ${providerSettings.model}`
            };
        }

        return { isValid: true };
    }

    /**
     * Validate dimensions compatibility
     */
    validateDimensions(settings: any, providerId: string, embeddingsExist: boolean): ValidationResult {
        const provider = EmbeddingProviderRegistry.getProvider(providerId);
        
        if (!provider) {
            return {
                isValid: false,
                error: `Unknown provider: ${providerId}`
            };
        }

        const providerSettings = settings.providerSettings?.[providerId];
        
        if (!providerSettings) {
            return {
                isValid: false,
                error: `Provider settings not found for ${providerId}`
            };
        }

        const selectedModel = provider.models.find(m => m.id === providerSettings.model);
        
        if (!selectedModel) {
            return {
                isValid: false,
                error: `Selected model not found: ${providerSettings.model}`
            };
        }

        // Check for dimension mismatch when embeddings exist
        if (embeddingsExist && providerSettings.dimensions !== selectedModel.dimensions) {
            return {
                isValid: false,
                error: `Dimension mismatch: existing embeddings use ${providerSettings.dimensions} dimensions, ` +
                       `but selected model uses ${selectedModel.dimensions} dimensions`
            };
        }

        return { isValid: true };
    }

    /**
     * Validate rate limit settings
     */
    validateRateLimit(settings: any): ValidationResult {
        const rateLimit = settings.apiRateLimitPerMinute;
        
        if (typeof rateLimit !== 'number') {
            return {
                isValid: false,
                error: 'Rate limit must be a number'
            };
        }

        if (rateLimit < 1 || rateLimit > 1000) {
            return {
                isValid: false,
                error: 'Rate limit must be between 1 and 1000'
            };
        }

        return { isValid: true };
    }

    /**
     * Validate embeddings can be enabled
     */
    validateEmbeddingEnable(settings: any, providerId: string): ValidationResult {
        const provider = EmbeddingProviderRegistry.getProvider(providerId);
        
        if (!provider) {
            return {
                isValid: false,
                error: `Unknown provider: ${providerId}`
            };
        }

        // Skip validation for providers that don't require API key
        if (!provider.requiresApiKey) {
            return { isValid: true };
        }

        const providerSettings = settings.providerSettings?.[providerId];
        
        if (!providerSettings?.apiKey || providerSettings.apiKey.trim() === '') {
            return {
                isValid: false,
                error: `API Key is required to enable embeddings for ${provider.name}`
            };
        }

        return { isValid: true };
    }

    /**
     * Validate complete settings configuration
     */
    validateCompleteSettings(settings: any, embeddingsExist: boolean): ValidationResult {
        const providerId = settings.apiProvider;
        
        if (!providerId) {
            return {
                isValid: false,
                error: 'API provider must be selected'
            };
        }

        // Validate API key
        const apiKeyValidation = this.validateApiKey(settings, providerId);
        if (!apiKeyValidation.isValid) {
            return apiKeyValidation;
        }

        // Validate model
        const modelValidation = this.validateModel(settings, providerId);
        if (!modelValidation.isValid) {
            return modelValidation;
        }

        // Validate dimensions
        const dimensionValidation = this.validateDimensions(settings, providerId, embeddingsExist);
        if (!dimensionValidation.isValid) {
            return dimensionValidation;
        }

        // Validate rate limit
        const rateLimitValidation = this.validateRateLimit(settings);
        if (!rateLimitValidation.isValid) {
            return rateLimitValidation;
        }

        return { isValid: true };
    }

    /**
     * Get provider display name
     */
    getProviderDisplayName(providerId: string): string {
        const provider = EmbeddingProviderRegistry.getProvider(providerId);
        return provider ? provider.name : providerId;
    }

    /**
     * Get model display name
     */
    getModelDisplayName(providerId: string, modelId: string): string {
        const provider = EmbeddingProviderRegistry.getProvider(providerId);
        if (!provider) return modelId;
        
        const model = provider.models.find(m => m.id === modelId);
        return model ? `${model.name} (${model.dimensions} dims)` : modelId;
    }

    /**
     * Normalize settings after changes
     */
    normalizeSettings(settings: any, providerId: string): void {
        this.ensureProviderSettings(settings);
        
        if (!settings.providerSettings[providerId]) {
            this.initializeProviderSettings(settings, providerId);
        }

        // Ensure dimensions match selected model
        const provider = EmbeddingProviderRegistry.getProvider(providerId);
        if (provider) {
            const providerSettings = settings.providerSettings[providerId];
            const selectedModel = provider.models.find(m => m.id === providerSettings.model);
            if (selectedModel) {
                providerSettings.dimensions = selectedModel.dimensions;
            }
        }
    }
}