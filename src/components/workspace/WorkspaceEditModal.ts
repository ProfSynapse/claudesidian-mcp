import { App, Modal, Setting, TFile } from 'obsidian';
import { WorkspaceService } from '../../services/WorkspaceService';
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
  private tabs?: UnifiedTabs;
  private availableAgents: CustomPrompt[] = [];

  // View management
  private currentView: ModalView = ModalView.MAIN_TABS;
  private editingWorkflowIndex?: number;
  private editingKeyFileIndex?: number;
  private selectedFilePath: string = '';

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
    this.tabs?.destroy();
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

    // Create tabbed interface
    this.createTabbedInterface(contentEl);

    // Render action buttons (always visible)
    this.renderActionButtons(contentEl);
  }

  /**
   * Render the workflow edit view with full editor
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

    // Get the workflow being edited (or create new one)
    let workflow: { name: string; when: string; steps: string };
    const isNewWorkflow = this.editingWorkflowIndex === undefined ||
                         this.editingWorkflowIndex >= this.formData.context.workflows.length;

    if (isNewWorkflow) {
      workflow = { name: '', when: '', steps: '' };
    } else {
      workflow = { ...this.formData.context.workflows[this.editingWorkflowIndex!] };
    }

    // Header with back button
    const header = contentEl.createDiv('workflow-edit-header');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.marginBottom = '20px';

    const backButton = header.createEl('button', {
      text: '← Back to Workspace',
      cls: 'workflow-back-button'
    });
    backButton.addEventListener('click', () => this.backToMainTabs());

    header.createEl('h2', {
      text: isNewWorkflow ? 'Create Workflow' : 'Edit Workflow',
      cls: 'workflow-edit-title'
    });

    // Workflow form
    const form = contentEl.createDiv('workflow-edit-form');
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
        .setPlaceholder('e.g., When applying to new position, When following up after interview')
        .setValue(workflow.when)
        .onChange(value => {
          workflow.when = value;
        }));

    // Steps Section
    new Setting(form)
      .setName('Steps')
      .setDesc('Define the step-by-step process for this workflow (one per line or as paragraphs)')
      .addTextArea(text => text
        .setPlaceholder('e.g., Research company\nCustomize cover letter\nApply\nTrack')
        .setValue(workflow.steps)
        .onChange(value => {
          workflow.steps = value;
        }));

    // Action buttons
    const actionsContainer = contentEl.createDiv('workflow-edit-actions');
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
    cancelButton.addEventListener('click', () => this.backToMainTabs());
  }

  /**
   * Render the file picker view with fuzzy search
   */
  private renderFilePickerView(): void {
    const { contentEl } = this;

    // Header with back button and action buttons
    const header = contentEl.createDiv('file-picker-header');
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
      // If canceling on a newly added empty file, remove it
      if (this.editingKeyFileIndex !== undefined &&
          this.formData.context?.keyFiles?.[this.editingKeyFileIndex] === '') {
        this.formData.context.keyFiles.splice(this.editingKeyFileIndex, 1);
      }
      this.selectedFilePath = '';
      this.backToMainTabs();
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
      // If canceling on a newly added empty file, remove it
      if (this.editingKeyFileIndex !== undefined &&
          this.formData.context?.keyFiles?.[this.editingKeyFileIndex] === '') {
        this.formData.context.keyFiles.splice(this.editingKeyFileIndex, 1);
      }
      this.selectedFilePath = '';
      this.backToMainTabs();
    });

    const selectButton = actionsContainer.createEl('button', {
      text: 'Select File',
      cls: 'mod-cta'
    });
    selectButton.addEventListener('click', () => this.saveKeyFile());

    // File picker form
    const form = contentEl.createDiv('file-picker-form');
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

        // Highlight selected file
        if (file.path === this.selectedFilePath) {
          fileItem.style.backgroundColor = 'var(--background-modifier-hover)';
          fileItem.style.fontWeight = 'bold';
        }

        fileItem.textContent = file.path;

        // Click to select
        fileItem.addEventListener('click', () => {
          this.selectedFilePath = file.path;
          renderFileList();
        });

        // Hover effect
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

    // Pre-select current file if one exists
    if (this.formData.context?.keyFiles?.[keyFileIndex]) {
      this.selectedFilePath = this.formData.context.keyFiles[keyFileIndex];
    } else {
      this.selectedFilePath = '';
    }

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
   * Save the selected key file and return to main tabs
   */
  private saveKeyFile(): void {
    // Validate selection
    if (!this.selectedFilePath.trim()) {
      alert('Please select a file');
      return;
    }

    // Validate file exists in vault
    const file = this.app.vault.getAbstractFileByPath(this.selectedFilePath);
    if (!file) {
      alert('Selected file no longer exists in vault');
      return;
    }

    // Save to form data
    if (this.formData.context?.keyFiles && this.editingKeyFileIndex !== undefined) {
      this.formData.context.keyFiles[this.editingKeyFileIndex] = this.selectedFilePath;
    }

    // Clear selection and return
    this.selectedFilePath = '';
    this.backToMainTabs();
  }

  /**
   * Save the workflow and return to main tabs
   */
  private saveWorkflow(workflow: { name: string; when: string; steps: string }, isNewWorkflow: boolean): void {
    // Validate workflow data
    if (!workflow.name.trim()) {
      alert('Workflow name is required');
      return;
    }

    if (!workflow.when.trim()) {
      alert('Please specify when this workflow should be used');
      return;
    }

    // Validate steps
    if (!workflow.steps.trim()) {
      alert('At least one step is required');
      return;
    }

    // Ensure context exists
    if (!this.formData.context?.workflows) {
      this.formData.context = this.formData.context || {
        purpose: '', currentGoal: '', workflows: [], keyFiles: [], preferences: ''
      };
      this.formData.context.workflows = [];
    }

    // Save workflow
    if (isNewWorkflow) {
      this.formData.context.workflows.push(workflow);
    } else {
      this.formData.context.workflows[this.editingWorkflowIndex!] = workflow;
    }

    // Return to main tabs
    this.backToMainTabs();
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

    // Ensure context exists (using new simplified structure)
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

    // Preferences section
    this.renderPreferencesSection(tabContent);

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
    this.renderAgentSection(tabContent);

    // Key Files section
    this.renderKeyFilesSection(tabContent);
  }

  /**
   * Render Preferences section with simple textarea
   */
  private renderPreferencesSection(container: HTMLElement): void {
    new Setting(container)
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
  }

  /**
   * Render Workflows section with simple summary list
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
        const stepsPreview = workflow.steps ? workflow.steps.substring(0, 50) + (workflow.steps.length > 50 ? '...' : '') : 'No steps';
        workflowInfo.innerHTML = `<strong>${workflowName}</strong><br><small>${stepsPreview}</small>`;

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
            this.renderCurrentView(); // Refresh the view
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
          // Create new workflow and switch to editor
          const newWorkflow = {
            name: '',
            when: '',
            steps: ''
          };
          this.formData.context!.workflows.push(newWorkflow);
          this.switchToWorkflowEditor(this.formData.context!.workflows.length - 1);
        }));
  }

  /**
   * Render Agent selection section
   */
  private renderAgentSection(container: HTMLElement): void {
    const agentContainer = container.createDiv('agent-section');
    agentContainer.createEl('h4', { text: 'Dedicated Agent' });
    agentContainer.createEl('p', {
      text: 'Choose a custom agent for this workspace (optional)',
      cls: 'setting-item-description'
    });

    new Setting(agentContainer)
      .setName('Agent')
      .setDesc('Select an agent to provide specialized assistance for this workspace')
      .addDropdown(dropdown => {
        // Add default option
        dropdown.addOption('', 'No agent selected');

        // Add available agents
        this.availableAgents.forEach(agent => {
          dropdown.addOption(agent.id, agent.name);
        });

        // Set current value
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
            // Add empty entry and immediately open picker for it
            const newIndex = this.formData.context.keyFiles.length;
            this.formData.context.keyFiles.push('');
            this.switchToFilePicker(newIndex);
          }));
    };

    updateKeyFilesList();
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