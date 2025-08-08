/**
 * LLM Provider Configuration Modal
 * Modal-based editing for LLM provider settings and model descriptions
 */

import { Modal, App, Setting, ButtonComponent, Notice } from 'obsidian';
import { LLMProviderConfig, ModelConfig } from '../types';
import { LLMProviderManager } from '../services/llm/providers/ProviderManager';
import { StaticModelsService, ModelWithProvider } from '../services/StaticModelsService';
import { LLMValidationService } from '../services/llm/validation/ValidationService';

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
  private ollamaModel: string = ''; // Temporary storage for Ollama model
  private testButton?: HTMLButtonElement; // Reference to test button

  constructor(app: App, config: LLMProviderModalConfig, providerManager: LLMProviderManager) {
    super(app);
    this.config = config;
    this.providerManager = providerManager;
    this.staticModelsService = StaticModelsService.getInstance();
    
    // Initialize Ollama model if editing existing config
    if (this.config.providerId === 'ollama') {
      // Try to get the current model from settings if Ollama is default
      const settings = this.providerManager.getSettings();
      if (settings.defaultModel.provider === 'ollama') {
        this.ollamaModel = settings.defaultModel.model || '';
      }
    }
  }

  // Constructor moved above

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
    
    // Special handling for Ollama - URL instead of API key
    if (this.config.providerId === 'ollama') {
      section.createEl('h2', { text: 'Ollama Server URL' });
      
      new Setting(section)
        .setDesc('Enter your Ollama server URL (default: http://127.0.0.1:11434)')
        .addText(text => {
          this.apiKeyInput = text.inputEl;
          text
            .setPlaceholder('http://127.0.0.1:11434')
            .setValue(this.config.config.apiKey || 'http://127.0.0.1:11434')
            .onChange((value) => {
              // Reset validation when URL changes
              this.isValidated = false;
              this.apiKeyInput.removeClass('validating success error');
              
              // Clear existing timeout
              if (this.validationTimeout) {
                clearTimeout(this.validationTimeout);
                this.validationTimeout = null;
              }
              
              // Auto-validate after 2 second delay if URL is entered
              if (value.trim()) {
                this.validationTimeout = setTimeout(() => {
                  this.validateApiKey();
                }, 2000);
                
                // Auto-enable when URL is added
                if (!this.config.config.enabled) {
                  this.config.config.enabled = true;
                }
              }
            });
        })
        .addButton(button => {
          this.testButton = button.buttonEl;
          button
            .setButtonText('Test Connection')
            .setTooltip('Test connection to Ollama server with the configured model')
            .onClick(() => {
              this.testOllamaConnection();
            });
        });
    } else {
      // Standard API key handling for other providers
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
              this.apiKeyInput.removeClass('validating success error');
              
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
  }


  /**
   * Create models section
   */
  private createModelsSection(contentEl: HTMLElement): void {
    const section = contentEl.createDiv('provider-modal-section');
    const header = section.createDiv('models-header llm-provider-header');
    
    header.createEl('h2', { text: 'Available Models' });

    this.modelsContainer = section.createDiv('models-container');
    
    // Special handling for Ollama - single model configuration
    if (this.config.providerId === 'ollama') {
      // Add model input field for Ollama
      new Setting(section)
        .setName('Default Model')
        .setDesc('Enter the name of the Ollama model to use (this will be the only available model)')
        .addText(text => text
          .setPlaceholder('e.g., llama3.1, mistral, phi3')
          .setValue(this.ollamaModel || '')
          .onChange(value => {
            // Store the model selection temporarily
            this.ollamaModel = value;
          })
        );
      
      // Add helpful information
      this.modelsContainer.createDiv('models-info').innerHTML = `
        <p><strong>ℹ️ Ollama Model Configuration:</strong></p>
        <p>Configure the single model that will be available:</p>
        <ol>
          <li>Install the model using: <code>ollama pull [model-name]</code></li>
          <li>Common models: llama3.1, mistral, codellama, phi3, gemma</li>
          <li>View installed models: <code>ollama list</code></li>
          <li>Enter the exact model name above - this will be your only available model</li>
        </ol>
      `;
    } else {
      // For other providers, load and display static models
      this.loadModels();
    }
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
      const modelRow = modelEl.createDiv('model-row llm-provider-model-row');
      
      // Model name (left side)
      const modelNameEl = modelRow.createDiv('model-name llm-provider-model-name');
      modelNameEl.textContent = model.name;
      
      // Description input (right side)
      const currentDescription = this.config.config.models?.[model.id]?.description || '';
      const descInput = modelRow.createEl('input', {
        type: 'text',
        cls: 'model-description-input llm-provider-description-input'
      });
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
    const buttonContainer = contentEl.createDiv('modal-button-container llm-provider-button-container');

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
    this.apiKeyInput.removeClass('success error');
    this.apiKeyInput.addClass('validating');

    try {
      // Use the dedicated validation service for real API testing
      const result = await LLMValidationService.validateApiKey(this.config.providerId, apiKey);
      
      if (result.success) {
        // Mark as validated
        this.isValidated = true;
        this.apiKeyInput.removeClass('validating error');
        this.apiKeyInput.addClass('success');
        
        new Notice(`✅ ${this.config.providerName} API key validated successfully!`);
      } else {
        throw new Error(result.error || 'API key validation failed');
      }
      
    } catch (error) {
      console.error('API key validation failed:', error);
      
      this.isValidated = false;
      this.apiKeyInput.removeClass('validating success');
      this.apiKeyInput.addClass('error');
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      new Notice(`❌ ${this.config.providerName} API key validation failed: ${errorMessage}`);
    } finally {
      // Validation feedback is already shown via border colors
    }
  }

  /**
   * Test Ollama connection with the configured server URL and model
   */
  private async testOllamaConnection(): Promise<void> {
    const serverUrl = this.apiKeyInput.value.trim();
    const modelName = this.ollamaModel.trim();

    if (!serverUrl) {
      new Notice('Please enter a server URL first');
      return;
    }

    if (!modelName) {
      new Notice('Please enter a model name first');
      return;
    }

    // Validate URL format
    try {
      new URL(serverUrl);
    } catch (e) {
      new Notice('Please enter a valid URL (e.g., http://127.0.0.1:11434)');
      return;
    }

    // Show testing state
    if (this.testButton) {
      this.testButton.textContent = 'Testing...';
      this.testButton.disabled = true;
    }

    try {
      // First, test if the server is running
      const serverResponse = await fetch(`${serverUrl}/api/tags`);
      if (!serverResponse.ok) {
        throw new Error(`Server not responding: ${serverResponse.status} ${serverResponse.statusText}`);
      }

      // Check if the model is available
      const serverData = await serverResponse.json();
      const availableModels = serverData.models || [];
      const modelExists = availableModels.some((model: any) => model.name === modelName);

      if (!modelExists) {
        new Notice(`⚠️ Model '${modelName}' not found on server. Available models: ${availableModels.map((m: any) => m.name).join(', ') || 'none'}`);
        return;
      }

      // Test a simple generation request with the model
      const testResponse = await fetch(`${serverUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          prompt: 'Hello',
          stream: false,
          options: {
            num_predict: 5 // Just a few tokens for testing
          }
        })
      });

      if (!testResponse.ok) {
        const errorText = await testResponse.text();
        throw new Error(`Model test failed: ${testResponse.status} ${testResponse.statusText} - ${errorText}`);
      }

      const testData = await testResponse.json();
      if (testData.response) {
        new Notice(`✅ Ollama connection successful! Model '${modelName}' is working.`);
        
        // Mark as validated
        this.isValidated = true;
        this.apiKeyInput.removeClass('validating error');
        this.apiKeyInput.addClass('success');
      } else {
        throw new Error('Model test returned invalid response');
      }

    } catch (error) {
      console.error('Ollama connection test failed:', error);
      
      this.isValidated = false;
      this.apiKeyInput.removeClass('validating success');
      this.apiKeyInput.addClass('error');
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      new Notice(`❌ Ollama test failed: ${errorMessage}`);
    } finally {
      // Restore button state
      if (this.testButton) {
        this.testButton.textContent = 'Test Connection';
        this.testButton.disabled = false;
      }
    }
  }

  /**
   * Save the provider configuration
   */
  private saveConfig(): void {
    const apiKey = this.apiKeyInput.value.trim();

    // Validation
    if (!apiKey) {
      const fieldName = this.config.providerId === 'ollama' ? 'Server URL' : 'API key';
      new Notice(`${fieldName} is required`);
      this.apiKeyInput.focus();
      return;
    }

    // Special validation for Ollama
    if (this.config.providerId === 'ollama') {
      // Validate URL format
      try {
        new URL(apiKey);
      } catch (e) {
        new Notice('Please enter a valid URL (e.g., http://127.0.0.1:11434)');
        this.apiKeyInput.focus();
        return;
      }
      
      // Check if model is specified
      if (!this.ollamaModel || !this.ollamaModel.trim()) {
        new Notice('Please specify a default model name');
        return;
      }
    } else {
      // Regular API key validation
      if (apiKey.length < 8) {
        new Notice('API key appears to be too short');
        this.apiKeyInput.focus();
        return;
      }
    }

    // Suggest validation if not done
    if (!this.isValidated && this.config.providerId !== 'ollama') {
      new Notice('Consider validating your API key before saving');
    }

    // Update the configuration
    const updatedConfig: LLMProviderConfig = {
      ...this.config.config,
      apiKey: apiKey,
      enabled: true // Auto-enable when saving
    };
    
    // For Ollama, pass the model via a special marker in the config
    if (this.config.providerId === 'ollama' && this.ollamaModel) {
      // Store the model in a special field that the callback can extract
      (updatedConfig as any).__ollamaModel = this.ollamaModel;
    }

    this.config.onSave(updatedConfig);
    
    new Notice(`${this.config.providerName} configuration saved`);
    this.close();
  }
}