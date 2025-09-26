import { App, Modal, Setting, TFile } from 'obsidian';
import { WorkspaceService } from '../../agents/memoryManager/services/WorkspaceService';
import { ProjectWorkspace } from '../../database/workspace-types';
import { WorkspaceContext } from '../../database/types/workspace/WorkspaceTypes';
import { UnifiedTabs, UnifiedTabConfig } from '../UnifiedTabs';
import { CustomPromptStorageService } from '../../agents/agentManager/services/CustomPromptStorageService';
import { CustomPrompt } from '../../types/mcp/CustomPromptTypes';
import { Settings } from '../../settings';

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
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', {
      text: this.mode === 'create' ? 'Create Workspace' : 'Edit Workspace'
    });

    // Load available agents
    this.availableAgents = this.customPromptStorage.getAllPrompts();

    // Create tabbed interface
    this.createTabbedInterface(contentEl);

    // Render action buttons (always visible)
    this.renderActionButtons(contentEl);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    this.tabs?.destroy();
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
        preferences: []
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
        preferences: []
      };
    }

    // Dedicated Agent section
    this.renderAgentSection(tabContent);

    // Key Files section
    this.renderKeyFilesSection(tabContent);
  }

  /**
   * Render Preferences section with dynamic list
   */
  private renderPreferencesSection(container: HTMLElement): void {
    const preferencesContainer = container.createDiv('preferences-section');
    preferencesContainer.createEl('h4', { text: 'Preferences' });
    preferencesContainer.createEl('p', {
      text: 'Add actionable guidelines for this workspace',
      cls: 'setting-item-description'
    });

    const preferencesListEl = preferencesContainer.createDiv('preferences-list');

    const updatePreferencesList = () => {
      preferencesListEl.empty();

      if (!this.formData.context?.preferences) {
        this.formData.context = this.formData.context || {
          purpose: '', currentGoal: '', workflows: [], keyFiles: [], preferences: []
        };
        this.formData.context.preferences = [];
      }

      this.formData.context.preferences.forEach((preference, index) => {
        const prefItem = preferencesListEl.createDiv('preference-item');

        new Setting(prefItem)
          .addText(text => text
            .setPlaceholder('e.g., Use professional tone')
            .setValue(preference)
            .onChange(value => {
              if (this.formData.context?.preferences) {
                this.formData.context.preferences[index] = value;
              }
            }))
          .addButton(button => button
            .setButtonText('Remove')
            .setClass('mod-warning')
            .onClick(() => {
              if (this.formData.context?.preferences) {
                this.formData.context.preferences.splice(index, 1);
                updatePreferencesList();
              }
            }));
      });

      // Add new preference button
      const addButtonContainer = preferencesListEl.createDiv('add-preference-container');
      new Setting(addButtonContainer)
        .addButton(button => button
          .setButtonText('Add Preference')
          .setClass('mod-cta')
          .onClick(() => {
            if (!this.formData.context?.preferences) {
              this.formData.context = this.formData.context || {
                purpose: '', currentGoal: '', workflows: [], keyFiles: [], preferences: []
              };
              this.formData.context.preferences = [];
            }
            this.formData.context.preferences.push('');
            updatePreferencesList();
          }));
    };

    updatePreferencesList();
  }

  /**
   * Render Workflows section with nested editor
   */
  private renderWorkflowsSection(container: HTMLElement): void {
    const workflowsContainer = container.createDiv('workflows-section');
    workflowsContainer.createEl('h4', { text: 'Workflows' });
    workflowsContainer.createEl('p', {
      text: 'Define step-by-step workflows for different situations',
      cls: 'setting-item-description'
    });

    const workflowsListEl = workflowsContainer.createDiv('workflows-list');

    const updateWorkflowsList = () => {
      workflowsListEl.empty();

      if (!this.formData.context?.workflows) {
        this.formData.context = this.formData.context || {
          purpose: '', currentGoal: '', workflows: [], keyFiles: [], preferences: []
        };
        this.formData.context.workflows = [];
      }

      this.formData.context.workflows.forEach((workflow, workflowIndex) => {
        const workflowItem = workflowsContainer.createDiv('workflow-item');
        workflowItem.style.marginBottom = '20px';
        workflowItem.style.padding = '15px';
        workflowItem.style.border = '1px solid var(--background-modifier-border)';
        workflowItem.style.borderRadius = '6px';

        new Setting(workflowItem)
          .setName('Workflow Name')
          .addText(text => text
            .setPlaceholder('e.g., New Application')
            .setValue(workflow.name)
            .onChange(value => {
              if (this.formData.context?.workflows) {
                this.formData.context.workflows[workflowIndex].name = value;
              }
            }));

        new Setting(workflowItem)
          .setName('When to Use')
          .addText(text => text
            .setPlaceholder('e.g., When applying to new position')
            .setValue(workflow.when)
            .onChange(value => {
              if (this.formData.context?.workflows) {
                this.formData.context.workflows[workflowIndex].when = value;
              }
            }));

        // Steps subsection
        const stepsContainer = workflowItem.createDiv('workflow-steps');
        stepsContainer.createEl('h5', { text: 'Steps' });

        const updateStepsList = () => {
          const stepsListEl = stepsContainer.querySelector('.steps-list') || stepsContainer.createDiv('steps-list');
          stepsListEl.empty();

          workflow.steps.forEach((step, stepIndex) => {
            new Setting(stepsListEl as HTMLElement)
              .addText(text => text
                .setPlaceholder('e.g., Research company')
                .setValue(step)
                .onChange(value => {
                  if (this.formData.context?.workflows) {
                    this.formData.context.workflows[workflowIndex].steps[stepIndex] = value;
                  }
                }))
              .addButton(button => button
                .setButtonText('Remove Step')
                .setClass('mod-warning')
                .onClick(() => {
                  if (this.formData.context?.workflows) {
                    this.formData.context.workflows[workflowIndex].steps.splice(stepIndex, 1);
                    updateStepsList();
                  }
                }));
          });

          // Add step button
          new Setting(stepsListEl as HTMLElement)
            .addButton(button => button
              .setButtonText('Add Step')
              .onClick(() => {
                if (this.formData.context?.workflows) {
                  this.formData.context.workflows[workflowIndex].steps.push('');
                  updateStepsList();
                }
              }));
        };

        updateStepsList();

        // Remove workflow button
        new Setting(workflowItem)
          .addButton(button => button
            .setButtonText('Remove Workflow')
            .setClass('mod-warning')
            .onClick(() => {
              if (this.formData.context?.workflows) {
                this.formData.context.workflows.splice(workflowIndex, 1);
                updateWorkflowsList();
              }
            }));
      });

      // Add new workflow button
      const addWorkflowContainer = workflowsListEl.createDiv('add-workflow-container');
      new Setting(addWorkflowContainer)
        .addButton(button => button
          .setButtonText('Add Workflow')
          .setClass('mod-cta')
          .onClick(() => {
            if (!this.formData.context?.workflows) {
              this.formData.context = this.formData.context || {
                purpose: '', currentGoal: '', workflows: [], keyFiles: [], preferences: []
              };
              this.formData.context.workflows = [];
            }
            this.formData.context.workflows.push({
              name: '',
              when: '',
              steps: []
            });
            updateWorkflowsList();
          }));
    };

    updateWorkflowsList();
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
              purpose: '', currentGoal: '', workflows: [], keyFiles: [], preferences: []
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
          purpose: '', currentGoal: '', workflows: [], keyFiles: [], preferences: []
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
                purpose: '', currentGoal: '', workflows: [], keyFiles: [], preferences: []
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

    // Validate preferences - ensure they're not empty
    if (this.formData.context?.preferences) {
      this.formData.context.preferences.forEach((preference, index) => {
        if (!preference?.trim()) {
          errors.push(`Preference ${index + 1}: Description is required`);
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
        preferences: []
      }
    };
  }
}