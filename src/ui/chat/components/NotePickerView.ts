/**
 * NotePickerView - Dedicated view for selecting context notes from the vault
 * Location: /src/ui/chat/components/NotePickerView.ts
 *
 * This class is responsible for:
 * - Rendering note picker interface with fuzzy search
 * - Filtering vault notes by search term
 * - Managing note selection state
 * - Providing callback for note selection confirmation
 *
 * Used by ChatSettingsModal to handle context note selection,
 * following the Single Responsibility Principle for view components.
 */

import { App, TFile } from 'obsidian';

export interface NotePickerEvents {
  onNoteSelected: (notePath: string) => void;
  onCancel: () => void;
}

export class NotePickerView {
  private selectedNotePath: string = '';
  private allFiles: TFile[] = [];
  private filteredFiles: TFile[] = [];

  constructor(
    private app: App,
    private events: NotePickerEvents
  ) {
    this.allFiles = this.app.vault.getMarkdownFiles();
    this.filteredFiles = [...this.allFiles];
  }

  /**
   * Render the note picker view
   */
  render(container: HTMLElement): void {
    container.empty();

    // Header with back button and action buttons
    const header = container.createDiv('note-picker-header');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '20px';

    // Left side: Back button and title
    const leftSection = header.createDiv('note-picker-header-left');
    leftSection.style.display = 'flex';
    leftSection.style.alignItems = 'center';
    leftSection.style.gap = '12px';

    const backButton = leftSection.createEl('button', {
      text: '← Back',
      cls: 'note-picker-back-button'
    });
    backButton.addEventListener('click', () => {
      this.selectedNotePath = '';
      this.events.onCancel();
    });

    leftSection.createEl('h2', {
      text: 'Select Context Note',
      cls: 'note-picker-title'
    });

    // Right side: Action buttons
    const actionsContainer = header.createDiv('note-picker-actions');
    actionsContainer.style.display = 'flex';
    actionsContainer.style.gap = '8px';

    const cancelButton = actionsContainer.createEl('button', {
      text: 'Cancel'
    });
    cancelButton.addEventListener('click', () => {
      this.selectedNotePath = '';
      this.events.onCancel();
    });

    const selectButton = actionsContainer.createEl('button', {
      text: 'Select Note',
      cls: 'mod-cta'
    });
    selectButton.addEventListener('click', () => this.handleSelectNote());

    // Note picker form
    const form = container.createDiv('note-picker-form');
    form.style.maxWidth = '600px';
    form.style.margin = '0 auto';

    // Search input with fuzzy matching
    this.renderSearchInput(form);

    // File list container
    const fileListContainer = form.createDiv('note-picker-list');
    fileListContainer.style.maxHeight = '400px';
    fileListContainer.style.overflowY = 'auto';
    fileListContainer.style.border = '1px solid var(--background-modifier-border)';
    fileListContainer.style.borderRadius = '4px';
    fileListContainer.style.marginTop = '12px';

    this.renderFileList(fileListContainer);
  }

  /**
   * Render search input with fuzzy matching
   */
  private renderSearchInput(container: HTMLElement): void {
    const searchContainer = container.createDiv('note-picker-search');

    const searchLabel = searchContainer.createDiv('setting-item');
    searchLabel.createDiv('setting-item-info').createDiv('setting-item-name').textContent = 'Search notes';
    const descEl = searchLabel.createDiv('setting-item-info').createDiv('setting-item-description');
    descEl.textContent = 'Type to filter notes (fuzzy search)';

    const searchControl = searchLabel.createDiv('setting-item-control');
    const searchInput = searchControl.createEl('input', {
      type: 'text',
      placeholder: 'Start typing note name...'
    });
    searchInput.style.width = '100%';

    searchInput.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      this.handleSearch(target.value);
    });
  }

  /**
   * Handle search input change
   */
  private handleSearch(searchTerm: string): void {
    const lowerSearchTerm = searchTerm.toLowerCase();

    if (!lowerSearchTerm) {
      this.filteredFiles = [...this.allFiles];
    } else {
      // Fuzzy search: match if all chars appear in order
      this.filteredFiles = this.allFiles.filter(file => {
        const filePath = file.path.toLowerCase();
        let searchIndex = 0;

        for (let i = 0; i < filePath.length && searchIndex < lowerSearchTerm.length; i++) {
          if (filePath[i] === lowerSearchTerm[searchIndex]) {
            searchIndex++;
          }
        }

        return searchIndex === lowerSearchTerm.length;
      });
    }

    // Find the file list container and re-render
    const fileListContainer = document.querySelector('.note-picker-list');
    if (fileListContainer) {
      this.renderFileList(fileListContainer as HTMLElement);
    }
  }

  /**
   * Render file list
   */
  private renderFileList(container: HTMLElement): void {
    container.empty();

    if (this.filteredFiles.length === 0) {
      const emptyState = container.createDiv('note-picker-empty');
      emptyState.style.padding = '20px';
      emptyState.style.textAlign = 'center';
      emptyState.style.color = 'var(--text-muted)';
      emptyState.textContent = 'No notes found';
      return;
    }

    this.filteredFiles.forEach(file => {
      const fileItem = container.createDiv('note-picker-item');
      fileItem.style.padding = '8px 12px';
      fileItem.style.cursor = 'pointer';
      fileItem.style.borderBottom = '1px solid var(--background-modifier-border)';

      // Highlight selected file
      if (file.path === this.selectedNotePath) {
        fileItem.style.backgroundColor = 'var(--background-modifier-hover)';
        fileItem.style.fontWeight = 'bold';
      }

      fileItem.textContent = file.path;

      // Click to select
      fileItem.addEventListener('click', () => {
        this.selectedNotePath = file.path;
        this.renderFileList(container);
      });

      // Hover effect
      fileItem.addEventListener('mouseenter', () => {
        if (file.path !== this.selectedNotePath) {
          fileItem.style.backgroundColor = 'var(--background-modifier-hover)';
        }
      });
      fileItem.addEventListener('mouseleave', () => {
        if (file.path !== this.selectedNotePath) {
          fileItem.style.backgroundColor = '';
        }
      });
    });
  }

  /**
   * Handle select note button click
   */
  private handleSelectNote(): void {
    if (!this.selectedNotePath.trim()) {
      // Could add visual feedback here
      return;
    }

    this.events.onNoteSelected(this.selectedNotePath);
    this.selectedNotePath = '';
  }

  /**
   * Get selected note path
   */
  getSelectedNotePath(): string {
    return this.selectedNotePath;
  }

  /**
   * Set selected note path
   */
  setSelectedNotePath(path: string): void {
    this.selectedNotePath = path;
  }
}
