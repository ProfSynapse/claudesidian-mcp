/**
 * LLM Provider Configuration Modal
 * Modal-based editing for LLM provider settings and model descriptions
 */

import { Modal, App, Setting, ButtonComponent, Notice, requestUrl } from 'obsidian';
import { LLMProviderConfig, ModelConfig } from '../types';
import { LLMProviderManager } from '../services/llm/providers/ProviderManager';
import { StaticModelsService, ModelWithProvider } from '../services/StaticModelsService';
import { LLMValidationService } from '../services/llm/validation/ValidationService';
import { WebLLMVRAMDetector } from '../services/llm/adapters/webllm/WebLLMVRAMDetector';
import { VRAMInfo, DownloadProgress, WebLLMModelSpec } from '../services/llm/adapters/webllm/types';
import { WEBLLM_MODELS, getModelsForVRAM, getWebLLMModel } from '../services/llm/adapters/webllm/WebLLMModels';
import { WebLLMModelManager } from '../services/llm/adapters/webllm/WebLLMModelManager';
import { WebLLMAdapter } from '../services/llm/adapters/webllm/WebLLMAdapter';

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
  private webllmVramInfo: VRAMInfo | null = null; // WebLLM VRAM detection info
  private webllmSelectedModel: string = ''; // Selected WebLLM model
  private webllmSelectedQuantization: 'q4f16' | 'q5f16' | 'q8f16' = 'q4f16'; // Selected quantization
  private autoSaveTimeout: NodeJS.Timeout | null = null;
  private saveStatusEl?: HTMLElement;
  private webllmModelManager: WebLLMModelManager | null = null; // WebLLM model manager
  private webllmAdapter: WebLLMAdapter | null = null; // WebLLM adapter for direct loading
  private webllmIsDownloading: boolean = false; // Download in progress flag
  private webllmDownloadContainer?: HTMLElement; // Container for download UI

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

    // Initialize WebLLM settings if editing existing config
    if (this.config.providerId === 'webllm') {
      this.webllmSelectedModel = this.config.config.webllmModel || 'nexus-tools-q4f16';
      this.webllmSelectedQuantization = this.config.config.webllmQuantization || 'q4f16';
      // Initialize model manager with vault
      this.webllmModelManager = new WebLLMModelManager(this.app.vault);
      // Initialize adapter for direct model loading (WebLLM handles its own caching)
      this.webllmAdapter = new WebLLMAdapter(this.app.vault);
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
    } else if (this.config.providerId === 'webllm') {
      // Special handling for Nexus (Local) - no API key, VRAM detection instead
      section.createEl('h2', { text: 'Device Status' });

      const statusContainer = section.createDiv('webllm-status-container');
      statusContainer.innerHTML = `<p>🔍 Checking device compatibility...</p>`;

      // Async VRAM detection
      this.detectWebGPUCapabilities(statusContainer);

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
    } else if (this.config.providerId === 'webllm') {
      // Special handling for WebLLM - model/quantization selection
      // Show loading state while checking installation status
      this.modelsContainer.createDiv('setting-item-description').setText('Loading model status...');
      this.createWebLLMModelsSection();
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
   * Detect WebGPU capabilities and display status
   */
  private async detectWebGPUCapabilities(container: HTMLElement): Promise<void> {
    try {
      this.webllmVramInfo = await WebLLMVRAMDetector.detect();

      container.empty();

      if (!this.webllmVramInfo.webGPUSupported) {
        container.innerHTML = `
          <div class="webllm-status webllm-status-error">
            <p><strong>❌ Device Not Compatible</strong></p>
            <p>Nexus requires WebGPU support for local inference. Your system does not support WebGPU.</p>
            <p><strong>Requirements:</strong></p>
            <ul>
              <li>Chrome 113+ or Edge 113+ (recommended)</li>
              <li>Safari 17+ on macOS Sonoma or later</li>
              <li>Firefox with WebGPU flag enabled</li>
            </ul>
          </div>
        `;
        return;
      }

      const vramGB = this.webllmVramInfo.estimatedVRAM.toFixed(1);
      const gpuName = this.webllmVramInfo.gpuName || 'Unknown GPU';
      const quantizations = this.webllmVramInfo.recommendedQuantizations;

      if (quantizations.length === 0) {
        container.innerHTML = `
          <div class="webllm-status webllm-status-warning">
            <p><strong>⚠️ Insufficient GPU Memory</strong></p>
            <p><strong>GPU:</strong> ${gpuName}</p>
            <p><strong>Estimated Memory:</strong> ~${vramGB} GB</p>
            <p>Minimum 5GB GPU memory required. Nexus may not run well on this system.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="webllm-status webllm-status-success">
          <p><strong>✅ Device Compatible</strong></p>
          <p><strong>GPU:</strong> ${gpuName}</p>
          <p><strong>Estimated Memory:</strong> ~${vramGB} GB</p>
        </div>
      `;

      // Auto-enable when WebGPU is available
      if (!this.config.config.enabled && quantizations.length > 0) {
        this.config.config.enabled = true;
        this.autoSave();
      }

      // Refresh the models section now that we have VRAM info
      this.createWebLLMModelsSection();

    } catch (error) {
      console.error('WebGPU detection failed:', error);
      container.innerHTML = `
        <div class="webllm-status webllm-status-error">
          <p><strong>❌ Detection Failed</strong></p>
          <p>${error instanceof Error ? error.message : 'Unknown error during WebGPU detection'}</p>
        </div>
      `;
    }
  }

  /**
   * Create WebLLM model selection section with download UI
   */
  private async createWebLLMModelsSection(): Promise<void> {
    this.modelsContainer.empty();

    // Get available models based on VRAM
    const estimatedVRAM = this.webllmVramInfo?.estimatedVRAM || 0;
    const availableModels = getModelsForVRAM(estimatedVRAM);

    if (availableModels.length === 0) {
      this.modelsContainer.createDiv('setting-item-description').setText(
        'Your GPU does not have enough memory for Nexus. Minimum 5GB required.'
      );
      return;
    }

    // Check if model is already loaded in the adapter
    const selectedModel = getWebLLMModel(this.webllmSelectedModel) || availableModels[0];
    // WebLLM uses browser Cache API for caching - we check adapter state, not local files
    const isLoaded = this.webllmAdapter?.isModelLoaded() ?? false;

    // Model selection dropdown
    new Setting(this.modelsContainer)
      .setName('Model')
      .setDesc('Select the Nexus model variant')
      .addDropdown(dropdown => {
        availableModels.forEach(model => {
          dropdown.addOption(model.id, `${model.name} (~${model.vramRequired}GB)`);
        });

        dropdown.setValue(this.webllmSelectedModel || availableModels[0].id);
        dropdown.onChange(async value => {
          this.webllmSelectedModel = value;

          // Extract quantization from model ID
          const match = value.match(/(q[458]f16)/);
          if (match) {
            this.webllmSelectedQuantization = match[1] as 'q4f16' | 'q5f16' | 'q8f16';
          }

          this.config.config.webllmModel = value;
          this.config.config.webllmQuantization = this.webllmSelectedQuantization;
          this.autoSave();

          // Refresh to show updated install status
          await this.createWebLLMModelsSection();
        });
      });

    // Download/Status section
    this.webllmDownloadContainer = this.modelsContainer.createDiv('webllm-download-section');

    if (isLoaded) {
      // Model is loaded - show status and unload option
      this.renderWebLLMLoadedState(selectedModel);
    } else {
      // Model not loaded - show load button
      this.renderWebLLMDownloadButton(selectedModel);
    }

    // Feature info (collapsible style like Obsidian)
    const infoEl = this.modelsContainer.createDiv('setting-item');
    const infoDesc = infoEl.createDiv('setting-item-description');
    infoDesc.style.marginTop = '1em';
    infoDesc.innerHTML = `
      <details>
        <summary style="cursor: pointer; font-weight: 500;">About Nexus</summary>
        <div style="margin-top: 0.5em; padding-left: 1em;">
          <p>A fine-tuned model optimized for Nexus's tool system. Runs entirely on your device.</p>
          <ul style="margin: 0.5em 0;">
            <li>Trained specifically for tool calling</li>
            <li>Works offline after download</li>
            <li>Complete privacy - no data leaves your vault</li>
            <li>Free - no API costs</li>
          </ul>
        </div>
      </details>
    `;
  }

  /**
   * Render the loaded state UI for WebLLM
   */
  private renderWebLLMLoadedState(model: WebLLMModelSpec): void {
    if (!this.webllmDownloadContainer) return;
    this.webllmDownloadContainer.empty();

    const statusSetting = new Setting(this.webllmDownloadContainer)
      .setName('Model Status')
      .setDesc(`${model.name} is loaded in GPU memory and ready to use`);

    // Add a checkmark indicator
    const statusEl = statusSetting.settingEl.createDiv('webllm-status-indicator');
    statusEl.innerHTML = '<span style="color: var(--text-success);">✓ Loaded</span>';
    statusEl.style.marginLeft = 'auto';
    statusEl.style.marginRight = '1em';

    // Unload button (frees GPU memory, model stays cached in browser)
    statusSetting.addButton(button => button
      .setButtonText('Unload')
      .setWarning()
      .onClick(async () => {
        if (this.webllmAdapter) {
          button.setButtonText('Unloading...');
          button.setDisabled(true);

          try {
            await this.webllmAdapter.unloadModel();
            new Notice(`Model ${model.name} unloaded from GPU memory`);

            // Refresh UI
            await this.createWebLLMModelsSection();
          } catch (error) {
            new Notice(`Failed to unload model: ${error instanceof Error ? error.message : 'Unknown error'}`);
            button.setButtonText('Unload');
            button.setDisabled(false);
          }
        }
      })
    );

    // Clear cache button - add after status setting
    this.addClearCacheButton(this.webllmDownloadContainer!, model);
  }

  /**
   * Add a clear cache button for WebLLM
   */
  private addClearCacheButton(container: HTMLElement, model: WebLLMModelSpec): void {
    const cacheSetting = new Setting(container)
      .setName('Clear Model Cache')
      .setDesc('Delete cached model files and re-download fresh from HuggingFace');

    cacheSetting.addButton(button => button
      .setButtonText('Clear Cache')
      .onClick(async () => {
        button.setButtonText('Clearing...');
        button.setDisabled(true);

        try {
          // Unload model first if loaded
          if (this.webllmAdapter?.isModelLoaded()) {
            await this.webllmAdapter.unloadModel();
          }

          // Clear browser caches used by WebLLM
          await this.clearWebLLMCache();

          new Notice('WebLLM cache cleared. Model will be re-downloaded on next load.');

          // Refresh UI
          await this.createWebLLMModelsSection();
        } catch (error) {
          new Notice(`Failed to clear cache: ${error instanceof Error ? error.message : 'Unknown error'}`);
          button.setButtonText('Clear Cache');
          button.setDisabled(false);
        }
      })
    );
  }

  /**
   * Clear WebLLM browser caches (Cache API and IndexedDB)
   */
  private async clearWebLLMCache(): Promise<void> {
    // Clear Cache API entries
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        // WebLLM uses caches with 'webllm' or 'tvmjs' in the name
        if (name.includes('webllm') || name.includes('tvmjs') || name.includes('mlc')) {
          await caches.delete(name);
          console.log(`[WebLLM] Deleted cache: ${name}`);
        }
      }
    }

    // Clear IndexedDB databases used by WebLLM
    if ('indexedDB' in window) {
      const databases = await indexedDB.databases?.() || [];
      for (const db of databases) {
        if (db.name && (db.name.includes('webllm') || db.name.includes('tvmjs') || db.name.includes('mlc'))) {
          indexedDB.deleteDatabase(db.name);
          console.log(`[WebLLM] Deleted IndexedDB: ${db.name}`);
        }
      }
    }
  }

  /**
   * Render the load button UI for WebLLM
   */
  private renderWebLLMDownloadButton(model: WebLLMModelSpec): void {
    if (!this.webllmDownloadContainer) return;
    this.webllmDownloadContainer.empty();

    const downloadSetting = new Setting(this.webllmDownloadContainer)
      .setName('Load Model')
      .setDesc(`Load ${model.name} into GPU memory. First load downloads ~4GB from HuggingFace.`);

    downloadSetting.addButton(button => button
      .setButtonText('Load Model')
      .setCta()
      .onClick(async () => {
        if (this.webllmIsDownloading) return;

        this.webllmIsDownloading = true;
        button.setDisabled(true);
        button.setButtonText('Starting...');

        // Replace button with progress UI
        this.renderWebLLMDownloadProgress(model);
      })
    );

    // Add clear cache button for when model is not loaded
    this.addClearCacheButton(this.webllmDownloadContainer!, model);
  }

  /**
   * Render the download progress UI for WebLLM
   * Uses WebLLM's native model loading which downloads via browser Cache API
   */
  private renderWebLLMDownloadProgress(model: WebLLMModelSpec): void {
    if (!this.webllmDownloadContainer || !this.webllmAdapter) return;
    this.webllmDownloadContainer.empty();

    // Create progress container
    const progressContainer = this.webllmDownloadContainer.createDiv('webllm-progress-container');
    progressContainer.style.padding = '1em 0';

    // Status text
    const statusText = progressContainer.createDiv('webllm-progress-status');
    statusText.style.marginBottom = '0.5em';
    statusText.style.fontSize = '0.9em';
    statusText.setText('Initializing WebLLM engine...');

    // Progress bar container (Obsidian style)
    const progressBarContainer = progressContainer.createDiv('webllm-progress-bar-container');
    progressBarContainer.style.height = '4px';
    progressBarContainer.style.backgroundColor = 'var(--background-modifier-border)';
    progressBarContainer.style.borderRadius = '2px';
    progressBarContainer.style.overflow = 'hidden';

    // Progress bar fill
    const progressBarFill = progressBarContainer.createDiv('webllm-progress-bar-fill');
    progressBarFill.style.height = '100%';
    progressBarFill.style.backgroundColor = 'var(--interactive-accent)';
    progressBarFill.style.width = '0%';
    progressBarFill.style.transition = 'width 0.3s ease';

    // Progress percentage
    const progressPercent = progressContainer.createDiv('webllm-progress-percent');
    progressPercent.style.marginTop = '0.5em';
    progressPercent.style.fontSize = '0.85em';
    progressPercent.style.color = 'var(--text-muted)';
    progressPercent.setText('0%');

    // Show initial notice that download has started
    new Notice(`Loading Nexus model... First load downloads ~4GB from HuggingFace.`, 5000);

    // Track last progress update for periodic notices
    let lastNoticePercent = 0;

    // Initialize adapter first
    this.webllmAdapter.initialize().then(() => {
      // Load model using WebLLM's native mechanism (downloads via browser Cache API)
      return this.webllmAdapter!.loadModel(model, (progress: number, stage: string) => {
        const percent = Math.round(progress * 100);

        // Update modal UI (if still open)
        try {
          progressBarFill.style.width = `${percent}%`;
          progressPercent.setText(`${percent}%`);
          statusText.setText(`${stage}: ${percent}%`);
        } catch {
          // Modal might be closed, ignore UI update errors
        }

        // Show periodic notice every 25% progress
        if (percent >= lastNoticePercent + 25) {
          lastNoticePercent = Math.floor(percent / 25) * 25;
          if (percent < 100) {
            new Notice(`Nexus: ${stage} ${percent}%`, 3000);
          }
        }
      });
    }).then(async () => {
      // Model loaded successfully
      this.webllmIsDownloading = false;

      // Show success notice (always visible even if modal closed)
      new Notice(`✅ Nexus loaded successfully! Ready for local inference.`, 10000);

      // Enable the provider
      this.config.config.enabled = true;
      this.config.config.webllmModel = model.id;
      this.config.config.webllmQuantization = model.quantization;
      this.autoSave();

      // Try to refresh UI (if modal still open)
      try {
        await this.createWebLLMModelsSection();
      } catch {
        // Modal might be closed, ignore
      }
    }).catch(error => {
      // Loading failed
      this.webllmIsDownloading = false;
      console.error('Nexus loading failed:', error);

      // Show error notice (always visible)
      new Notice(`❌ Nexus loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 10000);

      // Try to show download button again (if modal still open)
      try {
        this.renderWebLLMDownloadButton(model);
      } catch {
        // Modal might be closed, ignore
      }
    });
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

      // For WebLLM, include model and quantization settings
      if (this.config.providerId === 'webllm') {
        this.config.config.webllmModel = this.webllmSelectedModel;
        this.config.config.webllmQuantization = this.webllmSelectedQuantization;
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
