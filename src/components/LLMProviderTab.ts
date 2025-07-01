/**
 * LLM Provider Tab Component
 * Card-based interface for managing LLM providers and their models
 */

import { Setting, ButtonComponent, Modal, App } from 'obsidian';
import { LLMProviderSettings, LLMProviderConfig, ModelConfig } from '../types';
import { LLMProviderManager } from '../services/LLMProviderManager';
import { Card, CardConfig } from './Card';
import { LLMProviderModal, LLMProviderModalConfig } from './LLMProviderModal';
import { StaticModelsService } from '../services/StaticModelsService';

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
  private app: App;
  private providerCards: Map<string, Card> = new Map();
  private staticModelsService: StaticModelsService;
  private modelDropdownSetting: Setting | null = null;

  constructor(options: LLMProviderTabOptions & { app?: App }) {
    this.containerEl = options.containerEl;
    this.settings = options.settings;
    this.onSettingsChange = options.onSettingsChange;
    this.providerManager = new LLMProviderManager(this.settings);
    this.app = options.app || (window as any).app;
    this.staticModelsService = StaticModelsService.getInstance();

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
            // Reset model when provider changes
            this.settings.defaultModel.model = '';
            this.updateModelDropdown(value);
            this.onSettingsChange(this.settings);
          });
      });

    // Create model dropdown setting and store reference
    this.modelDropdownSetting = new Setting(sectionEl)
      .setName('Default Model')
      .setDesc('The specific model to use by default');
    
    // Initial population of model dropdown
    this.updateModelDropdown(this.settings.defaultModel.provider);
  }

  /**
   * Update the model dropdown based on selected provider
   */
  private updateModelDropdown(providerId: string): void {
    if (!this.modelDropdownSetting) return;

    // Clear existing dropdown
    this.modelDropdownSetting.clear();
    
    this.modelDropdownSetting.addDropdown(dropdown => {
      if (!providerId) {
        dropdown.addOption('', 'Select a provider first');
        dropdown.setValue('');
        return;
      }

      try {
        const models = this.staticModelsService.getModelsForProvider(providerId);
        
        if (models.length === 0) {
          dropdown.addOption('', 'No models available');
          dropdown.setValue('');
          return;
        }

        // Add models to dropdown
        models.forEach(model => {
          dropdown.addOption(model.id, model.name);
        });

        // Set current value or first model if current is invalid
        const currentModel = this.settings.defaultModel.model;
        const modelExists = models.some(m => m.id === currentModel);
        
        if (modelExists) {
          dropdown.setValue(currentModel);
        } else if (models.length > 0) {
          // Set to first model if current model is invalid
          dropdown.setValue(models[0].id);
          this.settings.defaultModel.model = models[0].id;
        }

        dropdown.onChange(async (value) => {
          this.settings.defaultModel.model = value;
          this.onSettingsChange(this.settings);
        });

      } catch (error) {
        console.error('Error loading models for provider:', providerId, error);
        dropdown.addOption('', 'Error loading models');
        dropdown.setValue('');
      }
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
    this.providerCards.clear();

    const providerConfigs = this.getProviderConfigs();
    
    Object.keys(providerConfigs).forEach(providerId => {
      this.createProviderCard(providerId, providerConfigs[providerId]);
    });

    // Also refresh the default model dropdown in case provider states changed
    this.updateModelDropdown(this.settings.defaultModel.provider);
  }

  /**
   * Create a card for a single provider using the reusable Card component
   */
  private createProviderCard(providerId: string, config: ProviderDisplayConfig): void {
    const providerConfig = this.settings.providers[providerId] || {
      apiKey: '',
      enabled: false,
      userDescription: '',
      models: {}
    };

    const hasValidatedApiKey = !!(providerConfig.apiKey && providerConfig.apiKey.length > 0);

    const cardConfig: CardConfig = {
      title: config.name, // Just the provider name, no emojis
      description: '', // No description
      isEnabled: hasValidatedApiKey && providerConfig.enabled,
      showToggle: true, // Show toggle for providers
      onToggle: async (enabled: boolean) => {
        if (!hasValidatedApiKey && enabled) {
          // If trying to enable without API key, open modal instead
          this.openProviderModal(providerId, config, providerConfig);
          return;
        }
        
        this.settings.providers[providerId] = {
          ...providerConfig,
          enabled: enabled
        };
        this.onSettingsChange(this.settings);
        this.refreshProviderCards();
      },
      onEdit: () => this.openProviderModal(providerId, config, providerConfig)
    };

    const card = new Card(this.providerCardsContainer, cardConfig);
    this.providerCards.set(providerId, card);
  }

  /**
   * Open the provider configuration modal
   */
  private openProviderModal(
    providerId: string, 
    config: ProviderDisplayConfig, 
    providerConfig: LLMProviderConfig
  ): void {
    const modalConfig: LLMProviderModalConfig = {
      providerId,
      providerName: config.name,
      providerDescription: '', // Remove built-in descriptions
      keyFormat: config.keyFormat,
      signupUrl: config.signupUrl,
      config: providerConfig,
      onSave: (updatedConfig: LLMProviderConfig) => {
        this.settings.providers[providerId] = updatedConfig;
        this.onSettingsChange(this.settings);
        this.refreshProviderCards();
      }
    };

    new LLMProviderModal(this.app, modalConfig, this.providerManager).open();
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