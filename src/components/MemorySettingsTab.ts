import { App, Setting } from 'obsidian';
import { WorkspaceService } from '../services/WorkspaceService';
import { MemoryService } from '../agents/memoryManager/services/MemoryService';
import { WorkspaceCardManager } from './workspace/WorkspaceCardManager';
import { FilePickerRenderer } from './workspace/FilePickerRenderer';
import { WorkflowEditorRenderer, Workflow } from './workspace/WorkflowEditorRenderer';
import { WorkspaceFormRenderer } from './workspace/WorkspaceFormRenderer';
import { ProjectWorkspace } from '../database/workspace-types';
import { WorkspaceContext } from '../database/types/workspace/WorkspaceTypes';
import { UnifiedTabs, UnifiedTabConfig } from './UnifiedTabs';
import { CustomPromptStorageService } from '../agents/agentManager/services/CustomPromptStorageService';
import { CustomPrompt } from '../types/mcp/CustomPromptTypes';
import { Settings } from '../settings';

/**
 * View types for Memory Settings Tab
 */
enum SettingsView {
    WORKSPACE_LIST = 'list',
    WORKSPACE_EDIT = 'edit',
    WORKFLOW_EDIT = 'workflow',
    FILE_PICKER = 'file-picker'
}

/**
 * Memory Manager settings tab component
 * Card-based workspace management interface with inline editing
 */
export class MemorySettingsTab {
    private app: App;
    private workspaceService: WorkspaceService;
    private memoryService: MemoryService;
    private settings: Settings;
    private workspaceCardManager: WorkspaceCardManager;
    private customPromptStorage: CustomPromptStorageService;

    // View management
    private currentView: SettingsView = SettingsView.WORKSPACE_LIST;
    private editingWorkspace?: ProjectWorkspace;
    private editMode: 'create' | 'edit' = 'create';

    // Form data for workspace editing
    private formData: Partial<ProjectWorkspace> = {};
    private availableAgents: CustomPrompt[] = [];
    private formRenderer?: WorkspaceFormRenderer;

    // Workflow editing state
    private editingWorkflowIndex?: number;
    private workflowEditorRenderer?: WorkflowEditorRenderer;

    // File picker state
    private editingKeyFileIndex?: number;
    private filePickerRenderer?: FilePickerRenderer;

    constructor(
        private containerEl: HTMLElement,
        app: App,
        workspaceService: WorkspaceService,
        memoryService: MemoryService,
        settings: Settings
    ) {
        this.app = app;
        this.workspaceService = workspaceService;
        this.memoryService = memoryService;
        this.settings = settings;
        this.customPromptStorage = new CustomPromptStorageService(settings);

        this.workspaceCardManager = new WorkspaceCardManager(
            this.containerEl,
            this.workspaceService,
            this.settings,
            this.app,
            (workspace) => this.switchToWorkspaceEdit('edit', workspace),
            () => this.switchToWorkspaceEdit('create')
        );
    }

    async display(): Promise<void> {
        if (!this.workspaceService) {
            this.containerEl.empty();
            this.containerEl.createEl('div', {
                cls: 'memory-notice error',
                text: 'Workspace Service unavailable. Cannot display workspace management.'
            });
            return;
        }

        // Load available agents
        this.availableAgents = this.customPromptStorage.getAllPrompts();

        // Render current view
        this.renderCurrentView();
    }

    /**
     * Render the current view based on state
     */
    private async renderCurrentView(): Promise<void> {
        this.containerEl.empty();

        if (this.currentView === SettingsView.WORKSPACE_LIST) {
            await this.renderWorkspaceListView();
        } else if (this.currentView === SettingsView.WORKSPACE_EDIT) {
            this.renderWorkspaceEditView();
        } else if (this.currentView === SettingsView.WORKFLOW_EDIT) {
            this.renderWorkflowEditView();
        } else if (this.currentView === SettingsView.FILE_PICKER) {
            this.renderFilePickerView();
        }
    }

    /**
     * Render workspace list view
     */
    private async renderWorkspaceListView(): Promise<void> {
        const memorySection = this.containerEl.createEl('div', { cls: 'memory-settings-container' });
        memorySection.createEl('h2', { text: 'Workspace Management' });

        // Create workspace card manager with callbacks
        this.workspaceCardManager = new WorkspaceCardManager(
            memorySection,
            this.workspaceService,
            this.settings,
            this.app,
            (workspace) => this.switchToWorkspaceEdit('edit', workspace),
            () => this.switchToWorkspaceEdit('create')
        );

        await this.workspaceCardManager.display();
    }

    /**
     * Render workspace edit view (inline in settings)
     */
    private renderWorkspaceEditView(): void {
        const editSection = this.containerEl.createEl('div', { cls: 'workspace-edit-inline' });

        // Header with back button
        const header = editSection.createDiv('workspace-edit-header');
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.marginBottom = '20px';

        // Left: Back button and title
        const leftSection = header.createDiv();
        leftSection.style.display = 'flex';
        leftSection.style.alignItems = 'center';
        leftSection.style.gap = '12px';

        const backButton = leftSection.createEl('button', {
            text: '← Back'
        });
        backButton.addEventListener('click', () => this.backToWorkspaceList());

        leftSection.createEl('h2', {
            text: this.editMode === 'create' ? 'Create Workspace' : 'Edit Workspace'
        });

        // Right: Save/Cancel buttons
        const actionsContainer = header.createDiv();
        actionsContainer.style.display = 'flex';
        actionsContainer.style.gap = '8px';

        const cancelButton = actionsContainer.createEl('button', {
            text: 'Cancel'
        });
        cancelButton.addEventListener('click', () => this.backToWorkspaceList());

        const saveButton = actionsContainer.createEl('button', {
            text: this.editMode === 'create' ? 'Create Workspace' : 'Save Changes',
            cls: 'mod-cta'
        });
        saveButton.addEventListener('click', () => this.handleSave());

        // Create form renderer
        const formContainer = editSection.createDiv('workspace-form-container');
        this.formRenderer = new WorkspaceFormRenderer(
            this.app,
            this.formData,
            this.availableAgents,
            (index) => this.switchToWorkflowEditor(index),
            (index) => this.switchToFilePicker(index),
            () => this.renderCurrentView()
        );
        this.formRenderer.render(formContainer);
    }

    /**
     * Render workflow edit view using WorkflowEditorRenderer
     */
    private renderWorkflowEditView(): void {
        const editSection = this.containerEl.createEl('div', { cls: 'workflow-edit-inline' });

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
            () => this.backToWorkspaceEdit()
        );

        this.workflowEditorRenderer.render(editSection, workflow, isNewWorkflow);
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

        this.backToWorkspaceEdit();
    }

    /**
     * Render file picker view using FilePickerRenderer
     */
    private renderFilePickerView(): void {
        const editSection = this.containerEl.createEl('div', { cls: 'file-picker-inline' });

        // Get initial selection
        const initialSelection = this.formData.context?.keyFiles?.[this.editingKeyFileIndex!] || '';

        // Create file picker renderer
        this.filePickerRenderer = new FilePickerRenderer(
            this.app,
            (filePath) => this.handleFileSelected(filePath),
            () => this.handleFilePickerCancelled(),
            initialSelection
        );

        this.filePickerRenderer.render(editSection);
    }

    /**
     * Handle file selected from picker
     */
    private handleFileSelected(filePath: string): void {
        if (this.formData.context?.keyFiles && this.editingKeyFileIndex !== undefined) {
            this.formData.context.keyFiles[this.editingKeyFileIndex] = filePath;
        }
        this.backToWorkspaceEdit();
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
        this.backToWorkspaceEdit();
    }

    /**
     * Switch to workflow editor view
     */
    private switchToWorkflowEditor(workflowIndex?: number): void {
        this.currentView = SettingsView.WORKFLOW_EDIT;
        this.editingWorkflowIndex = workflowIndex;
        this.renderCurrentView();
    }

    /**
     * Switch to file picker view
     */
    private switchToFilePicker(keyFileIndex: number): void {
        this.currentView = SettingsView.FILE_PICKER;
        this.editingKeyFileIndex = keyFileIndex;
        this.renderCurrentView();
    }

    /**
     * Back to workspace edit view
     */
    private backToWorkspaceEdit(): void {
        this.currentView = SettingsView.WORKSPACE_EDIT;
        this.editingWorkflowIndex = undefined;
        this.renderCurrentView();
    }

    /**
     * Back to workspace list view
     */
    private backToWorkspaceList(): void {
        this.currentView = SettingsView.WORKSPACE_LIST;
        this.editingWorkspace = undefined;
        this.formRenderer?.destroy();
        this.renderCurrentView();
    }

    /**
     * Switch to workspace edit view
     */
    private switchToWorkspaceEdit(mode: 'create' | 'edit', workspace?: ProjectWorkspace): void {
        this.currentView = SettingsView.WORKSPACE_EDIT;
        this.editingWorkspace = workspace;
        this.editMode = mode;

        // Initialize form data
        if (mode === 'edit' && workspace) {
            this.formData = { ...workspace };
        } else {
            this.formData = this.getDefaultWorkspaceData();
        }

        this.renderCurrentView();
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

            if (this.editMode === 'create') {
                await this.workspaceService.createWorkspace(this.formData as Omit<ProjectWorkspace, 'id'>);
            } else if (this.editingWorkspace) {
                await this.workspaceService.updateWorkspace(this.editingWorkspace.id, this.formData);
            }

            this.backToWorkspaceList();
        } catch (error) {
            console.error('Error saving workspace:', error);
            alert('Error saving workspace: ' + (error as Error).message);
        }
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
