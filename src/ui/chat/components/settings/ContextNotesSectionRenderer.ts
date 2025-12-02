/**
 * ContextNotesSectionRenderer - Renders context notes section
 *
 * Handles the list of context notes and the "Add Context Note" button.
 * Opens NotePickerModal when user wants to add a note.
 */

import { Setting } from 'obsidian';
import { ISectionRenderer, ChatSettingsState, ChatSettingsDependencies } from './types';
import { NotePickerModal } from './NotePickerModal';

export class ContextNotesSectionRenderer implements ISectionRenderer {
  private notesListEl: HTMLElement | null = null;

  constructor(
    private state: ChatSettingsState,
    private deps: ChatSettingsDependencies
  ) {}

  render(container: HTMLElement): void {
    const notesContainer = container.createDiv('context-notes-section');
    notesContainer.createEl('h4', { text: 'Context Notes' });
    notesContainer.createEl('p', {
      text: 'Add vault notes to include in the system prompt as context',
      cls: 'setting-item-description'
    });

    this.notesListEl = notesContainer.createDiv('context-notes-list');
    this.renderNotesList();
  }

  private renderNotesList(): void {
    if (!this.notesListEl) return;

    this.notesListEl.empty();

    if (this.state.contextNotes.length === 0) {
      const emptyState = this.notesListEl.createDiv('context-notes-empty');
      emptyState.createEl('p', {
        text: 'No context notes added yet',
        cls: 'setting-item-description'
      });
    } else {
      this.state.contextNotes.forEach((notePath, index) => {
        new Setting(this.notesListEl!)
          .setName(notePath)
          .addButton(button => button
            .setButtonText('Remove')
            .setClass('mod-warning')
            .onClick(() => {
              this.removeNote(index);
            }));
      });
    }

    // Add context note button
    const addNoteContainer = this.notesListEl.createDiv('add-context-note-container');
    new Setting(addNoteContainer)
      .addButton(button => button
        .setButtonText('Add Context Note')
        .setClass('mod-cta')
        .onClick(() => {
          this.openNotePicker();
        }));
  }

  private removeNote(index: number): void {
    this.state.contextNotes.splice(index, 1);
    this.deps.onContextNotesChange?.(this.state.contextNotes);
    this.renderNotesList();
  }

  private async openNotePicker(): Promise<void> {
    const picker = new NotePickerModal(this.deps.app, this.state.contextNotes);
    const result = await picker.open();

    if (result.selected && result.notePath) {
      this.state.contextNotes.push(result.notePath);
      this.deps.onContextNotesChange?.(this.state.contextNotes);
      this.renderNotesList();
    }
  }

  update(): void {
    this.renderNotesList();
  }

  destroy(): void {
    this.notesListEl = null;
  }
}
