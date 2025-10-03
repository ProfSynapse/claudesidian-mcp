import { App, Setting } from 'obsidian';
import { WorkspaceService } from '../services/WorkspaceService';
import { MemoryService } from '../agents/memoryManager/services/MemoryService';
import { WorkspaceCardManager } from './workspace/WorkspaceCardManager';
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
    private tabs?: UnifiedTabs;
    private availableAgents: CustomPrompt[] = [];

    // Workflow editing state
    private editingWorkflowIndex?: number;

    // File picker state
    private editingKeyFileIndex?: number;
    private selectedFilePath: string = '';

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
            (workspace) => this.switchToWorkspaceEdit(workspace, 'edit'),
            () => this.switchToWorkspaceEdit(undefined, 'create')
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
            (workspace) => this.switchToWorkspaceEdit(workspace, 'edit'),
            () => this.switchToWorkspaceEdit(undefined, 'create')
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

        // Create tabbed interface
        this.createTabbedInterface(editSection);
    }

    /**
     * Create the tabbed interface
     */
    private createTabbedInterface(container: HTMLElement): void {
        const tabsContainer = container.createDiv('workspace-edit-tabs-container');

        const tabConfigs: UnifiedTabConfig[] = [
            { key: 'basic', label: '📝 Basic Info' },
            { key: 'context', label: '⚙️ Context' },
            { key: 'agent-files', label: '🤖 Agent & Files' }
        ];

        this.tabs = new UnifiedTabs({
            containerEl: tabsContainer,
            tabs: tabConfigs,
            defaultTab: 'basic'
        });

        // Render content for each tab
        this.renderBasicInfoTab();
        this.renderContextTab();
        this.renderAgentFilesTab();
    }

    /**
     * Render Tab 1: Basic Info
     */
    private renderBasicInfoTab(): void {
        const tabContent = this.tabs?.getTabContent('basic');
        if (!tabContent) return;

        new Setting(tabContent)
            .setName('Name')
            .setDesc('Workspace name')
            .addText(text => text
                .setPlaceholder('My Workspace')
                .setValue(this.formData.name || '')
                .onChange(value => {
                    this.formData.name = value;
                }));

        new Setting(tabContent)
            .setName('Description')
            .setDesc('Brief description of this workspace')
            .addTextArea(text => text
                .setPlaceholder('Description of what this workspace is for...')
                .setValue(this.formData.description || '')
                .onChange(value => {
                    this.formData.description = value;
                }));

        new Setting(tabContent)
            .setName('Root Folder')
            .setDesc('Base folder for this workspace')
            .addText(text => text
                .setPlaceholder('/')
                .setValue(this.formData.rootFolder || '/')
                .onChange(value => {
                    this.formData.rootFolder = value;
                }));

        new Setting(tabContent)
            .setName('Active')
            .setDesc('Enable this workspace')
            .addToggle(toggle => toggle
                .setValue(this.formData.isActive ?? true)
                .onChange(value => {
                    this.formData.isActive = value;
                }));
    }

    /**
     * Render Tab 2: Context
     */
    private renderContextTab(): void {
        const tabContent = this.tabs?.getTabContent('context');
        if (!tabContent) return;

        // Ensure context exists
        if (!this.formData.context) {
            this.formData.context = {
                purpose: '',
                currentGoal: '',
                workflows: [],
                keyFiles: [],
                preferences: ''
            };
        }

        new Setting(tabContent)
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

        new Setting(tabContent)
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

        // Preferences
        new Setting(tabContent)
            .setName('Preferences')
            .setDesc('Actionable guidelines for this workspace')
            .addTextArea(text => text
                .setPlaceholder('Use professional tone. Focus on tech companies. Be concise and clear.')
                .setValue(this.formData.context?.preferences || '')
                .onChange(value => {
                    if (this.formData.context) {
                        this.formData.context.preferences = value;
                    }
                }));

        // Workflows section
        this.renderWorkflowsSection(tabContent);
    }

    /**
     * Render Tab 3: Agent & Files
     */
    private renderAgentFilesTab(): void {
        const tabContent = this.tabs?.getTabContent('agent-files');
        if (!tabContent) return;

        // Ensure context exists
        if (!this.formData.context) {
            this.formData.context = {
                purpose: '',
                currentGoal: '',
                workflows: [],
                keyFiles: [],
                preferences: ''
            };
        }

        // Dedicated Agent section
        const agentContainer = tabContent.createDiv('agent-section');
        agentContainer.createEl('h4', { text: 'Dedicated Agent' });
        agentContainer.createEl('p', {
            text: 'Choose a custom agent for this workspace (optional)',
            cls: 'setting-item-description'
        });

        new Setting(agentContainer)
            .setName('Agent')
            .setDesc('Select an agent to provide specialized assistance for this workspace')
            .addDropdown(dropdown => {
                dropdown.addOption('', 'No agent selected');

                this.availableAgents.forEach(agent => {
                    dropdown.addOption(agent.id, agent.name);
                });

                const currentAgentId = this.formData.context?.dedicatedAgent?.agentId || '';
                dropdown.setValue(currentAgentId);

                dropdown.onChange(value => {
                    if (!this.formData.context) {
                        this.formData.context = {
                            purpose: '', currentGoal: '', workflows: [], keyFiles: [], preferences: ''
                        };
                    }

                    if (value) {
                        const selectedAgent = this.availableAgents.find(agent => agent.id === value);
                        if (selectedAgent) {
                            this.formData.context.dedicatedAgent = {
                                agentId: selectedAgent.id,
                                agentName: selectedAgent.name
                            };
                        }
                    } else {
                        delete this.formData.context.dedicatedAgent;
                    }
                });
            });

        // Key Files section
        this.renderKeyFilesSection(tabContent);
    }

    /**
     * Handle save button click
     */
    private async handleSave(): Promise<void> {
        try {
            // Validate
            if (!this.formData.name?.trim()) {
                alert('Workspace name is required');
                return;
            }

            if (this.editMode === 'create') {
                await this.workspaceService.createWorkspace(this.formData as Omit<ProjectWorkspace, 'id'>);
            } else if (this.editingWorkspace) {
                await this.workspaceService.updateWorkspace(this.editingWorkspace.id, this.formData);
            }

            // Return to list
            this.backToWorkspaceList();
        } catch (error) {
            console.error('Error saving workspace:', error);
            alert('Error saving workspace: ' + (error as Error).message);
        }
    }

    /**
     * Switch to workspace edit view
     */
    private switchToWorkspaceEdit(workspace: ProjectWorkspace | undefined, mode: 'create' | 'edit'): void {
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
     * Switch back to workspace list view
     */
    private backToWorkspaceList(): void {
        this.currentView = SettingsView.WORKSPACE_LIST;
        this.editingWorkspace = undefined;
        this.tabs?.destroy();
        this.renderCurrentView();
    }

    /**
     * Get default workspace data
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

    /**
     * Render Workflows section with summary list
     */
    private renderWorkflowsSection(container: HTMLElement): void {
        const workflowsContainer = container.createDiv('workflows-section');
        workflowsContainer.createEl('h4', { text: 'Workflows' });
        workflowsContainer.createEl('p', {
            text: 'Step-by-step workflows for different situations',
            cls: 'setting-item-description'
        });

        // Ensure workflows array exists
        if (!this.formData.context?.workflows) {
            this.formData.context = this.formData.context || {
                purpose: '', currentGoal: '', workflows: [], keyFiles: [], preferences: ''
            };
            this.formData.context.workflows = [];
        }

        // Show workflow summaries
        if (this.formData.context.workflows.length === 0) {
            const emptyState = workflowsContainer.createDiv('workflows-empty');
            emptyState.createEl('p', {
                text: 'No workflows defined yet',
                cls: 'setting-item-description'
            });
        } else {
            this.formData.context.workflows.forEach((workflow, index) => {
                const workflowSummary = workflowsContainer.createDiv('workflow-summary');
                workflowSummary.style.display = 'flex';
                workflowSummary.style.alignItems = 'center';
                workflowSummary.style.marginBottom = '8px';
                workflowSummary.style.padding = '8px';
                workflowSummary.style.border = '1px solid var(--background-modifier-border)';
                workflowSummary.style.borderRadius = '4px';

                // Workflow name and description
                const workflowInfo = workflowSummary.createDiv('workflow-info');
                workflowInfo.style.flex = '1';
                const workflowName = workflow.name || `Workflow ${index + 1}`;
                const stepCount = workflow.steps?.length || 0;
                workflowInfo.innerHTML = `<strong>${workflowName}</strong><br><small>${stepCount} steps</small>`;

                // Action buttons
                const workflowActions = workflowSummary.createDiv('workflow-actions');
                workflowActions.style.display = 'flex';
                workflowActions.style.gap = '8px';

                const editButton = workflowActions.createEl('button', {
                    text: 'Edit',
                    cls: 'mod-cta'
                });
                editButton.style.padding = '4px 12px';
                editButton.addEventListener('click', () => {
                    this.switchToWorkflowEditor(index);
                });

                const deleteButton = workflowActions.createEl('button', {
                    text: 'Delete',
                    cls: 'mod-warning'
                });
                deleteButton.style.padding = '4px 12px';
                deleteButton.addEventListener('click', () => {
                    if (confirm(`Delete workflow "${workflowName}"?`)) {
                        this.formData.context!.workflows.splice(index, 1);
                        this.renderCurrentView();
                    }
                });
            });
        }

        // Add new workflow button
        const addWorkflowContainer = workflowsContainer.createDiv('add-workflow-container');
        addWorkflowContainer.style.marginTop = '12px';

        new Setting(addWorkflowContainer)
            .addButton(button => button
                .setButtonText('Add Workflow')
                .setClass('mod-cta')
                .onClick(() => {
                    const newWorkflow = {
                        name: '',
                        when: '',
                        steps: []
                    };
                    this.formData.context!.workflows.push(newWorkflow);
                    this.switchToWorkflowEditor(this.formData.context!.workflows.length - 1);
                }));
    }

    /**
     * Render Key Files section
     */
    private renderKeyFilesSection(container: HTMLElement): void {
        const keyFilesContainer = container.createDiv('key-files-section');
        keyFilesContainer.createEl('h4', { text: 'Key Files' });
        keyFilesContainer.createEl('p', {
            text: 'Select important files for quick reference in this workspace',
            cls: 'setting-item-description'
        });

        const keyFilesListEl = keyFilesContainer.createDiv('key-files-list');

        const updateKeyFilesList = () => {
            keyFilesListEl.empty();

            if (!this.formData.context?.keyFiles) {
                this.formData.context = this.formData.context || {
                    purpose: '', currentGoal: '', workflows: [], keyFiles: [], preferences: ''
                };
                this.formData.context.keyFiles = [];
            }

            this.formData.context.keyFiles.forEach((filePath, index) => {
                new Setting(keyFilesListEl)
                    .addText(text => text
                        .setPlaceholder('path/to/file.md')
                        .setValue(filePath)
                        .onChange(value => {
                            if (this.formData.context?.keyFiles) {
                                this.formData.context.keyFiles[index] = value;
                            }
                        }))
                    .addButton(button => button
                        .setButtonText('Browse')
                        .onClick(() => {
                            this.switchToFilePicker(index);
                        }))
                    .addButton(button => button
                        .setButtonText('Remove')
                        .setClass('mod-warning')
                        .onClick(() => {
                            if (this.formData.context?.keyFiles) {
                                this.formData.context.keyFiles.splice(index, 1);
                                updateKeyFilesList();
                            }
                        }));
            });

            // Add new key file button
            const addKeyFileContainer = keyFilesListEl.createDiv('add-key-file-container');
            new Setting(addKeyFileContainer)
                .addButton(button => button
                    .setButtonText('Add Key File')
                    .setClass('mod-cta')
                    .onClick(() => {
                        if (!this.formData.context?.keyFiles) {
                            this.formData.context = this.formData.context || {
                                purpose: '', currentGoal: '', workflows: [], keyFiles: [], preferences: ''
                            };
                            this.formData.context.keyFiles = [];
                        }
                        const newIndex = this.formData.context.keyFiles.length;
                        this.formData.context.keyFiles.push('');
                        this.switchToFilePicker(newIndex);
                    }));
        };

        updateKeyFilesList();
    }

    /**
     * Render workflow edit view
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
        let workflow: { name: string; when: string; steps: string[] };
        const isNewWorkflow = this.editingWorkflowIndex === undefined ||
                             this.editingWorkflowIndex >= this.formData.context.workflows.length;

        if (isNewWorkflow) {
            workflow = { name: '', when: '', steps: [''] };
        } else {
            workflow = { ...this.formData.context.workflows[this.editingWorkflowIndex!] };
            if (workflow.steps.length === 0) {
                workflow.steps = [''];
            }
        }

        // Header with back button
        const header = editSection.createDiv('workflow-edit-header');
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.marginBottom = '20px';

        const backButton = header.createEl('button', {
            text: '← Back to Workspace',
            cls: 'workflow-back-button'
        });
        backButton.addEventListener('click', () => this.backToWorkspaceEdit());

        header.createEl('h2', {
            text: isNewWorkflow ? 'Create Workflow' : 'Edit Workflow',
            cls: 'workflow-edit-title'
        });

        // Workflow form
        const form = editSection.createDiv('workflow-edit-form');
        form.style.maxWidth = '600px';
        form.style.margin = '0 auto';

        // Workflow Name
        new Setting(form)
            .setName('Workflow Name')
            .setDesc('What do you call this workflow?')
            .addText(text => text
                .setPlaceholder('e.g., New Application, Follow-up, Interview Prep')
                .setValue(workflow.name)
                .onChange(value => {
                    workflow.name = value;
                }));

        // When to Use
        new Setting(form)
            .setName('When to Use')
            .setDesc('When should this workflow be used?')
            .addText(text => text
                .setPlaceholder('e.g., When applying to new position')
                .setValue(workflow.when)
                .onChange(value => {
                    workflow.when = value;
                }));

        // Steps Section
        const stepsSection = form.createDiv('workflow-steps-section');
        stepsSection.style.marginTop = '20px';

        stepsSection.createEl('h3', { text: 'Steps' });
        stepsSection.createEl('p', {
            text: 'Define the step-by-step process for this workflow',
            cls: 'setting-item-description'
        });

        const stepsContainer = stepsSection.createDiv('workflow-steps-container');

        const renderSteps = () => {
            stepsContainer.empty();

            workflow.steps.forEach((step, stepIndex) => {
                const stepSetting = new Setting(stepsContainer)
                    .setName(`Step ${stepIndex + 1}`)
                    .addText(text => text
                        .setPlaceholder('e.g., Research company, Customize cover letter')
                        .setValue(step)
                        .onChange(value => {
                            workflow.steps[stepIndex] = value;
                        }))
                    .addButton(button => button
                        .setButtonText('Remove')
                        .setClass('mod-warning')
                        .onClick(() => {
                            workflow.steps.splice(stepIndex, 1);
                            if (workflow.steps.length === 0) {
                                workflow.steps.push('');
                            }
                            renderSteps();
                        }));

                if (workflow.steps.length === 1) {
                    const removeButton = stepSetting.controlEl.querySelector('.mod-warning') as HTMLElement;
                    if (removeButton) {
                        removeButton.style.display = 'none';
                    }
                }
            });

            // Add Step button
            new Setting(stepsContainer)
                .addButton(button => button
                    .setButtonText('+ Add Step')
                    .setClass('mod-cta')
                    .onClick(() => {
                        workflow.steps.push('');
                        renderSteps();
                    }));
        };

        renderSteps();

        // Action buttons
        const actionsContainer = editSection.createDiv('workflow-edit-actions');
        actionsContainer.style.display = 'flex';
        actionsContainer.style.justifyContent = 'center';
        actionsContainer.style.gap = '12px';
        actionsContainer.style.marginTop = '30px';

        const saveButton = actionsContainer.createEl('button', {
            text: 'Save Workflow',
            cls: 'mod-cta'
        });
        saveButton.addEventListener('click', () => this.saveWorkflow(workflow, isNewWorkflow));

        const cancelButton = actionsContainer.createEl('button', {
            text: 'Cancel'
        });
        cancelButton.addEventListener('click', () => this.backToWorkspaceEdit());
    }

    /**
     * Render file picker view
     */
    private renderFilePickerView(): void {
        const editSection = this.containerEl.createEl('div', { cls: 'file-picker-inline' });

        // Header with back button and action buttons
        const header = editSection.createDiv('file-picker-header');
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.marginBottom = '20px';

        // Left side: Back button and title
        const leftSection = header.createDiv('file-picker-header-left');
        leftSection.style.display = 'flex';
        leftSection.style.alignItems = 'center';
        leftSection.style.gap = '12px';

        const backButton = leftSection.createEl('button', {
            text: '← Back',
            cls: 'file-picker-back-button'
        });
        backButton.addEventListener('click', () => {
            if (this.editingKeyFileIndex !== undefined &&
                this.formData.context?.keyFiles?.[this.editingKeyFileIndex] === '') {
                this.formData.context.keyFiles.splice(this.editingKeyFileIndex, 1);
            }
            this.selectedFilePath = '';
            this.backToWorkspaceEdit();
        });

        leftSection.createEl('h2', {
            text: 'Select Key File',
            cls: 'file-picker-title'
        });

        // Right side: Action buttons
        const actionsContainer = header.createDiv('file-picker-actions');
        actionsContainer.style.display = 'flex';
        actionsContainer.style.gap = '8px';

        const cancelButton = actionsContainer.createEl('button', {
            text: 'Cancel'
        });
        cancelButton.addEventListener('click', () => {
            if (this.editingKeyFileIndex !== undefined &&
                this.formData.context?.keyFiles?.[this.editingKeyFileIndex] === '') {
                this.formData.context.keyFiles.splice(this.editingKeyFileIndex, 1);
            }
            this.selectedFilePath = '';
            this.backToWorkspaceEdit();
        });

        const selectButton = actionsContainer.createEl('button', {
            text: 'Select File',
            cls: 'mod-cta'
        });
        selectButton.addEventListener('click', () => this.saveKeyFile());

        // File picker form
        const form = editSection.createDiv('file-picker-form');
        form.style.maxWidth = '600px';
        form.style.margin = '0 auto';

        // Get all files from vault
        const allFiles = this.app.vault.getFiles();
        let filteredFiles = [...allFiles];

        // Search/Filter input with fuzzy matching
        const searchContainer = form.createDiv('file-picker-search');
        new Setting(searchContainer)
            .setName('Search files')
            .setDesc('Type to filter files (fuzzy search)')
            .addText(text => text
                .setPlaceholder('Start typing file name...')
                .onChange(value => {
                    const searchTerm = value.toLowerCase();

                    if (!searchTerm) {
                        filteredFiles = [...allFiles];
                    } else {
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
        const fileListContainer = form.createDiv('file-picker-list');
        fileListContainer.style.maxHeight = '400px';
        fileListContainer.style.overflowY = 'auto';
        fileListContainer.style.border = '1px solid var(--background-modifier-border)';
        fileListContainer.style.borderRadius = '4px';
        fileListContainer.style.marginTop = '12px';

        const renderFileList = () => {
            fileListContainer.empty();

            if (filteredFiles.length === 0) {
                const emptyState = fileListContainer.createDiv('file-picker-empty');
                emptyState.style.padding = '20px';
                emptyState.style.textAlign = 'center';
                emptyState.style.color = 'var(--text-muted)';
                emptyState.textContent = 'No files found';
                return;
            }

            filteredFiles.forEach(file => {
                const fileItem = fileListContainer.createDiv('file-picker-item');
                fileItem.style.padding = '8px 12px';
                fileItem.style.cursor = 'pointer';
                fileItem.style.borderBottom = '1px solid var(--background-modifier-border)';

                if (file.path === this.selectedFilePath) {
                    fileItem.style.backgroundColor = 'var(--background-modifier-hover)';
                    fileItem.style.fontWeight = 'bold';
                }

                fileItem.textContent = file.path;

                fileItem.addEventListener('click', () => {
                    this.selectedFilePath = file.path;
                    renderFileList();
                });

                fileItem.addEventListener('mouseenter', () => {
                    if (file.path !== this.selectedFilePath) {
                        fileItem.style.backgroundColor = 'var(--background-modifier-hover)';
                    }
                });
                fileItem.addEventListener('mouseleave', () => {
                    if (file.path !== this.selectedFilePath) {
                        fileItem.style.backgroundColor = '';
                    }
                });
            });
        };

        renderFileList();
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

        if (this.formData.context?.keyFiles?.[keyFileIndex]) {
            this.selectedFilePath = this.formData.context.keyFiles[keyFileIndex];
        } else {
            this.selectedFilePath = '';
        }

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
     * Save workflow and return to workspace edit
     */
    private saveWorkflow(workflow: { name: string; when: string; steps: string[] }, isNewWorkflow: boolean): void {
        if (!workflow.name.trim()) {
            alert('Workflow name is required');
            return;
        }

        if (!workflow.when.trim()) {
            alert('Please specify when this workflow should be used');
            return;
        }

        workflow.steps = workflow.steps.filter(step => step.trim());
        if (workflow.steps.length === 0) {
            alert('At least one step is required');
            return;
        }

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
     * Save key file and return to workspace edit
     */
    private saveKeyFile(): void {
        if (!this.selectedFilePath.trim()) {
            alert('Please select a file');
            return;
        }

        const file = this.app.vault.getAbstractFileByPath(this.selectedFilePath);
        if (!file) {
            alert('Selected file no longer exists in vault');
            return;
        }

        if (this.formData.context?.keyFiles && this.editingKeyFileIndex !== undefined) {
            this.formData.context.keyFiles[this.editingKeyFileIndex] = this.selectedFilePath;
        }

        this.selectedFilePath = '';
        this.backToWorkspaceEdit();
    }
}
