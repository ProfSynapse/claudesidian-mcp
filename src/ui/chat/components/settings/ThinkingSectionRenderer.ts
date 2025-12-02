/**
 * ThinkingSectionRenderer - Renders thinking/reasoning settings
 *
 * Shows/hides based on whether the selected model supports thinking.
 * Provides an Obsidian toggle for enabling thinking and a slider for effort level.
 */

import { Setting } from 'obsidian';
import { ISectionRenderer, ChatSettingsState, ChatSettingsDependencies, ThinkingEffort } from './types';

/**
 * Maps slider value (0-2) to effort level
 */
const EFFORT_LEVELS: ThinkingEffort[] = ['low', 'medium', 'high'];

/**
 * Display labels for effort levels
 */
const EFFORT_LABELS: Record<ThinkingEffort, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High'
};

export class ThinkingSectionRenderer implements ISectionRenderer {
  private containerEl: HTMLElement | null = null;
  private effortValueEl: HTMLElement | null = null;

  constructor(
    private state: ChatSettingsState,
    private deps: ChatSettingsDependencies
  ) {}

  render(container: HTMLElement): void {
    this.containerEl = container.createDiv('thinking-settings-section');
    this.renderContent();
  }

  private renderContent(): void {
    if (!this.containerEl) return;

    this.containerEl.empty();

    // Check if model supports thinking
    const supportsThinking = this.checkModelSupportsThinking();

    if (!supportsThinking) {
      this.containerEl.addClass('is-hidden');
      return;
    }

    this.containerEl.removeClass('is-hidden');

    // Section header
    this.containerEl.createEl('h4', { text: 'Thinking Mode' });
    this.containerEl.createEl('p', {
      text: 'Enable extended thinking for deeper reasoning on complex tasks',
      cls: 'setting-item-description'
    });

    // Enable thinking toggle
    new Setting(this.containerEl)
      .setName('Enable thinking')
      .setDesc('Allow the model to think before responding')
      .addToggle(toggle => toggle
        .setValue(this.state.thinking.enabled)
        .onChange(value => {
          this.state.thinking.enabled = value;
          this.deps.onThinkingChange?.(this.state.thinking);
          this.updateEffortVisibility();
        }));

    // Effort level slider container
    const effortContainer = this.containerEl.createDiv('thinking-effort-container');

    if (!this.state.thinking.enabled) {
      effortContainer.addClass('is-hidden');
    }

    // Convert effort to slider value
    const effortToSlider = (effort: ThinkingEffort): number => {
      return EFFORT_LEVELS.indexOf(effort);
    };

    // Effort level slider with value display
    const effortSetting = new Setting(effortContainer)
      .setName('Thinking effort')
      .setDesc('Higher effort = more thorough reasoning');

    // Create value display element
    this.effortValueEl = effortSetting.controlEl.createDiv('thinking-effort-value');
    this.effortValueEl.textContent = EFFORT_LABELS[this.state.thinking.effort];

    effortSetting.addSlider(slider => slider
      .setLimits(0, 2, 1)
      .setValue(effortToSlider(this.state.thinking.effort))
      .setDynamicTooltip()
      .onChange(value => {
        const effort = EFFORT_LEVELS[value];
        this.state.thinking.effort = effort;
        if (this.effortValueEl) {
          this.effortValueEl.textContent = EFFORT_LABELS[effort];
        }
        this.deps.onThinkingChange?.(this.state.thinking);
      }));
  }

  /**
   * Check if the currently selected model supports thinking
   */
  private checkModelSupportsThinking(): boolean {
    const model = this.state.selectedModel;
    if (!model) return false;

    // Check for supportsThinking capability
    return model.supportsThinking === true;
  }

  /**
   * Update effort slider visibility based on thinking enabled state
   */
  private updateEffortVisibility(): void {
    if (!this.containerEl) return;

    const effortContainer = this.containerEl.querySelector('.thinking-effort-container');
    if (effortContainer) {
      if (this.state.thinking.enabled) {
        effortContainer.removeClass('is-hidden');
      } else {
        effortContainer.addClass('is-hidden');
      }
    }
  }

  update(): void {
    // Re-render when model changes (to show/hide section)
    this.renderContent();
  }

  destroy(): void {
    this.containerEl = null;
    this.effortValueEl = null;
  }
}
