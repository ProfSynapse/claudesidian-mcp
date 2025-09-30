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
  WORKFLOW_EDIT = 'workflow' // Full workflow editor view
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
    let workflow: { name: string; when: string; steps: string[] };
    const isNewWorkflow = this.editingWorkflowIndex === undefined ||
                         this.editingWorkflowIndex >= this.formData.context.workflows.length;

    if (isNewWorkflow) {
      workflow = { name: '', when: '', steps: [''] };
    } else {
      workflow = { ...this.formData.context.workflows[this.editingWorkflowIndex!] };
      // Ensure workflow has at least one step for editing
      if (workflow.steps.length === 0) {
        workflow.steps = [''];
      }
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
              // Ensure at least one step remains
              if (workflow.steps.length === 0) {
                workflow.steps.push('');
              }
              renderSteps();
            }));

        // Hide remove button if it's the only step
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
   * Switch to workflow editor view
   */
  private switchToWorkflowEditor(workflowIndex?: number): void {
    this.currentView = ModalView.WORKFLOW_EDIT;
    this.editingWorkflowIndex = workflowIndex;
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
   * Save the workflow and return to main tabs
   */
  private saveWorkflow(workflow: { name: string; when: string; steps: string[] }, isNewWorkflow: boolean): void {
    // Validate workflow data
    if (!workflow.name.trim()) {
      alert('Workflow name is required');
      return;
    }

    if (!workflow.when.trim()) {
      alert('Please specify when this workflow should be used');
      return;
    }

    // Filter out empty steps
    workflow.steps = workflow.steps.filter(step => step.trim());
    if (workflow.steps.length === 0) {
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
            steps: []
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
            .onClick(async () => {
              const files = this.app.vault.getFiles();
              const fileOptions = files.map(file => ({
                value: file.path,
                text: file.path
              }));

              // Simple file selection using a dropdown in a mini modal
              const fileSelectorModal = new Modal(this.app);
              fileSelectorModal.titleEl.setText('Select File');

              let selectedFile = '';
              new Setting(fileSelectorModal.contentEl)
                .setName('File')
                .addDropdown(dropdown => {
                  dropdown.addOption('', 'Select a file...');
                  fileOptions.forEach(option => {
                    dropdown.addOption(option.value, option.text);
                  });
                  dropdown.onChange(value => {
                    selectedFile = value;
                  });
                });

              new Setting(fileSelectorModal.contentEl)
                .addButton(button => button
                  .setButtonText('Select')
                  .setClass('mod-cta')
                  .onClick(() => {
                    if (selectedFile && this.formData.context?.keyFiles) {
                      this.formData.context.keyFiles[index] = selectedFile;
                      updateKeyFilesList();
                    }
                    fileSelectorModal.close();
                  }))
                .addButton(button => button
                  .setButtonText('Cancel')
                  .onClick(() => {
                    fileSelectorModal.close();
                  }));

              fileSelectorModal.open();
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
            this.formData.context.keyFiles.push('');
            updateKeyFilesList();
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
        if (workflow.name?.trim() && workflow.steps.length === 0) {
          errors.push(`Workflow ${index + 1}: At least one step is required`);
        }
        workflow.steps.forEach((step, stepIndex) => {
          if (!step?.trim()) {
            errors.push(`Workflow ${index + 1}, Step ${stepIndex + 1}: Step description is required`);
          }
        });
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