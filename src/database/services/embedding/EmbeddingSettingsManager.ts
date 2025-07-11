/**
 * EmbeddingSettingsManager - Handles embedding settings management
 * Follows Single Responsibility Principle by focusing only on settings operations
 */

import { Plugin } from 'obsidian';
import { MemorySettings, DEFAULT_MEMORY_SETTINGS } from '../../../types';

// Define an interface that extends Plugin with our custom properties
interface ClaudesidianPlugin extends Plugin {
  settings: {
    settings: {
      memory: MemorySettings;
    };
    saveSettings: () => Promise<void>;
  };
}

export class EmbeddingSettingsManager {
  private plugin: Plugin;
  private settings: MemorySettings;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.settings = { ...DEFAULT_MEMORY_SETTINGS };
    this.initializeSettings();
  }

  /**
   * Initialize settings from plugin
   */
  private initializeSettings(): void {
    try {
      // Get settings from plugin - cast to ClaudesidianPlugin
      const pluginAsClaudesidian = this.plugin as ClaudesidianPlugin;
      const pluginSettings = pluginAsClaudesidian?.settings?.settings?.memory || DEFAULT_MEMORY_SETTINGS;
      this.settings = { ...pluginSettings };
      
      // Embedding settings loaded
    } catch (error) {
      console.error("Failed to initialize EmbeddingSettingsManager settings:", error);
      this.settings = { ...DEFAULT_MEMORY_SETTINGS, embeddingsEnabled: false };
    }
  }

  /**
   * Get current settings
   */
  getSettings(): MemorySettings {
    return { ...this.settings };
  }

  /**
   * Update settings
   * @param newSettings New memory settings
   */
  updateSettings(newSettings: MemorySettings): void {
    this.settings = { ...newSettings };
  }

  /**
   * Save settings to plugin
   */
  async saveSettings(): Promise<void> {
    try {
      const pluginAsClaudesidian = this.plugin as ClaudesidianPlugin;
      if (pluginAsClaudesidian && pluginAsClaudesidian.settings) {
        pluginAsClaudesidian.settings.settings.memory = this.settings;
        await pluginAsClaudesidian.settings.saveSettings();
      }
    } catch (saveError) {
      console.error('Error saving settings:', saveError);
      throw saveError;
    }
  }

  /**
   * Check if embeddings are enabled
   */
  areEmbeddingsEnabled(): boolean {
    return this.settings.embeddingsEnabled;
  }

  /**
   * Get API provider name
   */
  getApiProvider(): string {
    return this.settings.apiProvider;
  }

  /**
   * Get provider-specific settings
   */
  getProviderSettings(provider?: string): any {
    const targetProvider = provider || this.settings.apiProvider;
    return this.settings.providerSettings?.[targetProvider];
  }

  /**
   * Get chunking configuration
   */
  getChunkingConfig(): {
    maxTokensPerChunk: number;
    chunkStrategy: string;
  } {
    return {
      maxTokensPerChunk: this.settings.maxTokensPerChunk || 8000,
      chunkStrategy: this.settings.chunkStrategy || 'paragraph'
    };
  }

  /**
   * Get batching configuration
   */
  getBatchingConfig(): {
    batchSize: number;
    processingDelay: number;
  } {
    return {
      batchSize: 10,
      processingDelay: 1000
    };
  }

  /**
   * Validate settings for a specific provider
   * @param provider Provider name to validate
   * @returns Validation result with details
   */
  validateProviderSettings(provider?: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const targetProvider = provider || this.settings.apiProvider;
    const providerSettings = this.getProviderSettings(targetProvider);
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if embeddings are enabled
    if (!this.settings.embeddingsEnabled) {
      warnings.push('Embeddings are disabled');
    }

    // Check if provider settings exist
    if (!providerSettings) {
      errors.push(`No settings found for provider: ${targetProvider}`);
      return { isValid: false, errors, warnings };
    }

    // Check API key if required (this would need to be enhanced based on provider requirements)
    if (!providerSettings.apiKey || providerSettings.apiKey.trim() === '') {
      errors.push(`API key is required for ${targetProvider} but not provided`);
    }

    // Check dimensions
    if (providerSettings.dimensions && providerSettings.dimensions <= 0) {
      errors.push(`Invalid dimensions specified: ${providerSettings.dimensions}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get settings comparison for provider switching
   * @param newSettings New settings to compare against
   * @returns Comparison details
   */
  compareSettings(newSettings: MemorySettings): {
    providerChanged: boolean;
    dimensionsChanged: boolean;
    embeddingsToggled: boolean;
    oldProvider: string;
    newProvider: string;
    oldDimensions?: number;
    newDimensions?: number;
  } {
    const oldProvider = this.settings.apiProvider;
    const newProvider = newSettings.apiProvider;
    const oldProviderSettings = this.settings.providerSettings?.[oldProvider];
    const newProviderSettings = newSettings.providerSettings?.[newProvider];

    return {
      providerChanged: oldProvider !== newProvider,
      dimensionsChanged: oldProviderSettings?.dimensions !== newProviderSettings?.dimensions,
      embeddingsToggled: this.settings.embeddingsEnabled !== newSettings.embeddingsEnabled,
      oldProvider,
      newProvider,
      oldDimensions: oldProviderSettings?.dimensions,
      newDimensions: newProviderSettings?.dimensions
    };
  }

  /**
   * Reset settings to defaults
   */
  resetToDefaults(): void {
    this.settings = { ...DEFAULT_MEMORY_SETTINGS };
  }

  /**
   * Get settings summary for debugging
   */
  getSettingsSummary(): {
    embeddingsEnabled: boolean;
    apiProvider: string;
    hasApiKey: boolean;
    dimensions?: number;
    batchSize: number;
    maxTokensPerChunk: number;
  } {
    const providerSettings = this.getProviderSettings();
    
    return {
      embeddingsEnabled: this.settings.embeddingsEnabled,
      apiProvider: this.settings.apiProvider,
      hasApiKey: !!(providerSettings?.apiKey && providerSettings.apiKey.trim() !== ''),
      dimensions: providerSettings?.dimensions,
      batchSize: 10,
      maxTokensPerChunk: this.settings.maxTokensPerChunk || 8000
    };
  }
}