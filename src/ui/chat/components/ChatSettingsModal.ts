/**
 * ChatSettingsModal - Modal for configuring chat settings
 *
 * Orchestrates section renderers for workspace, model, agent, and context notes.
 * Refactored from 702 lines to ~200 lines following SOLID principles.
 */

import { App, Modal } from 'obsidian';
import { WorkspaceService } from '../../../services/WorkspaceService';
import { ModelAgentManager } from '../services/ModelAgentManager';
import { ModelOption } from './ModelSelector';
import { AgentOption } from './AgentSelector';
import {
  ChatSettingsState,
  ChatSettingsDependencies,
  ISectionRenderer,
  WorkspaceSectionRenderer,
  ModelSectionRenderer,
  AgentSectionRenderer,
  ContextNotesSectionRenderer,
  ThinkingSectionRenderer
} from './settings';

export class ChatSettingsModal extends Modal {
  private workspaceService: WorkspaceService;
  private modelAgentManager: ModelAgentManager;
  private conversationId: string | null;

  // Shared state for section renderers
  private state: ChatSettingsState;

  // Section renderers
  private renderers: ISectionRenderer[] = [];

  constructor(
    app: App,
    conversationId: string | null,
    workspaceService: WorkspaceService,
    modelAgentManager: ModelAgentManager
  ) {
    super(app);
    this.conversationId = conversationId;
    this.workspaceService = workspaceService;
    this.modelAgentManager = modelAgentManager;

    // Initialize shared state
    this.state = {
      selectedWorkspaceId: modelAgentManager.getSelectedWorkspaceId(),
      selectedModel: modelAgentManager.getSelectedModel(),
      selectedAgent: modelAgentManager.getSelectedAgent(),
      contextNotes: [...modelAgentManager.getContextNotes()],
      availableWorkspaces: [],
      availableModels: [],
      availableAgents: [],
      thinking: modelAgentManager.getThinkingSettings()
    };
  }

  async onOpen() {
    await this.loadAvailableOptions();
    this.render();
  }

  onClose() {
    // Destroy all renderers
    this.renderers.forEach(r => r.destroy?.());
    this.renderers = [];

    const { contentEl } = this;
    contentEl.empty();
  }

  /**
   * Load available workspaces, models, and agents
   */
  private async loadAvailableOptions(): Promise<void> {
    try {
      this.state.availableWorkspaces = await this.workspaceService.listWorkspaces();
      this.state.availableModels = await this.modelAgentManager.getAvailableModels();
      this.state.availableAgents = await this.modelAgentManager.getAvailableAgents();
    } catch (error) {
      // Error loading options - state will have empty arrays
    }
  }

  /**
   * Create dependencies for section renderers
   */
  private createDependencies(): ChatSettingsDependencies {
    return {
      app: this.app,
      workspaceService: this.workspaceService,
      modelAgentManager: this.modelAgentManager,
      conversationId: this.conversationId,
      onWorkspaceChange: async (workspaceId) => {
        this.state.selectedWorkspaceId = workspaceId;
        await this.handleWorkspaceAgentSync(workspaceId);
      },
      onModelChange: (model) => {
        this.state.selectedModel = model;
        // Update thinking section when model changes (to show/hide based on capability)
        const thinkingRenderer = this.renderers.find(r => r instanceof ThinkingSectionRenderer);
        thinkingRenderer?.update?.();
      },
      onAgentChange: (agent) => {
        this.state.selectedAgent = agent;
      },
      onContextNotesChange: (notes) => {
        this.state.contextNotes = notes;
      },
      onThinkingChange: (settings) => {
        this.state.thinking = settings;
      }
    };
  }

  /**
   * Sync agent selection when workspace changes
   */
  private async handleWorkspaceAgentSync(workspaceId: string | null): Promise<void> {
    if (!workspaceId) return;

    try {
      const workspace = await this.workspaceService.getWorkspace(workspaceId);
      if (workspace?.context?.dedicatedAgent) {
        const agentId = workspace.context.dedicatedAgent.agentId;
        const agent = this.state.availableAgents.find(a => a.id === agentId);
        if (agent) {
          this.state.selectedAgent = agent;
          // Update agent renderer
          const agentRenderer = this.renderers.find(r => r instanceof AgentSectionRenderer);
          agentRenderer?.update?.();
        }
      }
    } catch (error) {
      // Error syncing agent
    }
  }

  /**
   * Render the modal
   */
  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('chat-settings-modal');

    // Header
    const header = contentEl.createDiv('chat-settings-header');
    header.createEl('h2', { text: 'Chat Settings' });
    this.renderActionButtons(header);

    // Create dependencies and renderers
    const deps = this.createDependencies();

    // Section container
    const sectionsContainer = contentEl.createDiv('chat-settings-sections');

    // Create and render section renderers
    this.renderers = [
      new WorkspaceSectionRenderer(this.state, deps),
      new ModelSectionRenderer(this.state, deps),
      new ThinkingSectionRenderer(this.state, deps),
      new AgentSectionRenderer(this.state, deps),
      new ContextNotesSectionRenderer(this.state, deps)
    ];

    this.renderers.forEach(renderer => {
      renderer.render(sectionsContainer);
    });
  }

  /**
   * Render action buttons
   */
  private renderActionButtons(container: HTMLElement): void {
    const buttonContainer = container.createDiv('chat-settings-button-container');

    const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelButton.addEventListener('click', () => this.close());

    const saveButton = buttonContainer.createEl('button', {
      text: 'Save',
      cls: 'mod-cta'
    });
    saveButton.addEventListener('click', () => this.handleSave());
  }

  /**
   * Handle save button click
   */
  private async handleSave(): Promise<void> {
    try {
      // Update model selection
      if (this.state.selectedModel) {
        this.modelAgentManager.handleModelChange(this.state.selectedModel);
      }

      // Update agent selection
      await this.modelAgentManager.handleAgentChange(this.state.selectedAgent);

      // Update workspace context
      if (this.state.selectedWorkspaceId) {
        const workspace = await this.workspaceService.getWorkspace(this.state.selectedWorkspaceId);
        if (workspace?.context) {
          await this.modelAgentManager.setWorkspaceContext(this.state.selectedWorkspaceId, workspace.context);
        } else {
          await this.modelAgentManager.clearWorkspaceContext();
        }
      } else {
        await this.modelAgentManager.clearWorkspaceContext();
      }

      // Update context notes
      await this.modelAgentManager.setContextNotes(this.state.contextNotes);

      // Update thinking settings
      this.modelAgentManager.setThinkingSettings(this.state.thinking);

      // Persist to conversation metadata
      if (this.conversationId) {
        await this.modelAgentManager.saveToConversation(this.conversationId);
      }

      this.close();
    } catch (error) {
      // Error saving settings
    }
  }
}
