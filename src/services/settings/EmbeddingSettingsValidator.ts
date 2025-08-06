import { EmbeddingProviderRegistry } from '../../database/providers/registry/EmbeddingProviderRegistry';

/**
 * Location: src/services/settings/EmbeddingSettingsValidator.ts
 * 
 * EmbeddingSettingsValidator service handles validation logic for embedding settings including:
 * - API key validation for different providers
 * - Model configuration validation
 * - Provider setting consistency checks
 * - Dimension compatibility validation
 * - Rate limit and threshold validation
 * 
 * Used by: EmbeddingSettingsTab and related components for settings validation
 * Dependencies: EmbeddingProviderRegistry
 */

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

export interface SettingsValidationContext {
    embeddingsExist: boolean;
    currentDimensions?: number;
    hasApiAccess: boolean;
}

export class EmbeddingSettingsValidator {
    
    /**
     * Validates complete embedding settings configuration
     */
    static validateEmbeddingSettings(settings: any, context: SettingsValidationContext): ValidationResult {
        const result: ValidationResult = {
            isValid: true,
            errors: [],
            warnings: []
        };

        // Validate core settings structure
        this.validateSettingsStructure(settings, result);
        
        // Validate provider configuration
        if (settings.apiProvider) {
            this.validateProviderConfiguration(settings, context, result);
        }
        
        // Validate embedding strategy settings
        this.validateEmbeddingStrategy(settings, result);
        
        // Validate exclude patterns
        if (settings.excludePaths) {
            this.validateExcludePatterns(settings.excludePaths, result);
        }
        
        // Validate rate limiting
        this.validateRateLimiting(settings, result);

        // Set overall validity
        result.isValid = result.errors.length === 0;
        
        return result;
    }

    /**
     * Validates API key requirements for enabling embeddings
     */
    static validateApiKeyForEmbeddings(settings: any): ValidationResult {
        const result: ValidationResult = {
            isValid: true,
            errors: [],
            warnings: []
        };

        if (!settings.embeddingsEnabled) {
            return result; // No validation needed if embeddings are disabled
        }

        const provider = EmbeddingProviderRegistry.getProvider(settings.apiProvider);
        if (!provider) {
            result.errors.push(`Unknown provider: ${settings.apiProvider}`);
            result.isValid = false;
            return result;
        }

        if (provider.requiresApiKey) {
            const providerSettings = settings.providerSettings?.[settings.apiProvider];
            if (!providerSettings?.apiKey || providerSettings.apiKey.trim() === '') {
                result.errors.push(`API Key is required for ${provider.name} to enable embeddings`);
                result.isValid = false;
            }
        }

        return result;
    }

    /**
     * Validates dimension compatibility when changing models
     */
    static validateDimensionCompatibility(settings: any, context: SettingsValidationContext): ValidationResult {
        const result: ValidationResult = {
            isValid: true,
            errors: [],
            warnings: []
        };

        if (!context.embeddingsExist) {
            return result; // No compatibility issues if no embeddings exist
        }

        const provider = EmbeddingProviderRegistry.getProvider(settings.apiProvider);
        if (!provider) {
            result.errors.push(`Unknown provider: ${settings.apiProvider}`);
            result.isValid = false;
            return result;
        }

        const providerSettings = settings.providerSettings?.[settings.apiProvider];
        if (!providerSettings) {
            result.errors.push('Provider settings not configured');
            result.isValid = false;
            return result;
        }

        const selectedModel = provider.models.find(m => m.id === providerSettings.model);
        if (!selectedModel) {
            result.errors.push(`Model ${providerSettings.model} not found for provider ${provider.name}`);
            result.isValid = false;
            return result;
        }

        if (context.currentDimensions && selectedModel.dimensions !== context.currentDimensions) {
            result.warnings.push(
                `Dimension mismatch: existing embeddings use ${context.currentDimensions} dimensions, ` +
                `selected model uses ${selectedModel.dimensions} dimensions. ` +
                `All embeddings must be deleted to change dimensions.`
            );
        }

        return result;
    }

    /**
     * Validates provider configuration settings
     */
    private static validateProviderConfiguration(settings: any, context: SettingsValidationContext, result: ValidationResult): void {
        const provider = EmbeddingProviderRegistry.getProvider(settings.apiProvider);
        
        if (!provider) {
            result.errors.push(`Invalid provider: ${settings.apiProvider}`);
            return;
        }

        const providerSettings = settings.providerSettings?.[settings.apiProvider];
        if (!providerSettings) {
            result.errors.push(`Missing configuration for provider: ${settings.apiProvider}`);
            return;
        }

        // Validate API key if required
        if (provider.requiresApiKey && settings.embeddingsEnabled) {
            if (!providerSettings.apiKey || providerSettings.apiKey.trim() === '') {
                result.errors.push(`API key is required for ${provider.name}`);
            } else if (providerSettings.apiKey.length < 10) {
                result.warnings.push(`API key appears to be too short for ${provider.name}`);
            }
        }

        // Validate model selection
        if (!providerSettings.model) {
            result.errors.push('No model selected');
        } else {
            const modelExists = provider.models.some(m => m.id === providerSettings.model);
            if (!modelExists) {
                result.errors.push(`Model ${providerSettings.model} is not available for ${provider.name}`);
            }
        }

        // Validate dimensions
        if (providerSettings.dimensions) {
            if (!Number.isInteger(providerSettings.dimensions) || providerSettings.dimensions <= 0) {
                result.errors.push('Dimensions must be a positive integer');
            } else if (providerSettings.dimensions > 4096) {
                result.warnings.push('Very high dimension count may impact performance');
            }
        }

        // Validate Ollama-specific settings
        if (settings.apiProvider === 'ollama') {
            this.validateOllamaSettings(providerSettings, result);
        }
    }

    /**
     * Validates Ollama-specific configuration
     */
    private static validateOllamaSettings(providerSettings: any, result: ValidationResult): void {
        const customSettings = providerSettings.customSettings;
        if (!customSettings) {
            result.warnings.push('Ollama URL not configured, using default');
            return;
        }

        const url = customSettings.url || 'http://127.0.0.1:11434/';
        
        // Basic URL validation
        try {
            new URL(url);
        } catch (error) {
            result.errors.push(`Invalid Ollama URL format: ${url}`);
        }

        // Check for common URL issues
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            result.errors.push('Ollama URL must start with http:// or https://');
        }

        if (!url.endsWith('/')) {
            result.warnings.push('Ollama URL should end with a forward slash');
        }
    }

    /**
     * Validates embedding strategy configuration
     */
    private static validateEmbeddingStrategy(settings: any, result: ValidationResult): void {
        const validStrategies = ['idle', 'startup'];
        
        if (!settings.embeddingStrategy) {
            result.warnings.push('No embedding strategy specified, using default');
            return;
        }

        if (!validStrategies.includes(settings.embeddingStrategy)) {
            result.errors.push(`Invalid embedding strategy: ${settings.embeddingStrategy}`);
        }

        // Validate idle-specific settings
        if (settings.embeddingStrategy === 'idle') {
            this.validateIdleSettings(settings, result);
        }
    }

    /**
     * Validates idle strategy specific settings
     */
    private static validateIdleSettings(settings: any, result: ValidationResult): void {
        if (!settings.idleTimeThreshold) {
            result.warnings.push('Idle time threshold not set, using default');
            return;
        }

        const threshold = settings.idleTimeThreshold;
        
        if (!Number.isInteger(threshold) || threshold <= 0) {
            result.errors.push('Idle time threshold must be a positive number');
        } else if (threshold < 5000) { // 5 seconds minimum
            result.errors.push('Idle time threshold must be at least 5 seconds');
        } else if (threshold > 3600000) { // 1 hour maximum
            result.warnings.push('Very long idle time threshold may delay indexing significantly');
        }
    }

    /**
     * Validates exclude patterns
     */
    private static validateExcludePatterns(excludePaths: string[], result: ValidationResult): void {
        if (!Array.isArray(excludePaths)) {
            result.errors.push('Exclude paths must be an array');
            return;
        }

        let invalidPatterns = 0;
        
        excludePaths.forEach((pattern, index) => {
            if (typeof pattern !== 'string') {
                result.errors.push(`Exclude pattern at index ${index} must be a string`);
                invalidPatterns++;
                return;
            }

            // Check for potentially problematic patterns
            if (pattern === '*' || pattern === '**') {
                result.warnings.push(`Pattern "${pattern}" will exclude all files`);
            }

            if (pattern.includes('\\')) {
                result.errors.push(`Pattern "${pattern}" should use forward slashes instead of backslashes`);
                invalidPatterns++;
            }

            if (pattern.startsWith('/')) {
                result.warnings.push(`Pattern "${pattern}" should not start with forward slash`);
            }
        });

        if (invalidPatterns > 0) {
            result.warnings.push(`${invalidPatterns} exclude pattern(s) may not work as expected`);
        }
    }

    /**
     * Validates rate limiting settings
     */
    private static validateRateLimiting(settings: any, result: ValidationResult): void {
        if (!settings.apiRateLimitPerMinute) {
            result.warnings.push('API rate limit not set, using default');
            return;
        }

        const rateLimit = settings.apiRateLimitPerMinute;
        
        if (!Number.isInteger(rateLimit) || rateLimit <= 0) {
            result.errors.push('API rate limit must be a positive integer');
        } else if (rateLimit < 10) {
            result.warnings.push('Very low rate limit may significantly slow down indexing');
        } else if (rateLimit > 1000) {
            result.warnings.push('Very high rate limit may exceed provider limits');
        }
    }

    /**
     * Validates basic settings structure
     */
    private static validateSettingsStructure(settings: any, result: ValidationResult): void {
        if (!settings) {
            result.errors.push('Settings object is null or undefined');
            return;
        }

        // Check for required top-level properties
        const requiredProperties = ['apiProvider', 'embeddingsEnabled'];
        requiredProperties.forEach(prop => {
            if (!(prop in settings)) {
                result.errors.push(`Missing required setting: ${prop}`);
            }
        });

        // Validate settings types
        if (typeof settings.embeddingsEnabled !== 'boolean') {
            result.errors.push('embeddingsEnabled must be a boolean');
        }

        if (settings.apiProvider && typeof settings.apiProvider !== 'string') {
            result.errors.push('apiProvider must be a string');
        }
    }
}