import { App, Modal, Setting } from 'obsidian';
import { WorkspaceService } from '../../agents/memoryManager/services/WorkspaceService';
import { ProjectWorkspace } from '../../database/workspace-types';
import { WorkspaceContext } from '../../database/types/workspace/WorkspaceTypes';

/**
 * Modal for creating and editing workspaces
 * Supports the rich workspace data structure with tabbed interface
 */
export class WorkspaceEditModal extends Modal {
  private workspaceService: WorkspaceService;
  private mode: 'create' | 'edit';
  private workspace?: ProjectWorkspace;
  private onSave: () => void;

  // Form data
  private formData: Partial<ProjectWorkspace> = {};

  constructor(
    app: App,
    workspaceService: WorkspaceService,
    mode: 'create' | 'edit',
    workspace?: ProjectWorkspace,
    onSave?: () => void
  ) {
    super(app);
    this.workspaceService = workspaceService;
    this.mode = mode;
    this.workspace = workspace;
    this.onSave = onSave || (() => {});

    // Initialize form data
    if (this.mode === 'edit' && this.workspace) {
      this.formData = { ...this.workspace };
    } else {
      this.formData = this.getDefaultWorkspaceData();
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', {
      text: this.mode === 'create' ? 'Create Workspace' : 'Edit Workspace'
    });

    this.renderBasicInfoForm(contentEl);
    this.renderContextForm(contentEl);
    this.renderActionButtons(contentEl);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  /**
   * Render basic workspace information form
   */
  private renderBasicInfoForm(container: HTMLElement): void {
    const section = container.createDiv('workspace-edit-section');
    section.createEl('h3', { text: 'Basic Information' });

    new Setting(section)
      .setName('Name')
      .setDesc('Workspace name')
      .addText(text => text
        .setPlaceholder('My Workspace')
        .setValue(this.formData.name || '')
        .onChange(value => {
          this.formData.name = value;
        }));

    new Setting(section)
      .setName('Description')
      .setDesc('Brief description of this workspace')
      .addTextArea(text => text
        .setPlaceholder('Description of what this workspace is for...')
        .setValue(this.formData.description || '')
        .onChange(value => {
          this.formData.description = value;
        }));

    new Setting(section)
      .setName('Root Folder')
      .setDesc('Base folder for this workspace')
      .addText(text => text
        .setPlaceholder('/')
        .setValue(this.formData.rootFolder || '/')
        .onChange(value => {
          this.formData.rootFolder = value;
        }));

    new Setting(section)
      .setName('Active')
      .setDesc('Enable this workspace')
      .addToggle(toggle => toggle
        .setValue(this.formData.isActive ?? true)
        .onChange(value => {
          this.formData.isActive = value;
        }));
  }

  /**
   * Render workspace context form
   */
  private renderContextForm(container: HTMLElement): void {
    const section = container.createDiv('workspace-edit-section');
    section.createEl('h3', { text: 'Workspace Context' });

    // Ensure context exists
    if (!this.formData.context) {
      this.formData.context = {
        purpose: '',
        currentGoal: '',
        status: '',
        workflows: [],
        keyFiles: [],
        preferences: [],
        agents: []
      };
    }

    new Setting(section)
      .setName('Purpose')
      .setDesc('What is this workspace for?')
      .addText(text => text
        .setPlaceholder('e.g., Apply for marketing manager positions')
        .setValue(this.formData.context?.purpose || '')
        .onChange(value => {
          if (this.formData.context) {
            this.formData.context.purpose = value;
          }
        }));

    new Setting(section)
      .setName('Current Goal')
      .setDesc('What are you trying to accomplish right now?')
      .addText(text => text
        .setPlaceholder('e.g., Submit 10 applications this week')
        .setValue(this.formData.context?.currentGoal || '')
        .onChange(value => {
          if (this.formData.context) {
            this.formData.context.currentGoal = value;
          }
        }));

    new Setting(section)
      .setName('Status')
      .setDesc("What's the current state of progress?")
      .addText(text => text
        .setPlaceholder('e.g., 5 sent, 2 pending responses, need 5 more')
        .setValue(this.formData.context?.status || '')
        .onChange(value => {
          if (this.formData.context) {
            this.formData.context.status = value;
          }
        }));
  }

  /**
   * Render action buttons
   */
  private renderActionButtons(container: HTMLElement): void {
    const buttonContainer = container.createDiv('workspace-edit-actions');

    const saveButton = buttonContainer.createEl('button', {
      text: this.mode === 'create' ? 'Create Workspace' : 'Save Changes',
      cls: 'mod-cta'
    });
    saveButton.addEventListener('click', () => this.handleSave());

    const cancelButton = buttonContainer.createEl('button', {
      text: 'Cancel'
    });
    cancelButton.addEventListener('click', () => this.close());
  }

  /**
   * Handle save button click
   */
  private async handleSave(): Promise<void> {
    try {
      if (!this.formData.name?.trim()) {
        alert('Workspace name is required');
        return;
      }

      if (this.mode === 'create') {
        await this.workspaceService.createWorkspace(this.formData as Omit<ProjectWorkspace, 'id'>);
      } else if (this.workspace) {
        await this.workspaceService.updateWorkspace(this.workspace.id, this.formData);
      }

      this.onSave();
      this.close();
    } catch (error) {
      console.error('Error saving workspace:', error);
      alert('Error saving workspace: ' + (error as Error).message);
    }
  }

  /**
   * Get default workspace data for creation
   */
  private getDefaultWorkspaceData(): Partial<ProjectWorkspace> {
    return {
      name: '',
      description: '',
      rootFolder: '/',
      isActive: true,
      context: {
        purpose: '',
        currentGoal: '',
        status: 'Starting workspace setup',
        workflows: [],
        keyFiles: [],
        preferences: [],
        agents: []
      }
    };
  }
}