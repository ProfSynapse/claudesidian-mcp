/**
 * ProvidersTab - LLM providers list with defaults and thinking settings
 *
 * Features:
 * - Default provider/model dropdowns at top
 * - Default thinking settings (toggle + slider) for supported models
 * - Grouped provider list (Local vs Cloud)
 * - Status badges (configured/not configured)
 * - Detail view opens LLMProviderModal
 * - Auto-save on all changes
 */

import { App, Setting, Notice } from 'obsidian';
import { SettingsRouter } from '../SettingsRouter';
import { LLMProviderSettings, LLMProviderConfig, ThinkingEffort, DefaultThinkingSettings } from '../../types/llm/ProviderTypes';
import { LLMProviderModal, LLMProviderModalConfig } from '../../components/LLMProviderModal';
import { LLMProviderManager } from '../../services/llm/providers/ProviderManager';
import { StaticModelsService, ModelWithProvider } from '../../services/StaticModelsService';
import { WEBLLM_MODELS } from '../../services/llm/adapters/webllm/WebLLMModels';
import { Settings } from '../../settings';
import { Card, CardConfig } from '../../components/Card';

/**
 * Provider display configuration
 */
interface ProviderDisplayConfig {
    name: string;
    keyFormat: string;
    signupUrl: string;
    category: 'local' | 'cloud';
}

/**
 * Maps slider value (0-2) to effort level
 */
const EFFORT_LEVELS: ThinkingEffort[] = ['low', 'medium', 'high'];
const EFFORT_LABELS: Record<ThinkingEffort, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High'
};

export interface ProvidersTabServices {
    app: App;
    settings: Settings;
    llmProviderSettings?: LLMProviderSettings;
}

export class ProvidersTab {
    private container: HTMLElement;
    private router: SettingsRouter;
    private services: ProvidersTabServices;
    private providerManager: LLMProviderManager;
    private staticModelsService: StaticModelsService;

    // UI References
    private thinkingContainer?: HTMLElement;
    private effortValueEl?: HTMLElement;

    // Provider configurations
    private readonly providerConfigs: Record<string, ProviderDisplayConfig> = {
        // Local providers
        webllm: {
            name: 'Nexus (Local)',
            keyFormat: 'No API key required',
            signupUrl: '',
            category: 'local'
        },
        ollama: {
            name: 'Ollama',
            keyFormat: 'http://127.0.0.1:11434',
            signupUrl: 'https://ollama.com/download',
            category: 'local'
        },
        lmstudio: {
            name: 'LM Studio',
            keyFormat: 'http://127.0.0.1:1234',
            signupUrl: 'https://lmstudio.ai',
            category: 'local'
        },
        // Cloud providers
        openai: {
            name: 'OpenAI',
            keyFormat: 'sk-proj-...',
            signupUrl: 'https://platform.openai.com/api-keys',
            category: 'cloud'
        },
        anthropic: {
            name: 'Anthropic',
            keyFormat: 'sk-ant-...',
            signupUrl: 'https://console.anthropic.com/login',
            category: 'cloud'
        },
        google: {
            name: 'Google AI',
            keyFormat: 'AIza...',
            signupUrl: 'https://aistudio.google.com/app/apikey',
            category: 'cloud'
        },
        mistral: {
            name: 'Mistral AI',
            keyFormat: 'msak_...',
            signupUrl: 'https://console.mistral.ai/api-keys',
            category: 'cloud'
        },
        groq: {
            name: 'Groq',
            keyFormat: 'gsk_...',
            signupUrl: 'https://console.groq.com/keys',
            category: 'cloud'
        },
        openrouter: {
            name: 'OpenRouter',
            keyFormat: 'sk-or-...',
            signupUrl: 'https://openrouter.ai/keys',
            category: 'cloud'
        },
        requesty: {
            name: 'Requesty',
            keyFormat: 'req_...',
            signupUrl: 'https://requesty.com/api-keys',
            category: 'cloud'
        },
        perplexity: {
            name: 'Perplexity',
            keyFormat: 'pplx-...',
            signupUrl: 'https://www.perplexity.ai/settings/api',
            category: 'cloud'
        }
    };

    constructor(
        container: HTMLElement,
        router: SettingsRouter,
        services: ProvidersTabServices
    ) {
        this.container = container;
        this.router = router;
        this.services = services;
        this.staticModelsService = StaticModelsService.getInstance();

        // Initialize provider manager
        if (this.services.llmProviderSettings) {
            this.providerManager = new LLMProviderManager(this.services.llmProviderSettings);
        } else {
            // Create empty manager
            this.providerManager = new LLMProviderManager({
                providers: {},
                defaultModel: { provider: '', model: '' }
            });
        }

        this.render();
    }

    /**
     * Get current LLM settings
     */
    private getSettings(): LLMProviderSettings {
        return this.services.llmProviderSettings || {
            providers: {},
            defaultModel: { provider: '', model: '' }
        };
    }

    /**
     * Save settings
     */
    private async saveSettings(): Promise<void> {
        if (this.services.settings && this.services.llmProviderSettings) {
            this.services.settings.settings.llmProviders = this.services.llmProviderSettings;
            await this.services.settings.saveSettings();
        }
    }

    /**
     * Main render method
     */
    render(): void {
        this.container.empty();

        // Defaults section
        this.renderDefaultsSection();

        // Provider groups
        this.renderProviderGroups();
    }

    /**
     * Render the defaults section (provider, model, thinking)
     */
    private renderDefaultsSection(): void {
        const section = this.container.createDiv('nexus-provider-defaults');

        section.createEl('h3', { text: 'Default Settings' });

        const settings = this.getSettings();

        // Default Provider dropdown
        new Setting(section)
            .setName('Default Provider')
            .setDesc('The LLM provider to use when none is specified')
            .addDropdown(dropdown => {
                const enabledProviders = this.getEnabledProviders();

                if (enabledProviders.length === 0) {
                    dropdown.addOption('', 'No providers enabled');
                } else {
                    enabledProviders.forEach(providerId => {
                        const config = this.providerConfigs[providerId];
                        dropdown.addOption(providerId, config?.name || providerId);
                    });
                }

                dropdown.setValue(settings.defaultModel.provider);
                dropdown.onChange(async (value) => {
                    settings.defaultModel.provider = value;
                    settings.defaultModel.model = ''; // Reset model
                    await this.saveSettings();
                    this.render(); // Re-render to update model dropdown and thinking section
                });
            });

        // Default Model dropdown
        this.renderModelDropdown(section, settings);

        // Default Thinking settings
        this.renderThinkingSection(section, settings);
    }

    /**
     * Get list of enabled provider IDs
     */
    private getEnabledProviders(): string[] {
        const settings = this.getSettings();
        return Object.keys(settings.providers).filter(id => {
            const config = settings.providers[id];
            if (!config?.enabled) return false;
            // WebLLM doesn't need an API key
            if (id === 'webllm') return true;
            // Other providers need an API key
            return !!config.apiKey;
        });
    }

    /**
     * Render the model dropdown
     */
    private renderModelDropdown(container: HTMLElement, settings: LLMProviderSettings): void {
        const providerId = settings.defaultModel.provider;

        // Special handling for Ollama
        if (providerId === 'ollama') {
            new Setting(container)
                .setName('Default Model')
                .setDesc('Configure model in the Ollama provider settings')
                .addText(text => text
                    .setValue(settings.defaultModel.model || '')
                    .setDisabled(true)
                    .setPlaceholder('Configure in Ollama settings'));
            return;
        }

        // Special handling for WebLLM
        if (providerId === 'webllm') {
            new Setting(container)
                .setName('Default Model')
                .setDesc('Local model running in your browser')
                .addDropdown(dropdown => {
                    if (WEBLLM_MODELS.length === 0) {
                        dropdown.addOption('', 'No models available');
                    } else {
                        WEBLLM_MODELS.forEach(model => {
                            dropdown.addOption(model.id, model.name);
                        });
                    }

                    const current = settings.defaultModel.model;
                    const exists = WEBLLM_MODELS.some(m => m.id === current);
                    dropdown.setValue(exists ? current : (WEBLLM_MODELS[0]?.id || ''));

                    dropdown.onChange(async (value) => {
                        settings.defaultModel.model = value;
                        await this.saveSettings();
                        this.updateThinkingVisibility(settings);
                    });
                });
            return;
        }

        // Standard provider models
        new Setting(container)
            .setName('Default Model')
            .setDesc('The specific model to use by default')
            .addDropdown(async dropdown => {
                if (!providerId) {
                    dropdown.addOption('', 'Select a provider first');
                    return;
                }

                try {
                    const models = await this.providerManager.getModelsForProvider(providerId);

                    if (models.length === 0) {
                        dropdown.addOption('', 'No models available');
                    } else {
                        models.forEach(model => {
                            dropdown.addOption(model.id, model.name);
                        });

                        const current = settings.defaultModel.model;
                        const exists = models.some(m => m.id === current);
                        dropdown.setValue(exists ? current : models[0].id);

                        if (!exists && models.length > 0) {
                            settings.defaultModel.model = models[0].id;
                        }
                    }

                    dropdown.onChange(async (value) => {
                        settings.defaultModel.model = value;
                        await this.saveSettings();
                        this.updateThinkingVisibility(settings);
                    });
                } catch (error) {
                    dropdown.addOption('', 'Error loading models');
                }
            });
    }

    /**
     * Render thinking settings section
     */
    private renderThinkingSection(container: HTMLElement, settings: LLMProviderSettings): void {
        this.thinkingContainer = container.createDiv('nexus-thinking-section');

        // Check if model supports thinking
        const supportsThinking = this.checkModelSupportsThinking(settings);

        if (!supportsThinking) {
            this.thinkingContainer.addClass('is-hidden');
            return;
        }

        // Initialize default thinking if not exists
        if (!settings.defaultThinking) {
            settings.defaultThinking = { enabled: false, effort: 'medium' };
        }

        // Section header
        this.thinkingContainer.createEl('h4', { text: 'Default Thinking Mode' });
        this.thinkingContainer.createEl('p', {
            text: 'Enable extended thinking by default for models that support it',
            cls: 'setting-item-description'
        });

        // Enable thinking toggle
        new Setting(this.thinkingContainer)
            .setName('Enable thinking by default')
            .setDesc('New conversations will use thinking mode when available')
            .addToggle(toggle => toggle
                .setValue(settings.defaultThinking?.enabled ?? false)
                .onChange(async (value) => {
                    if (!settings.defaultThinking) {
                        settings.defaultThinking = { enabled: false, effort: 'medium' };
                    }
                    settings.defaultThinking.enabled = value;
                    await this.saveSettings();
                    this.updateEffortVisibility(settings);
                }));

        // Effort level container
        const effortContainer = this.thinkingContainer.createDiv('nexus-thinking-effort-container');

        if (!settings.defaultThinking.enabled) {
            effortContainer.addClass('is-hidden');
        }

        // Effort level slider
        const effortSetting = new Setting(effortContainer)
            .setName('Default effort level')
            .setDesc('Higher effort = more thorough reasoning');

        // Create value display
        this.effortValueEl = effortSetting.controlEl.createDiv('nexus-thinking-effort-value');
        this.effortValueEl.textContent = EFFORT_LABELS[settings.defaultThinking.effort];

        effortSetting.addSlider(slider => slider
            .setLimits(0, 2, 1)
            .setValue(EFFORT_LEVELS.indexOf(settings.defaultThinking?.effort || 'medium'))
            .setDynamicTooltip()
            .onChange(async (value) => {
                const effort = EFFORT_LEVELS[value];
                if (!settings.defaultThinking) {
                    settings.defaultThinking = { enabled: false, effort: 'medium' };
                }
                settings.defaultThinking.effort = effort;
                if (this.effortValueEl) {
                    this.effortValueEl.textContent = EFFORT_LABELS[effort];
                }
                await this.saveSettings();
            }));
    }

    /**
     * Check if the selected model supports thinking
     */
    private checkModelSupportsThinking(settings: LLMProviderSettings): boolean {
        const providerId = settings.defaultModel.provider;
        const modelId = settings.defaultModel.model;

        if (!providerId || !modelId) return false;

        // WebLLM models
        if (providerId === 'webllm') {
            const model = WEBLLM_MODELS.find(m => m.id === modelId);
            return model?.capabilities?.supportsThinking ?? false;
        }

        // Standard providers
        const model = this.staticModelsService.findModel(providerId, modelId);
        return model?.capabilities?.supportsThinking ?? false;
    }

    /**
     * Update thinking section visibility
     */
    private updateThinkingVisibility(settings: LLMProviderSettings): void {
        if (!this.thinkingContainer) return;

        const supportsThinking = this.checkModelSupportsThinking(settings);

        if (supportsThinking) {
            this.thinkingContainer.removeClass('is-hidden');
        } else {
            this.thinkingContainer.addClass('is-hidden');
        }
    }

    /**
     * Update effort slider visibility
     */
    private updateEffortVisibility(settings: LLMProviderSettings): void {
        if (!this.thinkingContainer) return;

        const effortContainer = this.thinkingContainer.querySelector('.nexus-thinking-effort-container');
        if (effortContainer) {
            if (settings.defaultThinking?.enabled) {
                effortContainer.removeClass('is-hidden');
            } else {
                effortContainer.addClass('is-hidden');
            }
        }
    }

    /**
     * Render provider groups (Local and Cloud)
     */
    private renderProviderGroups(): void {
        const settings = this.getSettings();

        // Local providers
        this.container.createDiv('nexus-provider-group-title').setText('LOCAL PROVIDERS');
        this.renderProviderList(['webllm', 'ollama', 'lmstudio'], settings);

        // Cloud providers
        this.container.createDiv('nexus-provider-group-title').setText('CLOUD PROVIDERS');
        this.renderProviderList(
            ['openai', 'anthropic', 'google', 'mistral', 'groq', 'openrouter', 'requesty', 'perplexity'],
            settings
        );
    }

    /**
     * Render a list of providers as cards
     */
    private renderProviderList(providerIds: string[], settings: LLMProviderSettings): void {
        const grid = this.container.createDiv('card-manager-grid');

        providerIds.forEach(providerId => {
            const displayConfig = this.providerConfigs[providerId];
            if (!displayConfig) return;

            const providerConfig = settings.providers[providerId] || {
                apiKey: '',
                enabled: false
            };

            const isConfigured = this.isProviderConfigured(providerId, providerConfig);

            // Create card for this provider
            const cardConfig: CardConfig = {
                title: displayConfig.name,
                description: isConfigured ? 'Configured' : 'Not configured',
                isEnabled: providerConfig.enabled,
                showToggle: true,
                onToggle: async (enabled: boolean) => {
                    settings.providers[providerId] = {
                        ...providerConfig,
                        enabled
                    };
                    await this.saveSettings();
                    this.render(); // Re-render to update defaults dropdown
                },
                onEdit: () => {
                    this.openProviderModal(providerId, displayConfig, providerConfig);
                }
            };

            new Card(grid, cardConfig);
        });
    }

    /**
     * Check if a provider is configured
     */
    private isProviderConfigured(providerId: string, config: LLMProviderConfig): boolean {
        if (!config.enabled) return false;
        // WebLLM doesn't need an API key
        if (providerId === 'webllm') return true;
        // Other providers need an API key
        return !!config.apiKey;
    }

    /**
     * Open provider configuration modal
     */
    private openProviderModal(
        providerId: string,
        displayConfig: ProviderDisplayConfig,
        providerConfig: LLMProviderConfig
    ): void {
        const settings = this.getSettings();

        const modalConfig: LLMProviderModalConfig = {
            providerId,
            providerName: displayConfig.name,
            keyFormat: displayConfig.keyFormat,
            signupUrl: displayConfig.signupUrl,
            config: { ...providerConfig },
            onSave: async (updatedConfig: LLMProviderConfig) => {
                settings.providers[providerId] = updatedConfig;

                // Handle Ollama model update
                if (providerId === 'ollama') {
                    const ollamaModel = (updatedConfig as any).__ollamaModel;
                    if (ollamaModel) {
                        delete (updatedConfig as any).__ollamaModel;
                        if (settings.defaultModel.provider === 'ollama') {
                            settings.defaultModel.model = ollamaModel;
                        }
                    }
                }

                await this.saveSettings();
                this.render(); // Refresh the view
                new Notice(`${displayConfig.name} settings saved`);
            }
        };

        new LLMProviderModal(this.services.app, modalConfig, this.providerManager).open();
    }

    /**
     * Cleanup
     */
    destroy(): void {
        // No resources to clean up
    }
}
