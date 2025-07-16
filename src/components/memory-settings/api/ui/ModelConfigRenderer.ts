/**
 * ModelConfigRenderer - Handles model configuration UI rendering
 * Follows Single Responsibility Principle by focusing only on model config
 */

import { Notice, Setting } from 'obsidian';
import { EmbeddingProviderRegistry } from '../../../../database/providers/registry/EmbeddingProviderRegistry';
import { SettingsValidator } from '../services/SettingsValidator';
import { EmbeddingChecker } from '../services/EmbeddingChecker';

export interface ModelConfigContext {
    embeddingsExist: boolean;
    app: any;
    onSettingsChanged?: () => void;
    onSaveSettings: () => Promise<void>;
    onRefreshDisplay: () => void;
}

/**
 * Service responsible for rendering model configuration UI
 * Follows SRP by focusing only on model config operations
 */
export class ModelConfigRenderer {
    constructor(
        private settings: any,
        private settingsValidator: SettingsValidator,
        private embeddingChecker: EmbeddingChecker
    ) {}

    /**
     * Render model configuration section
     */
    async render(containerEl: HTMLElement, context: ModelConfigContext): Promise<void> {
        // Render model dropdown
        await this.renderModelDropdown(containerEl, context);

        // Render dimensions display
        await this.renderDimensionsDisplay(containerEl, context);

        // Render dimension mismatch warning if applicable
        await this.renderDimensionWarning(containerEl, context);

        // Render model information
        await this.renderModelInfo(containerEl, context);
    }

    /**
     * Render model dropdown
     */
    private async renderModelDropdown(containerEl: HTMLElement, context: ModelConfigContext): Promise<void> {
        const provider = EmbeddingProviderRegistry.getProvider(this.settings.apiProvider);
        
        if (!provider || !provider.models.length) {
            return;
        }

        const providerSettings = this.settings.providerSettings?.[this.settings.apiProvider];
        
        new Setting(containerEl)
            .setName('Model')
            .setDesc('Select the embedding model to use')
            .addDropdown(dropdown => {
                provider.models.forEach(model => {
                    dropdown.addOption(model.id, `${model.name} (${model.dimensions} dims)`);
                });
                
                dropdown.setValue(providerSettings?.model || provider.models[0].id);
                dropdown.onChange(async (value) => {
                    await this.handleModelChange(value, context);
                });
            });
    }

    /**
     * Handle model change
     */
    private async handleModelChange(value: string, context: ModelConfigContext): Promise<void> {
        const provider = EmbeddingProviderRegistry.getProvider(this.settings.apiProvider);
        
        if (!provider) {
            return;
        }

        const selectedModel = provider.models.find(m => m.id === value);
        
        if (!selectedModel) {
            return;
        }

        // Check for dimension mismatch if embeddings exist
        if (context.embeddingsExist) {
            const confirmed = await this.confirmModelChange(selectedModel, context);
            if (!confirmed) {
                return;
            }
        }

        // Update settings
        this.settingsValidator.ensureProviderSettings(this.settings);
        
        if (!this.settings.providerSettings[this.settings.apiProvider]) {
            this.settings.providerSettings[this.settings.apiProvider] = {};
        }
        
        this.settings.providerSettings[this.settings.apiProvider].model = value;
        this.settings.providerSettings[this.settings.apiProvider].dimensions = selectedModel.dimensions;

        // Save settings
        await context.onSaveSettings();

        // Refresh display
        context.onRefreshDisplay();

        // Show feedback
        new Notice(`Model changed to ${selectedModel.name}`, 3000);
    }

    /**
     * Render dimensions display
     */
    private async renderDimensionsDisplay(containerEl: HTMLElement, context: ModelConfigContext): Promise<void> {
        const provider = EmbeddingProviderRegistry.getProvider(this.settings.apiProvider);
        
        if (!provider) {
            return;
        }

        const providerSettings = this.settings.providerSettings?.[this.settings.apiProvider];
        const selectedModel = provider.models.find(m => m.id === providerSettings?.model);
        
        if (!selectedModel) {
            return;
        }

        new Setting(containerEl)
            .setName('Dimensions')
            .setDesc('Vector dimensions for the selected model')
            .addText(text => {
                text.setValue(selectedModel.dimensions.toString());
                text.setDisabled(true);
            });
    }

    /**
     * Render dimension warning if applicable
     */
    private async renderDimensionWarning(containerEl: HTMLElement, context: ModelConfigContext): Promise<void> {
        if (!context.embeddingsExist) {
            return;
        }

        const dimensionValidation = this.settingsValidator.validateDimensions(
            this.settings,
            this.settings.apiProvider,
            context.embeddingsExist
        );

        if (dimensionValidation.isValid) {
            return;
        }

        const warningEl = containerEl.createEl('div', { cls: 'dimension-warning' });
        warningEl.createEl('p', { 
            text: '⚠️ Dimension Mismatch Warning',
            cls: 'warning-title'
        });
        warningEl.createEl('p', { 
            text: dimensionValidation.error,
            cls: 'warning-message'
        });
        warningEl.createEl('p', { 
            text: 'You may need to delete existing embeddings before changing models.',
            cls: 'warning-suggestion'
        });
    }

    /**
     * Render model information
     */
    private async renderModelInfo(containerEl: HTMLElement, context: ModelConfigContext): Promise<void> {
        const provider = EmbeddingProviderRegistry.getProvider(this.settings.apiProvider);
        
        if (!provider) {
            return;
        }

        const providerSettings = this.settings.providerSettings?.[this.settings.apiProvider];
        const selectedModel = provider.models.find(m => m.id === providerSettings?.model);
        
        if (!selectedModel) {
            return;
        }

        const infoContainer = containerEl.createEl('div', { cls: 'model-info' });
        
        infoContainer.createEl('h4', { text: 'Model Information' });
        
        const infoList = infoContainer.createEl('ul', { cls: 'model-info-list' });
        
        // Model name
        infoList.createEl('li').innerHTML = `<strong>Name:</strong> ${selectedModel.name}`;
        
        // Dimensions
        infoList.createEl('li').innerHTML = `<strong>Dimensions:</strong> ${selectedModel.dimensions}`;
        
        // Model ID
        infoList.createEl('li').innerHTML = `<strong>Model ID:</strong> ${selectedModel.id}`;
        
        // Context length (if available)
        if ((selectedModel as any).contextLength) {
            infoList.createEl('li').innerHTML = `<strong>Context Length:</strong> ${(selectedModel as any).contextLength}`;
        }
        
        // Description (if available)
        if (selectedModel.description) {
            infoList.createEl('li').innerHTML = `<strong>Description:</strong> ${selectedModel.description}`;
        }
        
        // Performance info (if available)
        if ((selectedModel as any).performance) {
            const perfInfo = infoList.createEl('li');
            perfInfo.innerHTML = '<strong>Performance:</strong>';
            const perfList = perfInfo.createEl('ul');
            
            Object.entries((selectedModel as any).performance).forEach(([key, value]) => {
                perfList.createEl('li').innerHTML = `${key}: ${value}`;
            });
        }
    }

    /**
     * Confirm model change when embeddings exist
     */
    private async confirmModelChange(selectedModel: any, context: ModelConfigContext): Promise<boolean> {
        const provider = EmbeddingProviderRegistry.getProvider(this.settings.apiProvider);
        const providerSettings = this.settings.providerSettings?.[this.settings.apiProvider];
        
        if (!provider || !providerSettings) {
            return true;
        }

        const currentModel = provider.models.find(m => m.id === providerSettings.model);
        
        if (!currentModel) {
            return true;
        }

        // Check for dimension mismatch
        const dimensionMismatch = currentModel.dimensions !== selectedModel.dimensions;
        
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-container">
                    <div class="modal-bg"></div>
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>Confirm Model Change</h3>
                        </div>
                        <div class="modal-body">
                            <p>You are changing from <strong>${currentModel.name}</strong> to <strong>${selectedModel.name}</strong>.</p>
                            ${dimensionMismatch ? `
                                <p><strong>⚠️ Dimension Mismatch:</strong></p>
                                <p>Current: ${currentModel.dimensions} dimensions</p>
                                <p>New: ${selectedModel.dimensions} dimensions</p>
                                <p>Your existing embeddings will be incompatible with the new model.</p>
                            ` : ''}
                            <p>You may need to rebuild your embeddings after this change.</p>
                        </div>
                        <div class="modal-footer">
                            <button class="mod-cta" id="confirm-model-change">Continue</button>
                            <button id="cancel-model-change">Cancel</button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            const confirmButton = modal.querySelector('#confirm-model-change') as HTMLButtonElement;
            const cancelButton = modal.querySelector('#cancel-model-change') as HTMLButtonElement;
            
            const cleanup = () => {
                document.body.removeChild(modal);
            };
            
            confirmButton.onclick = () => {
                cleanup();
                resolve(true);
            };
            
            cancelButton.onclick = () => {
                cleanup();
                resolve(false);
            };
            
            // Close on background click
            const modalBg = modal.querySelector('.modal-bg') as HTMLElement;
            modalBg.onclick = () => {
                cleanup();
                resolve(false);
            };
        });
    }

    /**
     * Get model configuration status
     */
    getModelStatus(): {
        provider: string;
        model: string;
        dimensions: number;
        configured: boolean;
        dimensionMismatch: boolean;
        errorMessage?: string;
    } {
        const provider = EmbeddingProviderRegistry.getProvider(this.settings.apiProvider);
        
        if (!provider) {
            return {
                provider: this.settings.apiProvider,
                model: '',
                dimensions: 0,
                configured: false,
                dimensionMismatch: false,
                errorMessage: 'Unknown provider'
            };
        }

        const providerSettings = this.settings.providerSettings?.[this.settings.apiProvider];
        
        if (!providerSettings || !providerSettings.model) {
            return {
                provider: provider.name,
                model: '',
                dimensions: 0,
                configured: false,
                dimensionMismatch: false,
                errorMessage: 'No model selected'
            };
        }

        const selectedModel = provider.models.find(m => m.id === providerSettings.model);
        
        if (!selectedModel) {
            return {
                provider: provider.name,
                model: providerSettings.model,
                dimensions: providerSettings.dimensions || 0,
                configured: false,
                dimensionMismatch: false,
                errorMessage: 'Selected model not found'
            };
        }

        const dimensionValidation = this.settingsValidator.validateDimensions(
            this.settings,
            this.settings.apiProvider,
            true // Assume embeddings exist for validation
        );

        return {
            provider: provider.name,
            model: selectedModel.name,
            dimensions: selectedModel.dimensions,
            configured: true,
            dimensionMismatch: !dimensionValidation.isValid,
            errorMessage: dimensionValidation.error
        };
    }
}