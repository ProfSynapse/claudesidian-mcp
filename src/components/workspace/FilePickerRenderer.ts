import { App, Setting, TFile } from 'obsidian';

/**
 * FilePickerRenderer - Reusable file picker with fuzzy search
 *
 * Responsibilities:
 * - Render file picker view with search input
 * - Implement fuzzy file search
 * - Render file list with selection state
 * - Handle file selection and cancellation
 *
 * Used by:
 * - MemorySettingsTab (settings inline editing)
 * - WorkspaceEditModal (modal editing)
 */
export class FilePickerRenderer {
  private selectedFilePath: string = '';
  private allFiles: TFile[] = [];
  private filteredFiles: TFile[] = [];
  private fileListContainer?: HTMLElement;

  constructor(
    private app: App,
    private onSelect: (filePath: string) => void,
    private onCancel: () => void,
    initialSelection?: string
  ) {
    this.selectedFilePath = initialSelection || '';
    this.allFiles = this.app.vault.getFiles();
    this.filteredFiles = [...this.allFiles];
  }

  /**
   * Render the file picker view
   */
  render(container: HTMLElement): void {
    container.empty();

    // Header with back button and action buttons
    const header = container.createDiv('file-picker-header');
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
    backButton.addEventListener('click', () => this.onCancel());

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
    cancelButton.addEventListener('click', () => this.onCancel());

    const selectButton = actionsContainer.createEl('button', {
      text: 'Select File',
      cls: 'mod-cta'
    });
    selectButton.addEventListener('click', () => this.handleSelectFile());

    // File picker form
    const form = container.createDiv('file-picker-form');
    form.style.maxWidth = '600px';
    form.style.margin = '0 auto';

    // Search/Filter input with fuzzy matching
    this.renderSearchInput(form);

    // File list container
    this.fileListContainer = form.createDiv('file-picker-list');
    this.fileListContainer.style.maxHeight = '400px';
    this.fileListContainer.style.overflowY = 'auto';
    this.fileListContainer.style.border = '1px solid var(--background-modifier-border)';
    this.fileListContainer.style.borderRadius = '4px';
    this.fileListContainer.style.marginTop = '12px';

    this.renderFileList();
  }

  /**
   * Render search input with fuzzy search
   */
  private renderSearchInput(container: HTMLElement): void {
    const searchContainer = container.createDiv('file-picker-search');
    new Setting(searchContainer)
      .setName('Search files')
      .setDesc('Type to filter files (fuzzy search)')
      .addText(text => text
        .setPlaceholder('Start typing file name...')
        .onChange(value => {
          this.performFuzzySearch(value);
          this.renderFileList();
        }));
  }

  /**
   * Perform fuzzy search on file paths
   */
  private performFuzzySearch(searchTerm: string): void {
    const searchTermLower = searchTerm.toLowerCase();

    if (!searchTermLower) {
      this.filteredFiles = [...this.allFiles];
      return;
    }

    // Fuzzy search: match if all chars appear in order
    this.filteredFiles = this.allFiles.filter(file => {
      const filePath = file.path.toLowerCase();
      let searchIndex = 0;

      for (let i = 0; i < filePath.length && searchIndex < searchTermLower.length; i++) {
        if (filePath[i] === searchTermLower[searchIndex]) {
          searchIndex++;
        }
      }

      return searchIndex === searchTermLower.length;
    });
  }

  /**
   * Render file list with selection state
   */
  private renderFileList(): void {
    if (!this.fileListContainer) return;

    this.fileListContainer.empty();

    if (this.filteredFiles.length === 0) {
      const emptyState = this.fileListContainer.createDiv('file-picker-empty');
      emptyState.style.padding = '20px';
      emptyState.style.textAlign = 'center';
      emptyState.style.color = 'var(--text-muted)';
      emptyState.textContent = 'No files found';
      return;
    }

    this.filteredFiles.forEach(file => {
      const fileItem = this.fileListContainer!.createDiv('file-picker-item');
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
        this.renderFileList();
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
  }

  /**
   * Handle file selection
   */
  private handleSelectFile(): void {
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

    this.onSelect(this.selectedFilePath);
  }

  /**
   * Get currently selected file path
   */
  getSelectedPath(): string {
    return this.selectedFilePath;
  }
}
