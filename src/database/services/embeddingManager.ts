import { App, Notice } from 'obsidian';
import { EmbeddingProvider, MemorySettings, DEFAULT_MEMORY_SETTINGS } from '../../types';
import { VectorStoreFactory } from '../factory/VectorStoreFactory';
import { IEmbeddingProvider } from '../interfaces/IEmbeddingProvider';
import { getErrorMessage } from '../../utils/errorUtils';

/**
 * Manages embedding providers and settings
 */
export class EmbeddingManager {
  private embeddingProvider: IEmbeddingProvider | null = null;
  private settings: MemorySettings;
  private app: App;

  constructor(app: App) {
    this.app = app;
    this.settings = { ...DEFAULT_MEMORY_SETTINGS };
    this.initializeSettings();
  }

  /**
   * Initialize settings from plugin
   */
  private initializeSettings(): void {
    try {
      const pluginSettings = this.app.plugins.getPlugin('claudesidian-mcp')?.settings?.settings?.memory 
                          || DEFAULT_MEMORY_SETTINGS;
      this.settings = pluginSettings;
      
      const embeddingsWereEnabled = pluginSettings.embeddingsEnabled;
      
      // Validate settings
      const currentProvider = pluginSettings.providerSettings[pluginSettings.apiProvider];
      if (embeddingsWereEnabled && (!currentProvider?.apiKey || currentProvider.apiKey.trim() === "")) {
        this.settings.embeddingsEnabled = false;
        console.warn(`${pluginSettings.apiProvider} API key is required but not provided. Embeddings will be disabled.`);
        new Notice(`Embeddings are disabled until you provide a valid ${pluginSettings.apiProvider} API key in settings.`);
      }
      
      // Initialize provider
      this.initializeProvider().catch(error => {
        console.error('Failed to initialize provider:', error);
      });
      
      // Save if modified
      if (embeddingsWereEnabled !== this.settings.embeddingsEnabled) {
        this.saveSettings();
      }
    } catch (error) {
      console.error("Failed to initialize EmbeddingManager settings:", error);
      this.settings = { ...DEFAULT_MEMORY_SETTINGS, embeddingsEnabled: false };
      this.embeddingProvider = null;
    }
  }

  /**
   * Initialize the embedding provider based on settings
   */
  private async initializeProvider(): Promise<void> {
    const currentProvider = this.settings.providerSettings[this.settings.apiProvider];
    if (this.settings.embeddingsEnabled && currentProvider?.apiKey) {
      try {
        this.embeddingProvider = await VectorStoreFactory.createEmbeddingProvider(this.settings);
        console.log(`${this.settings.apiProvider} embedding provider initialized successfully`);
      } catch (providerError) {
        console.error(`Error initializing ${this.settings.apiProvider} provider:`, providerError);
        this.settings.embeddingsEnabled = false;
        this.embeddingProvider = null;
        new Notice(`Error initializing embeddings: ${getErrorMessage(providerError)}`);
      }
    } else {
      this.embeddingProvider = null;
      console.log("Embeddings are disabled - no provider initialized");
    }
  }

  /**
   * Get the embedding provider
   */
  getProvider(): IEmbeddingProvider | null {
    return this.embeddingProvider;
  }

  /**
   * Get embedding for text
   */
  async getEmbedding(text: string): Promise<number[] | null> {
    if (!this.embeddingProvider || !this.settings.embeddingsEnabled) {
      return null;
    }
    
    try {
      // IEmbeddingProvider uses generateEmbeddings which takes an array
      const embeddings = await this.embeddingProvider.generateEmbeddings([text]);
      return embeddings.length > 0 ? embeddings[0] : null;
    } catch (error) {
      console.error('Error generating embedding:', error);
      return null;
    }
  }

  /**
   * Check if embeddings are enabled
   */
  areEmbeddingsEnabled(): boolean {
    return this.settings.embeddingsEnabled && this.embeddingProvider !== null;
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
    const prevSettings = this.settings;
    this.settings = settings;
    
    const currentProvider = settings.providerSettings[settings.apiProvider];
    
    // Validate API key if embeddings are enabled
    if (settings.embeddingsEnabled && (!currentProvider?.apiKey || currentProvider.apiKey.trim() === "")) {
      // API key is required but not provided, disable embeddings
      console.warn(`${settings.apiProvider} API key is required but not provided. Embeddings will be disabled.`);
      this.settings.embeddingsEnabled = false;
      
      // Show notice to user
      new Notice(`Embeddings are disabled until you provide a valid ${settings.apiProvider} API key in settings.`);
    }
    
    // Clean up existing provider if needed
    if (this.embeddingProvider && typeof (this.embeddingProvider as any).close === 'function') {
      (this.embeddingProvider as any).close();
      this.embeddingProvider = null;
    }
    
    // Initialize the appropriate provider based on settings
    try {
      // Only initialize a provider if embeddings are enabled and we have a key
      if (settings.embeddingsEnabled && currentProvider?.apiKey) {
        // Use VectorStoreFactory to create provider with new architecture
        this.embeddingProvider = await VectorStoreFactory.createEmbeddingProvider(this.settings);
        console.log(`Initialized ${settings.apiProvider} embedding provider (${currentProvider.model})`);
      } else {
        // Embeddings are disabled or no API key
        this.embeddingProvider = null;
        
        // If embeddings were enabled before but now disabled due to API key, show notice
        if (prevSettings && prevSettings.embeddingsEnabled && settings.embeddingsEnabled && !currentProvider?.apiKey) {
          new Notice('Embeddings are enabled but require an OpenAI API key. Please add your key in settings.');
        }
      }
    } catch (error) {
      // Handle provider initialization errors
      console.error('Error initializing embedding provider:', error);
      new Notice(`Error initializing embedding provider: ${getErrorMessage(error)}`);
      
      // Disable embeddings since provider failed
      this.settings.embeddingsEnabled = false;
      this.embeddingProvider = null;
    }
    
    console.log('Embedding settings updated, embeddings enabled:', this.settings.embeddingsEnabled);
    
    // Save the settings
    this.saveSettings();
  }

  /**
   * Save settings to plugin
   */
  private saveSettings(): void {
    try {
      const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
      if (plugin && plugin.settings) {
        plugin.settings.settings.memory = this.settings;
        plugin.settings.saveSettings();
      }
    } catch (saveError) {
      console.error('Error saving settings:', saveError);
    }
  }

  /**
   * Clean up resources
   */
  onunload(): void {
    try {
      // Close any open database connections
      if (this.embeddingProvider && typeof (this.embeddingProvider as any).close === 'function') {
        (this.embeddingProvider as any).close();
      }
      
      console.log('Embedding manager unloaded successfully');
    } catch (error) {
      console.error('Error unloading embedding manager:', error);
    }
  }
}