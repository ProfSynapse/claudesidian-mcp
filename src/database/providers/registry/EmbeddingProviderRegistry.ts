import { ChromaEmbeddingFunction } from '../chroma/PersistentChromaClient';

/**
 * Configuration for an embedding provider
 */
export interface EmbeddingProviderConfig {
  id: string;
  name: string;
  packageName: string;
  importPath: string;
  models: {
    id: string;
    name: string;
    dimensions: number;
    description?: string;
  }[];
  requiresApiKey: boolean;
  createEmbeddingFunction: (settings: ProviderSettings) => Promise<ChromaEmbeddingFunction | null>;
}

/**
 * Settings for a specific provider
 */
export interface ProviderSettings {
  apiKey: string;
  model: string;
  dimensions: number;
  customSettings?: Record<string, any>;
}

/**
 * Registry for embedding providers
 */
export class EmbeddingProviderRegistry {
  private static providers = new Map<string, EmbeddingProviderConfig>();
  
  /**
   * Register a new embedding provider
   */
  static registerProvider(provider: EmbeddingProviderConfig): void {
    this.providers.set(provider.id, provider);
  }
  
  /**
   * Get all registered providers
   */
  static getProviders(): EmbeddingProviderConfig[] {
    return Array.from(this.providers.values());
  }
  
  /**
   * Get a specific provider by ID
   */
  static getProvider(id: string): EmbeddingProviderConfig | undefined {
    return this.providers.get(id);
  }
  
  /**
   * Create embedding function for a provider
   */
  static async createEmbeddingFunction(
    providerId: string, 
    settings: ProviderSettings
  ): Promise<ChromaEmbeddingFunction | null> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      console.error(`Provider not found: ${providerId}`);
      return null;
    }
    
    try {
      return await provider.createEmbeddingFunction(settings);
    } catch (error) {
      console.error(`Failed to create embedding function for ${providerId}:`, error);
      return null;
    }
  }
  
  /**
   * Check if a provider's package is installed
   */
  static async isProviderAvailable(providerId: string): Promise<boolean> {
    const provider = this.providers.get(providerId);
    if (!provider) return false;
    
    try {
      require.resolve(provider.packageName);
      return true;
    } catch {
      return false;
    }
  }
}