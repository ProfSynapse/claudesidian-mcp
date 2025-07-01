/**
 * EmbeddingProviderManager - Manages embedding provider lifecycle
 * Follows Single Responsibility Principle by focusing only on provider management
 */

import { IEmbeddingProvider, ITokenTrackingProvider } from '../../interfaces/IEmbeddingProvider';
import { VectorStoreFactory } from '../../factory/VectorStoreFactory';
import { MemorySettings } from '../../../types';
import { EmbeddingProviderRegistry } from '../../providers/registry/EmbeddingProviderRegistry';

export class EmbeddingProviderManager {
  private embeddingProvider: IEmbeddingProvider | null = null;
  private initialized = false;

  /**
   * Initialize provider with given settings
   * @param settings Memory settings containing provider configuration
   */
  async initializeProvider(settings: MemorySettings): Promise<void> {
    try {
      // Validate settings before initialization
      if (!this.validateProviderSettings(settings)) {
        console.warn(`${settings.apiProvider} API key is required but not provided. Provider will not be initialized.`);
        this.embeddingProvider = null;
        this.initialized = false;
        return;
      }

      // Use the factory to create the embedding provider with the current settings
      this.embeddingProvider = await VectorStoreFactory.createEmbeddingProvider(settings);
      
      if (this.embeddingProvider) {
        await this.embeddingProvider.initialize();
        console.log(`Initialized ${settings.apiProvider} embedding provider successfully`);
        this.initialized = true;
      }
    } catch (providerError) {
      console.error("Error initializing embedding provider:", providerError);
      this.embeddingProvider = null;
      this.initialized = false;
    }
  }

  /**
   * Get the current embedding provider
   */
  getProvider(): IEmbeddingProvider | null {
    return this.embeddingProvider;
  }

  /**
   * Check if provider is initialized and ready
   */
  isInitialized(): boolean {
    return this.initialized && this.embeddingProvider !== null;
  }

  /**
   * Check if provider supports token tracking
   */
  isTokenTrackingProvider(provider: IEmbeddingProvider | null = null): boolean {
    const targetProvider = provider || this.embeddingProvider;
    return (
      targetProvider !== null &&
      typeof (targetProvider as ITokenTrackingProvider).getTokensThisMonth === 'function' &&
      typeof (targetProvider as ITokenTrackingProvider).updateUsageStats === 'function' &&
      typeof (targetProvider as ITokenTrackingProvider).getTotalCost === 'function'
    );
  }

  /**
   * Get token tracking provider if available
   */
  getTokenTrackingProvider(): ITokenTrackingProvider | null {
    if (this.isTokenTrackingProvider()) {
      return this.embeddingProvider as ITokenTrackingProvider;
    }
    return null;
  }

  /**
   * Validate provider settings
   * @param settings Memory settings to validate
   * @returns True if settings are valid for provider initialization
   */
  private validateProviderSettings(settings: MemorySettings): boolean {
    if (!settings.embeddingsEnabled) {
      return false;
    }

    const providerConfig = EmbeddingProviderRegistry.getProvider(settings.apiProvider);
    const currentProvider = settings.providerSettings?.[settings.apiProvider];

    // Check if provider requires API key and if one is provided
    if (providerConfig && typeof providerConfig === 'object' && 'requiresApiKey' in providerConfig && providerConfig.requiresApiKey) {
      return !!(currentProvider?.apiKey && currentProvider.apiKey.trim() !== "");
    }

    // Provider doesn't require API key or config not found
    return true;
  }

  /**
   * Check if switching providers would cause dimension conflicts
   * @param oldSettings Previous settings
   * @param newSettings New settings
   * @returns True if dimensions would change
   */
  checkDimensionConflict(oldSettings: MemorySettings, newSettings: MemorySettings): boolean {
    const oldProvider = oldSettings.apiProvider;
    const oldProviderSettings = oldSettings.providerSettings?.[oldProvider];
    const newProvider = newSettings.apiProvider;
    const newProviderSettings = newSettings.providerSettings?.[newProvider];

    const dimensionsChanged = oldProviderSettings?.dimensions !== newProviderSettings?.dimensions;
    const providerChanged = oldProvider !== newProvider;

    return providerChanged || dimensionsChanged;
  }

  /**
   * Get provider configuration information
   * @param settings Memory settings
   * @returns Provider configuration details
   */
  getProviderInfo(settings: MemorySettings): {
    provider: string;
    dimensions: number | undefined;
    requiresApiKey: boolean;
    hasApiKey: boolean;
  } {
    const providerConfig = EmbeddingProviderRegistry.getProvider(settings.apiProvider);
    const currentProvider = settings.providerSettings?.[settings.apiProvider];

    return {
      provider: settings.apiProvider,
      dimensions: currentProvider?.dimensions,
      requiresApiKey: (providerConfig && typeof providerConfig === 'object' && 'requiresApiKey' in providerConfig && providerConfig.requiresApiKey) || false,
      hasApiKey: !!(currentProvider?.apiKey && currentProvider.apiKey.trim() !== "")
    };
  }

  /**
   * Clean up provider resources
   */
  async cleanup(): Promise<void> {
    if (this.embeddingProvider && 'cleanup' in this.embeddingProvider && typeof (this.embeddingProvider as any).cleanup === 'function') {
      try {
        await (this.embeddingProvider as any).cleanup();
      } catch (error) {
        console.error('Error cleaning up embedding provider:', error);
      }
    }
    
    this.embeddingProvider = null;
    this.initialized = false;
  }

  /**
   * Reset provider state
   */
  reset(): void {
    this.embeddingProvider = null;
    this.initialized = false;
  }
}