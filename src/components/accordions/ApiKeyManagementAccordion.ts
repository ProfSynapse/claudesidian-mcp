/**
 * API Key Management Accordion
 * Provides UI for managing LLM provider API keys with secure input fields
 */

import { Setting } from 'obsidian';
import { Accordion } from '../Accordion';
import { LLMProviderSettings, LLMProviderConfig } from '../../types';

export interface ApiKeyManagementAccordionOptions {
  containerEl: HTMLElement;
  settings: LLMProviderSettings;
  onSettingsChange: (settings: LLMProviderSettings) => void;
  onTestProvider?: (provider: string) => Promise<{ success: boolean; error?: string }>;
}

export class ApiKeyManagementAccordion extends Accordion {
  private settings: LLMProviderSettings;
  private onSettingsChange: (settings: LLMProviderSettings) => void;
  private onTestProvider?: (provider: string) => Promise<{ success: boolean; error?: string }>;
  private providerConfigs: { [key: string]: ProviderDisplayConfig } = {};

  constructor(options: ApiKeyManagementAccordionOptions) {
    super(
      options.containerEl,
      '🔑 LLM Provider API Keys',
      'Configure API keys for LLM providers and set default model preferences'
    );

    this.settings = options.settings;
    this.onSettingsChange = options.onSettingsChange;
    this.onTestProvider = options.onTestProvider;

    this.initializeProviderConfigs();
    this.buildContent();
  }

  /**
   * Initialize provider display configurations
   */
  private initializeProviderConfigs(): void {
    this.providerConfigs = {
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
   * Build the accordion content
   */
  protected buildContent(): void {
    this.contentEl.empty();

    // Add header information
    this.addHeaderInfo();

    // Add default model selection
    this.addDefaultModelSection();

    // Add provider sections
    Object.keys(this.providerConfigs).forEach(providerId => {
      this.addProviderSection(providerId);
    });

    // Add usage information
    this.addUsageInfo();
  }

  /**
   * Add header information section
   */
  private addHeaderInfo(): void {
    const headerEl = this.contentEl.createDiv('api-key-header');
    headerEl.innerHTML = `
      <div class="api-key-notice">
        <p><strong>🔐 Security Notice:</strong> API keys are stored locally in your Obsidian vault settings. Ensure your vault is properly secured.</p>
        <p><strong>💰 Cost Warning:</strong> LLM API calls consume tokens and incur costs. Monitor your usage carefully.</p>
      </div>
    `;
  }

  /**
   * Add default model selection section
   */
  private addDefaultModelSection(): void {
    const sectionEl = this.contentEl.createDiv('default-model-section');
    sectionEl.createEl('h3', { text: '🎯 Default Model Settings' });

    new Setting(sectionEl)
      .setName('Default Provider')
      .setDesc('The LLM provider to use when none is specified')
      .addDropdown(dropdown => {
        // Add options for enabled providers only
        const enabledProviders = Object.keys(this.settings.providers)
          .filter(id => this.settings.providers[id]?.enabled && this.settings.providers[id]?.apiKey);
        
        if (enabledProviders.length === 0) {
          dropdown.addOption('', 'No providers enabled');
        } else {
          enabledProviders.forEach(providerId => {
            const config = this.providerConfigs[providerId];
            dropdown.addOption(providerId, config?.name || providerId);
          });
        }
        
        dropdown
          .setValue(this.settings.defaultModel.provider)
          .onChange(async (value) => {
            this.settings.defaultModel.provider = value;
            this.onSettingsChange(this.settings);
            this.buildContent(); // Rebuild to update model dropdown
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
   * Add provider configuration section
   */
  private addProviderSection(providerId: string): void {
    const config = this.providerConfigs[providerId];
    const providerSettings = this.settings.providers[providerId] || {
      apiKey: '',
      enabled: false,
      userDescription: config.description
    };

    const sectionEl = this.contentEl.createDiv(`provider-section provider-${providerId}`);
    
    // Provider header
    const headerEl = sectionEl.createDiv('provider-header');
    const titleEl = headerEl.createEl('h3');
    titleEl.innerHTML = `${config.name} ${providerSettings.enabled ? '✅' : '❌'}`;
    
    const descEl = headerEl.createDiv('provider-description');
    descEl.textContent = config.description;

    // Enable/disable toggle
    new Setting(sectionEl)
      .setName('Enable Provider')
      .setDesc(`Enable ${config.name} for LLM operations`)
      .addToggle(toggle => {
        toggle
          .setValue(providerSettings.enabled)
          .onChange(async (value) => {
            this.settings.providers[providerId] = {
              ...providerSettings,
              enabled: value
            };
            this.onSettingsChange(this.settings);
            this.buildContent(); // Rebuild to update UI
          });
      });

    // API Key input
    new Setting(sectionEl)
      .setName('API Key')
      .setDesc(`${config.name} API key (format: ${config.keyFormat})`)
      .addText(text => {
        text
          .setPlaceholder(`Enter your ${config.name} API key`)
          .setValue(this.maskApiKey(providerSettings.apiKey))
          .onChange(async (value) => {
            // Only update if the value has actually changed and isn't masked
            if (value !== this.maskApiKey(providerSettings.apiKey)) {
              this.settings.providers[providerId] = {
                ...providerSettings,
                apiKey: value
              };
              this.onSettingsChange(this.settings);
            }
          });
        
        // Show full key on focus for editing
        text.inputEl.addEventListener('focus', () => {
          if (text.getValue() === this.maskApiKey(providerSettings.apiKey)) {
            text.setValue(providerSettings.apiKey);
          }
        });
        
        // Mask key on blur
        text.inputEl.addEventListener('blur', () => {
          if (text.getValue() === providerSettings.apiKey) {
            text.setValue(this.maskApiKey(providerSettings.apiKey));
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

    // User description
    new Setting(sectionEl)
      .setName('Provider Description')
      .setDesc('Custom description to help the AI choose when to use this provider')
      .addTextArea(text => {
        text
          .setPlaceholder(`Describe when to use ${config.name}...`)
          .setValue(providerSettings.userDescription || '')
          .onChange(async (value) => {
            this.settings.providers[providerId] = {
              ...providerSettings,
              userDescription: value
            };
            this.onSettingsChange(this.settings);
          });
        text.inputEl.rows = 2;
      });

    // Test connection button (only if enabled and has API key)
    if (providerSettings.enabled && providerSettings.apiKey && this.onTestProvider) {
      new Setting(sectionEl)
        .setName('Test Connection')
        .setDesc(`Test your ${config.name} API key connection`)
        .addButton(button => {
          button
            .setButtonText('Test')
            .setClass('mod-cta')
            .onClick(async () => {
              button.setButtonText('Testing...');
              button.setDisabled(true);
              
              try {
                const result = await this.onTestProvider!(providerId);
                if (result.success) {
                  button.setButtonText('✅ Success');
                  button.setClass('mod-success');
                } else {
                  button.setButtonText('❌ Failed');
                  button.setClass('mod-warning');
                  console.error(`${config.name} test failed:`, result.error);
                }
              } catch (error) {
                button.setButtonText('❌ Error');
                button.setClass('mod-warning');
                console.error(`${config.name} test error:`, error);
              }
              
              setTimeout(() => {
                button.setButtonText('Test');
                button.setDisabled(false);
                button.removeClass('mod-success', 'mod-warning');
                button.setClass('mod-cta');
              }, 3000);
            });
        });
    }

    // Add documentation link
    const docsEl = sectionEl.createDiv('provider-docs');
    docsEl.innerHTML = `
      <a href="${config.docsUrl}" target="_blank" class="external-link">
        📚 ${config.name} Documentation
      </a>
    `;
  }

  /**
   * Add usage information section
   */
  private addUsageInfo(): void {
    const infoEl = this.contentEl.createDiv('usage-info');
    infoEl.innerHTML = `
      <div class="usage-tips">
        <h4>💡 Usage Tips</h4>
        <ul>
          <li><strong>Provider Descriptions:</strong> Help the AI choose the right model by describing each provider's strengths</li>
          <li><strong>Cost Monitoring:</strong> Different providers have different pricing - monitor your usage</li>
          <li><strong>Rate Limits:</strong> Each provider has different rate limits and quotas</li>
          <li><strong>Model Selection:</strong> Use the listModels mode to see available models for each provider</li>
        </ul>
      </div>
    `;
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
}

interface ProviderDisplayConfig {
  name: string;
  description: string;
  keyFormat: string;
  signupUrl: string;
  docsUrl: string;
}