import { App, Setting } from 'obsidian';
import { ProjectWorkspace } from '../../database/workspace-types';
import { UnifiedTabs, UnifiedTabConfig } from '../UnifiedTabs';
import { CustomPrompt } from '../../types/mcp/CustomPromptTypes';

/**
 * WorkspaceFormRenderer - Reusable workspace form with tabbed interface
 *
 * Responsibilities:
 * - Render all 3 tabs (Basic Info, Context, Agent & Files)
 * - Render workflows section with summaries
 * - Render key files section with list
 * - Manage formData binding
 * - Delegate workflow editing to WorkflowEditorRenderer
 * - Delegate file picking to FilePickerRenderer
 *
 * Used by:
 * - MemorySettingsTab (settings inline editing)
 * - WorkspaceEditModal (modal editing)
 */
export class WorkspaceFormRenderer {
  private tabs?: UnifiedTabs;

  constructor(
    private app: App,
    private formData: Partial<ProjectWorkspace>,
    private availableAgents: CustomPrompt[],
    private onWorkflowEdit: (index?: number) => void,
    private onFilePick: (index: number) => void,
    private onRefresh: () => void
  ) {}

  /**
   * Render the tabbed form interface
   */
  render(container: HTMLElement): void {
    this.createTabbedInterface(container);
  }

  /**
   * Destroy the tabs component
   */
  destroy(): void {
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
          this.onWorkflowEdit(index);
        });

        const deleteButton = workflowActions.createEl('button', {
          text: 'Delete',
          cls: 'mod-warning'
        });
        deleteButton.style.padding = '4px 12px';
        deleteButton.addEventListener('click', () => {
          if (confirm(`Delete workflow "${workflowName}"?`)) {
            this.formData.context!.workflows.splice(index, 1);
            this.onRefresh();
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
            steps: ''
          };
          this.formData.context!.workflows.push(newWorkflow);
          this.onWorkflowEdit(this.formData.context!.workflows.length - 1);
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
              this.onFilePick(index);
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
            this.onFilePick(newIndex);
          }));
    };

    updateKeyFilesList();
  }
}
