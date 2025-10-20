import { App, Modal, Setting, TFile } from 'obsidian';
import { WorkspaceService } from '../../services/WorkspaceService';
import { FilePickerRenderer } from './FilePickerRenderer';
import { WorkflowEditorRenderer, Workflow } from './WorkflowEditorRenderer';
import { WorkspaceFormRenderer } from './WorkspaceFormRenderer';
import { ProjectWorkspace } from '../../database/workspace-types';
import { WorkspaceContext } from '../../database/types/workspace/WorkspaceTypes';
import { UnifiedTabs, UnifiedTabConfig } from '../UnifiedTabs';
import { CustomPromptStorageService } from '../../agents/agentManager/services/CustomPromptStorageService';
import { CustomPrompt } from '../../types/mcp/CustomPromptTypes';
import { Settings } from '../../settings';

/**
 * Modal view types for different editing interfaces
 */
enum ModalView {
  MAIN_TABS = 'main',        // The current 3-tab interface
  WORKFLOW_EDIT = 'workflow', // Full workflow editor view
  FILE_PICKER = 'file-picker' // File picker view
}

/**
 * Modal for creating and editing workspaces
 * Supports the rich workspace data structure with tabbed interface
 */
export class WorkspaceEditModal extends Modal {
  private workspaceService: WorkspaceService;
  private customPromptStorage: CustomPromptStorageService;
  private mode: 'create' | 'edit';
  private workspace?: ProjectWorkspace;
  private onSave: () => void;

  // Form data
  private formData: Partial<ProjectWorkspace> = {};

  // UI components
  private availableAgents: CustomPrompt[] = [];
  private formRenderer?: WorkspaceFormRenderer;

  // View management
  private currentView: ModalView = ModalView.MAIN_TABS;
  private editingWorkflowIndex?: number;
  private workflowEditorRenderer?: WorkflowEditorRenderer;
  private editingKeyFileIndex?: number;
  private filePickerRenderer?: FilePickerRenderer;

  constructor(
    app: App,
    workspaceService: WorkspaceService,
    settings: Settings,
    mode: 'create' | 'edit',
    workspace?: ProjectWorkspace,
    onSave?: () => void
  ) {
    super(app);
    this.workspaceService = workspaceService;
    this.customPromptStorage = new CustomPromptStorageService(settings);
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

  async onOpen() {
    // Load available agents
    this.availableAgents = this.customPromptStorage.getAllPrompts();

    // Render current view
    this.renderCurrentView();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    this.formRenderer?.destroy();
  }

  /**
   * Render the current view based on currentView state
   */
  private renderCurrentView(): void {
    const { contentEl } = this;
    contentEl.empty();

    if (this.currentView === ModalView.MAIN_TABS) {
      this.renderMainTabsView();
    } else if (this.currentView === ModalView.WORKFLOW_EDIT) {
      this.renderWorkflowEditView();
    } else if (this.currentView === ModalView.FILE_PICKER) {
      this.renderFilePickerView();
    }
  }

  /**
   * Render the main tabs view (current interface)
   */
  private renderMainTabsView(): void {
    const { contentEl } = this;

    contentEl.createEl('h2', {
      text: this.mode === 'create' ? 'Create Workspace' : 'Edit Workspace'
    });

    // Create form renderer
    this.formRenderer = new WorkspaceFormRenderer(
      this.app,
      this.formData,
      this.availableAgents,
      (index) => this.switchToWorkflowEditor(index),
      (index) => this.switchToFilePicker(index),
      () => this.renderCurrentView()
    );
    this.formRenderer.render(contentEl);

    // Render action buttons (always visible)
    this.renderActionButtons(contentEl);
  }

  /**
   * Render the workflow edit view using WorkflowEditorRenderer
   */
  private renderWorkflowEditView(): void {
    const { contentEl } = this;

    // Ensure we have a workflow to edit
    if (!this.formData.context?.workflows) {
      this.formData.context = this.formData.context || {
        purpose: '', currentGoal: '', workflows: [], keyFiles: [], preferences: ''
      };
      this.formData.context.workflows = [];
    }

    // Get the workflow being edited
    const isNewWorkflow = this.editingWorkflowIndex === undefined ||
                         this.editingWorkflowIndex >= this.formData.context.workflows.length;

    const workflow: Workflow = isNewWorkflow
      ? { name: '', when: '', steps: '' }
      : { ...this.formData.context.workflows[this.editingWorkflowIndex!] };

    // Create workflow editor renderer
    this.workflowEditorRenderer = new WorkflowEditorRenderer(
      (savedWorkflow) => this.handleWorkflowSaved(savedWorkflow, isNewWorkflow),
      () => this.backToMainTabs()
    );

    this.workflowEditorRenderer.render(contentEl, workflow, isNewWorkflow);
  }

  /**
   * Handle workflow saved from editor
   */
  private handleWorkflowSaved(workflow: Workflow, isNewWorkflow: boolean): void {
    if (!this.formData.context?.workflows) {
      this.formData.context = this.formData.context || {
        purpose: '', currentGoal: '', workflows: [], keyFiles: [], preferences: ''
      };
      this.formData.context.workflows = [];
    }

    if (isNewWorkflow) {
      this.formData.context.workflows.push(workflow);
    } else {
      this.formData.context.workflows[this.editingWorkflowIndex!] = workflow;
    }

    this.backToMainTabs();
  }

  /**
   * Render the file picker view using FilePickerRenderer
   */
  private renderFilePickerView(): void {
    const { contentEl } = this;

    // Get initial selection
    const initialSelection = this.formData.context?.keyFiles?.[this.editingKeyFileIndex!] || '';

    // Create file picker renderer
    this.filePickerRenderer = new FilePickerRenderer(
      this.app,
      (filePath) => this.handleFileSelected(filePath),
      () => this.handleFilePickerCancelled(),
      initialSelection
    );

    this.filePickerRenderer.render(contentEl);
  }

  /**
   * Handle file selected from picker
   */
  private handleFileSelected(filePath: string): void {
    if (this.formData.context?.keyFiles && this.editingKeyFileIndex !== undefined) {
      this.formData.context.keyFiles[this.editingKeyFileIndex] = filePath;
    }
    this.backToMainTabs();
  }

  /**
   * Handle file picker cancelled
   */
  private handleFilePickerCancelled(): void {
    // If canceling on a newly added empty file, remove it
    if (this.editingKeyFileIndex !== undefined &&
        this.formData.context?.keyFiles?.[this.editingKeyFileIndex] === '') {
      this.formData.context.keyFiles.splice(this.editingKeyFileIndex, 1);
    }
    this.backToMainTabs();
  }

  /**
   * Switch to workflow editor view
   */
  private switchToWorkflowEditor(workflowIndex?: number): void {
    this.currentView = ModalView.WORKFLOW_EDIT;
    this.editingWorkflowIndex = workflowIndex;
    this.renderCurrentView();
  }

  /**
   * Switch to file picker view
   */
  private switchToFilePicker(keyFileIndex: number): void {
    this.currentView = ModalView.FILE_PICKER;
    this.editingKeyFileIndex = keyFileIndex;
    this.renderCurrentView();
  }

  /**
   * Switch back to main tabs view
   */
  private backToMainTabs(): void {
    this.currentView = ModalView.MAIN_TABS;
    this.editingWorkflowIndex = undefined;
    this.renderCurrentView();
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
   * Validate form data across all tabs
   */
  private validateFormData(): string[] {
    const errors: string[] = [];

    if (!this.formData.name?.trim()) {
      errors.push('Workspace name is required');
    }

    // Validate workflows - ensure they have names and steps if they exist
    if (this.formData.context?.workflows) {
      this.formData.context.workflows.forEach((workflow, index) => {
        if (workflow.name?.trim() && !workflow.when?.trim()) {
          errors.push(`Workflow ${index + 1}: "When to use" is required`);
        }
        if (workflow.name?.trim() && !workflow.steps?.trim()) {
          errors.push(`Workflow ${index + 1}: At least one step is required`);
        }
      });
    }

    // Validate preferences - no validation needed for string format

    // Validate key files - ensure they're not empty
    if (this.formData.context?.keyFiles) {
      this.formData.context.keyFiles.forEach((filePath, index) => {
        if (!filePath?.trim()) {
          errors.push(`Key file ${index + 1}: File path is required`);
        }
      });
    }

    return errors;
  }

  /**
   * Handle save button click
   */
  private async handleSave(): Promise<void> {
    try {
      // Validate form data
      const errors = this.validateFormData();
      if (errors.length > 0) {
        alert('Please fix the following errors:\n\n' + errors.join('\n'));
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
        workflows: [],
        keyFiles: [],
        preferences: ''
      }
    };
  }
}