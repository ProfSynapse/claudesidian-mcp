/**
 * LLM Provider Configuration Modal
 * Modal-based editing for LLM provider settings and model descriptions
 */

import { Modal, App, Setting, ButtonComponent, Notice } from 'obsidian';
import { LLMProviderConfig, ModelConfig } from '../types';
import { LLMProviderManager } from '../services/LLMProviderManager';
import { StaticModelsService, ModelWithProvider } from '../services/StaticModelsService';
import { LLMValidationService } from '../services/LLMValidationService';

export interface LLMProviderModalConfig {
  providerId: string;
  providerName: string;
  providerDescription: string;
  keyFormat: string;
  signupUrl: string;
  config: LLMProviderConfig;
  onSave: (config: LLMProviderConfig) => void;
}

export class LLMProviderModal extends Modal {
  private config: LLMProviderModalConfig;
  private providerManager: LLMProviderManager;
  private staticModelsService: StaticModelsService;
  
  private apiKeyInput!: HTMLInputElement;
  private modelsContainer!: HTMLElement;
  private models: ModelWithProvider[] = [];
  private isValidated = false;
  private validationTimeout: NodeJS.Timeout | null = null;

  constructor(app: App, config: LLMProviderModalConfig, providerManager: LLMProviderManager) {
    super(app);
    this.config = config;
    this.providerManager = providerManager;
    this.staticModelsService = StaticModelsService.getInstance();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    // Modal title
    contentEl.createEl('h1', { text: `Configure ${this.config.providerName}` });

    // API Key section
    this.createApiKeySection(contentEl);

    // Models section
    this.createModelsSection(contentEl);

    // Buttons
    this.createButtons(contentEl);

    // Load models immediately (no API key needed for static models)
    this.loadModels();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    
    // Clean up validation timeout
    if (this.validationTimeout) {
      clearTimeout(this.validationTimeout);
      this.validationTimeout = null;
    }
  }

  /**
   * Create API key input section
   */
  private createApiKeySection(contentEl: HTMLElement): void {
    const section = contentEl.createDiv('provider-modal-section');
    section.createEl('h2', { text: 'API Key' });

    new Setting(section)
      .setDesc(`Enter your ${this.config.providerName} API key (format: ${this.config.keyFormat})`)
      .addText(text => {
        this.apiKeyInput = text.inputEl;
        this.apiKeyInput.type = 'password'; // Make it a password field
        text
          .setPlaceholder(`Enter your ${this.config.providerName} API key`)
          .setValue(this.config.config.apiKey || '')
          .onChange((value) => {
            // Reset validation when key changes
            this.isValidated = false;
            this.apiKeyInput.style.borderColor = '';
            this.apiKeyInput.style.backgroundColor = '';
            
            // Clear existing timeout
            if (this.validationTimeout) {
              clearTimeout(this.validationTimeout);
              this.validationTimeout = null;
            }
            
            // Auto-validate after 2 second delay if key is entered
            if (value.trim()) {
              this.validationTimeout = setTimeout(() => {
                this.validateApiKey();
              }, 2000);
              
              // Auto-enable when API key is added
              if (!this.config.config.enabled) {
                this.config.config.enabled = true;
              }
            }
          });
      })
      .addButton(button => {
        button
          .setButtonText('Get Key')
          .setTooltip(`Open ${this.config.providerName} API key page`)
          .onClick(() => {
            window.open(this.config.signupUrl, '_blank');
          });
      });

  }


  /**
   * Create models section
   */
  private createModelsSection(contentEl: HTMLElement): void {
    const section = contentEl.createDiv('provider-modal-section');
    const header = section.createDiv('models-header');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    
    header.createEl('h2', { text: 'Available Models' });

    this.modelsContainer = section.createDiv('models-container');
    
    // Models are always available since they're static
    this.loadModels();
  }

  /**
   * Load models from static service (no API calls needed)
   */
  private loadModels(): void {
    try {
      this.models = this.staticModelsService.getModelsForProvider(this.config.providerId);
      this.displayModels();
    } catch (error) {
      console.error('Error loading static models:', error);
      this.modelsContainer.empty();
      const errorEl = this.modelsContainer.createDiv('models-error');
      errorEl.innerHTML = `
        <p><strong>⚠️ Error loading models:</strong></p>
        <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
      `;
    }
  }

  /**
   * Display the loaded models
   */
  private displayModels(): void {
    this.modelsContainer.empty();

    if (this.models.length === 0) {
      this.modelsContainer.createDiv('models-empty')
        .textContent = 'No models available. Check your API key and try again.';
      return;
    }

    const modelsList = this.modelsContainer.createDiv('models-list');
    
    this.models.forEach(model => {
      const modelEl = modelsList.createDiv('model-item');
      
      // Simple layout: | Model Name | Description Input |
      const modelRow = modelEl.createDiv('model-row');
      modelRow.style.display = 'flex';
      modelRow.style.alignItems = 'center';
      modelRow.style.gap = '10px';
      modelRow.style.marginBottom = '10px';
      
      // Model name (left side)
      const modelNameEl = modelRow.createDiv('model-name');
      modelNameEl.style.minWidth = '150px';
      modelNameEl.style.fontWeight = 'bold';
      modelNameEl.textContent = model.name;
      
      // Description input (right side)
      const currentDescription = this.config.config.models?.[model.id]?.description || '';
      const descInput = modelRow.createEl('input', {
        type: 'text',
        cls: 'model-description-input'
      });
      descInput.style.flex = '1';
      descInput.placeholder = 'Describe when to use this model...';
      descInput.value = currentDescription;
      
      descInput.addEventListener('input', (e) => {
        const value = (e.target as HTMLInputElement).value;
        
        // Initialize models object if needed
        if (!this.config.config.models) {
          this.config.config.models = {};
        }
        if (!this.config.config.models[model.id]) {
          this.config.config.models[model.id] = {};
        }
        
        this.config.config.models[model.id].description = value;
      });
    });
  }

  /**
   * Create action buttons
   */
  private createButtons(contentEl: HTMLElement): void {
    const buttonContainer = contentEl.createDiv('modal-button-container');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '10px';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.marginTop = '20px';

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = buttonContainer.createEl('button', { text: 'Save', cls: 'mod-cta' });
    saveBtn.addEventListener('click', () => this.saveConfig());
  }

  /**
   * Validate the API key by making a real test request
   */
  private async validateApiKey(): Promise<void> {
    const apiKey = this.apiKeyInput.value.trim();
    
    if (!apiKey) {
      new Notice('Please enter an API key first');
      return;
    }

    // Show visual feedback that validation is in progress
    this.apiKeyInput.style.borderColor = '#3b82f6';
    this.apiKeyInput.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';

    try {
      // Use the dedicated validation service for real API testing
      const result = await LLMValidationService.validateApiKey(this.config.providerId, apiKey);
      
      if (result.success) {
        // Mark as validated
        this.isValidated = true;
        this.apiKeyInput.style.borderColor = '#22c55e';
        this.apiKeyInput.style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
        
        new Notice(`✅ ${this.config.providerName} API key validated successfully!`);
      } else {
        throw new Error(result.error || 'API key validation failed');
      }
      
    } catch (error) {
      console.error('API key validation failed:', error);
      
      this.isValidated = false;
      this.apiKeyInput.style.borderColor = '#ef4444';
      this.apiKeyInput.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      new Notice(`❌ ${this.config.providerName} API key validation failed: ${errorMessage}`);
    } finally {
      // Validation feedback is already shown via border colors
    }
  }

  /**
   * Save the provider configuration
   */
  private saveConfig(): void {
    const apiKey = this.apiKeyInput.value.trim();

    // Validation
    if (!apiKey) {
      new Notice('API key is required');
      this.apiKeyInput.focus();
      return;
    }

    if (apiKey.length < 8) {
      new Notice('API key appears to be too short');
      this.apiKeyInput.focus();
      return;
    }

    // Suggest validation if not done
    if (!this.isValidated) {
      new Notice('Consider validating your API key before saving');
    }

    // Update the configuration
    const updatedConfig: LLMProviderConfig = {
      ...this.config.config,
      apiKey: apiKey,
      enabled: true // Auto-enable when saving with valid API key
    };

    this.config.onSave(updatedConfig);
    
    new Notice(`${this.config.providerName} configuration saved`);
    this.close();
  }
}