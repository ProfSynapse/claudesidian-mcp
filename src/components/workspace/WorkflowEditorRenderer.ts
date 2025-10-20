import { Setting } from 'obsidian';

/**
 * Workflow data structure
 */
export interface Workflow {
  name: string;
  when: string;
  steps: string;
}

/**
 * WorkflowEditorRenderer - Reusable workflow editor form
 *
 * Responsibilities:
 * - Render workflow editor form (name, when, steps)
 * - Handle form field changes
 * - Validate workflow data
 * - Handle save/cancel actions
 *
 * Used by:
 * - MemorySettingsTab (settings inline editing)
 * - WorkspaceEditModal (modal editing)
 */
export class WorkflowEditorRenderer {
  private workflow: Workflow;
  private isNewWorkflow: boolean;

  constructor(
    private onSave: (workflow: Workflow) => void,
    private onCancel: () => void
  ) {
    this.workflow = { name: '', when: '', steps: '' };
    this.isNewWorkflow = true;
  }

  /**
   * Render the workflow editor view
   */
  render(container: HTMLElement, workflow: Workflow, isNew: boolean): void {
    container.empty();

    this.workflow = { ...workflow };
    this.isNewWorkflow = isNew;

    // Header with back button
    const header = container.createDiv('workflow-edit-header');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.marginBottom = '20px';

    const backButton = header.createEl('button', {
      text: '← Back to Workspace',
      cls: 'workflow-back-button'
    });
    backButton.addEventListener('click', () => this.onCancel());

    header.createEl('h2', {
      text: isNew ? 'Create Workflow' : 'Edit Workflow',
      cls: 'workflow-edit-title'
    });

    // Workflow form
    const form = container.createDiv('workflow-edit-form');
    form.style.maxWidth = '600px';
    form.style.margin = '0 auto';

    // Workflow Name
    new Setting(form)
      .setName('Workflow Name')
      .setDesc('What do you call this workflow?')
      .addText(text => text
        .setPlaceholder('e.g., New Application, Follow-up, Interview Prep')
        .setValue(this.workflow.name)
        .onChange(value => {
          this.workflow.name = value;
        }));

    // When to Use
    new Setting(form)
      .setName('When to Use')
      .setDesc('When should this workflow be used?')
      .addText(text => text
        .setPlaceholder('e.g., When applying to new position')
        .setValue(this.workflow.when)
        .onChange(value => {
          this.workflow.when = value;
        }));

    // Steps Section
    new Setting(form)
      .setName('Steps')
      .setDesc('Define the step-by-step process for this workflow (one per line or as paragraphs)')
      .addTextArea(text => text
        .setPlaceholder('e.g., Research company\nCustomize cover letter\nApply\nTrack')
        .setValue(this.workflow.steps)
        .onChange(value => {
          this.workflow.steps = value;
        }));

    // Action buttons
    const actionsContainer = container.createDiv('workflow-edit-actions');
    actionsContainer.style.display = 'flex';
    actionsContainer.style.justifyContent = 'center';
    actionsContainer.style.gap = '12px';
    actionsContainer.style.marginTop = '30px';

    const saveButton = actionsContainer.createEl('button', {
      text: 'Save Workflow',
      cls: 'mod-cta'
    });
    saveButton.addEventListener('click', () => this.handleSave());

    const cancelButton = actionsContainer.createEl('button', {
      text: 'Cancel'
    });
    cancelButton.addEventListener('click', () => this.onCancel());
  }

  /**
   * Handle save button click
   */
  private handleSave(): void {
    // Validate workflow data
    if (!this.workflow.name.trim()) {
      alert('Workflow name is required');
      return;
    }

    if (!this.workflow.when.trim()) {
      alert('Please specify when this workflow should be used');
      return;
    }

    if (!this.workflow.steps.trim()) {
      alert('At least one step is required');
      return;
    }

    this.onSave(this.workflow);
  }

  /**
   * Get current workflow data
   */
  getWorkflow(): Workflow {
    return { ...this.workflow };
  }
}
