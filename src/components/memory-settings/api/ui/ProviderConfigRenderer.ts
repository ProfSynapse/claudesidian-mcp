/**
 * ProviderConfigRenderer - Handles provider configuration UI rendering
 * Follows Single Responsibility Principle by focusing only on provider config
 */

import { Notice, Setting } from 'obsidian';
import { EmbeddingProviderRegistry } from '../../../../database/providers/registry/EmbeddingProviderRegistry';
import { EmbeddingService } from '../../../../database/services/EmbeddingService';
import { SettingsValidator } from '../services/SettingsValidator';
import { ApiConnectionTester } from '../services/ApiConnectionTester';

export interface ProviderConfigContext {
    embeddingsExist: boolean;
    embeddingService: EmbeddingService | null;
    onSettingsChanged?: () => void;
    onSaveSettings: () => Promise<void>;
    onRefreshDisplay: () => void;
}

/**
 * Service responsible for rendering provider configuration UI
 * Follows SRP by focusing only on provider config operations
 */
export class ProviderConfigRenderer {
    constructor(
        private settings: any,
        private settingsValidator: SettingsValidator,
        private apiConnectionTester: ApiConnectionTester
    ) {}

    /**
     * Render provider configuration section
     */
    async render(containerEl: HTMLElement, context: ProviderConfigContext): Promise<void> {
        // Render provider dropdown
        await this.renderProviderDropdown(containerEl, context);

        // Render API key input
        await this.renderApiKeyInput(containerEl, context);

        // Render API URL input (for providers that need it)
        await this.renderApiUrlInput(containerEl, context);

        // Render connection test button
        await this.renderConnectionTest(containerEl, context);

        // Render setup instructions for applicable providers
        await this.renderSetupInstructions(containerEl, context);
    }

    /**
     * Render provider dropdown
     */
    private async renderProviderDropdown(containerEl: HTMLElement, context: ProviderConfigContext): Promise<void> {
        const providers = EmbeddingProviderRegistry.getProviders();
        
        new Setting(containerEl)
            .setName('Embedding Provider')
            .setDesc('Select the service to use for generating embeddings')
            .addDropdown(dropdown => {
                providers.forEach(provider => {
                    dropdown.addOption(provider.id, provider.name);
                });
                
                dropdown.setValue(this.settings.apiProvider || providers[0].id);
                dropdown.onChange(async (value) => {
                    await this.handleProviderChange(value, context);
                });
            });
    }

    /**
     * Handle provider change
     */
    private async handleProviderChange(value: string, context: ProviderConfigContext): Promise<void> {
        if (context.embeddingsExist) {
            const confirmed = await this.confirmProviderChange();
            if (!confirmed) {
                return;
            }
        }

        // Update settings
        this.settings.apiProvider = value;
        this.settingsValidator.initializeProviderSettings(this.settings, value);
        this.settingsValidator.normalizeSettings(this.settings, value);

        // Save settings
        await context.onSaveSettings();

        // Refresh display
        context.onRefreshDisplay();

        // Show feedback
        const provider = EmbeddingProviderRegistry.getProvider(value);
        if (provider) {
            new Notice(`Provider changed to ${provider.name}`, 3000);
        }
    }

    /**
     * Render API key input
     */
    private async renderApiKeyInput(containerEl: HTMLElement, context: ProviderConfigContext): Promise<void> {
        const provider = EmbeddingProviderRegistry.getProvider(this.settings.apiProvider);
        
        if (!provider || !provider.requiresApiKey) {
            return;
        }

        const providerSettings = this.settings.providerSettings?.[this.settings.apiProvider];
        
        new Setting(containerEl)
            .setName(`${provider.name} API Key`)
            .setDesc(`Enter your ${provider.name} API key`)
            .addText(text => {
                text.setPlaceholder('Enter API key...');
                text.setValue(providerSettings?.apiKey || '');
                text.onChange(async (value) => {
                    await this.handleApiKeyChange(value, context);
                });
                
                // Make it a password field
                text.inputEl.type = 'password';
            });
    }

    /**
     * Handle API key change
     */
    private async handleApiKeyChange(value: string, context: ProviderConfigContext): Promise<void> {
        this.settingsValidator.ensureProviderSettings(this.settings);
        
        if (!this.settings.providerSettings[this.settings.apiProvider]) {
            this.settings.providerSettings[this.settings.apiProvider] = {};
        }
        
        this.settings.providerSettings[this.settings.apiProvider].apiKey = value;
        
        await context.onSaveSettings();
        
        if (context.onSettingsChanged) {
            context.onSettingsChanged();
        }
    }

    /**
     * Render API URL input
     */
    private async renderApiUrlInput(containerEl: HTMLElement, context: ProviderConfigContext): Promise<void> {
        if (this.settings.apiProvider !== 'ollama') {
            return;
        }

        new Setting(containerEl)
            .setName('Ollama API URL')
            .setDesc('URL where Ollama is running')
            .addText(text => {
                text.setPlaceholder('http://localhost:11434/');
                text.setValue(this.settings.apiUrl || 'http://localhost:11434/');
                text.onChange(async (value) => {
                    await this.handleApiUrlChange(value, context);
                });
            });
    }

    /**
     * Handle API URL change
     */
    private async handleApiUrlChange(value: string, context: ProviderConfigContext): Promise<void> {
        this.settings.apiUrl = value;
        await context.onSaveSettings();
        
        if (context.onSettingsChanged) {
            context.onSettingsChanged();
        }
    }

    /**
     * Render connection test button
     */
    private async renderConnectionTest(containerEl: HTMLElement, context: ProviderConfigContext): Promise<void> {
        const provider = EmbeddingProviderRegistry.getProvider(this.settings.apiProvider);
        
        if (!provider) {
            return;
        }

        new Setting(containerEl)
            .setName('Test Connection')
            .setDesc(`Test connection to ${provider.name}`)
            .addButton(button => button
                .setButtonText('Test Connection')
                .onClick(async () => {
                    await this.handleConnectionTest(button.buttonEl, context);
                })
            );
    }

    /**
     * Handle connection test
     */
    private async handleConnectionTest(button: HTMLButtonElement, context: ProviderConfigContext): Promise<void> {
        const provider = EmbeddingProviderRegistry.getProvider(this.settings.apiProvider);
        
        if (!provider) {
            new Notice('Unknown provider selected', 3000);
            return;
        }

        // Test based on provider type
        if (this.settings.apiProvider === 'ollama') {
            const url = this.settings.apiUrl || 'http://localhost:11434/';
            
            await this.apiConnectionTester.testConnectionWithNotice(
                () => this.apiConnectionTester.testOllamaConnection(url),
                button
            );
        } else {
            // For other providers, test generic connection
            const testUrl = this.getProviderTestUrl(provider);
            const headers = this.getProviderTestHeaders(provider);
            
            await this.apiConnectionTester.testConnectionWithNotice(
                () => this.apiConnectionTester.testGenericConnection(testUrl, headers),
                button
            );
        }
    }

    /**
     * Render setup instructions
     */
    private async renderSetupInstructions(containerEl: HTMLElement, context: ProviderConfigContext): Promise<void> {
        if (this.settings.apiProvider === 'ollama') {
            await this.renderOllamaInstructions(containerEl);
        }
    }

    /**
     * Render Ollama setup instructions
     */
    private async renderOllamaInstructions(containerEl: HTMLElement): Promise<void> {
        const instructionsContainer = containerEl.createEl('div', { cls: 'ollama-instructions' });
        
        instructionsContainer.createEl('h4', { text: 'Ollama Setup Instructions' });
        
        const instructionsContent = instructionsContainer.createEl('div', { cls: 'instructions-content' });
        instructionsContent.innerHTML = this.apiConnectionTester.getOllamaSetupInstructions();
    }

    /**
     * Confirm provider change when embeddings exist
     */
    private async confirmProviderChange(): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-container">
                    <div class="modal-bg"></div>
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>Confirm Provider Change</h3>
                        </div>
                        <div class="modal-body">
                            <p>Changing providers will require rebuilding your embeddings.</p>
                            <p><strong>Your existing embeddings will be incompatible with the new provider.</strong></p>
                            <p>You may want to delete existing embeddings first.</p>
                        </div>
                        <div class="modal-footer">
                            <button class="mod-cta" id="confirm-change">Continue</button>
                            <button id="cancel-change">Cancel</button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            const confirmButton = modal.querySelector('#confirm-change') as HTMLButtonElement;
            const cancelButton = modal.querySelector('#cancel-change') as HTMLButtonElement;
            
            const cleanup = () => {
                document.body.removeChild(modal);
            };
            
            confirmButton.onclick = () => {
                cleanup();
                resolve(true);
            };
            
            cancelButton.onclick = () => {
                cleanup();
                resolve(false);
            };
            
            // Close on background click
            const modalBg = modal.querySelector('.modal-bg') as HTMLElement;
            modalBg.onclick = () => {
                cleanup();
                resolve(false);
            };
        });
    }

    /**
     * Get provider test URL
     */
    private getProviderTestUrl(provider: any): string {
        // Default implementation - providers should define their test endpoints
        return provider.baseUrl || 'https://api.example.com/test';
    }

    /**
     * Get provider test headers
     */
    private getProviderTestHeaders(provider: any): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };
        
        // Add API key if required
        if (provider.requiresApiKey) {
            const providerSettings = this.settings.providerSettings?.[provider.id];
            if (providerSettings?.apiKey) {
                headers['Authorization'] = `Bearer ${providerSettings.apiKey}`;
            }
        }
        
        return headers;
    }

    /**
     * Get provider configuration status
     */
    getProviderStatus(): {
        provider: string;
        configured: boolean;
        apiKeyValid: boolean;
        connectionTested: boolean;
    } {
        const provider = EmbeddingProviderRegistry.getProvider(this.settings.apiProvider);
        
        if (!provider) {
            return {
                provider: this.settings.apiProvider,
                configured: false,
                apiKeyValid: false,
                connectionTested: false
            };
        }

        const apiKeyValidation = this.settingsValidator.validateApiKey(this.settings, provider.id);
        
        return {
            provider: provider.name,
            configured: true,
            apiKeyValid: apiKeyValidation.isValid,
            connectionTested: false // This would need to be tracked separately
        };
    }
}