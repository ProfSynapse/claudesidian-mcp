import { Notice, Setting } from 'obsidian';
import { EmbeddingProviderRegistry } from '../../../database/providers/registry/EmbeddingProviderRegistry';

/**
 * Location: src/components/memory-settings/sections/ChunkingSection.ts
 * 
 * ChunkingSection component handles model configuration including:
 * - Model selection dropdown with dimension information
 * - Dimension mismatch warnings and resolution
 * - API rate limiting configuration
 * - Embedding deletion for dimension changes
 * 
 * Used by: EmbeddingSettingsTab for model configuration section
 * Dependencies: EmbeddingProviderRegistry, Obsidian Notice/Setting
 */
export class ChunkingSection {
    constructor(
        private settings: any,
        private saveSettings: () => Promise<void>,
        private app: any,
        private embeddingsExist: boolean,
        private onSettingsChanged?: () => void
    ) {}

    /**
     * Renders the model configuration section
     */
    async display(containerEl: HTMLElement): Promise<void> {
        const currentProvider = EmbeddingProviderRegistry.getProvider(this.settings.apiProvider);
        
        // Ensure providerSettings exists
        if (!this.settings.providerSettings) {
            this.settings.providerSettings = {};
        }
        
        const providerSettings = this.settings.providerSettings[this.settings.apiProvider];
        
        if (!currentProvider || !providerSettings) {
            return;
        }

        // Model selection dropdown
        await this.renderModelSelection(containerEl, currentProvider, providerSettings);
        
        // Handle dimension mismatch warnings
        await this.renderDimensionWarnings(containerEl, currentProvider, providerSettings);
        
        // API Rate limit configuration
        await this.renderRateLimitSettings(containerEl);
    }

    /**
     * Renders the model selection dropdown
     */
    private async renderModelSelection(containerEl: HTMLElement, currentProvider: any, providerSettings: any): Promise<void> {
        new Setting(containerEl)
            .setName('Embedding Model')
            .setDesc('Select the embedding model to use')
            .addDropdown(dropdown => {
                // Add all available models for the current provider
                currentProvider.models.forEach((model: any) => {
                    const desc = `${model.name} (${model.dimensions} dims)`;
                    dropdown.addOption(model.id, desc);
                });
                
                dropdown.setValue(providerSettings.model || currentProvider.models[0]?.id || '')
                    .onChange(async (value) => {
                        if (this.settings.providerSettings[this.settings.apiProvider]) {
                            this.settings.providerSettings[this.settings.apiProvider].model = value;
                            
                            // Update dimensions based on selected model
                            const selectedModel = currentProvider.models.find((m: any) => m.id === value);
                            if (selectedModel) {
                                this.settings.providerSettings[this.settings.apiProvider].dimensions = selectedModel.dimensions;
                            }
                            
                            await this.saveSettings();
                            
                            if (this.onSettingsChanged) {
                                this.onSettingsChanged();
                            }
                        }
                    });
            });
    }

    /**
     * Renders dimension mismatch warnings and reset functionality
     */
    private async renderDimensionWarnings(containerEl: HTMLElement, currentProvider: any, providerSettings: any): Promise<void> {
        // Check for dimension mismatch and handle embedding reset if needed
        const selectedModel = currentProvider.models.find((m: any) => m.id === providerSettings.model);
        const maxDimensions = selectedModel?.dimensions;
        
        if (!maxDimensions) {
            throw new Error(`Model ${providerSettings.model} does not have dimensions specified`);
        }
        
        // Add a warning if embeddings exist with different dimensions
        if (this.embeddingsExist && providerSettings.dimensions !== maxDimensions) {
            const warningContainer = containerEl.createDiv({ cls: 'dimension-warning-container' });
            
            const warningText = warningContainer.createEl('p', {
                text: `⚠️ WARNING: Existing embeddings use ${providerSettings.dimensions} dimensions. ` +
                      `The selected model uses ${maxDimensions} dimensions. ` +
                      `You must delete ALL embeddings (files, workspaces, sessions, snapshots, and memory traces) to switch dimensions.`,
                cls: 'dimension-warning-text'
            });
            
            const resetButton = warningContainer.createEl('button', {
                text: 'Delete All Embeddings',
                cls: 'mod-warning'
            });
            
            resetButton.addEventListener('click', async () => {
                await this.handleEmbeddingReset(maxDimensions);
            });
        }
    }

    /**
     * Renders API rate limit settings
     */
    private async renderRateLimitSettings(containerEl: HTMLElement): Promise<void> {
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

    /**
     * Handles the embedding reset process for dimension changes
     */
    private async handleEmbeddingReset(newDimensions: number): Promise<void> {
        const confirmed = confirm(
            'WARNING: This will delete ALL existing embeddings including:\n' +
            '• File embeddings\n' +
            '• Workspace data\n' +
            '• Session memory\n' +
            '• Snapshots\n' +
            '• Memory traces\n\n' +
            'You will need to regenerate ALL data after changing dimensions. ' +
            'This operation cannot be undone. Continue?'
        );
        
        if (!confirmed) {
            return;
        }

        try {
            new Notice('Deleting all embeddings...', 3000);
            
            const plugin = this.app.plugins.plugins['claudesidian-mcp'];
            if (!plugin) {
                throw new Error('Claudesidian plugin not found');
            }
            
            const vectorStore = plugin.vectorStore;
            if (!vectorStore) {
                throw new Error('Vector store not found');
            }
            
            const embeddingCollections = [
                'file_embeddings', 
                'memory_traces', 
                'sessions',
                'snapshots',
                'workspaces'
            ];
            
            // Delete all embedding collections
            for (const collectionName of embeddingCollections) {
                if (await vectorStore.hasCollection(collectionName)) {
                    await vectorStore.deleteCollection(collectionName);
                }
            }
            
            new Notice('All embeddings deleted. You can now use the new model.', 4000);
            
            // Update dimensions to match the new model
            if (this.settings.providerSettings[this.settings.apiProvider]) {
                this.settings.providerSettings[this.settings.apiProvider].dimensions = newDimensions;
                await this.saveSettings();
            }
            
            // Trigger parent refresh to remove warning
            if (this.onSettingsChanged) {
                this.onSettingsChanged();
            }
            
        } catch (error) {
            console.error('Error deleting embeddings:', error);
            new Notice('Error deleting embeddings: ' + error, 5000);
        }
    }
}