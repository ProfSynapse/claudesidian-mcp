/**
 * NexusProviderModal
 *
 * Provider modal for Nexus (WebLLM) - local GPU-accelerated inference.
 * Handles GPU detection, model download/load lifecycle, and cache management.
 *
 * States:
 * - Not Downloaded: Model not in browser cache
 * - Downloaded: Model cached in browser, not loaded to GPU
 * - Loaded: Model in GPU memory, ready for inference
 */

import { Setting, Notice } from 'obsidian';
import {
  IProviderModal,
  ProviderModalConfig,
  ProviderModalDependencies,
  NexusModelState,
} from '../types';
import { WebLLMVRAMDetector } from '../../../services/llm/adapters/webllm/WebLLMVRAMDetector';
import { WebLLMAdapter } from '../../../services/llm/adapters/webllm/WebLLMAdapter';
import { VRAMInfo, WebLLMModelSpec } from '../../../services/llm/adapters/webllm/types';
import { WEBLLM_MODELS, getModelsForVRAM, getWebLLMModel } from '../../../services/llm/adapters/webllm/WebLLMModels';

export class NexusProviderModal implements IProviderModal {
  private config: ProviderModalConfig;
  private deps: ProviderModalDependencies;

  // UI containers
  private container: HTMLElement | null = null;
  private statusContainer: HTMLElement | null = null;
  private modelsContainer: HTMLElement | null = null;
  private actionContainer: HTMLElement | null = null;

  // State
  private vramInfo: VRAMInfo | null = null;
  private adapter: WebLLMAdapter | null = null;
  private selectedModelId: string = '';
  private selectedQuantization: 'q4f16' | 'q5f16' | 'q8f16' = 'q4f16';
  private isDownloading: boolean = false;
  private modelState: NexusModelState = 'not_downloaded';

  constructor(config: ProviderModalConfig, deps: ProviderModalDependencies) {
    this.config = config;
    this.deps = deps;

    // Initialize from existing config
    this.selectedModelId = config.config.webllmModel || WEBLLM_MODELS[0]?.id || '';
    this.selectedQuantization = config.config.webllmQuantization || 'q4f16';

    // Create adapter
    this.adapter = new WebLLMAdapter(deps.vault);
  }

  /**
   * Render the Nexus provider configuration UI
   */
  render(container: HTMLElement): void {
    this.container = container;
    container.empty();

    // Section: Device Status
    container.createEl('h2', { text: 'Device Status' });
    this.statusContainer = container.createDiv('nexus-status-container');
    this.statusContainer.innerHTML = '<p>Checking device compatibility...</p>';

    // Section: Model Selection
    container.createEl('h2', { text: 'Model' });
    this.modelsContainer = container.createDiv('nexus-models-container');

    // Detect GPU capabilities
    this.detectGPUCapabilities();
  }

  /**
   * Detect WebGPU capabilities and update UI
   */
  private async detectGPUCapabilities(): Promise<void> {
    if (!this.statusContainer) return;

    try {
      this.vramInfo = await WebLLMVRAMDetector.detect();

      this.statusContainer.empty();

      if (!this.vramInfo.webGPUSupported) {
        this.renderUnsupportedStatus();
        return;
      }

      const vramGB = this.vramInfo.estimatedVRAM.toFixed(1);
      const gpuName = this.vramInfo.gpuName || 'Unknown GPU';
      const quantizations = this.vramInfo.recommendedQuantizations;

      if (quantizations.length === 0) {
        this.renderInsufficientMemoryStatus(gpuName, vramGB);
        return;
      }

      this.renderCompatibleStatus(gpuName, vramGB);

      // Auto-enable provider
      if (!this.config.config.enabled) {
        this.config.config.enabled = true;
        this.config.onConfigChange(this.config.config);
      }

      // Render model selection
      await this.renderModelSelection();

    } catch (error) {
      console.error('[NexusProvider] GPU detection failed:', error);
      this.statusContainer.innerHTML = `
        <div class="nexus-status nexus-status-error">
          <p><strong>Detection Failed</strong></p>
          <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      `;
    }
  }

  /**
   * Render unsupported device status
   */
  private renderUnsupportedStatus(): void {
    if (!this.statusContainer) return;

    this.statusContainer.innerHTML = `
      <div class="nexus-status nexus-status-error">
        <p><strong>Device Not Compatible</strong></p>
        <p>Nexus requires WebGPU support for local inference.</p>
        <p><strong>Requirements:</strong></p>
        <ul>
          <li>Chrome 113+ or Edge 113+ (recommended)</li>
          <li>Safari 17+ on macOS Sonoma or later</li>
          <li>Firefox with WebGPU flag enabled</li>
        </ul>
      </div>
    `;
  }

  /**
   * Render insufficient memory status
   */
  private renderInsufficientMemoryStatus(gpuName: string, vramGB: string): void {
    if (!this.statusContainer) return;

    this.statusContainer.innerHTML = `
      <div class="nexus-status nexus-status-warning">
        <p><strong>Insufficient GPU Memory</strong></p>
        <p><strong>GPU:</strong> ${gpuName}</p>
        <p><strong>Estimated Memory:</strong> ~${vramGB} GB</p>
        <p>Minimum 5GB GPU memory required.</p>
      </div>
    `;
  }

  /**
   * Render compatible device status
   */
  private renderCompatibleStatus(gpuName: string, vramGB: string): void {
    if (!this.statusContainer) return;

    this.statusContainer.innerHTML = `
      <div class="nexus-status nexus-status-success">
        <p><strong>Device Compatible</strong></p>
        <p><strong>GPU:</strong> ${gpuName}</p>
        <p><strong>Estimated Memory:</strong> ~${vramGB} GB</p>
      </div>
    `;
  }

  /**
   * Render model selection and action buttons
   */
  private async renderModelSelection(): Promise<void> {
    if (!this.modelsContainer) return;
    this.modelsContainer.empty();

    const estimatedVRAM = this.vramInfo?.estimatedVRAM || 0;
    const availableModels = getModelsForVRAM(estimatedVRAM);

    if (availableModels.length === 0) {
      this.modelsContainer.createDiv('setting-item-description').setText(
        'Your GPU does not have enough memory for Nexus. Minimum 5GB required.'
      );
      return;
    }

    // Determine current model state
    const isLoaded = this.adapter?.isModelLoaded() ?? false;
    this.modelState = isLoaded ? 'loaded' : 'not_downloaded';

    // Model dropdown
    const selectedModel = getWebLLMModel(this.selectedModelId) || availableModels[0];

    new Setting(this.modelsContainer)
      .setName('Model')
      .setDesc('Select the Nexus model variant')
      .addDropdown(dropdown => {
        availableModels.forEach(model => {
          dropdown.addOption(model.id, `${model.name} (~${model.vramRequired}GB)`);
        });

        dropdown.setValue(this.selectedModelId || availableModels[0].id);
        dropdown.onChange(async value => {
          this.selectedModelId = value;

          // Extract quantization from model ID
          const match = value.match(/(q[458]f16)/);
          if (match) {
            this.selectedQuantization = match[1] as 'q4f16' | 'q5f16' | 'q8f16';
          }

          this.config.config.webllmModel = value;
          this.config.config.webllmQuantization = this.selectedQuantization;
          this.config.onConfigChange(this.config.config);

          // Refresh action section
          await this.renderModelSelection();
        });
      });

    // Action container (Download/Load/Unload buttons)
    this.actionContainer = this.modelsContainer.createDiv('nexus-action-container');

    if (isLoaded) {
      this.renderLoadedState(selectedModel);
    } else {
      this.renderDownloadState(selectedModel);
    }

    // About section
    this.renderAboutSection();
  }

  /**
   * Render the "Loaded" state UI
   */
  private renderLoadedState(model: WebLLMModelSpec): void {
    if (!this.actionContainer) return;
    this.actionContainer.empty();

    const setting = new Setting(this.actionContainer)
      .setName('Status')
      .setDesc(`${model.name} is loaded in GPU memory and ready to use`);

    // Status indicator
    const statusEl = setting.settingEl.createDiv('nexus-status-indicator');
    statusEl.innerHTML = '<span style="color: var(--text-success);">● Loaded</span>';
    statusEl.style.marginLeft = 'auto';
    statusEl.style.marginRight = '1em';
    statusEl.style.fontWeight = '500';

    // Unload button
    setting.addButton(button => button
      .setButtonText('Unload from GPU')
      .setWarning()
      .onClick(async () => {
        if (!this.adapter) return;

        button.setButtonText('Unloading...');
        button.setDisabled(true);

        try {
          await this.adapter.unloadModel();
          new Notice(`${model.name} unloaded from GPU memory`);
          await this.renderModelSelection();
        } catch (error) {
          new Notice(`Failed to unload: ${error instanceof Error ? error.message : 'Unknown error'}`);
          button.setButtonText('Unload from GPU');
          button.setDisabled(false);
        }
      })
    );

    // Delete model button
    this.renderDeleteModelButton(model);
  }

  /**
   * Render the "Not Downloaded" / "Downloaded" state UI
   */
  private renderDownloadState(model: WebLLMModelSpec): void {
    if (!this.actionContainer) return;
    this.actionContainer.empty();

    const setting = new Setting(this.actionContainer)
      .setName('Download Model')
      .setDesc(`Download ${model.name} (~4GB). Uses cache if previously downloaded.`);

    setting.addButton(button => button
      .setButtonText('Download')
      .setCta()
      .onClick(async () => {
        if (this.isDownloading) return;

        this.isDownloading = true;
        button.setDisabled(true);
        button.setButtonText('Starting...');

        this.renderDownloadProgress(model);
      })
    );

    // Delete model button (in case there's cached data)
    this.renderDeleteModelButton(model);
  }

  /**
   * Render download progress UI
   */
  private renderDownloadProgress(model: WebLLMModelSpec): void {
    if (!this.actionContainer || !this.adapter) return;
    this.actionContainer.empty();

    // Progress container
    const progressContainer = this.actionContainer.createDiv('nexus-progress-container');
    progressContainer.style.padding = '1em 0';

    // Status text
    const statusText = progressContainer.createDiv('nexus-progress-status');
    statusText.style.marginBottom = '0.5em';
    statusText.style.fontSize = '0.9em';
    statusText.setText('Initializing...');

    // Progress bar
    const progressBarContainer = progressContainer.createDiv('nexus-progress-bar-container');
    progressBarContainer.style.height = '4px';
    progressBarContainer.style.backgroundColor = 'var(--background-modifier-border)';
    progressBarContainer.style.borderRadius = '2px';
    progressBarContainer.style.overflow = 'hidden';

    const progressBarFill = progressBarContainer.createDiv('nexus-progress-bar-fill');
    progressBarFill.style.height = '100%';
    progressBarFill.style.backgroundColor = 'var(--interactive-accent)';
    progressBarFill.style.width = '0%';
    progressBarFill.style.transition = 'width 0.3s ease';

    // Progress percentage
    const progressPercent = progressContainer.createDiv('nexus-progress-percent');
    progressPercent.style.marginTop = '0.5em';
    progressPercent.style.fontSize = '0.85em';
    progressPercent.style.color = 'var(--text-muted)';
    progressPercent.setText('0%');

    new Notice('Downloading Nexus model... Uses cache if available.', 5000);

    let lastNoticePercent = 0;

    // Initialize and load
    this.adapter.initialize().then(() => {
      return this.adapter!.loadModel(model, (progress: number, stage: string) => {
        const percent = Math.round(progress * 100);

        try {
          progressBarFill.style.width = `${percent}%`;
          progressPercent.setText(`${percent}%`);
          statusText.setText(`${stage}: ${percent}%`);
        } catch {
          // Container might be gone
        }

        if (percent >= lastNoticePercent + 25) {
          lastNoticePercent = Math.floor(percent / 25) * 25;
          if (percent < 100) {
            new Notice(`Nexus: ${stage} ${percent}%`, 3000);
          }
        }
      });
    }).then(async () => {
      this.isDownloading = false;
      this.modelState = 'loaded';

      new Notice('Nexus loaded successfully! Ready for local inference.', 10000);

      this.config.config.enabled = true;
      this.config.config.webllmModel = model.id;
      this.config.config.webllmQuantization = model.quantization;
      this.config.onConfigChange(this.config.config);

      try {
        await this.renderModelSelection();
      } catch {
        // Modal might be closed
      }
    }).catch(error => {
      this.isDownloading = false;
      console.error('[NexusProvider] Download failed:', error);

      new Notice(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 10000);

      try {
        this.renderDownloadState(model);
      } catch {
        // Modal might be closed
      }
    });
  }

  /**
   * Render delete model button
   */
  private renderDeleteModelButton(model: WebLLMModelSpec): void {
    if (!this.actionContainer) return;

    const setting = new Setting(this.actionContainer)
      .setName('Delete Model')
      .setDesc('Remove cached model files. Will need to re-download to use again.');

    setting.addButton(button => button
      .setButtonText('Delete Model')
      .onClick(async () => {
        button.setButtonText('Deleting...');
        button.setDisabled(true);

        try {
          // Unload first if loaded
          if (this.adapter?.isModelLoaded()) {
            await this.adapter.unloadModel();
          }

          await this.clearCache();

          new Notice('Model deleted. Will re-download on next use.');
          await this.renderModelSelection();
        } catch (error) {
          new Notice(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`);
          button.setButtonText('Delete Model');
          button.setDisabled(false);
        }
      })
    );
  }

  /**
   * Clear WebLLM browser caches
   */
  private async clearCache(): Promise<void> {
    // Clear Cache API entries
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        if (name.includes('webllm') || name.includes('tvmjs') || name.includes('mlc')) {
          await caches.delete(name);
          console.log(`[NexusProvider] Deleted cache: ${name}`);
        }
      }
    }

    // Clear IndexedDB databases
    if ('indexedDB' in window) {
      const databases = await indexedDB.databases?.() || [];
      for (const db of databases) {
        if (db.name && (db.name.includes('webllm') || db.name.includes('tvmjs') || db.name.includes('mlc'))) {
          indexedDB.deleteDatabase(db.name);
          console.log(`[NexusProvider] Deleted IndexedDB: ${db.name}`);
        }
      }
    }
  }

  /**
   * Render about section
   */
  private renderAboutSection(): void {
    if (!this.modelsContainer) return;

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
   * Get current configuration
   */
  getConfig(): import('../../../types').LLMProviderConfig {
    return {
      ...this.config.config,
      webllmModel: this.selectedModelId,
      webllmQuantization: this.selectedQuantization,
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.container = null;
    this.statusContainer = null;
    this.modelsContainer = null;
    this.actionContainer = null;
    // Don't dispose adapter - it's managed by the lifecycle manager
  }
}
