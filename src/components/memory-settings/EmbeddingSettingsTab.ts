import { Notice, Setting } from 'obsidian';
import { BaseSettingsTab } from './BaseSettingsTab';
import { EmbeddingManager } from '../../database/services/embeddingManager';
import { EmbeddingService } from '../../database/services/EmbeddingService';
import { EmbeddingProviderRegistry } from '../../database/providers/registry/EmbeddingProviderRegistry';
import { ProviderSection } from './sections/ProviderSection';
import { ChunkingSection } from './sections/ChunkingSection';
import { IndexingSection } from './sections/IndexingSection';
import { FiltersSection } from './sections/FiltersSection';
import { EmbeddingSettingsValidator } from '../../services/settings/EmbeddingSettingsValidator';

/**
 * Location: src/components/memory-settings/EmbeddingSettingsTab.ts
 * 
 * Embedding Settings tab component - main coordinator for embedding configuration
 * Orchestrates sub-components for API configuration, model settings, indexing strategy, and file filters
 * 
 * Used by: Main settings modal for embedding configuration
 * Dependencies: Section components (Provider, Chunking, Indexing, Filters), EmbeddingSettingsValidator
 */
export class EmbeddingSettingsTab extends BaseSettingsTab {
    // Service managers
    protected embeddingManager: EmbeddingManager | null;
    protected embeddingService: EmbeddingService | null;
    
    // Track whether embeddings exist
    protected embeddingsExist = false;
    
    // Section components
    private providerSection: ProviderSection;
    private chunkingSection: ChunkingSection;
    private indexingSection: IndexingSection;
    private filtersSection: FiltersSection;
    
    /**
     * Create a new Embedding settings tab
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
        
        // Initialize section components
        this.providerSection = new ProviderSection(settings, this.saveSettings.bind(this), app, () => this.handleSettingsChange());
        this.chunkingSection = new ChunkingSection(settings, this.saveSettings.bind(this), app, this.embeddingsExist, () => this.handleSettingsChange());
        this.indexingSection = new IndexingSection(settings, this.saveSettings.bind(this), app, false, () => this.handleSettingsChange());
        this.filtersSection = new FiltersSection(settings, this.saveSettings.bind(this));
    }
    /**
     * Display the embedding settings tab using orchestrated components
     */
    async display(containerEl: HTMLElement): Promise<void> {
        await this.initializeEmbeddingState();
        await this.updateComponentState();
        
        // Main embeddings toggle
        this.renderEmbeddingsToggle(containerEl);
        
        // Information notices
        this.renderInfoNotices(containerEl);
        
        // Add dimension locking warning if this is first setup
        this.renderDimensionWarning(containerEl);
        
        // API Configuration section
        containerEl.createEl('h3', { text: 'API Configuration' });
        await this.providerSection.display(containerEl);
        
        // Model Configuration section
        containerEl.createEl('h3', { text: 'Model Configuration' });
        await this.chunkingSection.display(containerEl);
        
        // Embedding Strategy section
        containerEl.createEl('h3', { text: 'Embedding Strategy' });
        await this.indexingSection.display(containerEl);
        
        // Exclude Notes section
        containerEl.createEl('h3', { text: 'Exclude Notes' });
        await this.filtersSection.display(containerEl);
    }
    
    /**
     * Initializes embedding state and checks for existing embeddings
     */
    private async initializeEmbeddingState(): Promise<void> {
        // Ensure providerSettings exists
        if (!this.settings.providerSettings) {
            this.settings.providerSettings = {};
        }
        
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
    }
    
    /**
     * Updates component state with current embedding status
     */
    private async updateComponentState(): Promise<void> {
        const hasEmbeddings = await this.checkHasEmbeddings();
        
        // Update components with current state
        this.chunkingSection = new ChunkingSection(
            this.settings, 
            this.saveSettings.bind(this), 
            this.app, 
            this.embeddingsExist, 
            () => this.handleSettingsChange()
        );
        
        this.indexingSection = new IndexingSection(
            this.settings, 
            this.saveSettings.bind(this), 
            this.app, 
            hasEmbeddings, 
            () => this.handleSettingsChange()
        );
    }
    
    /**
     * Renders the main embeddings toggle control
     */
    private renderEmbeddingsToggle(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName('Enable Embeddings')
            .setDesc('Enable or disable embeddings functionality. When disabled, semantic search and embedding creation will not be available.')
            .addToggle(toggle => toggle
                .setValue(this.settings.embeddingsEnabled)
                .onChange(async (value) => {
                    const validation = EmbeddingSettingsValidator.validateApiKeyForEmbeddings({
                        ...this.settings,
                        embeddingsEnabled: value
                    });
                    
                    if (!validation.isValid && value) {
                        const currentProvider = this.settings.apiProvider;
                        new Notice(`API Key is required to enable embeddings. Please set your ${currentProvider} API key below.`, 4000);
                        toggle.setValue(false);
                        return;
                    }
                    
                    this.settings.embeddingsEnabled = value;
                    await this.saveSettings();
                    
                    // Update services and trigger refresh
                    await this.updateServicesAndRefresh(containerEl);
                })
            );
    }
    
    /**
     * Renders information notices about embedding functionality
     */
    private renderInfoNotices(containerEl: HTMLElement): void {
        const infoEl = containerEl.createEl('div', { cls: 'memory-info-notice' });
        if (this.settings.embeddingsEnabled) {
            infoEl.createEl('p', { text: 'Memory Manager is always enabled. You can control when embeddings are created below under "Automatic Indexing".' });
            infoEl.createEl('p', { text: 'Set to "Only Manually" if you want to control exactly when embeddings are created.' });
        } else {
            infoEl.createEl('p', { 
                cls: 'embeddings-disabled-notice',
                text: 'Embeddings are currently disabled. Semantic search and embedding creation will not be available when using Claude desktop app.'
            });
        }
    }
    
    /**
     * Renders dimension locking warning for new installations
     */
    private renderDimensionWarning(containerEl: HTMLElement): void {
        if (!this.embeddingsExist) {
            const infoContainer = containerEl.createDiv({ cls: 'dimension-info-container' });
            infoContainer.createEl('p', {
                text: '💡 IMPORTANT: Once you create embeddings, you cannot change dimensions without deleting all existing data. Choose your embedding model carefully.',
                cls: 'dimension-info-text'
            });
        }
    }
    
    /**
     * Handles settings changes and triggers appropriate updates
     */
    private async handleSettingsChange(): Promise<void> {
        // Trigger parent callback if available
        if (this.onSettingsChanged) {
            this.onSettingsChanged();
        }
        
        // Could trigger a component refresh here if needed
    }
    
    /**
     * Updates services and refreshes the display
     */
    private async updateServicesAndRefresh(containerEl: HTMLElement): Promise<void> {
        // Update embedding service if available
        if (this.embeddingService) {
            try {
                await this.embeddingService.updateSettings(this.settings);
            } catch (error) {
                console.error('Error updating embedding service:', error);
            }
        }
        
        // Update plugin configuration
        const plugin = (window as any).app.plugins.plugins['claudesidian-mcp'];
        if (plugin && typeof plugin.reloadConfiguration === 'function') {
            plugin.reloadConfiguration();
        }
        
        // Refresh the display
        containerEl.empty();
        await this.display(containerEl);
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