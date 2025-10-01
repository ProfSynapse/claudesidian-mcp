/**
 * ChatSettingsModal - Modal for configuring chat settings
 *
 * Provides workspace, model, and agent selection in a unified settings interface.
 * Workspace selection auto-populates agent and includes workspace context in system prompt.
 */

import { App, Modal, Setting, TFile } from 'obsidian';
import { WorkspaceService } from '../../../services/WorkspaceService';
import { ModelAgentManager } from '../services/ModelAgentManager';
import { ModelOption } from './ModelSelector';
import { AgentOption } from './AgentSelector';
import { WorkspaceMetadata } from '../../../types/storage/StorageTypes';
import { WorkspaceContext } from '../../../database/types/workspace/WorkspaceTypes';

/**
 * Modal view types
 */
enum ModalView {
  MAIN_SETTINGS = 'main',
  NOTE_PICKER = 'note-picker'
}

export class ChatSettingsModal extends Modal {
  private workspaceService: WorkspaceService;
  private modelAgentManager: ModelAgentManager;
  private conversationId: string | null;

  // Current selections
  private selectedWorkspaceId: string | null = null;
  private selectedModel: ModelOption | null = null;
  private selectedAgent: AgentOption | null = null;
  private contextNotes: string[] = [];

  // Available options
  private availableWorkspaces: WorkspaceMetadata[] = [];
  private availableModels: ModelOption[] = [];
  private availableAgents: AgentOption[] = [];

  // UI elements
  private workspaceDropdown: HTMLSelectElement | null = null;
  private modelDropdown: HTMLSelectElement | null = null;
  private agentDropdown: HTMLSelectElement | null = null;
  private workspaceInfoEl: HTMLElement | null = null;

  // View management
  private currentView: ModalView = ModalView.MAIN_SETTINGS;
  private selectedNotePath: string = '';
  private editingNoteIndex?: number;

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

    // Get current selections
    this.selectedModel = modelAgentManager.getSelectedModel();
    this.selectedAgent = modelAgentManager.getSelectedAgent();
    this.selectedWorkspaceId = modelAgentManager.getSelectedWorkspaceId();
    this.contextNotes = modelAgentManager.getContextNotes();
  }

  async onOpen() {
    await this.loadAvailableOptions();
    this.renderCurrentView();
  }

  /**
   * Render the current view based on currentView state
   */
  private renderCurrentView(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('chat-settings-modal');

    if (this.currentView === ModalView.MAIN_SETTINGS) {
      this.renderMainSettings();
    } else if (this.currentView === ModalView.NOTE_PICKER) {
      this.renderNotePickerView();
    }
  }

  /**
   * Render main settings view
   */
  private renderMainSettings(): void {
    const { contentEl } = this;

    // Title
    contentEl.createEl('h2', { text: 'Chat Settings' });

    // Render settings sections
    this.renderWorkspaceSection(contentEl);
    this.renderModelSection(contentEl);
    this.renderAgentSection(contentEl);
    this.renderContextNotesSection(contentEl);
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

    // Split on first colon only to handle model IDs that contain colons (e.g., "ollama:mistral:latest")
    const colonIndex = value.indexOf(':');
    if (colonIndex === -1) {
      console.error('[ChatSettingsModal] Invalid model value format:', value);
      return;
    }

    const providerId = value.substring(0, colonIndex);
    const modelId = value.substring(colonIndex + 1);

    console.log('[ChatSettingsModal] Parsed model selection:', { providerId, modelId, originalValue: value });

    const model = this.availableModels.find(
      m => m.providerId === providerId && m.modelId === modelId
    );

    if (model) {
      this.selectedModel = model;
      console.log('[ChatSettingsModal] Found matching model:', model);
    } else {
      console.error('[ChatSettingsModal] Model not found in available models:', { providerId, modelId });
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
   * Render context notes section
   */
  private renderContextNotesSection(container: HTMLElement): void {
    const notesContainer = container.createDiv('context-notes-section');
    notesContainer.createEl('h4', { text: 'Context Notes' });
    notesContainer.createEl('p', {
      text: 'Add vault notes to include in the system prompt as context',
      cls: 'setting-item-description'
    });

    const notesListEl = notesContainer.createDiv('context-notes-list');

    const updateNotesList = () => {
      notesListEl.empty();

      if (this.contextNotes.length === 0) {
        const emptyState = notesListEl.createDiv('context-notes-empty');
        emptyState.createEl('p', {
          text: 'No context notes added yet',
          cls: 'setting-item-description'
        });
      } else {
        this.contextNotes.forEach((notePath, index) => {
          new Setting(notesListEl)
            .setName(notePath)
            .addButton(button => button
              .setButtonText('Remove')
              .setClass('mod-warning')
              .onClick(() => {
                this.contextNotes.splice(index, 1);
                updateNotesList();
              }));
        });
      }

      // Add context note button
      const addNoteContainer = notesListEl.createDiv('add-context-note-container');
      new Setting(addNoteContainer)
        .addButton(button => button
          .setButtonText('Add Context Note')
          .setClass('mod-cta')
          .onClick(() => {
            this.switchToNotePicker();
          }));
    };

    updateNotesList();
  }

  /**
   * Render note picker view
   */
  private renderNotePickerView(): void {
    const { contentEl } = this;

    // Header with back button and action buttons
    const header = contentEl.createDiv('note-picker-header');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '20px';

    // Left side: Back button and title
    const leftSection = header.createDiv('note-picker-header-left');
    leftSection.style.display = 'flex';
    leftSection.style.alignItems = 'center';
    leftSection.style.gap = '12px';

    const backButton = leftSection.createEl('button', {
      text: '← Back',
      cls: 'note-picker-back-button'
    });
    backButton.addEventListener('click', () => {
      this.selectedNotePath = '';
      this.backToMainSettings();
    });

    leftSection.createEl('h2', {
      text: 'Select Context Note',
      cls: 'note-picker-title'
    });

    // Right side: Action buttons
    const actionsContainer = header.createDiv('note-picker-actions');
    actionsContainer.style.display = 'flex';
    actionsContainer.style.gap = '8px';

    const cancelButton = actionsContainer.createEl('button', {
      text: 'Cancel'
    });
    cancelButton.addEventListener('click', () => {
      this.selectedNotePath = '';
      this.backToMainSettings();
    });

    const selectButton = actionsContainer.createEl('button', {
      text: 'Select Note',
      cls: 'mod-cta'
    });
    selectButton.addEventListener('click', () => this.saveContextNote());

    // Note picker form
    const form = contentEl.createDiv('note-picker-form');
    form.style.maxWidth = '600px';
    form.style.margin = '0 auto';

    // Get all markdown files from vault
    const allFiles = this.app.vault.getMarkdownFiles();
    let filteredFiles = [...allFiles];

    // Search/Filter input with fuzzy matching
    const searchContainer = form.createDiv('note-picker-search');
    new Setting(searchContainer)
      .setName('Search notes')
      .setDesc('Type to filter notes (fuzzy search)')
      .addText(text => text
        .setPlaceholder('Start typing note name...')
        .onChange(value => {
          const searchTerm = value.toLowerCase();

          if (!searchTerm) {
            filteredFiles = [...allFiles];
          } else {
            // Fuzzy search: match if all chars appear in order
            filteredFiles = allFiles.filter(file => {
              const filePath = file.path.toLowerCase();
              let searchIndex = 0;

              for (let i = 0; i < filePath.length && searchIndex < searchTerm.length; i++) {
                if (filePath[i] === searchTerm[searchIndex]) {
                  searchIndex++;
                }
              }

              return searchIndex === searchTerm.length;
            });
          }

          renderFileList();
        }));

    // File list container
    const fileListContainer = form.createDiv('note-picker-list');
    fileListContainer.style.maxHeight = '400px';
    fileListContainer.style.overflowY = 'auto';
    fileListContainer.style.border = '1px solid var(--background-modifier-border)';
    fileListContainer.style.borderRadius = '4px';
    fileListContainer.style.marginTop = '12px';

    const renderFileList = () => {
      fileListContainer.empty();

      if (filteredFiles.length === 0) {
        const emptyState = fileListContainer.createDiv('note-picker-empty');
        emptyState.style.padding = '20px';
        emptyState.style.textAlign = 'center';
        emptyState.style.color = 'var(--text-muted)';
        emptyState.textContent = 'No notes found';
        return;
      }

      filteredFiles.forEach(file => {
        const fileItem = fileListContainer.createDiv('note-picker-item');
        fileItem.style.padding = '8px 12px';
        fileItem.style.cursor = 'pointer';
        fileItem.style.borderBottom = '1px solid var(--background-modifier-border)';

        // Highlight selected file
        if (file.path === this.selectedNotePath) {
          fileItem.style.backgroundColor = 'var(--background-modifier-hover)';
          fileItem.style.fontWeight = 'bold';
        }

        fileItem.textContent = file.path;

        // Click to select
        fileItem.addEventListener('click', () => {
          this.selectedNotePath = file.path;
          renderFileList();
        });

        // Hover effect
        fileItem.addEventListener('mouseenter', () => {
          if (file.path !== this.selectedNotePath) {
            fileItem.style.backgroundColor = 'var(--background-modifier-hover)';
          }
        });
        fileItem.addEventListener('mouseleave', () => {
          if (file.path !== this.selectedNotePath) {
            fileItem.style.backgroundColor = '';
          }
        });
      });
    };

    renderFileList();
  }

  /**
   * Switch to note picker view
   */
  private switchToNotePicker(): void {
    this.currentView = ModalView.NOTE_PICKER;
    this.selectedNotePath = '';
    this.renderCurrentView();
  }

  /**
   * Switch back to main settings view
   */
  private backToMainSettings(): void {
    this.currentView = ModalView.MAIN_SETTINGS;
    this.renderCurrentView();
  }

  /**
   * Save the selected context note and return to main settings
   */
  private saveContextNote(): void {
    // Validate selection
    if (!this.selectedNotePath.trim()) {
      alert('Please select a note');
      return;
    }

    // Check if note is already added
    if (this.contextNotes.includes(this.selectedNotePath)) {
      alert('This note is already added as context');
      return;
    }

    // Add to context notes
    this.contextNotes.push(this.selectedNotePath);

    // Clear selection and return
    this.selectedNotePath = '';
    this.backToMainSettings();
  }

  /**
   * Handle save button click
   */
  private async handleSave(): Promise<void> {
    try {
      console.log('[ChatSettingsModal] handleSave called:', {
        conversationId: this.conversationId,
        selectedModel: this.selectedModel,
        selectedAgent: this.selectedAgent,
        selectedWorkspaceId: this.selectedWorkspaceId,
        contextNotes: this.contextNotes
      });

      // Update model selection
      if (this.selectedModel) {
        console.log('[ChatSettingsModal] Updating model to:', this.selectedModel);
        this.modelAgentManager.handleModelChange(this.selectedModel);
      }

      // Update agent selection
      await this.modelAgentManager.handleAgentChange(this.selectedAgent);

      // Update workspace context
      if (this.selectedWorkspaceId) {
        const workspace = await this.workspaceService.getWorkspace(this.selectedWorkspaceId);
        if (workspace?.context) {
          await this.modelAgentManager.setWorkspaceContext(this.selectedWorkspaceId, workspace.context);
        } else {
          await this.modelAgentManager.clearWorkspaceContext();
        }
      } else {
        await this.modelAgentManager.clearWorkspaceContext();
      }

      // Update context notes
      await this.modelAgentManager.setContextNotes(this.contextNotes);

      // Persist to conversation metadata
      if (this.conversationId) {
        console.log('[ChatSettingsModal] Saving to conversation:', this.conversationId);
        await this.modelAgentManager.saveToConversation(this.conversationId);
      } else {
        console.warn('[ChatSettingsModal] No conversationId - cannot persist settings');
      }

      this.close();
    } catch (error) {
      console.error('[ChatSettingsModal] Error saving settings:', error);
    }
  }
}
