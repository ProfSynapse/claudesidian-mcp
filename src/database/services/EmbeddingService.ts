import { Plugin } from 'obsidian';
import { IEmbeddingProvider } from '../interfaces/IEmbeddingProvider';
import { VectorStoreFactory } from '../factory/VectorStoreFactory';
import { MemorySettings, DEFAULT_MEMORY_SETTINGS } from '../../types';

// Define an interface that extends Plugin with our custom properties
interface ClaudesidianPlugin extends Plugin {
  settings: {
    settings: {
      memory: MemorySettings;
    };
    saveSettings: () => Promise<void>;
  };
}

/**
 * Service for generating and managing embeddings
 */
export class EmbeddingService {
  /**
   * Embedding provider instance
   */
  private embeddingProvider: IEmbeddingProvider;
  
  /**
   * Memory settings
   */
  private settings: MemorySettings;
  
  /**
   * Plugin instance
   */
  private plugin: Plugin;
  
  /**
   * Initialization status
   */
  private initialized: boolean = false;
  
  /**
   * Create a new embedding service
   * @param plugin Plugin instance
   */
  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.settings = { ...DEFAULT_MEMORY_SETTINGS };
    
    // Create a default embedding provider
    this.embeddingProvider = VectorStoreFactory.createEmbeddingProvider();
    
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
      this.settings = pluginSettings;
      
      const embeddingsWereEnabled = pluginSettings.embeddingsEnabled;
      
      // Validate settings
      if (embeddingsWereEnabled && (!pluginSettings.openaiApiKey || pluginSettings.openaiApiKey.trim() === "")) {
        this.settings.embeddingsEnabled = false;
        console.warn("OpenAI API key is required but not provided. Embeddings will be disabled.");
      }
      
      // Initialize provider
      this.initializeProvider();
      
      this.initialized = true;
      
      // Save if modified
      if (embeddingsWereEnabled !== this.settings.embeddingsEnabled) {
        this.saveSettings();
      }
    } catch (error) {
      console.error("Failed to initialize EmbeddingService settings:", error);
      this.settings = { ...DEFAULT_MEMORY_SETTINGS, embeddingsEnabled: false };
      this.initialized = false;
    }
  }
  
  /**
   * Initialize the embedding provider
   */
  private async initializeProvider(): Promise<void> {
    if (this.settings.embeddingsEnabled && this.settings.openaiApiKey) {
      try {
        // Use a custom embedding function for OpenAI
        const openAiEmbedFunc = async (texts: string[]): Promise<number[][]> => {
          try {
            // Make OpenAI API call
            const response = await fetch('https://api.openai.com/v1/embeddings', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.settings.openaiApiKey}`
              },
              body: JSON.stringify({
                input: texts,
                model: this.settings.embeddingModel || 'text-embedding-ada-002'
              })
            });
            
            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
            }
            
            const data = await response.json();
            return data.data.map((item: any) => item.embedding);
          } catch (error) {
            console.error('Error calling OpenAI API:', error);
            throw error;
          }
        };
        
        // Create a new provider with the OpenAI function
        this.embeddingProvider = VectorStoreFactory.createEmbeddingProvider(1536, openAiEmbedFunc);
        await this.embeddingProvider.initialize();
        
        console.log("OpenAI embedding provider initialized successfully");
      } catch (providerError) {
        console.error("Error initializing OpenAI provider:", providerError);
        this.settings.embeddingsEnabled = false;
        
        // Fall back to default provider
        this.embeddingProvider = VectorStoreFactory.createEmbeddingProvider();
        await this.embeddingProvider.initialize();
      }
    } else {
      // Use the default provider in disabled mode
      this.embeddingProvider = VectorStoreFactory.createEmbeddingProvider();
      await this.embeddingProvider.initialize();
      
      console.log("Embeddings are disabled - using default provider");
    }
  }
  
  /**
   * Get the embedding provider
   */
  getProvider(): IEmbeddingProvider {
    return this.embeddingProvider;
  }
  
  /**
   * Get embedding for text
   * @param text Text to generate embedding for
   */
  async getEmbedding(text: string): Promise<number[] | null> {
    if (!this.initialized) {
      await this.initializeProvider();
    }
    
    if (!this.settings.embeddingsEnabled) {
      return null;
    }
    
    try {
      const embeddings = await this.embeddingProvider.generateEmbeddings([text]);
      return embeddings[0];
    } catch (error) {
      console.error('Error generating embedding:', error);
      return null;
    }
  }
  
  /**
   * Get embeddings for multiple texts
   * @param texts Array of texts to generate embeddings for
   */
  async getEmbeddings(texts: string[]): Promise<number[][] | null> {
    if (!this.initialized) {
      await this.initializeProvider();
    }
    
    if (!this.settings.embeddingsEnabled || texts.length === 0) {
      return null;
    }
    
    try {
      return await this.embeddingProvider.generateEmbeddings(texts);
    } catch (error) {
      console.error('Error generating embeddings:', error);
      return null;
    }
  }
  
  /**
   * Check if embeddings are enabled
   */
  areEmbeddingsEnabled(): boolean {
    return this.settings.embeddingsEnabled;
  }
  
  /**
   * Get current settings
   */
  getSettings(): MemorySettings {
    return this.settings;
  }
  
  /**
   * Update settings and initialize the appropriate embedding provider
   * @param settings Memory settings
   */
  async updateSettings(settings: MemorySettings): Promise<void> {
    this.settings = settings;
    
    // Validate API key if embeddings are enabled
    if (settings.embeddingsEnabled && (!settings.openaiApiKey || settings.openaiApiKey.trim() === "")) {
      // API key is required but not provided, disable embeddings
      console.warn("OpenAI API key is required but not provided. Embeddings will be disabled.");
      this.settings.embeddingsEnabled = false;
    }
    
    // Reinitialize provider
    await this.initializeProvider();
    
    // Save the settings
    this.saveSettings();
  }
  
  /**
   * Save settings to plugin
   */
  private saveSettings(): void {
    try {
      const pluginAsClaudesidian = this.plugin as ClaudesidianPlugin;
      if (pluginAsClaudesidian && pluginAsClaudesidian.settings) {
        pluginAsClaudesidian.settings.settings.memory = this.settings;
        pluginAsClaudesidian.settings.saveSettings();
      }
    } catch (saveError) {
      console.error('Error saving settings:', saveError);
    }
  }
  
  /**
   * Calculate similarity between two embeddings
   * @param embedding1 First embedding
   * @param embedding2 Second embedding
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    return this.embeddingProvider.calculateSimilarity(embedding1, embedding2);
  }
  
  /**
   * Clean up resources
   */
  onunload(): void {
    try {
      console.log('Embedding service unloaded successfully');
    } catch (error) {
      console.error('Error unloading embedding service:', error);
    }
  }
}