/**
 * ModelSelector - Dropdown for selecting LLM models from validated providers
 * 
 * Displays available models from providers that have valid API keys.
 * Updates the chat service with the selected model for subsequent requests.
 */

export interface ModelOption {
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
  contextWindow: number;
}

export class ModelSelector {
  private element: HTMLElement | null = null;
  private selectElement: HTMLSelectElement | null = null;
  private currentModel: ModelOption | null = null;

  constructor(
    private container: HTMLElement,
    private onModelChange: (model: ModelOption) => void,
    private getAvailableModels: () => Promise<ModelOption[]>
  ) {
    this.render();
  }

  /**
   * Render the model selector dropdown
   */
  private async render(): Promise<void> {
    this.container.empty();
    this.container.addClass('model-selector');

    // Label
    const label = this.container.createDiv('model-selector-label');
    label.textContent = 'Model:';

    // Dropdown container
    const dropdownContainer = this.container.createDiv('model-selector-dropdown');
    
    this.selectElement = dropdownContainer.createEl('select', {
      cls: 'model-select'
    });

    // Add default option
    const defaultOption = this.selectElement.createEl('option', {
      value: '',
      text: 'Loading models...'
    });
    defaultOption.disabled = true;
    defaultOption.selected = true;

    // Load and populate models
    await this.loadModels();

    // Handle selection changes
    this.selectElement.addEventListener('change', () => {
      this.handleModelChange();
    });

    this.element = this.container;
  }

  /**
   * Load available models from validated providers
   */
  private async loadModels(): Promise<void> {
    if (!this.selectElement) return;

    try {
      const models = await this.getAvailableModels();
      
      // Clear loading option
      this.selectElement.innerHTML = '';
      
      if (models.length === 0) {
        const noModelsOption = this.selectElement.createEl('option', {
          value: '',
          text: 'No models available'
        });
        noModelsOption.disabled = true;
        noModelsOption.selected = true;
        return;
      }

      // Add default selection option
      const defaultOption = this.selectElement.createEl('option', {
        value: '',
        text: 'Select model...'
      });

      // Group models by provider
      const modelsByProvider = new Map<string, ModelOption[]>();
      models.forEach(model => {
        if (!modelsByProvider.has(model.providerId)) {
          modelsByProvider.set(model.providerId, []);
        }
        modelsByProvider.get(model.providerId)!.push(model);
      });

      // Add models grouped by provider
      modelsByProvider.forEach((providerModels, providerId) => {
        const optgroup = this.selectElement!.createEl('optgroup', {
          attr: { label: providerModels[0].providerName }
        });

        providerModels.forEach(model => {
          const option = optgroup.createEl('option', {
            value: `${model.providerId}:${model.modelId}`,
            text: `${model.modelName} (${Math.round(model.contextWindow / 1000)}k)`
          });
        });
      });

      // Select first model by default
      if (models.length > 0) {
        const firstModel = models[0];
        this.selectElement.value = `${firstModel.providerId}:${firstModel.modelId}`;
        this.currentModel = firstModel;
        this.onModelChange(firstModel);
      }

    } catch (error) {
      console.error('[ModelSelector] Failed to load models:', error);
      
      if (this.selectElement) {
        this.selectElement.innerHTML = '';
        const errorOption = this.selectElement.createEl('option', {
          value: '',
          text: 'Error loading models'
        });
        errorOption.disabled = true;
        errorOption.selected = true;
      }
    }
  }

  /**
   * Handle model selection change
   */
  private handleModelChange(): void {
    if (!this.selectElement) return;

    const selectedValue = this.selectElement.value;
    if (!selectedValue) return;

    const [providerId, modelId] = selectedValue.split(':');
    
    // Find the selected model
    this.getAvailableModels().then(models => {
      const selectedModel = models.find(
        m => m.providerId === providerId && m.modelId === modelId
      );
      
      if (selectedModel) {
        this.currentModel = selectedModel;
        this.onModelChange(selectedModel);
      }
    });
  }

  /**
   * Get currently selected model
   */
  getCurrentModel(): ModelOption | null {
    return this.currentModel;
  }

  /**
   * Set the selected model programmatically
   */
  setModel(providerId: string, modelId: string): void {
    if (!this.selectElement) return;

    const value = `${providerId}:${modelId}`;
    const option = this.selectElement.querySelector(`option[value="${value}"]`);
    
    if (option) {
      this.selectElement.value = value;
      this.handleModelChange();
    }
  }

  /**
   * Refresh the model list
   */
  async refresh(): Promise<void> {
    await this.loadModels();
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.element = null;
    this.selectElement = null;
    this.currentModel = null;
  }
}