import { Notice, Setting } from 'obsidian';
import { EmbeddingProviderRegistry } from '../../../database/providers/registry/EmbeddingProviderRegistry';
import { Accordion } from '../../Accordion';

/**
 * Location: src/components/memory-settings/sections/ProviderSection.ts
 * 
 * ProviderSection component handles API provider configuration including:
 * - Provider selection dropdown
 * - API key configuration 
 * - Provider-specific settings (Ollama setup, organization IDs)
 * - Connection testing for local providers
 * 
 * Used by: EmbeddingSettingsTab for API configuration section
 * Dependencies: EmbeddingProviderRegistry, Accordion component, Obsidian Notice/Setting
 */
export class ProviderSection {
    constructor(
        private settings: any,
        private saveSettings: () => Promise<void>,
        private app: any,
        private onSettingsChanged?: () => void
    ) {}

    /**
     * Renders the provider configuration section
     */
    async display(containerEl: HTMLElement): Promise<void> {
        // Ensure providerSettings exists
        if (!this.settings.providerSettings) {
            this.settings.providerSettings = {};
        }

        // API Provider dropdown
        const providerSetting = new Setting(containerEl)
            .setName('Embedding Provider')
            .setDesc('Select the API provider for generating embeddings');
            
        const dropdown = providerSetting.addDropdown(dropdown => {
            // Add all registered providers
            const providers = EmbeddingProviderRegistry.getProviders();
            providers.forEach(provider => {
                dropdown.addOption(provider.id, provider.name);
            });
            
            dropdown.setValue(this.settings.apiProvider)
                .onChange(async (value) => {
                    this.settings.apiProvider = value;
                    
                    // Ensure providerSettings exists
                    if (!this.settings.providerSettings) {
                        this.settings.providerSettings = {};
                    }
                    
                    // Initialize provider settings if not exists
                    if (!this.settings.providerSettings[value]) {
                        const provider = EmbeddingProviderRegistry.getProvider(value);
                        if (provider && provider.models.length > 0) {
                            this.settings.providerSettings[value] = {
                                apiKey: '',
                                model: provider.models[0].id,
                                dimensions: provider.models[0].dimensions
                            };
                        }
                    }
                    
                    await this.saveSettings();
                    // Trigger parent re-render to show provider-specific settings
                    if (this.onSettingsChanged) {
                        this.onSettingsChanged();
                    }
                });
        });

        // Provider-specific settings
        await this.renderProviderSpecificSettings(containerEl);
    }

    /**
     * Renders settings specific to the current provider
     */
    private async renderProviderSpecificSettings(containerEl: HTMLElement): Promise<void> {
        const currentProvider = EmbeddingProviderRegistry.getProvider(this.settings.apiProvider);
        
        // Ensure providerSettings exists
        if (!this.settings.providerSettings) {
            this.settings.providerSettings = {};
        }
        
        const providerSettings = this.settings.providerSettings[this.settings.apiProvider] || {
            apiKey: '',
            model: currentProvider?.models[0]?.id || '',
            dimensions: currentProvider?.models[0]?.dimensions!
        };
        
        if (!currentProvider) return;

        // API Key setting (not needed for Ollama)
        if (currentProvider.requiresApiKey) {
            await this.renderApiKeySettings(containerEl, currentProvider, providerSettings);
        } else if (this.settings.apiProvider === 'ollama') {
            await this.renderOllamaSettings(containerEl, providerSettings);
        }
        
        // Organization ID for providers that support it (skip for OpenAI)
        if (this.settings.apiProvider !== 'openai' && providerSettings.organization !== undefined) {
            await this.renderOrganizationSettings(containerEl, currentProvider, providerSettings);
        }
    }

    /**
     * Renders API key configuration settings
     */
    private async renderApiKeySettings(containerEl: HTMLElement, currentProvider: any, providerSettings: any): Promise<void> {
        new Setting(containerEl)
            .setName(`${currentProvider.name} API Key`)
            .setDesc(`Your ${currentProvider.name} API key for embeddings (securely stored in your vault)`)
            .addText(text => {
                text.inputEl.type = 'password';
                return text
                    .setPlaceholder('Enter API key...')
                    .setValue(providerSettings.apiKey || '')
                    .onChange(async (value) => {
                        if (!this.settings.providerSettings[this.settings.apiProvider]) {
                            this.settings.providerSettings[this.settings.apiProvider] = {
                                apiKey: '',
                                model: currentProvider.models[0]?.id || '',
                                dimensions: currentProvider.models[0]?.dimensions!
                            };
                        }
                        this.settings.providerSettings[this.settings.apiProvider].apiKey = value;
                        await this.saveSettings();

                        // Handle embedding enablement based on API key
                        await this.handleApiKeyChange(value);
                    });
            });
    }

    /**
     * Renders Ollama-specific configuration settings
     */
    private async renderOllamaSettings(containerEl: HTMLElement, providerSettings: any): Promise<void> {
        // Ollama setup instructions accordion
        const setupAccordion = new Accordion(containerEl, '📋 Ollama Setup Instructions', false);
        const instructionsContent = setupAccordion.getContentEl();
        
        instructionsContent.innerHTML = this.getOllamaInstructions();
        
        // Ollama URL setting
        new Setting(containerEl)
            .setName('Ollama Server URL')
            .setDesc('URL where your Ollama server is running (default: http://127.0.0.1:11434/)')
            .addText(text => {
                return text
                    .setPlaceholder('http://127.0.0.1:11434/')
                    .setValue(providerSettings.customSettings?.url || 'http://127.0.0.1:11434/')
                    .onChange(async (value) => {
                        await this.updateOllamaUrl(value);
                    });
            });
        
        // Test connection button
        new Setting(containerEl)
            .setName('Test Ollama Connection')
            .setDesc('Verify that Ollama is running and accessible')
            .addButton(button => {
                button.setButtonText('Test Connection')
                    .onClick(async () => {
                        await this.testOllamaConnection(button, providerSettings);
                    });
            });
    }

    /**
     * Renders organization ID settings for supported providers
     */
    private async renderOrganizationSettings(containerEl: HTMLElement, currentProvider: any, providerSettings: any): Promise<void> {
        new Setting(containerEl)
            .setName('Organization ID (Optional)')
            .setDesc(`Your ${currentProvider.name} organization ID if applicable`)
            .addText(text => {
                text.inputEl.type = 'password';
                return text
                    .setPlaceholder('Enter organization ID...')
                    .setValue(providerSettings.organization || '')
                    .onChange(async (value) => {
                        if (this.settings.providerSettings[this.settings.apiProvider]) {
                            this.settings.providerSettings[this.settings.apiProvider].organization = value || undefined;
                            await this.saveSettings();
                        }
                    });
            });
    }

    /**
     * Handles API key changes and automatic embedding enablement
     */
    private async handleApiKeyChange(value: string): Promise<void> {
        // If we just added a valid API key, auto-enable embeddings for better UX
        if (value && value.trim() !== "" && !this.settings.embeddingsEnabled) {
            this.settings.embeddingsEnabled = true;
            await this.saveSettings();
            
            new Notice('API key saved successfully! Embeddings have been automatically enabled.', 3000);
            
            // Trigger a refresh of the parent settings to update the toggle
            if (this.onSettingsChanged) {
                this.onSettingsChanged();
            }
        } else if (!value || value.trim() === "") {
            // API key was removed, disable embeddings
            if (this.settings.embeddingsEnabled) {
                this.settings.embeddingsEnabled = false;
                await this.saveSettings();
                new Notice('API key removed. Embeddings have been disabled.', 3000);
                
                // Trigger a refresh of the parent settings to update the toggle
                if (this.onSettingsChanged) {
                    this.onSettingsChanged();
                }
            }
        } else {
            // API key updated for already enabled embeddings
            new Notice('API key saved successfully. Embeddings are now enabled!', 3000);
        }
    }

    /**
     * Updates Ollama server URL
     */
    private async updateOllamaUrl(value: string): Promise<void> {
        if (!this.settings.providerSettings[this.settings.apiProvider]) {
            const currentProvider = EmbeddingProviderRegistry.getProvider(this.settings.apiProvider);
            this.settings.providerSettings[this.settings.apiProvider] = {
                apiKey: '',
                model: currentProvider?.models[0]?.id || '',
                dimensions: currentProvider?.models[0]?.dimensions!,
                customSettings: {}
            };
        }
        if (!this.settings.providerSettings[this.settings.apiProvider].customSettings) {
            this.settings.providerSettings[this.settings.apiProvider].customSettings = {};
        }
        this.settings.providerSettings[this.settings.apiProvider].customSettings!.url = value || 'http://127.0.0.1:11434/';
        await this.saveSettings();
    }

    /**
     * Tests Ollama connection and displays results
     */
    private async testOllamaConnection(button: any, providerSettings: any): Promise<void> {
        const ollamaUrl = providerSettings.customSettings?.url || 'http://127.0.0.1:11434/';
        try {
            button.setButtonText('Testing...');
            button.setDisabled(true);
            
            const response = await fetch(`${ollamaUrl}api/tags`);
            if (response.ok) {
                const data = await response.json();
                const models = data.models || [];
                const embeddingModels = models.filter((m: any) => 
                    m.name.includes('embed') || 
                    m.name.includes('nomic') || 
                    m.name.includes('mxbai') ||
                    m.name.includes('all-minilm')
                );
                
                if (embeddingModels.length > 0) {
                    new Notice(`✅ Ollama connected! Found ${embeddingModels.length} embedding model(s): ${embeddingModels.map((m: any) => m.name).join(', ')}`, 4000);
                } else {
                    new Notice('⚠️ Ollama connected but no embedding models found. Please run: ollama pull nomic-embed-text', 5000);
                }
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Ollama connection test failed:', error);
            new Notice(`❌ Failed to connect to Ollama: ${(error as Error).message || String(error)}. Make sure Ollama is running.`, 5000);
        } finally {
            button.setButtonText('Test Connection');
            button.setDisabled(false);
        }
    }

    /**
     * Returns Ollama setup instructions HTML
     */
    private getOllamaInstructions(): string {
        return `
            <div class="ollama-step">
                <h5>Step 1: Install Ollama</h5>
                <p><strong>Windows:</strong></p>
                <ul>
                    <li>Visit <a href="https://ollama.com/download/windows" target="_blank">ollama.com/download/windows</a></li>
                    <li>Download and run <code>OllamaSetup.exe</code></li>
                    <li>Follow the installer (no admin rights required)</li>
                </ul>
                <p><strong>Mac/Linux:</strong> Follow instructions at <a href="https://ollama.com" target="_blank">ollama.com</a></p>
            </div>
            
            <div class="ollama-step">
                <h5>Step 2: Start Ollama Service</h5>
                <p>Open Command Prompt/Terminal and run:</p>
                <code>ollama serve</code>
                <p><strong>Keep this window open</strong> - Ollama needs to run in the background</p>
                <p><em>Note: If you get a "port already in use" error, Ollama may already be running as a service.</em></p>
            </div>
            
            <div class="ollama-step">
                <h5>Step 3: Download Embedding Model</h5>
                <p>In a <strong>new</strong> terminal window, run:</p>
                <ul>
                    <li><code>ollama pull nomic-embed-text</code> (Recommended - 274MB, 768 dims)</li>
                    <li><code>ollama pull mxbai-embed-large</code> (Large model - 669MB, 1024 dims)</li>
                    <li><code>ollama pull all-minilm</code> (Lightweight - 46MB, 384 dims)</li>
                </ul>
                <p>Wait for the download to complete (may take a few minutes)</p>
            </div>
            
            <div class="ollama-step">
                <h5>Step 4: Verify Setup</h5>
                <p>Check installed models:</p>
                <code>ollama list</code>
                <p>You should see your embedding model listed. Then use the "Test Connection" button below.</p>
            </div>
            
            <div class="ollama-step">
                <h5>Troubleshooting</h5>
                <ul>
                    <li><strong>Port 11434 already in use:</strong> Ollama may already be running. Check Task Manager (Windows) or Activity Monitor (Mac)</li>
                    <li><strong>Command not found:</strong> Restart your terminal or log out/in again</li>
                    <li><strong>Connection failed:</strong> Make sure <code>ollama serve</code> is running and showing "Listening on 127.0.0.1:11434"</li>
                </ul>
            </div>
        `;
    }
}