import { App, Notice } from 'obsidian';
import { EmbeddingProvider, MemorySettings, DEFAULT_MEMORY_SETTINGS } from '../../types';
import { OpenAIProvider } from '../providers/openai-provider';

/**
 * Manages embedding providers and settings
 */
export class EmbeddingManager {
  private embeddingProvider: EmbeddingProvider | null = null;
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
      if (embeddingsWereEnabled && (!pluginSettings.openaiApiKey || pluginSettings.openaiApiKey.trim() === "")) {
        this.settings.embeddingsEnabled = false;
        console.warn("OpenAI API key is required but not provided. Embeddings will be disabled.");
        new Notice("Embeddings are disabled until you provide a valid OpenAI API key in settings.");
      }
      
      // Initialize provider
      this.initializeProvider();
      
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
  private initializeProvider(): void {
    if (this.settings.embeddingsEnabled && this.settings.openaiApiKey) {
      try {
        this.embeddingProvider = new OpenAIProvider(this.settings);
        console.log("OpenAI embedding provider initialized successfully");
      } catch (providerError) {
        console.error("Error initializing OpenAI provider:", providerError);
        this.settings.embeddingsEnabled = false;
        this.embeddingProvider = null;
        new Notice(`Error initializing embeddings: ${providerError.message}`);
      }
    } else {
      this.embeddingProvider = null;
      console.log("Embeddings are disabled - no provider initialized");
    }
  }

  /**
   * Get the embedding provider
   */
  getProvider(): EmbeddingProvider | null {
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
      return await this.embeddingProvider.getEmbedding(text);
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
  updateSettings(settings: MemorySettings): void {
    const prevSettings = this.settings;
    this.settings = settings;
    
    // Validate API key if embeddings are enabled
    if (settings.embeddingsEnabled && (!settings.openaiApiKey || settings.openaiApiKey.trim() === "")) {
      // API key is required but not provided, disable embeddings
      console.warn("OpenAI API key is required but not provided. Embeddings will be disabled.");
      this.settings.embeddingsEnabled = false;
      
      // Show notice to user
      new Notice("Embeddings are disabled until you provide a valid OpenAI API key in settings.");
    }
    
    // Clean up existing provider if needed
    if (this.embeddingProvider && typeof this.embeddingProvider.close === 'function') {
      this.embeddingProvider.close();
      this.embeddingProvider = null;
    }
    
    // Initialize the appropriate provider based on settings
    try {
      // Only initialize a provider if embeddings are enabled and we have a key
      if (settings.embeddingsEnabled && settings.openaiApiKey) {
        if (settings.apiProvider === 'openai') {
          // Use OpenAI provider with API key
          this.embeddingProvider = new OpenAIProvider(settings);
          console.log(`Initialized OpenAI embedding provider (${settings.embeddingModel})`);
        } else if (settings.apiProvider === 'local') {
          // Local provider not yet implemented
          new Notice('Local embedding provider not yet implemented. Using OpenAI provider.');
          this.embeddingProvider = new OpenAIProvider(settings);
        }
      } else {
        // Embeddings are disabled or no API key
        this.embeddingProvider = null;
        
        // If embeddings were enabled before but now disabled due to API key, show notice
        if (prevSettings && prevSettings.embeddingsEnabled && settings.embeddingsEnabled && !settings.openaiApiKey) {
          new Notice('Embeddings are enabled but require an OpenAI API key. Please add your key in settings.');
        }
      }
    } catch (error) {
      // Handle provider initialization errors
      console.error('Error initializing embedding provider:', error);
      new Notice(`Error initializing embedding provider: ${error.message}`);
      
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
      if (this.embeddingProvider && typeof this.embeddingProvider.close === 'function') {
        this.embeddingProvider.close();
      }
      
      console.log('Embedding manager unloaded successfully');
    } catch (error) {
      console.error('Error unloading embedding manager:', error);
    }
  }
}