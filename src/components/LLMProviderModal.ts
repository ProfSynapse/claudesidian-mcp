/**
 * LLM Provider Configuration Modal
 * Modal-based editing for LLM provider settings and model descriptions
 */

import { Modal, App, Setting, ButtonComponent, Notice, requestUrl } from 'obsidian';
import { LLMProviderConfig, ModelConfig } from '../types';
import { LLMProviderManager } from '../services/llm/providers/ProviderManager';
import { StaticModelsService, ModelWithProvider } from '../services/StaticModelsService';
import { LLMValidationService } from '../services/llm/validation/ValidationService';

export interface LLMProviderModalConfig {
  providerId: string;
  providerName: string;
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
  private lmstudioDiscoveredModels: string[] = []; // Discovered LM Studio models
  private testButton?: HTMLButtonElement; // Reference to test button
  private autoSaveTimeout: NodeJS.Timeout | null = null;
  private saveStatusEl?: HTMLElement;

  constructor(app: App, config: LLMProviderModalConfig, providerManager: LLMProviderManager) {
    super(app);
    this.config = config;
    this.providerManager = providerManager;
    this.staticModelsService = StaticModelsService.getInstance();
    
    // Initialize Ollama model if editing existing config
    if (this.config.providerId === 'ollama') {
      // Get from config first, fallback to default model settings
      this.ollamaModel = this.config.config.ollamaModel || '';
      if (!this.ollamaModel) {
        const settings = this.providerManager.getSettings();
        if (settings.defaultModel.provider === 'ollama') {
          this.ollamaModel = settings.defaultModel.model || '';
        }
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

    // Clean up auto-save timeout
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
      this.autoSaveTimeout = null;
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
          this.apiKeyInput.addClass('llm-provider-input');
          text
            .setPlaceholder('http://127.0.0.1:11434')
            .setValue(this.config.config.apiKey || 'http://127.0.0.1:11434')
            .onChange((value) => {
              // Reset validation when URL changes
              this.isValidated = false;
              this.apiKeyInput.removeClass('success');
              this.apiKeyInput.removeClass('error');

              // Clear validation cache when URL changes
              this.config.config.lastValidated = undefined;
              this.config.config.validationHash = undefined;

              // Clear existing timeout
              if (this.validationTimeout) {
                clearTimeout(this.validationTimeout);
                this.validationTimeout = null;
              }

              // Show yellow outline immediately when typing
              if (value.trim()) {
                this.apiKeyInput.addClass('validating');
                // Auto-validate after 2 second delay
                this.validationTimeout = setTimeout(() => {
                  this.validateApiKey();
                }, 2000);

                // Auto-enable when URL is added
                if (!this.config.config.enabled) {
                  this.config.config.enabled = true;
                  this.autoSave();
                }
              } else {
                this.apiKeyInput.removeClass('validating');
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
    } else if (this.config.providerId === 'lmstudio') {
      // Special handling for LM Studio - URL instead of API key
      section.createEl('h2', { text: 'LM Studio Server URL' });

      new Setting(section)
        .setDesc('Enter your LM Studio server URL (default: http://127.0.0.1:1234)')
        .addText(text => {
          this.apiKeyInput = text.inputEl;
          this.apiKeyInput.addClass('llm-provider-input');
          text
            .setPlaceholder('http://127.0.0.1:1234')
            .setValue(this.config.config.apiKey || 'http://127.0.0.1:1234')
            .onChange((value) => {
              // Reset validation when URL changes
              this.isValidated = false;
              this.apiKeyInput.removeClass('success');
              this.apiKeyInput.removeClass('error');

              // Clear validation cache when URL changes
              this.config.config.lastValidated = undefined;
              this.config.config.validationHash = undefined;

              // Clear existing timeout
              if (this.validationTimeout) {
                clearTimeout(this.validationTimeout);
                this.validationTimeout = null;
              }

              // Show yellow outline immediately when typing
              if (value.trim()) {
                this.apiKeyInput.addClass('validating');
                // Auto-validate after 2 second delay
                this.validationTimeout = setTimeout(() => {
                  this.validateApiKey();
                }, 2000);

                // Auto-enable when URL is added
                if (!this.config.config.enabled) {
                  this.config.config.enabled = true;
                  this.autoSave();
                }
              } else {
                this.apiKeyInput.removeClass('validating');
              }
            });
        })
        .addButton(button => {
          this.testButton = button.buttonEl;
          button
            .setButtonText('Discover Models')
            .setTooltip('Connect to LM Studio server and discover available models')
            .onClick(() => {
              this.testLMStudioConnection();
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
          this.apiKeyInput.addClass('llm-provider-input');
          text
            .setPlaceholder(`Enter your ${this.config.providerName} API key`)
            .setValue(this.config.config.apiKey || '')
            .onChange((value) => {
              // Reset validation when key changes
              this.isValidated = false;
              this.apiKeyInput.removeClass('success');
              this.apiKeyInput.removeClass('error');
              
              // Clear validation cache when key changes
              this.config.config.lastValidated = undefined;
              this.config.config.validationHash = undefined;
              
              // Clear existing timeout
              if (this.validationTimeout) {
                clearTimeout(this.validationTimeout);
                this.validationTimeout = null;
              }
              
              // Show yellow outline immediately when typing
              if (value.trim()) {
                this.apiKeyInput.addClass('validating');
                // Auto-validate after 2 second delay
                this.validationTimeout = setTimeout(() => {
                  this.validateApiKey();
                }, 2000);
                
                // Auto-enable when API key is added
                if (!this.config.config.enabled) {
                  this.config.config.enabled = true;
                  this.autoSave();
                }
              } else {
                this.apiKeyInput.removeClass('validating');
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
            // Store the model selection and auto-save
            this.ollamaModel = value;
            this.config.config.ollamaModel = value;
            if (value.trim()) {
              this.autoSave();
            }
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
    } else if (this.config.providerId === 'lmstudio') {
      // Special handling for LM Studio - auto-discovered models
      // Add helpful information
      this.modelsContainer.createDiv('models-info').innerHTML = `
        <p><strong>ℹ️ LM Studio Model Discovery:</strong></p>
        <p>Models are automatically discovered from your LM Studio server:</p>
        <ol>
          <li>Start LM Studio and load your desired models</li>
          <li>Start the local server in LM Studio (usually on port 1234)</li>
          <li>Click "Discover Models" above to fetch available models</li>
          <li>Models will appear below once discovered</li>
        </ol>
        ${this.lmstudioDiscoveredModels.length > 0 ? `
          <p><strong>✅ Discovered Models (${this.lmstudioDiscoveredModels.length}):</strong></p>
          <ul>
            ${this.lmstudioDiscoveredModels.map(m => `<li><code>${m}</code></li>`).join('')}
          </ul>
        ` : '<p><em>No models discovered yet. Click "Discover Models" to scan the server.</em></p>'}
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
      
      // Simple layout: | Model Name | Toggle (right-aligned) |
      const modelRow = modelEl.createDiv('model-row llm-provider-model-row');
      modelRow.style.display = 'flex';
      modelRow.style.justifyContent = 'space-between';
      modelRow.style.alignItems = 'center';

      // Model name (left side)
      const modelNameEl = modelRow.createDiv('model-name llm-provider-model-name');
      modelNameEl.textContent = model.name;

      // Model toggle (right side)
      const currentEnabled = this.config.config.models?.[model.id]?.enabled ?? true;
      const toggleContainer = modelRow.createDiv('model-toggle-container');
      toggleContainer.style.marginLeft = 'auto';

      new Setting(toggleContainer)
        .addToggle(toggle => toggle
          .setValue(currentEnabled)
          .onChange(async (enabled) => {
            // Initialize models object if needed
            if (!this.config.config.models) {
              this.config.config.models = {};
            }
            if (!this.config.config.models[model.id]) {
              this.config.config.models[model.id] = { enabled: true };
            }

            // Update enabled status
            this.config.config.models[model.id].enabled = enabled;
            this.autoSave();
          })
        );
    });
  }

  /**
   * Create status display (no action buttons - auto-save only)
   */
  private createButtons(contentEl: HTMLElement): void {
    const statusContainer = contentEl.createDiv('modal-status-container llm-provider-status-container');

    // Save status indicator
    this.saveStatusEl = statusContainer.createDiv('save-status');
    this.showSaveStatus('Ready');

    // Only close button
    const buttonContainer = statusContainer.createDiv('modal-button-container');
    const closeBtn = buttonContainer.createEl('button', { text: 'Close', cls: 'mod-cta' });
    closeBtn.addEventListener('click', () => this.close());
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
    this.apiKeyInput.removeClass('success');
    this.apiKeyInput.removeClass('error');
    this.apiKeyInput.addClass('validating');

    try {
      // Use the dedicated validation service for real API testing
      // Force validation when user manually clicks button
      const result = await LLMValidationService.validateApiKey(
        this.config.providerId,
        apiKey,
        {
          forceValidation: true,  // Always validate fresh when user clicks button
          providerConfig: this.config.config,
          onValidationSuccess: (hash: string, timestamp: number) => {
            // Update config with validation state
            this.config.config.lastValidated = timestamp;
            this.config.config.validationHash = hash;
          }
        }
      );
      
      if (result.success) {
        // Mark as validated and auto-save
        this.isValidated = true;
        this.apiKeyInput.removeClass('validating');
        this.apiKeyInput.removeClass('error');
        this.apiKeyInput.addClass('success');

        // Auto-save the validated configuration
        this.config.config.apiKey = apiKey;
        this.config.config.enabled = true;
        this.autoSave();

        new Notice(`✅ ${this.config.providerName} API key validated successfully!`);
      } else {
        throw new Error(result.error || 'API key validation failed');
      }
      
    } catch (error) {
      console.error('API key validation failed:', error);
      
      this.isValidated = false;
      this.apiKeyInput.removeClass('validating');
      this.apiKeyInput.removeClass('success');
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
      // Use Obsidian's requestUrl to bypass CORS restrictions
      const serverResponse = await requestUrl({
        url: `${serverUrl}/api/tags`,
        method: 'GET'
      });

      if (serverResponse.status !== 200) {
        throw new Error(`Server not responding: ${serverResponse.status}`);
      }

      // Check if the model is available
      const serverData = serverResponse.json;
      const availableModels = serverData.models || [];
      const modelExists = availableModels.some((model: any) => model.name === modelName);

      if (!modelExists) {
        new Notice(`⚠️ Model '${modelName}' not found on server. Available models: ${availableModels.map((m: any) => m.name).join(', ') || 'none'}`);
        return;
      }

      // Test a simple generation request with the model
      const testResponse = await requestUrl({
        url: `${serverUrl}/api/generate`,
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

      if (testResponse.status !== 200) {
        throw new Error(`Model test failed: ${testResponse.status}`);
      }

      const testData = testResponse.json;
      if (testData.response) {
        new Notice(`✅ Ollama connection successful! Model '${modelName}' is working.`);

        // Mark as validated and auto-save
        this.isValidated = true;
        this.apiKeyInput.removeClass('validating');
        this.apiKeyInput.removeClass('error');
        this.apiKeyInput.addClass('success');

        // Auto-save the validated Ollama configuration
        this.config.config.apiKey = serverUrl;
        this.config.config.enabled = true;
        this.config.config.ollamaModel = this.ollamaModel;
        this.autoSave();
      } else {
        throw new Error('Model test returned invalid response');
      }

    } catch (error) {
      console.error('Ollama connection test failed:', error);
      
      this.isValidated = false;
      this.apiKeyInput.removeClass('validating');
      this.apiKeyInput.removeClass('success');
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
   * Test LM Studio connection and discover available models
   */
  private async testLMStudioConnection(): Promise<void> {
    const serverUrl = this.apiKeyInput.value.trim();

    if (!serverUrl) {
      new Notice('Please enter a server URL first');
      return;
    }

    // Validate URL format
    try {
      new URL(serverUrl);
    } catch (e) {
      new Notice('Please enter a valid URL (e.g., http://127.0.0.1:1234)');
      return;
    }

    // Show testing state
    if (this.testButton) {
      this.testButton.textContent = 'Discovering...';
      this.testButton.disabled = true;
    }

    try {
      // Query LM Studio's OpenAI-compatible /v1/models endpoint
      // Use Obsidian's requestUrl to bypass CORS restrictions
      const modelsResponse = await requestUrl({
        url: `${serverUrl}/v1/models`,
        method: 'GET'
      });

      if (modelsResponse.status !== 200) {
        throw new Error(`Server not responding: ${modelsResponse.status}. Make sure LM Studio server is running.`);
      }

      const modelsData = modelsResponse.json;

      if (!modelsData.data || !Array.isArray(modelsData.data)) {
        throw new Error('Invalid response format from LM Studio server');
      }

      // Extract model IDs
      this.lmstudioDiscoveredModels = modelsData.data.map((model: any) => model.id);

      if (this.lmstudioDiscoveredModels.length === 0) {
        new Notice('⚠️ No models loaded in LM Studio. Please load a model first.');
        return;
      }

      new Notice(`✅ LM Studio connection successful! Discovered ${this.lmstudioDiscoveredModels.length} model(s).`);

      // Mark as validated and auto-save
      this.isValidated = true;
      this.apiKeyInput.removeClass('validating');
      this.apiKeyInput.removeClass('error');
      this.apiKeyInput.addClass('success');

      // Auto-save the validated LM Studio configuration
      this.config.config.apiKey = serverUrl;
      this.config.config.enabled = true;
      this.autoSave();

      // Refresh the models section to show discovered models
      this.modelsContainer.empty();
      this.modelsContainer.createDiv('models-info').innerHTML = `
        <p><strong>ℹ️ LM Studio Model Discovery:</strong></p>
        <p>Models are automatically discovered from your LM Studio server:</p>
        <ol>
          <li>Start LM Studio and load your desired models</li>
          <li>Start the local server in LM Studio (usually on port 1234)</li>
          <li>Click "Discover Models" above to fetch available models</li>
          <li>Models will appear below once discovered</li>
        </ol>
        <p><strong>✅ Discovered Models (${this.lmstudioDiscoveredModels.length}):</strong></p>
        <ul>
          ${this.lmstudioDiscoveredModels.map(m => `<li><code>${m}</code></li>`).join('')}
        </ul>
      `;

    } catch (error) {
      console.error('LM Studio connection test failed:', error);

      this.isValidated = false;
      this.apiKeyInput.removeClass('validating');
      this.apiKeyInput.removeClass('success');
      this.apiKeyInput.addClass('error');

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      new Notice(`❌ LM Studio test failed: ${errorMessage}`);
    } finally {
      // Restore button state
      if (this.testButton) {
        this.testButton.textContent = 'Discover Models';
        this.testButton.disabled = false;
      }
    }
  }

  /**
   * Auto-save with debouncing and visual feedback
   */
  private autoSave(): void {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }

    this.showSaveStatus('Saving...');

    this.autoSaveTimeout = setTimeout(() => {
      // Update API key from current input
      const apiKey = this.apiKeyInput?.value?.trim();
      if (apiKey) {
        this.config.config.apiKey = apiKey;
      }

      // For Ollama, include model if available
      if (this.config.providerId === 'ollama' && this.ollamaModel) {
        this.config.config.ollamaModel = this.ollamaModel;
      }

      // Call the save callback
      this.config.onSave(this.config.config);
      this.showSaveStatus('Saved');

      // Reset status after 2 seconds
      setTimeout(() => {
        this.showSaveStatus('Ready');
      }, 2000);
    }, 500);
  }

  /**
   * Show save status with visual feedback
   */
  private showSaveStatus(status: string): void {
    if (this.saveStatusEl) {
      this.saveStatusEl.textContent = status;
      this.saveStatusEl.className = `save-status save-status-${status.toLowerCase()}`;
    }
  }
}