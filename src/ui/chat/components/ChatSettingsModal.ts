/**
 * ChatSettingsModal - Modal for configuring chat settings
 *
 * Provides workspace, model, and agent selection in a unified settings interface.
 * Workspace selection auto-populates agent and includes workspace context in system prompt.
 */

import { App, Modal, Setting } from 'obsidian';
import { WorkspaceService } from '../../../services/WorkspaceService';
import { ModelAgentManager } from '../services/ModelAgentManager';
import { ModelOption } from './ModelSelector';
import { AgentOption } from './AgentSelector';
import { WorkspaceMetadata } from '../../../types/storage/StorageTypes';
import { WorkspaceContext } from '../../../database/types/workspace/WorkspaceTypes';

export class ChatSettingsModal extends Modal {
  private workspaceService: WorkspaceService;
  private modelAgentManager: ModelAgentManager;

  // Current selections
  private selectedWorkspaceId: string | null = null;
  private selectedModel: ModelOption | null = null;
  private selectedAgent: AgentOption | null = null;

  // Available options
  private availableWorkspaces: WorkspaceMetadata[] = [];
  private availableModels: ModelOption[] = [];
  private availableAgents: AgentOption[] = [];

  // UI elements
  private workspaceDropdown: HTMLSelectElement | null = null;
  private modelDropdown: HTMLSelectElement | null = null;
  private agentDropdown: HTMLSelectElement | null = null;
  private workspaceInfoEl: HTMLElement | null = null;

  constructor(
    app: App,
    workspaceService: WorkspaceService,
    modelAgentManager: ModelAgentManager
  ) {
    super(app);
    this.workspaceService = workspaceService;
    this.modelAgentManager = modelAgentManager;

    // Get current selections
    this.selectedModel = modelAgentManager.getSelectedModel();
    this.selectedAgent = modelAgentManager.getSelectedAgent();
    this.selectedWorkspaceId = modelAgentManager.getSelectedWorkspaceId();
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('chat-settings-modal');

    // Title
    contentEl.createEl('h2', { text: 'Chat Settings' });

    // Load data
    await this.loadAvailableOptions();

    // Render settings sections
    this.renderWorkspaceSection(contentEl);
    this.renderModelSection(contentEl);
    this.renderAgentSection(contentEl);
    this.renderWorkspaceInfo(contentEl);

    // Action buttons
    this.renderActionButtons(contentEl);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  /**
   * Load available workspaces, models, and agents
   */
  private async loadAvailableOptions(): Promise<void> {
    try {
      // Load workspaces
      this.availableWorkspaces = await this.workspaceService.listWorkspaces();

      // Load models
      this.availableModels = await this.modelAgentManager.getAvailableModels();

      // Load agents
      this.availableAgents = await this.modelAgentManager.getAvailableAgents();
    } catch (error) {
      console.error('[ChatSettingsModal] Error loading options:', error);
    }
  }

  /**
   * Render workspace selection section
   */
  private renderWorkspaceSection(container: HTMLElement): void {
    new Setting(container)
      .setName('Workspace')
      .setDesc('Select a workspace to include its context and dedicated agent')
      .addDropdown(dropdown => {
        this.workspaceDropdown = dropdown.selectEl;

        // Add default "no workspace" option
        dropdown.addOption('', 'No workspace');

        // Add available workspaces
        this.availableWorkspaces.forEach(workspace => {
          dropdown.addOption(workspace.id, workspace.name);
        });

        // Set current value
        dropdown.setValue(this.selectedWorkspaceId || '');

        // Handle changes
        dropdown.onChange(async (value) => {
          await this.handleWorkspaceChange(value);
        });
      });
  }

  /**
   * Render model selection section
   */
  private renderModelSection(container: HTMLElement): void {
    new Setting(container)
      .setName('Model')
      .setDesc('Select the LLM model for this chat')
      .addDropdown(dropdown => {
        this.modelDropdown = dropdown.selectEl;

        // Add default option
        dropdown.addOption('', 'Select model...');

        if (this.availableModels.length === 0) {
          dropdown.addOption('', 'No models available');
          dropdown.setDisabled(true);
          return;
        }

        // Group models by provider
        const modelsByProvider = new Map<string, ModelOption[]>();
        this.availableModels.forEach(model => {
          if (!modelsByProvider.has(model.providerId)) {
            modelsByProvider.set(model.providerId, []);
          }
          modelsByProvider.get(model.providerId)!.push(model);
        });

        // Add models grouped by provider (note: Obsidian Setting dropdown doesn't support optgroups)
        // So we'll prefix with provider name
        modelsByProvider.forEach((providerModels, providerId) => {
          providerModels.forEach(model => {
            const value = `${model.providerId}:${model.modelId}`;
            const label = `${model.providerName} - ${model.modelName} (${Math.round(model.contextWindow / 1000)}k)`;
            dropdown.addOption(value, label);
          });
        });

        // Set current value
        if (this.selectedModel) {
          const currentValue = `${this.selectedModel.providerId}:${this.selectedModel.modelId}`;
          dropdown.setValue(currentValue);
        }

        // Handle changes
        dropdown.onChange((value) => {
          this.handleModelChange(value);
        });
      });
  }

  /**
   * Render agent selection section
   */
  private renderAgentSection(container: HTMLElement): void {
    new Setting(container)
      .setName('Agent')
      .setDesc('Select a custom agent (overrides workspace agent)')
      .addDropdown(dropdown => {
        this.agentDropdown = dropdown.selectEl;

        // Add default "no agent" option
        dropdown.addOption('', 'No agent (default)');

        // Add available agents
        this.availableAgents.forEach(agent => {
          dropdown.addOption(agent.id, agent.name);
        });

        // Set current value
        dropdown.setValue(this.selectedAgent?.id || '');

        // Handle changes
        dropdown.onChange((value) => {
          this.handleAgentChange(value);
        });
      });
  }

  /**
   * Render workspace info section (shows context details)
   */
  private renderWorkspaceInfo(container: HTMLElement): void {
    this.workspaceInfoEl = container.createDiv('workspace-info-section');
    this.updateWorkspaceInfo();
  }

  /**
   * Update workspace info display
   */
  private async updateWorkspaceInfo(): Promise<void> {
    if (!this.workspaceInfoEl) return;

    this.workspaceInfoEl.empty();

    if (!this.selectedWorkspaceId) {
      this.workspaceInfoEl.createEl('p', {
        text: 'No workspace selected. Workspace context will not be included in the system prompt.',
        cls: 'setting-item-description'
      });
      return;
    }

    // Load full workspace data
    try {
      const workspace = await this.workspaceService.getWorkspace(this.selectedWorkspaceId);

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
      console.error('[ChatSettingsModal] Error loading workspace info:', error);
      this.workspaceInfoEl.createEl('p', {
        text: 'Error loading workspace information.',
        cls: 'setting-item-description'
      });
    }
  }

  /**
   * Render action buttons
   */
  private renderActionButtons(container: HTMLElement): void {
    const buttonContainer = container.createDiv('modal-button-container');

    const saveButton = buttonContainer.createEl('button', {
      text: 'Save',
      cls: 'mod-cta'
    });
    saveButton.addEventListener('click', () => this.handleSave());

    const cancelButton = buttonContainer.createEl('button', {
      text: 'Cancel'
    });
    cancelButton.addEventListener('click', () => this.close());
  }

  /**
   * Handle workspace selection change
   */
  private async handleWorkspaceChange(workspaceId: string): Promise<void> {
    this.selectedWorkspaceId = workspaceId || null;

    // If workspace selected, check for dedicated agent
    if (workspaceId) {
      try {
        const workspace = await this.workspaceService.getWorkspace(workspaceId);

        if (workspace?.context?.dedicatedAgent) {
          // Auto-select the dedicated agent
          const agentId = workspace.context.dedicatedAgent.agentId;
          if (this.agentDropdown) {
            this.agentDropdown.value = agentId;
          }

          // Find and set the agent
          const agent = this.availableAgents.find(a => a.id === agentId);
          if (agent) {
            this.selectedAgent = agent;
          }
        }
      } catch (error) {
        console.error('[ChatSettingsModal] Error loading workspace:', error);
      }
    }

    // Update workspace info display
    await this.updateWorkspaceInfo();
  }

  /**
   * Handle model selection change
   */
  private handleModelChange(value: string): void {
    if (!value) {
      this.selectedModel = null;
      return;
    }

    const [providerId, modelId] = value.split(':');
    const model = this.availableModels.find(
      m => m.providerId === providerId && m.modelId === modelId
    );

    if (model) {
      this.selectedModel = model;
    }
  }

  /**
   * Handle agent selection change
   */
  private handleAgentChange(value: string): void {
    if (!value) {
      this.selectedAgent = null;
      return;
    }

    const agent = this.availableAgents.find(a => a.id === value);
    if (agent) {
      this.selectedAgent = agent;
    }
  }

  /**
   * Handle save button click
   */
  private async handleSave(): Promise<void> {
    try {
      // Update model selection
      if (this.selectedModel) {
        this.modelAgentManager.handleModelChange(this.selectedModel);
      }

      // Update agent selection
      this.modelAgentManager.handleAgentChange(this.selectedAgent);

      // Update workspace context
      if (this.selectedWorkspaceId) {
        const workspace = await this.workspaceService.getWorkspace(this.selectedWorkspaceId);
        if (workspace?.context) {
          this.modelAgentManager.setWorkspaceContext(this.selectedWorkspaceId, workspace.context);
        } else {
          this.modelAgentManager.clearWorkspaceContext();
        }
      } else {
        this.modelAgentManager.clearWorkspaceContext();
      }

      this.close();
    } catch (error) {
      console.error('[ChatSettingsModal] Error saving settings:', error);
    }
  }
}
