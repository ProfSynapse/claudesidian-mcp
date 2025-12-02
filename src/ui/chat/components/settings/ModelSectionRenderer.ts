/**
 * ModelSectionRenderer - Renders model selection section
 *
 * Handles the LLM model dropdown for chat settings.
 * Groups models by provider for easier selection.
 */

import { Setting } from 'obsidian';
import { ISectionRenderer, ChatSettingsState, ChatSettingsDependencies } from './types';
import { ModelOption } from '../ModelSelector';

export class ModelSectionRenderer implements ISectionRenderer {
  private modelDropdown: HTMLSelectElement | null = null;

  constructor(
    private state: ChatSettingsState,
    private deps: ChatSettingsDependencies
  ) {}

  render(container: HTMLElement): void {
    new Setting(container)
      .setName('Model')
      .setDesc('Select the LLM model for this chat')
      .addDropdown(dropdown => {
        this.modelDropdown = dropdown.selectEl;

        // Add default option
        dropdown.addOption('', 'Select model...');

        if (this.state.availableModels.length === 0) {
          dropdown.addOption('', 'No models available');
          dropdown.setDisabled(true);
          return;
        }

        // Group models by provider
        const modelsByProvider = new Map<string, ModelOption[]>();
        this.state.availableModels.forEach(model => {
          if (!modelsByProvider.has(model.providerId)) {
            modelsByProvider.set(model.providerId, []);
          }
          modelsByProvider.get(model.providerId)!.push(model);
        });

        // Add models grouped by provider
        // Note: Obsidian Setting dropdown doesn't support optgroups
        // So we prefix with provider name
        modelsByProvider.forEach((providerModels, providerId) => {
          providerModels.forEach(model => {
            const value = `${model.providerId}:${model.modelId}`;
            const label = `${model.providerName} - ${model.modelName} (${Math.round(model.contextWindow / 1000)}k)`;
            dropdown.addOption(value, label);
          });
        });

        // Set current value
        if (this.state.selectedModel) {
          const currentValue = `${this.state.selectedModel.providerId}:${this.state.selectedModel.modelId}`;
          dropdown.setValue(currentValue);
        }

        // Handle changes
        dropdown.onChange((value) => {
          this.handleModelChange(value);
        });
      });
  }

  private handleModelChange(value: string): void {
    if (!value) {
      this.state.selectedModel = null;
      this.deps.onModelChange?.(null);
      return;
    }

    // Split on first colon only to handle model IDs that contain colons
    // (e.g., "ollama:mistral:latest")
    const colonIndex = value.indexOf(':');
    if (colonIndex === -1) {
      return;
    }

    const providerId = value.substring(0, colonIndex);
    const modelId = value.substring(colonIndex + 1);

    const model = this.state.availableModels.find(
      m => m.providerId === providerId && m.modelId === modelId
    );

    if (model) {
      this.state.selectedModel = model;
      this.deps.onModelChange?.(model);
    }
  }

  update(): void {
    if (this.modelDropdown && this.state.selectedModel) {
      const currentValue = `${this.state.selectedModel.providerId}:${this.state.selectedModel.modelId}`;
      this.modelDropdown.value = currentValue;
    }
  }

  destroy(): void {
    this.modelDropdown = null;
  }
}
