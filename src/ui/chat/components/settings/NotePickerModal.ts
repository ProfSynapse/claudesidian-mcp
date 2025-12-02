/**
 * NotePickerModal - Modal for selecting context notes
 *
 * Extracted from ChatSettingsModal to follow Single Responsibility Principle.
 * Provides fuzzy search to select vault notes to include as context.
 */

import { App, Modal, Setting, TFile } from 'obsidian';

export interface NotePickerResult {
  selected: boolean;
  notePath?: string;
}

export class NotePickerModal extends Modal {
  private selectedNotePath: string = '';
  private existingNotes: string[];
  private resolve: ((result: NotePickerResult) => void) | null = null;

  constructor(
    app: App,
    existingNotes: string[] = []
  ) {
    super(app);
    this.existingNotes = existingNotes;
  }

  /**
   * Open the modal and return a promise with the result
   */
  open(): Promise<NotePickerResult> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      super.open();
    });
  }

  onOpen() {
    this.render();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();

    // If closed without selecting, return not selected
    if (this.resolve) {
      this.resolve({ selected: false });
      this.resolve = null;
    }
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('note-picker-modal');

    // Header
    const header = contentEl.createDiv('note-picker-header');

    // Left side: Title
    const leftSection = header.createDiv('note-picker-header-left');
    leftSection.createEl('h2', { text: 'Select Context Note' });

    // Right side: Action buttons
    const actionsContainer = header.createDiv('note-picker-actions');

    const cancelButton = actionsContainer.createEl('button', { text: 'Cancel' });
    cancelButton.addEventListener('click', () => {
      this.selectedNotePath = '';
      this.close();
    });

    const selectButton = actionsContainer.createEl('button', {
      text: 'Select Note',
      cls: 'mod-cta'
    });
    selectButton.addEventListener('click', () => this.handleSelect());

    // Form
    const form = contentEl.createDiv('note-picker-form');

    // Get all markdown files from vault
    const allFiles = this.app.vault.getMarkdownFiles();
    let filteredFiles = [...allFiles];

    // Search input with fuzzy matching
    const searchContainer = form.createDiv('note-picker-search');
    new Setting(searchContainer)
      .setName('Search notes')
      .setDesc('Type to filter notes (fuzzy search)')
      .addText(text => text
        .setPlaceholder('Start typing note name...')
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
    const fileListContainer = form.createDiv('note-picker-list');

    const renderFileList = () => {
      fileListContainer.empty();

      if (filteredFiles.length === 0) {
        const emptyState = fileListContainer.createDiv('note-picker-empty');
        emptyState.textContent = 'No notes found';
        return;
      }

      filteredFiles.forEach(file => {
        const isAlreadyAdded = this.existingNotes.includes(file.path);
        const fileItem = fileListContainer.createDiv('note-picker-item');

        // Dim already-added notes
        if (isAlreadyAdded) {
          fileItem.addClass('is-disabled');
        }

        // Highlight selected file
        if (file.path === this.selectedNotePath) {
          fileItem.addClass('is-selected');
        }

        fileItem.textContent = file.path;
        if (isAlreadyAdded) {
          fileItem.textContent += ' (already added)';
        }

        // Click to select (unless already added)
        if (!isAlreadyAdded) {
          fileItem.addEventListener('click', () => {
            this.selectedNotePath = file.path;
            renderFileList();
          });
        }
      });
    };

    renderFileList();
  }

  private handleSelect(): void {
    if (!this.selectedNotePath.trim()) {
      // No selection - could show a notice
      return;
    }

    // Check if note is already added
    if (this.existingNotes.includes(this.selectedNotePath)) {
      // Already added - could show a notice
      return;
    }

    // Return the selected note
    if (this.resolve) {
      this.resolve({
        selected: true,
        notePath: this.selectedNotePath
      });
      this.resolve = null as any; // Prevent double resolve on close
    }

    this.close();
  }
}
