import { Notice, Setting } from 'obsidian';
import { BaseSettingsTab } from './BaseSettingsTab';
import { EmbeddingManager } from '../../database/services/embeddingManager';
import { EmbeddingService } from '../../database/services/EmbeddingService';

/**
 * API Settings tab component
 * Handles API provider, model configuration, and usage limits
 */
export class ApiSettingsTab extends BaseSettingsTab {
    // Service managers
    protected embeddingManager: EmbeddingManager | null;
    protected embeddingService: EmbeddingService | null;
    
    // Track whether embeddings exist
    protected embeddingsExist: boolean = false;
    
    /**
     * Create a new API settings tab
     */
    constructor(
        settings: any, 
        settingsManager: any, 
        app: any,
        embeddingManager?: EmbeddingManager,
        embeddingService?: EmbeddingService
    ) {
        super(settings, settingsManager, app);
        this.embeddingManager = embeddingManager || null;
        this.embeddingService = embeddingService || null;
    }
    
    /**
     * Display the API settings tab
     */
    async display(containerEl: HTMLElement): Promise<void> {
        // Check if embeddings exist
        if (this.embeddingService) {
            try {
                this.embeddingsExist = await this.embeddingService.hasExistingEmbeddings();
                console.log('Embeddings exist:', this.embeddingsExist);
            } catch (error) {
                console.error('Error checking for existing embeddings:', error);
                // Be conservative and assume embeddings exist on error
                this.embeddingsExist = true;
            }
        }
        containerEl.createEl('h3', { text: 'API Configuration' });
        
        // Status section
        const statusSection = containerEl.createDiv({ cls: 'api-status-section' });
        
        // Add a button to start embedding (initial indexing)
        const startEmbeddingContainer = statusSection.createDiv({ cls: 'start-embedding-container' });
        
        // Check if we already have embeddings before showing the button
        const hasEmbeddings = await this.checkHasEmbeddings();
        
        if (!hasEmbeddings) {
            startEmbeddingContainer.createEl('p', { 
                text: 'No embeddings found. You need to start generating embeddings for your vault content.',
                cls: 'notice-text'
            });
            
            const startButton = startEmbeddingContainer.createEl('button', {
                text: 'Start Initial Embedding',
                cls: 'mod-cta'
            });
            
            startButton.addEventListener('click', async () => {
                if (confirm('This will start indexing all your vault content. It may take a while and use API tokens. Continue?')) {
                    startButton.disabled = true;
                    startButton.textContent = 'Indexing in progress...';
                    
                    try {
                        const plugin = this.app.plugins.plugins['claudesidian-mcp'];
                        if (!plugin) {
                            throw new Error('Plugin not found');
                        }
                        
                        if (plugin.searchService && typeof plugin.searchService.batchIndexFiles === 'function') {
                            // Get all markdown files from the vault
                            const files = plugin.app.vault.getMarkdownFiles();
                            const filePaths = files.map((file: {path: string}) => file.path);
                            
                            new Notice(`Starting indexing of ${filePaths.length} files...`);
                            
                            // Start the indexing process
                            await plugin.searchService.batchIndexFiles(filePaths);
                            
                            new Notice(`Successfully indexed ${filePaths.length} files`);
                            
                            // Redisplay to hide the button
                            containerEl.empty();
                            await this.display(containerEl);
                        } else {
                            throw new Error('Search service not available');
                        }
                    } catch (error) {
                        console.error('Error indexing content:', error);
                        new Notice(`Error indexing: ${error instanceof Error ? error.message : String(error)}`);
                        startButton.disabled = false;
                        startButton.textContent = 'Start Initial Embedding';
                    }
                }
            });
        } else {
            startEmbeddingContainer.createEl('p', {
                text: 'Embeddings detected. You can reindex content from the Usage tab.',
                cls: 'info-text'
            });
        }
        
        // API Provider dropdown
        new Setting(containerEl)
            .setName('Embedding Provider')
            .setDesc('Select the API provider for generating embeddings')
            .addDropdown(dropdown => dropdown
                .addOption('openai', 'OpenAI (Cloud API)')
                .addOption('local-minilm', 'Local - MiniLM (Free, Privacy-focused)')
                .setValue(this.settings.apiProvider)
                .onChange(async (value) => {
                    this.settings.apiProvider = value as 'openai' | 'local-minilm';
                    
                    // Set appropriate model based on provider
                    if (value === 'local-minilm') {
                        this.settings.embeddingModel = 'all-MiniLM-L6-v2';
                        this.settings.dimensions = 384; // MiniLM fixed dimensions
                    }
                    
                    await this.saveSettings();
                    // Refresh the UI to show/hide relevant settings
                    containerEl.empty();
                    await this.display(containerEl);
                })
            );

        // OpenAI Settings
        if (this.settings.apiProvider === 'openai') {
            new Setting(containerEl)
                .setName('OpenAI API Key')
                .setDesc('Your OpenAI API key for embeddings (securely stored in your vault)')
                .addText(text => {
                    text.inputEl.type = 'password';
                    return text
                        .setPlaceholder('sk-...')
                        .setValue(this.settings.openaiApiKey)
                        .onChange(async (value) => {
                            this.settings.openaiApiKey = value;
                            await this.saveSettings();
                            
                            // If embeddings are enabled but provider not initialized, update it
                            if (this.settings.embeddingsEnabled && this.embeddingService) {
                                try {
                                    await this.embeddingService.updateSettings(this.settings);
                                    console.log('Embedding service updated with new API key');
                                } catch (error) {
                                    console.error('Error updating embedding service with new API key:', error);
                                }
                            }
                        });
                });
            
            new Setting(containerEl)
                .setName('Organization ID (Optional)')
                .setDesc('Your OpenAI organization ID if applicable')
                .addText(text => {
                    text.inputEl.type = 'password';
                    return text
                        .setPlaceholder('org-...')
                        .setValue(this.settings.openaiOrganization || '')
                        .onChange(async (value) => {
                            this.settings.openaiOrganization = value || undefined;
                            await this.saveSettings();
                        });
                });
        }
        
        // Model settings
        containerEl.createEl('h3', { text: 'Model Configuration' });
        
        // Only show model dropdown for OpenAI - local model is fixed
        if (this.settings.apiProvider === 'openai') {
            new Setting(containerEl)
                .setName('Embedding Model')
                .setDesc('Select the embedding model to use')
                .addDropdown(dropdown => dropdown
                    .addOption('text-embedding-3-small', 'text-embedding-3-small (1536 dims, cheaper)')
                    .addOption('text-embedding-3-large', 'text-embedding-3-large (3072 dims, more accurate)')
                    .setValue(this.settings.embeddingModel)
                    .onChange(async (value) => {
                        this.settings.embeddingModel = value as 'text-embedding-3-small' | 'text-embedding-3-large';
                        
                        // Update default dimensions based on model
                        if (value === 'text-embedding-3-small' && this.settings.dimensions > 1536) {
                            this.settings.dimensions = 1536;
                        } else if (value === 'text-embedding-3-large' && this.settings.dimensions === 1536) {
                            this.settings.dimensions = 3072;
                        }
                        
                        await this.saveSettings();
                        if (this.onSettingsChanged) {
                            this.onSettingsChanged();
                        }
                    })
                );
        } else if (this.settings.apiProvider === 'local-minilm') {
            // For local models, show model info but no selection
            const modelInfoContainer = containerEl.createDiv({ cls: 'local-model-info' });
            
            modelInfoContainer.createEl('p', { 
                text: 'Using local model: all-MiniLM-L6-v2',
                cls: 'setting-item-name'
            });
            
            modelInfoContainer.createEl('p', { 
                text: 'This model runs directly in your browser with no API calls.',
                cls: 'setting-item-description'
            });
            
            modelInfoContainer.createEl('ul', { cls: 'model-features' })
                .append(
                    createEl('li', { text: '384 dimensions' }),
                    createEl('li', { text: 'No cost or API usage' }),
                    createEl('li', { text: 'Complete privacy (no data leaves your device)' }),
                    createEl('li', { text: 'Fast and efficient for most use cases' })
                );
                
            // Add a notice about model download
            modelInfoContainer.createEl('p', { 
                text: 'The model will be downloaded automatically the first time you use it (approximately 50MB).',
                cls: 'model-download-notice'
            });
        }
        
        // Get max dimensions based on model
        let maxDimensions = 3072; // Default to highest
        if (this.settings.embeddingModel === 'text-embedding-3-small') {
            maxDimensions = 1536;
        } else if (this.settings.embeddingModel === 'all-MiniLM-L6-v2') {
            maxDimensions = 384; // Fixed dimensions for MiniLM
        }
        
        // Only show dimension settings for OpenAI models
        // For local models, dimensions are fixed
        if (this.settings.apiProvider === 'openai') {
            const dimensionSetting = new Setting(containerEl)
                .setName('Embedding Dimensions')
                .setDesc(`Dimension size for embeddings (max ${maxDimensions})`);
            
            // Add a warning if embeddings exist
            if (this.embeddingsExist) {
                dimensionSetting.setDesc(
                    `Dimension size for embeddings (max ${maxDimensions}). ⚠️ LOCKED: Embeddings already exist with ${this.settings.dimensions} dimensions. Changing this requires removing all existing embeddings.`
                );
                
                // Add a disabled slider that shows the current value but doesn't allow changes
                dimensionSetting.addSlider(slider => {
                    slider
                        .setLimits(256, maxDimensions, 256)
                        .setValue(this.settings.dimensions)
                        .setDynamicTooltip();
                    
                    // Disable the slider
                    slider.sliderEl.disabled = true;
                    slider.sliderEl.style.opacity = '0.6';
                    
                    return slider;
                });
                
                // Add a button to force reset if needed
                dimensionSetting.addExtraButton(button => {
                    button
                        .setIcon('reset')
                        .setTooltip('Reset embeddings (deletes all existing embeddings)')
                        .onClick(async () => {
                            // Confirm with the user first
                            const confirmed = confirm(
                                'WARNING: This will delete ALL existing embeddings. ' +
                                'You will need to regenerate all embeddings after changing this setting. ' +
                                'This operation cannot be undone. Continue?'
                            );
                            
                            if (confirmed) {
                                try {
                                    // Show a notice to the user
                                    new Notice('Deleting all embeddings. This may take a moment...');
                                    
                                    // Get the vector store directly from the plugin
                                    const plugin = this.app.plugins.plugins['claudesidian-mcp'];
                                    if (!plugin) {
                                        throw new Error('Claudesidian plugin not found');
                                    }
                                    
                                    // Get the vector store
                                    const vectorStore = plugin.vectorStore;
                                    if (!vectorStore) {
                                        throw new Error('Vector store not found on plugin');
                                    }
                                    
                                    // Delete the collections that contain embeddings
                                    const embeddingCollections = [
                                        'file_embeddings', 
                                        'memory_traces', 
                                        'sessions',
                                        'snapshots',
                                        'workspaces'
                                    ];
                                    
                                    for (const collectionName of embeddingCollections) {
                                        if (await vectorStore.hasCollection(collectionName)) {
                                            await vectorStore.deleteCollection(collectionName);
                                        }
                                    }
                                    
                                    // Mark embeddings as not existing
                                    this.embeddingsExist = false;
                                    
                                    // Unlock the setting and re-render
                                    new Notice('All embeddings have been deleted. You can now change the dimension size.');
                                    
                                    // Redraw the entire tab
                                    containerEl.empty();
                                    await this.display(containerEl);
                                } catch (error) {
                                    console.error('Error deleting embeddings:', error);
                                    new Notice('Error deleting embeddings: ' + error);
                                }
                            }
                        });
                });
            } else {
                // Normal slider for when no embeddings exist
                dimensionSetting.addSlider(slider => slider
                    .setLimits(256, maxDimensions, 256)
                    .setValue(this.settings.dimensions)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.settings.dimensions = value;
                        await this.saveSettings();
                    })
                );
                
                // Add info text to explain locking behavior
                dimensionSetting.setDesc(
                    `Dimension size for embeddings (max ${maxDimensions}). NOTE: This setting will be locked once you create embeddings.`
                );
            }
        }
            
        // API Rate limit - only show for OpenAI API
        if (this.settings.apiProvider === 'openai') {
            new Setting(containerEl)
                .setName('API Rate Limit')
                .setDesc('Maximum API requests per minute')
                .addSlider(slider => slider
                    .setLimits(10, 1000, 10)
                    .setValue(this.settings.apiRateLimitPerMinute)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.settings.apiRateLimitPerMinute = value;
                        await this.saveSettings();
                    })
                );
        }
        
        // Add reset button for both provider types
        if (this.embeddingsExist) {
            new Setting(containerEl)
                .setName('Reset All Embeddings')
                .setDesc('Delete all existing embeddings. This is required when switching between different embedding providers.')
                .addButton(button => button
                    .setButtonText('Reset Embeddings')
                    .setCta()
                    .onClick(async () => {
                        // Confirm with the user first
                        const confirmed = confirm(
                            'WARNING: This will delete ALL existing embeddings. ' +
                            'You will need to regenerate all embeddings after changing providers. ' +
                            'This operation cannot be undone. Continue?'
                        );
                        
                        if (confirmed) {
                            try {
                                // Show a notice to the user
                                new Notice('Deleting all embeddings. This may take a moment...');
                                
                                // Get the vector store directly from the plugin
                                const plugin = this.app.plugins.plugins['claudesidian-mcp'];
                                if (!plugin) {
                                    throw new Error('Claudesidian plugin not found');
                                }
                                
                                // Get the vector store
                                const vectorStore = plugin.vectorStore;
                                if (!vectorStore) {
                                    throw new Error('Vector store not found on plugin');
                                }
                                
                                // Delete the collections that contain embeddings
                                const embeddingCollections = [
                                    'file_embeddings', 
                                    'memory_traces', 
                                    'sessions',
                                    'snapshots',
                                    'workspaces'
                                ];
                                
                                for (const collectionName of embeddingCollections) {
                                    if (await vectorStore.hasCollection(collectionName)) {
                                        await vectorStore.deleteCollection(collectionName);
                                    }
                                }
                                
                                // Mark embeddings as not existing
                                this.embeddingsExist = false;
                                
                                // Show success notice
                                new Notice('All embeddings have been deleted. You can now change providers or dimensions.');
                                
                                // Redraw the entire tab
                                containerEl.empty();
                                await this.display(containerEl);
                            } catch (error) {
                                console.error('Error deleting embeddings:', error);
                                new Notice('Error deleting embeddings: ' + error);
                            }
                        }
                    })
                );
    }
    /**
     * Check if any embeddings exist in the system
     * Uses both the embeddingService and direct check of collections
     */
    private async checkHasEmbeddings(): Promise<boolean> {
        // First try using embeddingService if available
        if (this.embeddingService) {
            try {
                return await this.embeddingService.hasExistingEmbeddings();
            } catch (error) {
                console.error('Error checking for embeddings via service:', error);
            }
        }
        
        // If the service didn't work or isn't available, try a direct check
        try {
            const plugin = this.app.plugins.plugins['claudesidian-mcp'];
            if (plugin && plugin.vectorStore) {
                const collections = await plugin.vectorStore.listCollections();
                
                if (!collections || collections.length === 0) {
                    return false;
                }
                
                // Check for specific collections that would contain embeddings
                const embeddingCollections = [
                    'file_embeddings', 
                    'memory_traces', 
                    'sessions',
                    'snapshots',
                    'workspaces'
                ];
                
                const collectionExists = embeddingCollections.some(name => 
                    collections.includes(name)
                );
                
                if (!collectionExists) {
                    return false;
                }
                
                // Check if any matching collections have items
                for (const collectionName of embeddingCollections) {
                    if (collections.includes(collectionName)) {
                        try {
                            const count = await plugin.vectorStore.count(collectionName);
                            if (count > 0) {
                                return true;
                            }
                        } catch (countError) {
                            console.warn(`Error getting count for ${collectionName}:`, countError);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error checking for embeddings directly:', error);
        }
        
        return false;
    }
    
    // Optional callback for when settings change
    onSettingsChanged?: () => void;
}