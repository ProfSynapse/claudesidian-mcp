/**
 * EmbeddingToggleRenderer - Handles embedding toggle UI rendering
 * Follows Single Responsibility Principle by focusing only on toggle UI
 */

import { Notice, Setting } from 'obsidian';
import { EmbeddingService } from '../../../../database/services/EmbeddingService';
import { EmbeddingProviderRegistry } from '../../../../database/providers/registry/EmbeddingProviderRegistry';
import { SettingsValidator } from '../services/SettingsValidator';

export interface EmbeddingToggleContext {
    embeddingService: EmbeddingService | null;
    onSettingsChanged?: () => void;
    onSaveSettings: () => Promise<void>;
}

/**
 * Service responsible for rendering embedding toggle UI
 * Follows SRP by focusing only on toggle rendering operations
 */
export class EmbeddingToggleRenderer {
    constructor(
        private settings: any,
        private settingsValidator: SettingsValidator
    ) {}

    /**
     * Render embedding toggle section
     */
    async render(containerEl: HTMLElement, context: EmbeddingToggleContext): Promise<void> {
        // Add the embeddings toggle at the top
        new Setting(containerEl)
            .setName('Enable Embeddings')
            .setDesc('Enable or disable embeddings functionality. When disabled, semantic search and embedding creation will not be available.')
            .addToggle(toggle => toggle
                .setValue(this.settings.embeddingsEnabled)
                .onChange(async (value) => {
                    await this.handleToggleChange(value, toggle, context);
                })
            );

        // Add info notice
        await this.renderInfoNotice(containerEl);
    }

    /**
     * Handle toggle change
     */
    private async handleToggleChange(
        value: boolean, 
        toggle: any, 
        context: EmbeddingToggleContext
    ): Promise<void> {
        if (value) {
            // Check if trying to enable embeddings without API key
            const validationResult = this.settingsValidator.validateEmbeddingEnable(
                this.settings, 
                this.settings.apiProvider
            );

            if (!validationResult.isValid) {
                const provider = EmbeddingProviderRegistry.getProvider(this.settings.apiProvider);
                const providerName = provider ? provider.name : this.settings.apiProvider;
                
                new Notice(
                    `API Key is required to enable embeddings. Please set your ${providerName} API key below.`, 
                    4000
                );
                
                toggle.setValue(false);
                return;
            }
        }

        // Update settings
        this.settings.embeddingsEnabled = value;
        await context.onSaveSettings();

        // Update embedding service
        await this.updateEmbeddingService(context.embeddingService);

        // Update plugin configuration
        await this.updatePluginConfiguration();

        // Show feedback based on action
        await this.showToggleFeedback(value, context);
    }

    /**
     * Update embedding service
     */
    private async updateEmbeddingService(embeddingService: EmbeddingService | null): Promise<void> {
        if (embeddingService) {
            try {
                await embeddingService.updateSettings(this.settings);
            } catch (error) {
                console.error('Error updating embedding service:', error);
            }
        }
    }

    /**
     * Update plugin configuration
     */
    private async updatePluginConfiguration(): Promise<void> {
        const plugin = (window as any).app.plugins.plugins['claudesidian-mcp'];
        if (plugin && typeof plugin.reloadConfiguration === 'function') {
            plugin.reloadConfiguration();
        }
    }

    /**
     * Show toggle feedback
     */
    private async showToggleFeedback(enabled: boolean, context: EmbeddingToggleContext): Promise<void> {
        const message = enabled 
            ? 'Embeddings enabled successfully!'
            : 'Embeddings disabled successfully!';
        
        new Notice(message, 3000);

        // Trigger settings refresh
        if (context.onSettingsChanged) {
            context.onSettingsChanged();
        }
    }

    /**
     * Render info notice
     */
    private async renderInfoNotice(containerEl: HTMLElement): Promise<void> {
        const infoEl = containerEl.createEl('div', { cls: 'memory-info-notice' });
        
        if (this.settings.embeddingsEnabled) {
            infoEl.createEl('p', { 
                text: 'Memory Manager is always enabled. You can control when embeddings are created in the Embedding tab under "Indexing Schedule".' 
            });
            infoEl.createEl('p', { 
                text: 'Set to "Only Manually" if you want to control exactly when embeddings are created.' 
            });
        } else {
            infoEl.createEl('p', { 
                cls: 'embeddings-disabled-notice',
                text: 'Embeddings are currently disabled. Semantic search and embedding creation will not be available when using Claude desktop app.'
            });
        }
    }

    /**
     * Get toggle status
     */
    getToggleStatus(): {
        enabled: boolean;
        canEnable: boolean;
        reason?: string;
    } {
        const validationResult = this.settingsValidator.validateEmbeddingEnable(
            this.settings, 
            this.settings.apiProvider
        );

        return {
            enabled: this.settings.embeddingsEnabled,
            canEnable: validationResult.isValid,
            reason: validationResult.error
        };
    }
}