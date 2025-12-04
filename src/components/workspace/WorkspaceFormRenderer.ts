import { App } from 'obsidian';
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

    const form = tabContent.createDiv('nexus-modern-form');

    // Name field
    const nameField = form.createDiv('nexus-form-field');
    nameField.createEl('label', { text: 'Name', cls: 'nexus-form-label' });
    const nameInput = nameField.createEl('input', {
      type: 'text',
      placeholder: 'My Workspace',
      cls: 'nexus-form-input'
    });
    nameInput.value = this.formData.name || '';
    nameInput.addEventListener('input', (e) => {
      this.formData.name = (e.target as HTMLInputElement).value;
    });

    // Description field
    const descField = form.createDiv('nexus-form-field');
    descField.createEl('label', { text: 'Description', cls: 'nexus-form-label' });
    descField.createEl('span', {
      text: 'Brief description of this workspace',
      cls: 'nexus-form-hint'
    });
    const descInput = descField.createEl('textarea', {
      placeholder: 'Description of what this workspace is for...',
      cls: 'nexus-form-textarea'
    });
    descInput.rows = 2;
    descInput.value = this.formData.description || '';
    descInput.addEventListener('input', (e) => {
      this.formData.description = (e.target as HTMLTextAreaElement).value;
    });

    // Root Folder field
    const folderField = form.createDiv('nexus-form-field');
    folderField.createEl('label', { text: 'Root Folder', cls: 'nexus-form-label' });
    folderField.createEl('span', {
      text: 'Base folder for this workspace',
      cls: 'nexus-form-hint'
    });
    const folderInput = folderField.createEl('input', {
      type: 'text',
      placeholder: '/',
      cls: 'nexus-form-input'
    });
    folderInput.value = this.formData.rootFolder || '/';
    folderInput.addEventListener('input', (e) => {
      this.formData.rootFolder = (e.target as HTMLInputElement).value;
    });
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

    const form = tabContent.createDiv('nexus-modern-form');

    // Purpose field
    const purposeField = form.createDiv('nexus-form-field');
    purposeField.createEl('label', { text: 'Purpose', cls: 'nexus-form-label' });
    purposeField.createEl('span', {
      text: 'What is this workspace for?',
      cls: 'nexus-form-hint'
    });
    const purposeInput = purposeField.createEl('input', {
      type: 'text',
      placeholder: 'e.g., Apply for marketing manager positions',
      cls: 'nexus-form-input'
    });
    purposeInput.value = this.formData.context?.purpose || '';
    purposeInput.addEventListener('input', (e) => {
      if (this.formData.context) {
        this.formData.context.purpose = (e.target as HTMLInputElement).value;
      }
    });

    // Current Goal field
    const goalField = form.createDiv('nexus-form-field');
    goalField.createEl('label', { text: 'Current Goal', cls: 'nexus-form-label' });
    goalField.createEl('span', {
      text: 'What are you trying to accomplish right now?',
      cls: 'nexus-form-hint'
    });
    const goalInput = goalField.createEl('input', {
      type: 'text',
      placeholder: 'e.g., Submit 10 applications this week',
      cls: 'nexus-form-input'
    });
    goalInput.value = this.formData.context?.currentGoal || '';
    goalInput.addEventListener('input', (e) => {
      if (this.formData.context) {
        this.formData.context.currentGoal = (e.target as HTMLInputElement).value;
      }
    });

    // Preferences field
    const prefsField = form.createDiv('nexus-form-field');
    prefsField.createEl('label', { text: 'Preferences', cls: 'nexus-form-label' });
    prefsField.createEl('span', {
      text: 'Actionable guidelines for this workspace',
      cls: 'nexus-form-hint'
    });
    const prefsInput = prefsField.createEl('textarea', {
      placeholder: 'Use professional tone. Focus on tech companies. Be concise and clear.',
      cls: 'nexus-form-textarea'
    });
    prefsInput.rows = 3;
    prefsInput.value = this.formData.context?.preferences || '';
    prefsInput.addEventListener('input', (e) => {
      if (this.formData.context) {
        this.formData.context.preferences = (e.target as HTMLTextAreaElement).value;
      }
    });

    // Workflows section
    this.renderWorkflowsSection(form);
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

    const form = tabContent.createDiv('nexus-modern-form');

    // Dedicated Agent field
    const agentField = form.createDiv('nexus-form-field');
    agentField.createEl('label', { text: 'Dedicated Agent', cls: 'nexus-form-label' });
    agentField.createEl('span', {
      text: 'Choose a custom agent for this workspace (optional)',
      cls: 'nexus-form-hint'
    });

    const agentSelect = agentField.createEl('select', { cls: 'nexus-form-select' });

    // Add empty option
    const emptyOption = agentSelect.createEl('option', { text: 'No agent selected' });
    emptyOption.value = '';

    // Add agent options
    this.availableAgents.forEach(agent => {
      const option = agentSelect.createEl('option', { text: agent.name });
      option.value = agent.id;
    });

    // Set current value
    const currentAgentId = this.formData.context?.dedicatedAgent?.agentId || '';
    agentSelect.value = currentAgentId;

    agentSelect.addEventListener('change', (e) => {
      const value = (e.target as HTMLSelectElement).value;
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

    // Key Files section
    this.renderKeyFilesSection(form);
  }

  /**
   * Render Workflows section with summary list
   */
  private renderWorkflowsSection(container: HTMLElement): void {
    const section = container.createDiv('nexus-form-section');
    section.createEl('label', { text: 'Workflows', cls: 'nexus-form-label' });
    section.createEl('span', {
      text: 'Step-by-step workflows for different situations',
      cls: 'nexus-form-hint'
    });

    // Ensure workflows array exists
    if (!this.formData.context?.workflows) {
      this.formData.context = this.formData.context || {
        purpose: '', currentGoal: '', workflows: [], keyFiles: [], preferences: ''
      };
      this.formData.context.workflows = [];
    }

    const listContainer = section.createDiv('nexus-item-list');

    // Show workflow summaries
    if (this.formData.context.workflows.length === 0) {
      listContainer.createEl('p', {
        text: 'No workflows defined yet',
        cls: 'nexus-form-hint'
      });
    } else {
      this.formData.context.workflows.forEach((workflow, index) => {
        const item = listContainer.createDiv('nexus-item-row');

        const info = item.createDiv('nexus-item-info');
        const workflowName = workflow.name || `Workflow ${index + 1}`;
        info.createEl('span', { text: workflowName, cls: 'nexus-item-title' });
        const stepsPreview = workflow.steps ? workflow.steps.substring(0, 40) + (workflow.steps.length > 40 ? '...' : '') : 'No steps';
        info.createEl('span', { text: stepsPreview, cls: 'nexus-item-subtitle' });

        const actions = item.createDiv('nexus-item-actions');

        const editBtn = actions.createEl('button', { text: 'Edit', cls: 'nexus-btn-small' });
        editBtn.addEventListener('click', () => this.onWorkflowEdit(index));

        const deleteBtn = actions.createEl('button', { text: 'Delete', cls: 'nexus-btn-small nexus-btn-danger' });
        deleteBtn.addEventListener('click', () => {
          if (confirm(`Delete workflow "${workflowName}"?`)) {
            this.formData.context!.workflows.splice(index, 1);
            this.onRefresh();
          }
        });
      });
    }

    // Add button
    const addBtn = section.createEl('button', { text: '+ Add Workflow', cls: 'nexus-btn-add' });
    addBtn.addEventListener('click', () => {
      const newWorkflow = { name: '', when: '', steps: '' };
      this.formData.context!.workflows.push(newWorkflow);
      this.onWorkflowEdit(this.formData.context!.workflows.length - 1);
    });
  }

  /**
   * Render Key Files section
   */
  private renderKeyFilesSection(container: HTMLElement): void {
    const section = container.createDiv('nexus-form-section');
    section.createEl('label', { text: 'Key Files', cls: 'nexus-form-label' });
    section.createEl('span', {
      text: 'Important files for quick reference in this workspace',
      cls: 'nexus-form-hint'
    });

    const listContainer = section.createDiv('nexus-item-list');

    const updateKeyFilesList = () => {
      listContainer.empty();

      if (!this.formData.context?.keyFiles) {
        this.formData.context = this.formData.context || {
          purpose: '', currentGoal: '', workflows: [], keyFiles: [], preferences: ''
        };
        this.formData.context.keyFiles = [];
      }

      if (this.formData.context.keyFiles.length === 0) {
        listContainer.createEl('p', {
          text: 'No key files selected yet',
          cls: 'nexus-form-hint'
        });
      } else {
        this.formData.context.keyFiles.forEach((filePath, index) => {
          const item = listContainer.createDiv('nexus-item-row');

          const input = item.createEl('input', {
            type: 'text',
            placeholder: 'path/to/file.md',
            cls: 'nexus-form-input nexus-item-input'
          });
          input.value = filePath;
          input.addEventListener('input', (e) => {
            if (this.formData.context?.keyFiles) {
              this.formData.context.keyFiles[index] = (e.target as HTMLInputElement).value;
            }
          });

          const actions = item.createDiv('nexus-item-actions');

          const browseBtn = actions.createEl('button', { text: 'Browse', cls: 'nexus-btn-small' });
          browseBtn.addEventListener('click', () => this.onFilePick(index));

          const removeBtn = actions.createEl('button', { text: 'Remove', cls: 'nexus-btn-small nexus-btn-danger' });
          removeBtn.addEventListener('click', () => {
            if (this.formData.context?.keyFiles) {
              this.formData.context.keyFiles.splice(index, 1);
              updateKeyFilesList();
            }
          });
        });
      }
    };

    updateKeyFilesList();

    // Add button
    const addBtn = section.createEl('button', { text: '+ Add Key File', cls: 'nexus-btn-add' });
    addBtn.addEventListener('click', () => {
      if (!this.formData.context?.keyFiles) {
        this.formData.context = this.formData.context || {
          purpose: '', currentGoal: '', workflows: [], keyFiles: [], preferences: ''
        };
        this.formData.context.keyFiles = [];
      }
      const newIndex = this.formData.context.keyFiles.length;
      this.formData.context.keyFiles.push('');
      this.onFilePick(newIndex);
    });
  }
}
