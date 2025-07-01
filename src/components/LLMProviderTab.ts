/**
 * LLM Provider Tab Component
 * Card-based interface for managing LLM providers and their models
 */

import { Setting, ButtonComponent, Modal, App } from 'obsidian';
import { LLMProviderSettings, LLMProviderConfig, ModelConfig } from '../types';
import { LLMProviderManager } from '../services/LLMProviderManager';

export interface LLMProviderTabOptions {
  containerEl: HTMLElement;
  settings: LLMProviderSettings;
  onSettingsChange: (settings: LLMProviderSettings) => void;
}

export class LLMProviderTab {
  private containerEl: HTMLElement;
  private settings: LLMProviderSettings;
  private onSettingsChange: (settings: LLMProviderSettings) => void;
  private providerCardsContainer!: HTMLElement;
  private providerManager: LLMProviderManager;

  constructor(options: LLMProviderTabOptions) {
    this.containerEl = options.containerEl;
    this.settings = options.settings;
    this.onSettingsChange = options.onSettingsChange;
    this.providerManager = new LLMProviderManager(this.settings);

    this.buildContent();
  }

  /**
   * Build the LLM provider tab content
   */
  private buildContent(): void {
    this.containerEl.empty();

    // Header section with default model settings
    this.createDefaultModelSection();

    // Provider cards section
    this.createProviderCardsSection();
  }

  /**
   * Create the default model selection section
   */
  private createDefaultModelSection(): void {
    const sectionEl = this.containerEl.createDiv('llm-default-section');
    sectionEl.createEl('h3', { text: '🎯 Default Model Settings' });

    new Setting(sectionEl)
      .setName('Default Provider')
      .setDesc('The LLM provider to use when none is specified')
      .addDropdown(dropdown => {
        const enabledProviders = Object.keys(this.settings.providers)
          .filter(id => this.settings.providers[id]?.enabled && this.settings.providers[id]?.apiKey);
        
        if (enabledProviders.length === 0) {
          dropdown.addOption('', 'No providers enabled');
        } else {
          enabledProviders.forEach(providerId => {
            dropdown.addOption(providerId, this.getProviderDisplayName(providerId));
          });
        }
        
        dropdown
          .setValue(this.settings.defaultModel.provider)
          .onChange(async (value) => {
            this.settings.defaultModel.provider = value;
            this.onSettingsChange(this.settings);
          });
      });

    new Setting(sectionEl)
      .setName('Default Model')
      .setDesc('The specific model to use by default')
      .addText(text => {
        text
          .setPlaceholder('e.g., gpt-4o, claude-3-5-sonnet-20241022')
          .setValue(this.settings.defaultModel.model)
          .onChange(async (value) => {
            this.settings.defaultModel.model = value;
            this.onSettingsChange(this.settings);
          });
      });
  }

  /**
   * Create the provider cards section
   */
  private createProviderCardsSection(): void {
    const sectionEl = this.containerEl.createDiv('llm-providers-section');
    sectionEl.createEl('h3', { text: '🤖 LLM Providers' });

    this.providerCardsContainer = sectionEl.createDiv('llm-provider-cards');
    this.refreshProviderCards();
  }

  /**
   * Refresh the provider cards display
   */
  private refreshProviderCards(): void {
    this.providerCardsContainer.empty();

    const providerConfigs = this.getProviderConfigs();
    
    Object.keys(providerConfigs).forEach(providerId => {
      this.createProviderCard(providerId, providerConfigs[providerId]);
    });
  }

  /**
   * Create a card for a single provider
   */
  private createProviderCard(providerId: string, config: ProviderDisplayConfig): void {
    const settings = this.settings.providers[providerId] || {
      apiKey: '',
      enabled: false,
      userDescription: config.description,
      models: {}
    };

    const cardEl = this.providerCardsContainer.createDiv('llm-provider-card');
    if (settings.enabled) {
      cardEl.addClass('enabled');
    }

    // Card header
    const headerEl = cardEl.createDiv('llm-provider-header');
    const titleEl = headerEl.createEl('h4');
    titleEl.innerHTML = `${config.name} ${settings.enabled ? '✅' : '❌'}`;
    
    const descEl = headerEl.createDiv('llm-provider-description');
    descEl.textContent = config.description;

    // Enable/disable toggle
    const toggleEl = cardEl.createDiv('llm-provider-toggle');
    new Setting(toggleEl)
      .setName('Enable Provider')
      .addToggle(toggle => {
        toggle
          .setValue(settings.enabled)
          .onChange(async (value) => {
            this.settings.providers[providerId] = {
              ...settings,
              enabled: value
            };
            this.onSettingsChange(this.settings);
            this.refreshProviderCards();
          });
      });

    // Card content (collapsed by default, expandable)
    const contentEl = cardEl.createDiv('llm-provider-content');
    if (!settings.enabled) {
      contentEl.style.display = 'none';
    }

    // API Key section
    this.createApiKeySection(contentEl, providerId, settings, config);

    // Models section (only if API key is present)
    if (settings.apiKey) {
      this.createModelsSection(contentEl, providerId, settings).catch(error => {
        console.error('Error creating models section:', error);
      });
    }

    // Click to expand/collapse
    headerEl.addEventListener('click', () => {
      const isExpanded = contentEl.style.display !== 'none';
      contentEl.style.display = isExpanded ? 'none' : 'block';
      cardEl.toggleClass('expanded', !isExpanded);
    });
  }

  /**
   * Create API key input section
   */
  private createApiKeySection(
    contentEl: HTMLElement, 
    providerId: string, 
    settings: LLMProviderConfig,
    config: ProviderDisplayConfig
  ): void {
    const apiKeyEl = contentEl.createDiv('llm-api-key-section');
    
    new Setting(apiKeyEl)
      .setName('API Key')
      .setDesc(`${config.name} API key (format: ${config.keyFormat})`)
      .addText(text => {
        text
          .setPlaceholder(`Enter your ${config.name} API key`)
          .setValue(this.maskApiKey(settings.apiKey))
          .onChange(async (value) => {
            if (value !== this.maskApiKey(settings.apiKey)) {
              this.settings.providers[providerId] = {
                ...settings,
                apiKey: value,
                enabled: value.length > 0 // Auto-enable when API key is added
              };
              this.onSettingsChange(this.settings);
              this.refreshProviderCards();
            }
          });
        
        // Show full key on focus
        text.inputEl.addEventListener('focus', () => {
          if (text.getValue() === this.maskApiKey(settings.apiKey)) {
            text.setValue(settings.apiKey);
          }
        });
        
        // Mask key on blur
        text.inputEl.addEventListener('blur', () => {
          if (text.getValue() === settings.apiKey) {
            text.setValue(this.maskApiKey(settings.apiKey));
          }
        });
      })
      .addButton(button => {
        button
          .setButtonText('Get Key')
          .setTooltip(`Open ${config.name} API key page`)
          .onClick(() => {
            window.open(config.signupUrl, '_blank');
          });
      });
  }

  /**
   * Create models section showing available models with descriptions
   */
  private async createModelsSection(
    contentEl: HTMLElement, 
    providerId: string, 
    settings: LLMProviderConfig
  ): Promise<void> {
    const modelsEl = contentEl.createDiv('llm-models-section');
    modelsEl.createEl('h5', { text: 'Available Models' });

    try {
      // Update provider manager with current settings to get models
      this.providerManager.updateSettings(this.settings);
      const models = await this.providerManager.getModelsForProvider(providerId);

      if (models.length === 0) {
        modelsEl.createDiv('llm-models-empty')
          .textContent = 'No models available. Check your API key and try again.';
        return;
      }

      // Create model list
      const modelsList = modelsEl.createDiv('llm-models-list');
      
      models.forEach(model => {
        const modelEl = modelsList.createDiv('llm-model-item');
        
        // Model name and info
        const modelHeader = modelEl.createDiv('llm-model-header');
        modelHeader.createEl('strong', { text: model.name });
        
        const modelInfo = modelEl.createDiv('llm-model-info');
        modelInfo.innerHTML = `
          <span class="llm-model-id">${model.id}</span>
          <span class="llm-model-context">Context: ${model.contextWindow.toLocaleString()} tokens</span>
          <span class="llm-model-price">$${model.pricing.inputPerMillion}/M input, $${model.pricing.outputPerMillion}/M output</span>
        `;

        // Model description input
        const currentDescription = settings.models?.[model.id]?.description || '';
        new Setting(modelEl)
          .setName('Usage Description')
          .setDesc('Describe when to use this model (helps Claude choose the right one)')
          .addText(text => {
            text
              .setPlaceholder('e.g., "Best for creative writing and long-form content"')
              .setValue(currentDescription)
              .onChange(async (value) => {
                // Initialize models object if it doesn't exist
                if (!settings.models) {
                  settings.models = {};
                }
                if (!settings.models[model.id]) {
                  settings.models[model.id] = {};
                }
                
                // Update the description
                settings.models[model.id].description = value;
                
                // Update the provider settings
                this.settings.providers[providerId] = settings;
                this.onSettingsChange(this.settings);
              });
          });
      });

    } catch (error) {
      const errorEl = modelsEl.createDiv('llm-models-error');
      errorEl.innerHTML = `
        <p><strong>⚠️ Error loading models:</strong></p>
        <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
        <p><em>Make sure your API key is valid and the provider is properly configured.</em></p>
      `;
    }
  }

  /**
   * Get provider display configurations
   */
  private getProviderConfigs(): { [key: string]: ProviderDisplayConfig } {
    return {
      openai: {
        name: 'OpenAI',
        description: 'GPT models including GPT-4o, GPT-4 Turbo, and GPT-3.5',
        keyFormat: 'sk-proj-...',
        signupUrl: 'https://platform.openai.com/api-keys',
        docsUrl: 'https://platform.openai.com/docs'
      },
      anthropic: {
        name: 'Anthropic',
        description: 'Claude models with strong reasoning and safety features',
        keyFormat: 'sk-ant-...',
        signupUrl: 'https://console.anthropic.com/login',
        docsUrl: 'https://docs.anthropic.com'
      },
      google: {
        name: 'Google AI',
        description: 'Gemini models with multimodal capabilities',
        keyFormat: 'AIza...',
        signupUrl: 'https://aistudio.google.com/app/apikey',
        docsUrl: 'https://ai.google.dev'
      },
      mistral: {
        name: 'Mistral AI',
        description: 'European models with strong coding and multilingual support',
        keyFormat: 'msak_...',
        signupUrl: 'https://console.mistral.ai/api-keys',
        docsUrl: 'https://docs.mistral.ai'
      },
      groq: {
        name: 'Groq',
        description: 'Ultra-fast inference speeds for quick responses',
        keyFormat: 'gsk_...',
        signupUrl: 'https://console.groq.com/keys',
        docsUrl: 'https://console.groq.com/docs'
      },
      openrouter: {
        name: 'OpenRouter',
        description: 'Access to 400+ models from multiple providers',
        keyFormat: 'sk-or-...',
        signupUrl: 'https://openrouter.ai/keys',
        docsUrl: 'https://openrouter.ai/docs'
      },
      requesty: {
        name: 'Requesty',
        description: 'Premium model access with cost optimization',
        keyFormat: 'req_...',
        signupUrl: 'https://requesty.com/api-keys',
        docsUrl: 'https://docs.requesty.com'
      },
      perplexity: {
        name: 'Perplexity',
        description: 'Web search-enabled models with real-time information',
        keyFormat: 'pplx-...',
        signupUrl: 'https://www.perplexity.ai/settings/api',
        docsUrl: 'https://docs.perplexity.ai'
      }
    };
  }

  /**
   * Get provider display name
   */
  private getProviderDisplayName(providerId: string): string {
    const configs = this.getProviderConfigs();
    return configs[providerId]?.name || providerId;
  }

  /**
   * Mask API key for display
   */
  private maskApiKey(apiKey: string): string {
    if (!apiKey || apiKey.length === 0) {
      return '';
    }
    if (apiKey.length <= 8) {
      return '*'.repeat(apiKey.length);
    }
    return apiKey.substring(0, 4) + '*'.repeat(Math.max(0, apiKey.length - 8)) + apiKey.substring(apiKey.length - 4);
  }

  /**
   * Refresh the tab content
   */
  refresh(): void {
    this.buildContent();
  }
}

interface ProviderDisplayConfig {
  name: string;
  description: string;
  keyFormat: string;
  signupUrl: string;
  docsUrl: string;
}