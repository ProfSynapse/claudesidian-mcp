import { App, TAbstractFile, TFile } from 'obsidian';
import { FileEvent } from './types';
import { FileEventQueue } from './FileEventQueue';
import { FileContentCache } from './FileContentCache';
import { VaultReadyDetector } from './VaultReadyDetector';

/**
 * Configuration for file event handlers
 */
interface FileEventHandlersConfig {
  isSystemOperation: () => boolean;
  isExcludedPath: (path: string) => boolean;
  onFileEvent: (event: FileEvent) => void;
}

/**
 * Handles file system events and converts them to FileEvents
 */
export class FileEventHandlers {
  // Event handlers
  private fileCreatedHandler: (file: TAbstractFile) => void;
  private fileModifiedHandler: (file: TAbstractFile) => void;
  private fileDeletedHandler: (file: TAbstractFile) => void;
  private fileOpenHandler: any;
  private activeLeafChangeHandler: any;

  constructor(
    private app: App,
    private contentCache: FileContentCache,
    private vaultReadyDetector: VaultReadyDetector,
    private eventQueue: FileEventQueue,
    private config: FileEventHandlersConfig
  ) {
    // Bind handlers
    this.fileCreatedHandler = this.handleFileCreated.bind(this);
    this.fileModifiedHandler = this.handleFileModified.bind(this);
    this.fileDeletedHandler = this.handleFileDeleted.bind(this);
    this.fileOpenHandler = this.handleFileOpen.bind(this);
    this.activeLeafChangeHandler = this.handleActiveLeafChange.bind(this);
  }

  /**
   * Register event listeners
   */
  registerEventListeners(): void {
    // Vault events
    // @ts-ignore - Obsidian API typing issue
    this.app.vault.on('create', this.fileCreatedHandler);
    // @ts-ignore
    this.app.vault.on('modify', this.fileModifiedHandler);
    // @ts-ignore
    this.app.vault.on('delete', this.fileDeletedHandler);

    // Workspace events - cache content when files are opened
    this.app.workspace.on('file-open', this.fileOpenHandler);
    this.app.workspace.on('active-leaf-change', this.activeLeafChangeHandler);
  }

  /**
   * Unregister event listeners
   */
  unregisterEventListeners(): void {
    // @ts-ignore
    this.app.vault.off('create', this.fileCreatedHandler);
    // @ts-ignore
    this.app.vault.off('modify', this.fileModifiedHandler);
    // @ts-ignore
    this.app.vault.off('delete', this.fileDeletedHandler);

    // Workspace events
    this.app.workspace.off('file-open', this.fileOpenHandler);
    this.app.workspace.off('active-leaf-change', this.activeLeafChangeHandler);
  }

  /**
   * Handle file creation
   */
  private async handleFileCreated(file: TAbstractFile): Promise<void> {
    if (!this.shouldProcessFile(file)) return;

    // Skip events during vault startup loading
    if (!this.vaultReadyDetector.isReady()) {
      this.vaultReadyDetector.incrementEventCount();
      console.log(`[FileEventHandlers] Skipping startup file event for ${file.path} (${this.vaultReadyDetector.getEventCount()} events so far)`);
      return;
    }

    // Store initial modification time
    const modTime = (file as TFile).stat?.mtime || Date.now();
    this.contentCache.updateModificationTime(file.path, modTime);

    // Cache the initial content for newly created files
    try {
      await this.contentCache.cacheFile(file as TFile);
      console.log(`[FileEventHandlers] Cached initial content for new file ${file.path}`);
    } catch (err) {
      // Ignore errors reading file content
    }

    console.log(`[FileEventHandlers] File created: ${file.path}`);

    this.config.onFileEvent({
      path: file.path,
      operation: 'create',
      timestamp: Date.now(),
      isSystemOperation: this.config.isSystemOperation(),
      source: 'vault',
      priority: 'normal'
    });
  }

  /**
   * Handle file modification
   */
  private async handleFileModified(file: TAbstractFile): Promise<void> {
    if (!this.shouldProcessFile(file)) return;

    // Skip events during vault startup loading
    if (!this.vaultReadyDetector.isReady()) {
      this.vaultReadyDetector.incrementEventCount();
      console.log(`[FileEventHandlers] Skipping startup file event for ${file.path} (${this.vaultReadyDetector.getEventCount()} events so far)`);
      return;
    }

    // Check if file has actually been modified
    const currentModTime = (file as TFile).stat?.mtime || Date.now();
    if (!this.contentCache.hasFileBeenModified(file.path, currentModTime)) {
      return;
    }

    console.log(`[FileEventHandlers] File modified: ${file.path}, isSystemOperation: ${this.config.isSystemOperation()}`);

    this.config.onFileEvent({
      path: file.path,
      operation: 'modify',
      timestamp: Date.now(),
      isSystemOperation: this.config.isSystemOperation(),
      source: 'vault',
      priority: 'normal'
    });
  }

  /**
   * Handle file deletion
   */
  private handleFileDeleted(file: TAbstractFile): void {
    if (!this.shouldProcessFile(file)) return;

    // Skip events during vault startup loading
    if (!this.vaultReadyDetector.isReady()) {
      this.vaultReadyDetector.incrementEventCount();
      console.log(`[FileEventHandlers] Skipping startup file event for ${file.path} (${this.vaultReadyDetector.getEventCount()} events so far)`);
      return;
    }

    // Clean up cached data
    this.contentCache.clearFile(file.path);

    console.log(`[FileEventHandlers] File deleted: ${file.path}`);

    this.config.onFileEvent({
      path: file.path,
      operation: 'delete',
      timestamp: Date.now(),
      isSystemOperation: this.config.isSystemOperation(),
      source: 'vault',
      priority: 'high' // Delete operations are high priority
    });
  }

  /**
   * Handle file open event - cache content when a file is opened
   */
  private async handleFileOpen(file: TFile | null): Promise<void> {
    if (!file || file.extension !== 'md') return;
    await this.contentCache.cacheFile(file);
  }

  /**
   * Handle active leaf change - cache content when switching to a file
   */
  private async handleActiveLeafChange(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
      await this.handleFileOpen(activeFile);
    }
  }

  /**
   * Check if a file should be processed
   */
  private shouldProcessFile(file: TAbstractFile): boolean {
    // Only process markdown files
    if (!(file instanceof TFile) || file.extension !== 'md') {
      return false;
    }

    // Skip excluded paths
    if (this.config.isExcludedPath(file.path)) {
      return false;
    }

    // Skip if already processing
    if (this.eventQueue.isProcessing(file.path)) {
      return false;
    }

    return true;
  }
}