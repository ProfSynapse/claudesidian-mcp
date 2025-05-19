import { Setting } from 'obsidian';
import { BaseSettingsTab } from './BaseSettingsTab';

/**
 * API Settings tab component
 * Handles API provider, model configuration, and usage limits
 */
export class ApiSettingsTab extends BaseSettingsTab {
    /**
     * Display the API settings tab
     */
    display(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'API Configuration' });
        
        // API Provider dropdown
        new Setting(containerEl)
            .setName('Embedding Provider')
            .setDesc('Select the API provider for generating embeddings')
            .addDropdown(dropdown => dropdown
                .addOption('openai', 'OpenAI')
                .setValue(this.settings.apiProvider)
                .onChange(async (value) => {
                    this.settings.apiProvider = value as 'openai';
                    await this.saveSettings();
                    // Trigger re-render if needed
                    if (this.onSettingsChanged) {
                        this.onSettingsChanged();
                    }
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
        
        const maxDimensions = this.settings.embeddingModel === 'text-embedding-3-small' ? 1536 : 3072;
        
        new Setting(containerEl)
            .setName('Embedding Dimensions')
            .setDesc(`Dimension size for embeddings (max ${maxDimensions})`)
            .addSlider(slider => slider
                .setLimits(256, maxDimensions, 256)
                .setValue(this.settings.dimensions)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.dimensions = value;
                    await this.saveSettings();
                })
            );
            
        // Usage limits
        containerEl.createEl('h3', { text: 'Usage Limits' });
        
        new Setting(containerEl)
            .setName('Monthly Token Limit')
            .setDesc('Maximum tokens to process per month (1M ≈ $0.13 for small model)')
            .addText(text => text
                .setPlaceholder('1000000')
                .setValue(String(this.settings.maxTokensPerMonth))
                .onChange(async (value) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue) && numValue > 0) {
                        this.settings.maxTokensPerMonth = numValue;
                        await this.saveSettings();
                    }
                })
            );
            
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
    
    // Optional callback for when settings change
    onSettingsChanged?: () => void;
}