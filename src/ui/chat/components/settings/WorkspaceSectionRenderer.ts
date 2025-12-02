/**
 * WorkspaceSectionRenderer - Renders workspace selection section
 *
 * Handles the workspace dropdown and workspace info display.
 * When a workspace is selected, shows context summary.
 */

import { Setting } from 'obsidian';
import { ISectionRenderer, ChatSettingsState, ChatSettingsDependencies } from './types';

export class WorkspaceSectionRenderer implements ISectionRenderer {
  private workspaceDropdown: HTMLSelectElement | null = null;
  private workspaceInfoEl: HTMLElement | null = null;

  constructor(
    private state: ChatSettingsState,
    private deps: ChatSettingsDependencies
  ) {}

  render(container: HTMLElement): void {
    // Workspace dropdown
    new Setting(container)
      .setName('Workspace')
      .setDesc('Select a workspace to include its context and dedicated agent')
      .addDropdown(dropdown => {
        this.workspaceDropdown = dropdown.selectEl;

        // Add default "no workspace" option
        dropdown.addOption('', 'No workspace');

        // Add available workspaces
        this.state.availableWorkspaces.forEach(workspace => {
          dropdown.addOption(workspace.id, workspace.name);
        });

        // Set current value
        dropdown.setValue(this.state.selectedWorkspaceId || '');

        // Handle changes
        dropdown.onChange(async (value) => {
          await this.handleWorkspaceChange(value);
        });
      });

    // Workspace info section (shows context details)
    this.workspaceInfoEl = container.createDiv('workspace-info-section');
    this.updateWorkspaceInfo();
  }

  private async handleWorkspaceChange(workspaceId: string): Promise<void> {
    this.state.selectedWorkspaceId = workspaceId || null;
    await this.deps.onWorkspaceChange?.(workspaceId || null);
    await this.updateWorkspaceInfo();
  }

  /**
   * Update workspace info display
   */
  async updateWorkspaceInfo(): Promise<void> {
    if (!this.workspaceInfoEl) return;

    this.workspaceInfoEl.empty();

    if (!this.state.selectedWorkspaceId) {
      this.workspaceInfoEl.createEl('p', {
        text: 'No workspace selected. Workspace context will not be included in the system prompt.',
        cls: 'setting-item-description'
      });
      return;
    }

    // Load full workspace data
    try {
      const workspace = await this.deps.workspaceService.getWorkspace(this.state.selectedWorkspaceId);

      if (!workspace || !workspace.context) {
        this.workspaceInfoEl.createEl('p', {
          text: 'Workspace has no context data.',
          cls: 'setting-item-description'
        });
        return;
      }

      // Show workspace context summary
      const infoContainer = this.workspaceInfoEl.createDiv('workspace-context-summary');
      infoContainer.createEl('h4', { text: 'Workspace Context' });

      if (workspace.context.purpose) {
        const purposeEl = infoContainer.createDiv('context-item');
        purposeEl.createEl('strong', { text: 'Purpose: ' });
        purposeEl.createSpan({ text: workspace.context.purpose });
      }

      if (workspace.context.currentGoal) {
        const goalEl = infoContainer.createDiv('context-item');
        goalEl.createEl('strong', { text: 'Current Goal: ' });
        goalEl.createSpan({ text: workspace.context.currentGoal });
      }

      if (workspace.context.dedicatedAgent) {
        const agentEl = infoContainer.createDiv('context-item');
        agentEl.createEl('strong', { text: 'Dedicated Agent: ' });
        agentEl.createSpan({ text: workspace.context.dedicatedAgent.agentName });
      }

      if (workspace.context.workflows && workspace.context.workflows.length > 0) {
        const workflowEl = infoContainer.createDiv('context-item');
        workflowEl.createEl('strong', { text: 'Workflows: ' });
        workflowEl.createSpan({ text: `${workspace.context.workflows.length} defined` });
      }

      if (workspace.context.keyFiles && workspace.context.keyFiles.length > 0) {
        const filesEl = infoContainer.createDiv('context-item');
        filesEl.createEl('strong', { text: 'Key Files: ' });
        filesEl.createSpan({ text: `${workspace.context.keyFiles.length} files` });
      }

      infoContainer.createEl('p', {
        text: 'This context will be included in the system prompt.',
        cls: 'setting-item-description'
      });

    } catch (error) {
      this.workspaceInfoEl.createEl('p', {
        text: 'Error loading workspace information.',
        cls: 'setting-item-description'
      });
    }
  }

  update(): void {
    if (this.workspaceDropdown) {
      this.workspaceDropdown.value = this.state.selectedWorkspaceId || '';
    }
    this.updateWorkspaceInfo();
  }

  destroy(): void {
    this.workspaceDropdown = null;
    this.workspaceInfoEl = null;
  }
}
