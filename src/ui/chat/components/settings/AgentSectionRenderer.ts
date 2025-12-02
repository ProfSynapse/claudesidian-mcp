/**
 * AgentSectionRenderer - Renders agent selection section
 *
 * Handles the custom agent dropdown for chat settings.
 */

import { Setting } from 'obsidian';
import { ISectionRenderer, ChatSettingsState, ChatSettingsDependencies } from './types';
import { AgentOption } from '../AgentSelector';

export class AgentSectionRenderer implements ISectionRenderer {
  private agentDropdown: HTMLSelectElement | null = null;

  constructor(
    private state: ChatSettingsState,
    private deps: ChatSettingsDependencies
  ) {}

  render(container: HTMLElement): void {
    new Setting(container)
      .setName('Agent')
      .setDesc('Select a custom agent (overrides workspace agent)')
      .addDropdown(dropdown => {
        this.agentDropdown = dropdown.selectEl;

        // Add default "no agent" option
        dropdown.addOption('', 'No agent (default)');

        // Add available agents
        this.state.availableAgents.forEach(agent => {
          dropdown.addOption(agent.id, agent.name);
        });

        // Set current value
        dropdown.setValue(this.state.selectedAgent?.id || '');

        // Handle changes
        dropdown.onChange((value) => {
          this.handleAgentChange(value);
        });
      });
  }

  private handleAgentChange(value: string): void {
    if (!value) {
      this.state.selectedAgent = null;
      this.deps.onAgentChange?.(null);
      return;
    }

    const agent = this.state.availableAgents.find(a => a.id === value);
    if (agent) {
      this.state.selectedAgent = agent;
      this.deps.onAgentChange?.(agent);
    }
  }

  /**
   * Update the dropdown value (e.g., when workspace auto-selects an agent)
   */
  update(): void {
    if (this.agentDropdown) {
      this.agentDropdown.value = this.state.selectedAgent?.id || '';
    }
  }

  destroy(): void {
    this.agentDropdown = null;
  }
}
