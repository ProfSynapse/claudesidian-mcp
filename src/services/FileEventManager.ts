import { App, Plugin, TAbstractFile, TFile, debounce, Notice } from 'obsidian';
import { MemoryService } from '../database/services/MemoryService';
import { WorkspaceService } from '../database/services/WorkspaceService';
import { EmbeddingService } from '../database/services/EmbeddingService';
import { EventManager } from './EventManager';
import { HierarchyType } from '../database/workspace-types';
import { sanitizePath } from '../utils/pathUtils';
import { ContentCache } from '../database/utils/ContentCache';

/**
 * File operation types
 */
type FileOperation = 'create' | 'modify' | 'delete';

/**
 * File event structure for unified processing
 */
interface FileEvent {
  path: string;
  operation: FileOperation;
  timestamp: number;
  isSystemOperation: boolean;
  source: 'vault' | 'manual';
  priority: 'high' | 'normal' | 'low';
}

/**
 * Processing result for a file
 */
interface ProcessingResult {
  success: boolean;
  embeddingCreated?: boolean;
  activityRecorded?: boolean;
  error?: string;
}

/**
 * Embedding strategy configuration
 */
interface EmbeddingStrategy {
  type: 'manual' | 'idle' | 'startup';
  idleTimeThreshold: number;
  batchSize: number;
  processingDelay: number;
}

/**
 * Unified File Event Manager
 * 
 * This service is the single source of truth for all file-related events in the vault.
 * It handles:
 * - File event registration and deduplication
 * - Embedding generation based on configured strategy
 * - Workspace activity recording
 * - Memory trace creation for active sessions
 * - System operation filtering to prevent loops
 */
export class FileEventManager {
  // Core services
  private app: App;
  private plugin: Plugin;
  private memoryService: MemoryService;
  private workspaceService: WorkspaceService;
  private embeddingService: EmbeddingService;
  private eventManager: EventManager;
  
  // Event handlers
  private fileCreatedHandler: (file: TAbstractFile) => void;
  private fileModifiedHandler: (file: TAbstractFile) => void;
  private fileDeletedHandler: (file: TAbstractFile) => void;
  private fileRenamedHandler: (file: TAbstractFile, oldPath: string) => void;
  private fileOpenHandler: any;
  private activeLeafChangeHandler: any;
  private sessionCreateHandler: (data: any) => void;
  private sessionEndHandler: (data: any) => void;
  
  // Processing state
  private fileQueue: Map<string, FileEvent> = new Map();
  private processingFiles: Set<string> = new Set();
  private completedFiles: Map<string, ProcessingResult> = new Map();
  private isProcessingQueue: boolean = false;
  private isSystemOperation: boolean = false;
  
  // Embedding strategy
  private embeddingStrategy!: EmbeddingStrategy;
  private processQueueDebounced!: () => void;
  
  // Session management
  private activeSessions: Record<string, string> = {}; // workspaceId -> sessionId
  
  // Cache for workspace relationships
  private fileWorkspaceCache: Map<string, { workspaceIds: string[]; timestamp: number }> = new Map();
  private workspaceRoots: Map<string, { id: string; rootFolder: string }> = new Map();
  private cacheExpiry = 30 * 60 * 1000; // 30 minutes
  
  // Track file modification times to detect actual changes
  private fileModificationTimes: Map<string, number> = new Map();
  
  // Track last embedding update times to prevent rapid re-processing
  private lastEmbeddingUpdateTimes: Map<string, number> = new Map();
  private embeddingUpdateCooldown: number = 10000; // 10 seconds cooldown
  
  // Rate limiting
  private lastActivityTimes: Record<string, number> = {};
  private activityRateLimit: number = 5000; // 5 seconds
  
  // Configuration
  private excludePaths: string[] = [];
  private isInitialized: boolean = false;
  
  // Track vault loading state to ignore startup file events
  private vaultIsReady: boolean = false;
  private vaultReadyTimestamp: number = 0;
  private startupFileEventCount: number = 0;
  private startupCheckTimer: NodeJS.Timeout | null = null;
  
  // Content cache for tracking old content before modifications
  private contentCache: ContentCache;
  
  // Periodic caching timer
  private contentCachingTimer: NodeJS.Timeout | null = null;
  
  constructor(
    app: App,
    plugin: Plugin,
    memoryService: MemoryService,
    workspaceService: WorkspaceService,
    embeddingService: EmbeddingService,
    eventManager: EventManager
  ) {
    console.log('[FileEventManager] ========== CONSTRUCTOR CALLED ==========');
    console.log('[FileEventManager] FileEventManager is being created/recreated');
    this.app = app;
    this.plugin = plugin;
    this.memoryService = memoryService;
    this.workspaceService = workspaceService;
    this.embeddingService = embeddingService;
    this.eventManager = eventManager;
    
    // Initialize vault ready state
    this.vaultIsReady = false;
    this.startupFileEventCount = 0;
    
    // Initialize handlers
    this.fileCreatedHandler = this.handleFileCreated.bind(this);
    this.fileModifiedHandler = this.handleFileModified.bind(this);
    this.fileDeletedHandler = this.handleFileDeleted.bind(this);
    this.fileRenamedHandler = this.handleFileRenamed.bind(this);
    this.fileOpenHandler = this.handleFileOpen.bind(this);
    this.activeLeafChangeHandler = this.handleActiveLeafChange.bind(this);
    this.sessionCreateHandler = this.handleSessionCreate.bind(this);
    this.sessionEndHandler = this.handleSessionEnd.bind(this);
    
    // Load configuration
    console.log('[FileEventManager] Loading configuration...');
    this.loadConfiguration();
    console.log(`[FileEventManager] Configuration loaded - Strategy: ${this.embeddingStrategy.type}`);
    
    // Setup debounced processing based on strategy
    this.setupProcessingStrategy();
    
    // Initialize content cache (10MB max size, 5 minute TTL)
    this.contentCache = new ContentCache(10 * 1024 * 1024, 5 * 60 * 1000);
  }
  
  /**
   * Initialize the file event manager
   */
  async initialize(): Promise<void> {
    console.log('[FileEventManager] ========== INITIALIZATION START ==========');
    console.log('[FileEventManager] Initializing unified file event system');
    
    // Load any persisted queue from previous session FIRST
    console.log('[FileEventManager] Step 1: Loading persisted queue...');
    await this.loadPersistedQueue();
    console.log(`[FileEventManager] Step 1 Complete: Queue loaded - Size: ${this.fileQueue.size}, Contents: ${Array.from(this.fileQueue.keys())}`);
    
    // Load workspace roots for faster lookups
    console.log('[FileEventManager] Step 2: Loading workspace roots...');
    await this.refreshWorkspaceRoots();
    console.log('[FileEventManager] Step 2 Complete: Workspace roots loaded');
    
    // Load active sessions
    console.log('[FileEventManager] Step 3: Loading active sessions...');
    await this.refreshActiveSessions();
    console.log('[FileEventManager] Step 3 Complete: Active sessions loaded');
    
    // Register event listeners
    console.log('[FileEventManager] Step 4: Registering event listeners...');
    this.registerEventListeners();
    console.log('[FileEventManager] Step 4 Complete: Event listeners registered');
    
    // Start monitoring for vault ready state
    console.log('[FileEventManager] Step 5: Starting vault ready detection...');
    this.startVaultReadyDetection();
    console.log('[FileEventManager] Step 5 Complete: Vault ready detection started');
    
    // Handle startup embedding if configured - simple approach like idle strategy
    console.log(`[FileEventManager] Step 6: Checking startup embedding conditions...`);
    console.log(`[FileEventManager] - Strategy: ${this.embeddingStrategy.type}`);
    console.log(`[FileEventManager] - Queue size: ${this.fileQueue.size}`);
    console.log(`[FileEventManager] - Queue contents: ${Array.from(this.fileQueue.keys())}`);
    
    if (this.embeddingStrategy.type === 'startup' && this.fileQueue.size > 0) {
      console.log(`[FileEventManager] ✓ Strategy is 'startup' with ${this.fileQueue.size} queued files - processing after short delay`);
      
      // Use the same simple approach as idle strategy - just with a startup delay instead of idle timeout
      setTimeout(() => {
        console.log(`[FileEventManager] Processing startup queue after delay...`);
        this.processQueue();
      }, 3000); // 3 second delay to let Obsidian finish loading
      
    } else if (this.embeddingStrategy.type === 'startup') {
      console.log(`[FileEventManager] ✓ Strategy is 'startup' but no files queued - nothing to do`);
    } else {
      console.log(`[FileEventManager] ✗ Strategy is '${this.embeddingStrategy.type}', skipping startup embedding`);
    }
    
    // Start periodic content caching for existing files
    console.log('[FileEventManager] Step 7: Starting content caching...');
    this.startContentCaching();
    console.log('[FileEventManager] Step 7 Complete: Content caching started');
    
    this.isInitialized = true;
    console.log('[FileEventManager] ========== INITIALIZATION COMPLETE ==========');
  }
  
  /**
   * Unload the file event manager
   */
  unload(): void {
    console.log('[FileEventManager] Unloading');
    
    // Clear startup detection timer
    if (this.startupCheckTimer) {
      clearTimeout(this.startupCheckTimer);
      this.startupCheckTimer = null;
    }
    
    // Clear content caching timer
    if (this.contentCachingTimer) {
      clearInterval(this.contentCachingTimer);
      this.contentCachingTimer = null;
    }
    
    // Process any remaining events
    if (this.fileQueue.size > 0) {
      this.processQueue();
    }
    
    // Unregister event listeners
    this.unregisterEventListeners();
    
    // Clear caches
    this.fileQueue.clear();
    this.processingFiles.clear();
    this.completedFiles.clear();
    this.fileWorkspaceCache.clear();
    this.workspaceRoots.clear();
    this.contentCache.clear();
    this.fileModificationTimes.clear();
    this.lastEmbeddingUpdateTimes.clear();
    this.activeSessions = {};
  }
  
  /**
   * Start monitoring for vault ready state
   */
  private startVaultReadyDetection(): void {
    console.log('[FileEventManager] Starting vault ready detection');
    
    // Monitor file event frequency to detect when startup loading is complete
    this.startupFileEventCount = 0;
    
    // Check if vault is ready after initial file events settle
    // Give more time for initial file events to arrive
    this.startupCheckTimer = setTimeout(() => {
      this.checkVaultReady();
    }, 5000); // Initial check after 5 seconds
  }
  
  /**
   * Check if vault loading has completed by monitoring file event patterns
   */
  private checkVaultReady(): void {
    const currentEventCount = this.startupFileEventCount;
    
    // Wait a bit more and check if events have stopped
    setTimeout(() => {
      if (this.startupFileEventCount === currentEventCount) {
        // No new file events in the last second, vault is likely ready
        this.vaultIsReady = true;
        this.vaultReadyTimestamp = Date.now();
        console.log(`[FileEventManager] Vault ready detected after ${this.startupFileEventCount} startup file events`);
      } else {
        // Still receiving events, check again
        console.log(`[FileEventManager] Still receiving startup events (${this.startupFileEventCount} total), checking again...`);
        this.startupCheckTimer = setTimeout(() => this.checkVaultReady(), 1000);
      }
    }, 1000);
  }
  
  /**
   * Wait for vault to be ready
   */
  private async waitForVaultReady(): Promise<void> {
    return new Promise((resolve) => {
      if (this.vaultIsReady) {
        resolve();
        return;
      }
      
      const checkInterval = setInterval(() => {
        if (this.vaultIsReady) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }
  
  /**
   * Load configuration from plugin settings
   */
  private loadConfiguration(): void {
    const settings = (this.plugin as any).settings?.settings?.memory;
    if (!settings) return;
    
    // Embedding strategy
    this.embeddingStrategy = {
      type: settings.embeddingStrategy || 'manual',
      idleTimeThreshold: settings.idleTimeThreshold || 60000,
      batchSize: settings.batchSize || 10,
      processingDelay: settings.processingDelay || 1000
    };
    
    // Exclude paths
    this.excludePaths = settings.excludePaths || ['.obsidian/**/*', 'node_modules/**/*'];
  }
  
  /**
   * Setup processing strategy based on configuration
   */
  private setupProcessingStrategy(): void {
    if (this.embeddingStrategy.type === 'idle') {
      // Create debounced processor for idle strategy
      this.processQueueDebounced = debounce(
        () => this.processQueue(),
        this.embeddingStrategy.idleTimeThreshold
      );
    } else {
      // For manual strategy, process immediately but still debounce to batch
      this.processQueueDebounced = debounce(
        () => this.processQueue(),
        1000 // 1 second debounce for batching
      );
    }
  }
  
  /**
   * Register event listeners
   */
  private registerEventListeners(): void {
    // Vault events
    // @ts-ignore - Obsidian API typing issue
    this.app.vault.on('create', this.fileCreatedHandler);
    // @ts-ignore
    this.app.vault.on('modify', this.fileModifiedHandler);
    // @ts-ignore
    this.app.vault.on('delete', this.fileDeletedHandler);
    // @ts-ignore
    this.app.vault.on('rename', this.fileRenamedHandler);
    
    // Workspace events - cache content when files are opened
    this.app.workspace.on('file-open', this.fileOpenHandler);
    this.app.workspace.on('active-leaf-change', this.activeLeafChangeHandler);
    
    // Session events
    this.eventManager.on('session:create', this.sessionCreateHandler);
    this.eventManager.on('session:end', this.sessionEndHandler);
  }
  
  /**
   * Unregister event listeners
   */
  private unregisterEventListeners(): void {
    // @ts-ignore
    this.app.vault.off('create', this.fileCreatedHandler);
    // @ts-ignore
    this.app.vault.off('modify', this.fileModifiedHandler);
    // @ts-ignore
    this.app.vault.off('delete', this.fileDeletedHandler);
    // @ts-ignore
    this.app.vault.off('rename', this.fileRenamedHandler);
    
    // Workspace events
    this.app.workspace.off('file-open', this.fileOpenHandler);
    this.app.workspace.off('active-leaf-change', this.activeLeafChangeHandler);
    
    this.eventManager.off('session:create', this.sessionCreateHandler);
    this.eventManager.off('session:end', this.sessionEndHandler);
  }
  
  /**
   * Handle file creation
   */
  private async handleFileCreated(file: TAbstractFile): Promise<void> {
    if (!this.shouldProcessFile(file)) return;
    
    // Skip events during vault startup loading
    if (!this.vaultIsReady) {
      this.startupFileEventCount++;
      console.log(`[FileEventManager] Skipping startup file event for ${file.path} (${this.startupFileEventCount} events so far)`);
      return;
    }
    
    // For startup strategy: Filter out false "create" events for existing files
    // Obsidian fires "create" events for ALL existing files during vault loading
    if (this.embeddingStrategy.type === 'startup') {
      const timeSinceVaultReady = Date.now() - (this.vaultReadyTimestamp || 0);
      const isInStartupWindow = timeSinceVaultReady < 30000; // 30 seconds after vault ready
      
      if (isInStartupWindow) {
        // During startup window, check if file already has embeddings
        const searchService = (this.plugin as any).searchService;
        if (searchService) {
          try {
            const existingEmbeddings = await searchService.getAllFileEmbeddings();
            const isAlreadyIndexed = existingEmbeddings.some((e: any) => e.filePath === file.path);
            if (isAlreadyIndexed) {
              console.log(`[FileEventManager] STARTUP FILTER: Ignoring "create" event for already-indexed file: ${file.path}`);
              return;
            } else {
              console.log(`[FileEventManager] STARTUP FILTER: File not indexed, allowing create event: ${file.path}`);
            }
          } catch (error) {
            console.warn(`[FileEventManager] Could not check if file is already indexed: ${file.path}`, error);
            // If we can't check, allow the event to be safe
          }
        }
      } else {
        console.log(`[FileEventManager] STARTUP FILTER: Outside startup window, allowing create event: ${file.path}`);
      }
    }
    
    // Store initial modification time
    const modTime = (file as TFile).stat?.mtime || Date.now();
    this.fileModificationTimes.set(file.path, modTime);
    
    // Cache the initial content for newly created files
    try {
      const content = await this.app.vault.read(file as TFile);
      this.contentCache.set(file.path, content);
      console.log(`[FileEventManager] Cached initial content for new file ${file.path}`);
    } catch (err) {
      // Ignore errors reading file content
    }
    
    // Check both FileEventManager and vector store system operation flags
    const vectorStore = (this.plugin as any).vectorStore;
    const isSystemOp = this.isSystemOperation || (vectorStore && vectorStore.isSystemOperation);
    
    console.log(`[FileEventManager] File created: ${file.path}, isSystemOperation: ${isSystemOp} (FEM: ${this.isSystemOperation}, VS: ${vectorStore?.isSystemOperation})`);
    
    this.queueFileEvent({
      path: file.path,
      operation: 'create',
      timestamp: Date.now(),
      isSystemOperation: isSystemOp,
      source: 'vault',
      priority: 'normal'
    });
  }
  
  /**
   * Handle file modification
   */
  private async handleFileModified(file: TAbstractFile): Promise<void> {
    // Log all file modifications for debugging
    console.log(`[FileEventManager] File modification detected: ${file.path}`);
    
    if (!this.shouldProcessFile(file)) return;
    
    // Skip events during vault startup loading
    if (!this.vaultIsReady) {
      this.startupFileEventCount++;
      console.log(`[FileEventManager] Skipping startup file event for ${file.path} (${this.startupFileEventCount} events so far)`);
      return;
    }
    
    
    // Check if file has actually been modified (not just touched)
    const currentModTime = (file as TFile).stat?.mtime || Date.now();
    const lastModTime = this.fileModificationTimes.get(file.path);
    
    // Update the modification time
    this.fileModificationTimes.set(file.path, currentModTime);
    
    // Skip if modification time hasn't changed significantly (file was just touched, not actually modified)
    // Increased threshold to 2 seconds to avoid false positives
    if (lastModTime && Math.abs(currentModTime - lastModTime) < 2000) {
      console.log(`[FileEventManager] Skipping file ${file.path} - modification time too close (${currentModTime - lastModTime}ms)`);
      return;
    }
    
    // Check both FileEventManager and vector store system operation flags
    const vectorStore = (this.plugin as any).vectorStore;
    const isSystemOp = this.isSystemOperation || (vectorStore && vectorStore.isSystemOperation);
    
    console.log(`[FileEventManager] File modified: ${file.path}, isSystemOperation: ${isSystemOp} (FEM: ${this.isSystemOperation}, VS: ${vectorStore?.isSystemOperation})`);
    
    this.queueFileEvent({
      path: file.path,
      operation: 'modify',
      timestamp: Date.now(),
      isSystemOperation: isSystemOp,
      source: 'vault',
      priority: 'normal'
    });
  }
  
  /**
   * Handle file open event - cache content when a file is opened
   */
  private async handleFileOpen(file: TFile | null): Promise<void> {
    if (!file || file.extension !== 'md') return;
    
    try {
      const content = await this.app.vault.read(file);
      this.contentCache.set(file.path, content);
      console.log(`[FileEventManager] Cached content for opened file: ${file.path}`);
    } catch (err) {
      console.warn(`[FileEventManager] Failed to cache content for opened file ${file.path}:`, err);
    }
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
   * Handle file deletion
   */
  private handleFileDeleted(file: TAbstractFile): void {
    if (!this.shouldProcessFile(file)) return;
    
    // Skip events during vault startup loading
    if (!this.vaultIsReady) {
      this.startupFileEventCount++;
      console.log(`[FileEventManager] Skipping startup file event for ${file.path} (${this.startupFileEventCount} events so far)`);
      return;
    }
    
    // Clean up modification time tracking
    this.fileModificationTimes.delete(file.path);
    
    // Check both FileEventManager and vector store system operation flags
    const vectorStore = (this.plugin as any).vectorStore;
    const isSystemOp = this.isSystemOperation || (vectorStore && vectorStore.isSystemOperation);
    
    console.log(`[FileEventManager] File deleted: ${file.path}, isSystemOperation: ${isSystemOp} (FEM: ${this.isSystemOperation}, VS: ${vectorStore?.isSystemOperation})`);
    
    // Remove from persisted queue if it was queued for startup embedding
    if (this.embeddingStrategy.type === 'startup' && this.fileQueue.has(file.path)) {
      this.fileQueue.delete(file.path);
      this.persistQueue().catch(error => {
        console.warn('[FileEventManager] Failed to update persisted queue after deletion:', error);
      });
      console.log(`[FileEventManager] Removed deleted file from startup queue: ${file.path}`);
    }
    
    this.queueFileEvent({
      path: file.path,
      operation: 'delete',
      timestamp: Date.now(),
      isSystemOperation: isSystemOp,
      source: 'vault',
      priority: 'high' // Delete operations are high priority
    });
  }
  
  /**
   * Handle file rename
   */
  private async handleFileRenamed(file: TAbstractFile, oldPath: string): Promise<void> {
    if (!this.shouldProcessFile(file)) return;
    
    console.log(`[FileEventManager] File renamed: ${oldPath} -> ${file.path}`);
    
    // For startup strategy, update the queue with the new path
    if (this.embeddingStrategy.type === 'startup') {
      console.log(`[FileEventManager] Checking queue for rename - Queue size before: ${this.fileQueue.size}`);
      console.log(`[FileEventManager] Queue contents:`, Array.from(this.fileQueue.keys()));
      
      if (this.fileQueue.has(oldPath)) {
        const oldEvent = this.fileQueue.get(oldPath);
        if (oldEvent) {
          // Remove old path
          this.fileQueue.delete(oldPath);
          // Add new path with same event data (unless it already exists)
          if (!this.fileQueue.has(file.path)) {
            this.fileQueue.set(file.path, {
              ...oldEvent,
              path: file.path,
              timestamp: Date.now()
            });
            console.log(`[FileEventManager] Updated queued file path from ${oldPath} to ${file.path}`);
          } else {
            console.log(`[FileEventManager] New path ${file.path} already in queue, removed old path ${oldPath}`);
          }
          
          console.log(`[FileEventManager] Queue size after rename: ${this.fileQueue.size}`);
          console.log(`[FileEventManager] Queue contents after:`, Array.from(this.fileQueue.keys()));
          
          // Persist the updated queue
          this.persistQueue().catch(error => {
            console.warn('[FileEventManager] Failed to update persisted queue after rename:', error);
          });
        }
      } else {
        console.log(`[FileEventManager] Old path ${oldPath} not found in queue during rename`);
      }
    }
    
    // Update embeddings with the new path
    const searchService = (this.plugin as any).searchService;
    if (searchService && typeof searchService.updateFilePath === 'function') {
      try {
        await searchService.updateFilePath(oldPath, file.path);
        console.log(`[FileEventManager] Updated embeddings path from ${oldPath} to ${file.path}`);
      } catch (error) {
        console.error(`[FileEventManager] Error updating embeddings path:`, error);
      }
    }
    
    // Update content cache with new path
    const oldContent = this.contentCache.get(oldPath);
    if (oldContent) {
      this.contentCache.delete(oldPath);
      this.contentCache.set(file.path, oldContent);
    }
    
    // Update modification time tracking
    if (this.fileModificationTimes.has(oldPath)) {
      const modTime = this.fileModificationTimes.get(oldPath);
      this.fileModificationTimes.delete(oldPath);
      this.fileModificationTimes.set(file.path, modTime!);
    }
  }
  
  /**
   * Check if a file should be processed
   */
  private shouldProcessFile(file: TAbstractFile): boolean {
    // Only process markdown files
    if (!(file instanceof TFile) || file.extension !== 'md') {
      console.log(`[FileEventManager] Skipping non-markdown file: ${file.path} (extension: ${(file as TFile).extension || 'folder'})`);
      return false;
    }
    
    // Skip if not initialized
    if (!this.isInitialized) {
      console.log(`[FileEventManager] Skipping - not initialized: ${file.path}`);
      return false;
    }
    
    // Skip excluded paths
    if (this.isExcludedPath(file.path)) {
      // Already logged in isExcludedPath
      return false;
    }
    
    // Skip if already processing
    if (this.processingFiles.has(file.path)) {
      console.log(`[FileEventManager] Skipping - already processing: ${file.path}`);
      return false;
    }
    
    return true;
  }
  
  /**
   * Check if a path is excluded
   */
  private isExcludedPath(path: string): boolean {
    const lowerPath = path.toLowerCase();
    const normalizedPath = path.replace(/\\/g, '/'); // Normalize path separators
    
    // Always exclude system paths
    // Check for .obsidian directory first (most common)
    if (lowerPath.includes('.obsidian')) {
      console.log(`[FileEventManager] Excluding .obsidian path: ${path}`);
      return true;
    }
    
    // Check for plugin data directories
    if (normalizedPath.includes('/.obsidian/plugins/') ||
        normalizedPath.includes('/plugins/claudesidian-mcp/data/') ||
        normalizedPath.includes('/chroma-db/') ||
        lowerPath.includes('chroma-db')) {
      console.log(`[FileEventManager] Excluding plugin data path: ${path}`);
      return true;
    }
    
    // Check configured exclude paths
    return this.excludePaths.some(pattern => {
      // Simple pattern matching (could be enhanced with glob)
      const isExcluded = path.includes(pattern.replace('/**/*', ''));
      if (isExcluded) {
        console.log(`[FileEventManager] Excluding configured path: ${path} (pattern: ${pattern})`);
      }
      return isExcluded;
    });
  }
  
  /**
   * Queue a file event for processing
   */
  private queueFileEvent(event: FileEvent): void {
    // Skip system operations unless it's a delete
    if (event.isSystemOperation && event.operation !== 'delete') {
      console.log(`[FileEventManager] Skipping system operation: ${event.operation} ${event.path}`);
      return;
    }
    
    console.log(`[FileEventManager] Queueing file event: ${event.operation} ${event.path} (system: ${event.isSystemOperation}, source: ${event.source})`);
    
    // For startup strategy, track what gets queued to debug the issue
    if (this.embeddingStrategy.type === 'startup') {
      console.log(`[FileEventManager] STARTUP QUEUE DEBUG: Adding ${event.path} (${event.operation}) - Queue size before: ${this.fileQueue.size}`);
      console.log(`[FileEventManager] STARTUP QUEUE DEBUG: Vault ready state: ${this.vaultIsReady}, startup event count: ${this.startupFileEventCount}`);
    }
    
    console.log(`[FileEventManager] Current queue before adding:`, Array.from(this.fileQueue.keys()));
    
    // Deduplicate by keeping the latest event for each file
    const existingEvent = this.fileQueue.get(event.path);
    if (existingEvent) {
      // Update priority if new event is higher priority
      if (event.priority === 'high' || 
          (event.priority === 'normal' && existingEvent.priority === 'low')) {
        existingEvent.priority = event.priority;
      }
      // Update operation (delete takes precedence, then modify, then create)
      if (event.operation === 'delete') {
        existingEvent.operation = 'delete';
      } else if (event.operation === 'modify' && existingEvent.operation === 'create') {
        // Keep create operation if file was just created - no need to change to modify
        existingEvent.operation = 'create';
      }
      existingEvent.timestamp = event.timestamp;
      console.log(`[FileEventManager] Updated existing queue entry for ${event.path} (operation: ${existingEvent.operation})`);
    } else {
      this.fileQueue.set(event.path, event);
      console.log(`[FileEventManager] Added new queue entry for ${event.path} (operation: ${event.operation})`);
    }
    
    console.log(`[FileEventManager] Queue size: ${this.fileQueue.size}, Strategy: ${this.embeddingStrategy.type}`);
    
    // Trigger processing based on strategy
    if (this.embeddingStrategy.type === 'manual' && event.operation === 'delete') {
      // Process deletes immediately in manual mode
      this.processQueue();
    } else if (this.embeddingStrategy.type === 'idle') {
      // Use debounced processing for idle strategy
      console.log(`[FileEventManager] Triggering debounced processing (${this.embeddingStrategy.idleTimeThreshold}ms)`);
      this.processQueueDebounced();
    } else if (this.embeddingStrategy.type === 'startup') {
      // For startup strategy, only queue files - don't process until next startup
      console.log(`[FileEventManager] Queued file for next startup embedding: ${event.path}`);
      // Persist the queue so it survives plugin restart
      this.persistQueue().catch(error => {
        console.warn('[FileEventManager] Failed to persist queue:', error);
      });
      // Don't trigger processing - files will be processed on next startup
    }
  }
  
  /**
   * Process the file event queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.fileQueue.size === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    console.log(`[FileEventManager] Processing ${this.fileQueue.size} queued file events`);
    console.log('[FileEventManager] Queued files:', Array.from(this.fileQueue.keys()));
    
    try {
      // Sort events by priority and timestamp
      const events = Array.from(this.fileQueue.values()).sort((a, b) => {
        // Priority order: high > normal > low
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        
        // Then by timestamp (older first)
        return a.timestamp - b.timestamp;
      });
      
      // DON'T clear the queue here - we'll remove items as they're processed
      
      // Group events by operation for batch processing
      const deleteEvents = events.filter(e => e.operation === 'delete');
      const createEvents = events.filter(e => e.operation === 'create');
      const modifyEvents = events.filter(e => e.operation === 'modify');
      
      // Process deletes first (they're usually high priority)
      for (const event of deleteEvents) {
        await this.processFileEvent(event);
        // Remove from queue after successful processing
        this.fileQueue.delete(event.path);
        console.log(`[FileEventManager] Removed processed delete event from queue: ${event.path}`);
        
        // Update persisted queue for startup strategy
        if (this.embeddingStrategy.type === 'startup') {
          await this.persistQueue().catch(error => {
            console.warn('[FileEventManager] Failed to update persisted queue after delete:', error);
          });
        }
      }
      
      // Process creates and modifies based on embedding strategy
      const eventsToEmbed = [...createEvents, ...modifyEvents];
      
      if (this.embeddingStrategy.type !== 'manual' && eventsToEmbed.length > 0) {
        // Batch process embeddings with incremental queue updates
        await this.batchProcessEmbeddingsIncremental(eventsToEmbed);
      } else {
        // For manual strategy, just remove from queue since we're not processing
        for (const event of eventsToEmbed) {
          this.fileQueue.delete(event.path);
          console.log(`[FileEventManager] Removed manual strategy event from queue: ${event.path}`);
        }
      }
      
      // Record activities for remaining events and remove them from queue
      for (const event of eventsToEmbed) {
        // Only process if still in queue (might have been removed by batch processing)
        if (this.fileQueue.has(event.path)) {
          await this.recordFileActivity(event);
          this.fileQueue.delete(event.path);
          console.log(`[FileEventManager] Removed activity-recorded event from queue: ${event.path}`);
        }
      }
      
      // Final persist of empty/updated queue
      if (this.embeddingStrategy.type === 'startup') {
        await this.persistQueue().catch(error => {
          console.warn('[FileEventManager] Failed to persist final queue state:', error);
        });
      }
      
    } catch (error) {
      console.error('[FileEventManager] Error processing queue:', error);
      new Notice(`Error processing file events: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.isProcessingQueue = false;
      
      // If new events were added during processing, schedule another run
      if (this.fileQueue.size > 0) {
        console.log(`[FileEventManager] ${this.fileQueue.size} new events queued during processing`);
        console.log('[FileEventManager] New queued files:', Array.from(this.fileQueue.keys()));
        this.processQueueDebounced();
      }
    }
  }
  
  /**
   * Process a single file event
   */
  private async processFileEvent(event: FileEvent): Promise<void> {
    this.processingFiles.add(event.path);
    
    try {
      if (event.operation === 'delete') {
        // Handle deletion
        await this.handleFileDeletion(event.path);
      } else {
        // For create/modify, record activity
        await this.recordFileActivity(event);
      }
      
      // Mark as completed
      this.completedFiles.set(event.path, {
        success: true,
        embeddingCreated: false,
        activityRecorded: true
      });
      
    } catch (error) {
      console.error(`[FileEventManager] Error processing ${event.operation} for ${event.path}:`, error);
      this.completedFiles.set(event.path, {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      this.processingFiles.delete(event.path);
    }
  }
  
  /**
   * Start periodic content caching
   */
  private startContentCaching(): void {
    // Cache the currently open file immediately
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
      this.handleFileOpen(activeFile);
    }
    
    // Cache content every 60 seconds for recently modified files
    this.contentCachingTimer = setInterval(() => {
      this.cacheActiveFileContents();
    }, 60000); // 60 seconds
  }
  
  /**
   * Cache contents of recently accessed files
   */
  private async cacheActiveFileContents(): Promise<void> {
    try {
      // Get all markdown files
      const markdownFiles = this.app.vault.getMarkdownFiles();
      
      // Cache contents for files that have been recently accessed or modified
      const now = Date.now();
      const recentThreshold = 5 * 60 * 1000; // 5 minutes
      
      let cachedCount = 0;
      for (const file of markdownFiles) {
        // Skip excluded paths
        if (this.isExcludedPath(file.path)) continue;
        
        // Skip if already cached recently (check cache freshness)
        if (this.contentCache.get(file.path)) continue;
        
        // Check if file was recently modified
        const modTime = file.stat.mtime;
        if (now - modTime < recentThreshold) {
          try {
            const content = await this.app.vault.read(file);
            this.contentCache.set(file.path, content);
            cachedCount++;
          } catch (err) {
            // Ignore errors
          }
        }
      }
      
      if (cachedCount > 0) {
        console.log(`[FileEventManager] Pre-cached content for ${cachedCount} recently modified files`);
      }
    } catch (error) {
      console.error('[FileEventManager] Error caching file contents:', error);
    }
  }
  
  /**
   * Batch process embeddings for multiple files with incremental queue updates
   */
  private async batchProcessEmbeddingsIncremental(events: FileEvent[]): Promise<void> {
    console.log(`[FileEventManager] Batch processing embeddings for ${events.length} notes with incremental queue updates`);
    console.log('[FileEventManager] Notes to process:', events.map(e => e.path));
    
    // Show a shared notice for the batch operation
    const batchNotice = new Notice(`Embedding 0/${events.length} notes`, 0);
    
    // Mark as system operation to prevent loops
    this.startSystemOperation();
    console.log('[FileEventManager] System operation started');
    
    try {
      let processedCount = 0;
      
      // Process each file individually to allow incremental queue updates
      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        
        try {
          // Update progress notice with current note name
          const fileName = event.path.split('/').pop() || event.path;
          batchNotice.setMessage(`Embedding "${fileName}" (${processedCount + 1}/${events.length} notes)`);
          
          // Check if this file was recently processed
          const lastUpdate = this.lastEmbeddingUpdateTimes.get(event.path);
          if (lastUpdate && Date.now() - lastUpdate < this.embeddingUpdateCooldown) {
            console.log(`[FileEventManager] Skipping ${event.path} - recently updated (${Date.now() - lastUpdate}ms ago)`);
          } else {
            // Get the current file
            const file = this.app.vault.getAbstractFileByPath(event.path);
            if (!(file instanceof TFile)) {
              console.warn(`[FileEventManager] File not found or is folder: ${event.path}`);
            } else {
              // For modify operations, try to get old content from cache
              let oldContent = this.contentCache.get(event.path);
              
              // Read current content
              const newContent = await this.app.vault.read(file);
              
              // If we don't have old content cached, try to read it from the existing embeddings
              if (!oldContent && event.operation === 'modify') {
                // As a fallback, cache the current content for next time
                this.contentCache.set(event.path, newContent);
                console.log(`[FileEventManager] No cached content for ${event.path}, caching current content for next modification`);
              }
              
              // If we have old content and it's a modify operation, use chunk-level update
              if (oldContent && event.operation === 'modify' && oldContent !== newContent) {
                console.log(`[FileEventManager] Using chunk-level update for ${event.path} (old: ${oldContent.length} chars, new: ${newContent.length} chars)`);
                await this.embeddingService.updateChangedChunks(
                  event.path, 
                  oldContent, 
                  newContent
                );
                // Update the cache with new content for next time
                this.contentCache.set(event.path, newContent);
                // Mark this file as recently updated
                this.lastEmbeddingUpdateTimes.set(event.path, Date.now());
              } else if (event.operation === 'modify' && oldContent === newContent) {
                console.log(`[FileEventManager] Content unchanged for ${event.path}, skipping embedding update`);
              } else {
                // Otherwise, use full file embedding
                console.log(`[FileEventManager] Using full file embedding for ${event.path} (operation: ${event.operation})`);
                
                // Use the embedding service but suppress its individual notices during batch processing
                await this.embeddingService.updateFileEmbeddingsSilent([event.path]);
                // Cache the content for next time
                this.contentCache.set(event.path, newContent);
              }
              
              // Mark this file as recently updated
              this.lastEmbeddingUpdateTimes.set(event.path, Date.now());
            }
          }
          
          // Remove from queue after successful processing
          this.fileQueue.delete(event.path);
          console.log(`[FileEventManager] Removed processed embedding event from queue: ${event.path}`);
          
          // Update persisted queue for startup strategy after each file
          if (this.embeddingStrategy.type === 'startup') {
            await this.persistQueue().catch(error => {
              console.warn(`[FileEventManager] Failed to update persisted queue after processing ${event.path}:`, error);
            });
          }
          
          processedCount++;
          
        } catch (error) {
          console.error(`[FileEventManager] Error processing embeddings for ${event.path}:`, error);
          // Don't remove from queue on error - it will be retried next time
        }
      }
      
      // Update final notice
      batchNotice.setMessage(`Embedded ${processedCount} notes successfully`);
      setTimeout(() => batchNotice.hide(), 3000);
      
    } catch (error) {
      console.error('[FileEventManager] Error batch processing embeddings:', error);
      batchNotice.setMessage(`Error embedding notes: ${error instanceof Error ? error.message : String(error)}`);
      setTimeout(() => batchNotice.hide(), 5000);
    } finally {
      console.log('[FileEventManager] System operation ended');
      this.endSystemOperation();
    }
  }

  /**
   * Batch process embeddings for multiple files (legacy method for non-incremental processing)
   */
  private async batchProcessEmbeddings(events: FileEvent[]): Promise<void> {
    console.log(`[FileEventManager] Batch processing embeddings for ${events.length} notes`);
    console.log('[FileEventManager] Notes to process:', events.map(e => e.path));
    
    // Show a shared notice for the batch operation
    const batchNotice = new Notice(`Embedding 0/${events.length} notes`, 0);
    
    // Mark as system operation to prevent loops
    this.startSystemOperation();
    console.log('[FileEventManager] System operation started');
    
    try {
      let processedCount = 0;
      
      // Process each file individually to use chunk-level updates when possible
      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        try {
          // Update progress notice with current note name
          const fileName = event.path.split('/').pop() || event.path;
          batchNotice.setMessage(`Embedding "${fileName}" (${processedCount + 1}/${events.length} notes)`);
          
          // Check if this file was recently processed
          const lastUpdate = this.lastEmbeddingUpdateTimes.get(event.path);
          if (lastUpdate && Date.now() - lastUpdate < this.embeddingUpdateCooldown) {
            console.log(`[FileEventManager] Skipping ${event.path} - recently updated (${Date.now() - lastUpdate}ms ago)`);
            processedCount++;
            continue;
          }
          
          // Get the current file
          const file = this.app.vault.getAbstractFileByPath(event.path);
          if (!(file instanceof TFile)) {
            processedCount++;
            continue;
          }
          
          // For modify operations, try to get old content from cache
          let oldContent = this.contentCache.get(event.path);
          
          // Read current content
          const newContent = await this.app.vault.read(file);
          
          // If we don't have old content cached, try to read it from the existing embeddings
          if (!oldContent && event.operation === 'modify') {
            // As a fallback, cache the current content for next time
            this.contentCache.set(event.path, newContent);
            console.log(`[FileEventManager] No cached content for ${event.path}, caching current content for next modification`);
          }
          
          // If we have old content and it's a modify operation, use chunk-level update
          if (oldContent && event.operation === 'modify' && oldContent !== newContent) {
            console.log(`[FileEventManager] Using chunk-level update for ${event.path} (old: ${oldContent.length} chars, new: ${newContent.length} chars)`);
            console.log(`[FileEventManager] Content changed: ${oldContent === newContent ? 'NO' : 'YES'}`);
            await this.embeddingService.updateChangedChunks(
              event.path, 
              oldContent, 
              newContent
            );
            // Update the cache with new content for next time
            this.contentCache.set(event.path, newContent);
            // Mark this file as recently updated
            this.lastEmbeddingUpdateTimes.set(event.path, Date.now());
          } else {
            // Otherwise, use full file embedding
            if (event.operation === 'modify' && !oldContent) {
              console.log(`[FileEventManager] No old content cached for ${event.path}, using full file embedding`);
            } else if (event.operation === 'modify' && oldContent === newContent) {
              console.log(`[FileEventManager] Content unchanged for ${event.path}, skipping embedding update`);
              processedCount++;
              continue; // Skip this file as content hasn't changed
            } else {
              console.log(`[FileEventManager] Using full file embedding for ${event.path} (operation: ${event.operation})`);
            }
            
            // Use the embedding service but suppress its individual notices during batch processing
            await this.embeddingService.updateFileEmbeddingsSilent([event.path]);
            // Cache the content for next time
            this.contentCache.set(event.path, newContent);
          }
          
          // Mark this file as recently updated
          this.lastEmbeddingUpdateTimes.set(event.path, Date.now());
          processedCount++;
          
        } catch (error) {
          console.error(`[FileEventManager] Error processing embeddings for ${event.path}:`, error);
          processedCount++;
        }
      }
      
      // Mark all as successfully embedded
      for (const event of events) {
        const result = this.completedFiles.get(event.path) || { success: true };
        result.embeddingCreated = true;
        this.completedFiles.set(event.path, result);
      }
      
      // Update final notice
      batchNotice.setMessage(`Embedded ${processedCount} notes successfully`);
      setTimeout(() => batchNotice.hide(), 3000);
      
    } catch (error) {
      console.error('[FileEventManager] Error batch processing embeddings:', error);
      batchNotice.setMessage(`Error embedding notes: ${error instanceof Error ? error.message : String(error)}`);
      setTimeout(() => batchNotice.hide(), 5000);
      // Don't throw - activities can still be recorded
    } finally {
      console.log('[FileEventManager] System operation ended');
      this.endSystemOperation();
    }
  }
  
  /**
   * Handle file deletion
   */
  private async handleFileDeletion(filePath: string): Promise<void> {
    console.log(`[FileEventManager] Processing file deletion: ${filePath}`);
    
    try {
      // Delete embeddings
      const searchService = (this.plugin as any).searchService;
      if (searchService) {
        await searchService.deleteFileEmbedding(filePath);
      }
      
      // Clear from cache
      this.fileWorkspaceCache.delete(filePath);
      
    } catch (error) {
      console.error(`[FileEventManager] Error handling deletion for ${filePath}:`, error);
    }
  }
  
  /**
   * Record file activity in workspaces
   */
  private async recordFileActivity(event: FileEvent): Promise<void> {
    // Skip system operations
    if (event.isSystemOperation) {
      return;
    }
    
    // Find workspaces for this file
    const workspaceIds = await this.findWorkspacesForFile(event.path);
    
    for (const workspaceId of workspaceIds) {
      // Check rate limiting
      const now = Date.now();
      const lastTime = this.lastActivityTimes[workspaceId] || 0;
      if (now - lastTime < this.activityRateLimit) {
        continue;
      }
      
      this.lastActivityTimes[workspaceId] = now;
      
      // Record activity
      const action = event.operation === 'create' ? 'create' : 'edit';
      
      try {
        await this.workspaceService.recordActivity(workspaceId, {
          action,
          timestamp: event.timestamp,
          hierarchyPath: [event.path],
          toolName: 'fileEventManager'
        });
        
        // Record memory trace if there's an active session
        const sessionId = this.activeSessions[workspaceId];
        if (sessionId) {
          await this.recordMemoryTrace(workspaceId, sessionId, event);
        }
      } catch (error) {
        console.error(`[FileEventManager] Error recording activity for workspace ${workspaceId}:`, error);
      }
    }
  }
  
  /**
   * Record a memory trace for a file event
   */
  private async recordMemoryTrace(workspaceId: string, sessionId: string, event: FileEvent): Promise<void> {
    const actionText = event.operation === 'create' ? 'Created' : 'Modified';
    const content = `${actionText} file: ${event.path}`;
    
    // Get file content preview if available
    let fileContent: string | undefined;
    if (event.operation !== 'delete') {
      try {
        const file = this.app.vault.getAbstractFileByPath(event.path);
        if (file instanceof TFile) {
          fileContent = await this.app.vault.read(file);
          if (fileContent.length > 500) {
            fileContent = fileContent.substring(0, 500) + '...';
          }
        }
      } catch (err) {
        // Ignore errors reading file content
      }
    }
    
    await this.memoryService.storeMemoryTrace({
      workspaceId,
      workspacePath: [workspaceId],
      contextLevel: 'workspace' as HierarchyType,
      activityType: 'research',
      content: fileContent ? `${content}\n\nContent preview:\n${fileContent}` : content,
      metadata: {
        tool: 'FileEventManager',
        params: { path: event.path },
        result: { success: true },
        relatedFiles: [event.path]
      },
      sessionId,
      timestamp: event.timestamp,
      importance: event.operation === 'create' ? 0.8 : 0.6,
      tags: ['file', event.operation]
    });
  }
  
  /**
   * Find workspaces that contain a file
   */
  private async findWorkspacesForFile(filePath: string): Promise<string[]> {
    // Check cache first
    const cached = this.fileWorkspaceCache.get(filePath);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.workspaceIds;
    }
    
    // Refresh workspace roots if needed
    if (this.workspaceRoots.size === 0) {
      await this.refreshWorkspaceRoots();
    }
    
    const workspaceIds: string[] = [];
    
    // Find matching workspaces
    for (const [id, workspace] of this.workspaceRoots.entries()) {
      const normalizedFilePath = sanitizePath(filePath, false);
      const normalizedRootFolder = sanitizePath(workspace.rootFolder, false);
      const rootFolderWithSlash = normalizedRootFolder.endsWith('/') 
        ? normalizedRootFolder 
        : normalizedRootFolder + '/';
      
      if (normalizedFilePath === normalizedRootFolder || 
          normalizedFilePath.startsWith(rootFolderWithSlash)) {
        workspaceIds.push(id);
      }
    }
    
    // Update cache
    this.fileWorkspaceCache.set(filePath, {
      workspaceIds,
      timestamp: Date.now()
    });
    
    return workspaceIds;
  }
  
  /**
   * Refresh workspace roots cache
   */
  private async refreshWorkspaceRoots(): Promise<void> {
    try {
      this.workspaceRoots.clear();
      const workspaces = await this.workspaceService.getWorkspaces();
      
      for (const workspace of workspaces) {
        if (workspace.rootFolder) {
          this.workspaceRoots.set(workspace.id, {
            id: workspace.id,
            rootFolder: workspace.rootFolder
          });
        }
      }
    } catch (error) {
      console.error('[FileEventManager] Error refreshing workspace roots:', error);
    }
  }
  
  /**
   * Refresh active sessions
   */
  private async refreshActiveSessions(): Promise<void> {
    try {
      const activeSessions = await this.memoryService.getActiveSessions();
      this.activeSessions = {};
      
      for (const session of activeSessions) {
        this.activeSessions[session.workspaceId] = session.id;
      }
    } catch (error) {
      console.error('[FileEventManager] Error refreshing active sessions:', error);
    }
  }
  
  /**
   * Handle session creation
   */
  private handleSessionCreate(data: { id: string; workspaceId: string }): void {
    this.activeSessions[data.workspaceId] = data.id;
  }
  
  /**
   * Handle session end
   */
  private handleSessionEnd(data: { id: string; workspaceId: string }): void {
    if (this.activeSessions[data.workspaceId] === data.id) {
      delete this.activeSessions[data.workspaceId];
    }
  }
  
  
  /**
   * Mark the start of a system operation
   */
  startSystemOperation(): void {
    this.isSystemOperation = true;
    
    // Also mark on vector store if available
    const vectorStore = (this.plugin as any).vectorStore;
    if (vectorStore && vectorStore.startSystemOperation) {
      vectorStore.startSystemOperation();
    }
  }
  
  /**
   * Mark the end of a system operation
   */
  endSystemOperation(): void {
    this.isSystemOperation = false;
    
    // Also clear on vector store if available
    const vectorStore = (this.plugin as any).vectorStore;
    if (vectorStore && vectorStore.endSystemOperation) {
      vectorStore.endSystemOperation();
    }
  }
  
  /**
   * Reload configuration from plugin settings
   * Called when settings change
   */
  reloadConfiguration(): void {
    console.log('[FileEventManager] Reloading configuration');
    
    // Temporarily mark vault as not ready to prevent processing files during config reload
    this.vaultIsReady = false;
    
    // Only clear the queue if we're already initialized - preserve it during initial startup
    if (this.isInitialized) {
      this.fileQueue.clear();
      console.log('[FileEventManager] Cleared pending file queue (post-initialization)');
    } else {
      console.log('[FileEventManager] Preserving file queue during initial startup');
    }
    
    // Load new configuration
    this.loadConfiguration();
    
    // Re-setup processing strategy
    this.setupProcessingStrategy();
    
    // Mark vault as ready again since it was already ready before config change
    // Note: We do NOT trigger startup embedding here even if strategy changed to 'startup'
    // because startup embedding should only run on actual plugin startup, not on settings change
    this.vaultIsReady = true;
    this.vaultReadyTimestamp = Date.now();
  }
  
  /**
   * Get current processing stats
   */
  getStats(): {
    queuedFiles: number;
    processingFiles: number;
    completedFiles: number;
    cachedWorkspaces: number;
  } {
    return {
      queuedFiles: this.fileQueue.size,
      processingFiles: this.processingFiles.size,
      completedFiles: this.completedFiles.size,
      cachedWorkspaces: this.workspaceRoots.size
    };
  }
  
  /**
   * Load persisted queue from plugin data
   */
  private async loadPersistedQueue(): Promise<void> {
    console.log('[FileEventManager] ========== LOAD PERSISTED QUEUE START ==========');
    console.log('[FileEventManager] loadPersistedQueue() called');
    try {
      const plugin = this.plugin as any;
      if (!plugin.loadData) {
        console.log('[FileEventManager] ✗ No loadData method available on plugin');
        console.log('[FileEventManager] ========== LOAD PERSISTED QUEUE END (NO METHOD) ==========');
        return;
      }
      
      console.log('[FileEventManager] Calling plugin.loadData()...');
      const data = await plugin.loadData();
      console.log('[FileEventManager] Plugin data loaded:', data ? 'data exists' : 'no data');
      console.log('[FileEventManager] Raw plugin data keys:', data ? Object.keys(data) : 'no data');
      
      const queueData = data?.fileEventQueue;
      console.log('[FileEventManager] Queue data found:', queueData ? `${queueData.length} items` : 'none');
      console.log('[FileEventManager] Queue data type:', typeof queueData);
      console.log('[FileEventManager] Queue data is array:', Array.isArray(queueData));
      
      if (queueData && Array.isArray(queueData)) {
        console.log(`[FileEventManager] ✓ Loading ${queueData.length} persisted queue items`);
        console.log('[FileEventManager] Raw queue data:', queueData);
        
        for (const item of queueData) {
          console.log('[FileEventManager] Processing queue item:', item);
          if (item.path && item.operation && item.timestamp) {
            this.fileQueue.set(item.path, {
              path: item.path,
              operation: item.operation,
              timestamp: item.timestamp,
              isSystemOperation: item.isSystemOperation || false,
              source: item.source || 'vault',
              priority: item.priority || 'normal'
            });
            console.log(`[FileEventManager] ✓ Restored queue item: ${item.path}`);
          } else {
            console.warn('[FileEventManager] ✗ Invalid queue item (missing required fields):', item);
          }
        }
        
        console.log(`[FileEventManager] ✓ Restored ${this.fileQueue.size} items to queue`);
        console.log(`[FileEventManager] Final queue contents:`, Array.from(this.fileQueue.keys()));
        console.log('[FileEventManager] ========== LOAD PERSISTED QUEUE END (SUCCESS) ==========');
      } else {
        console.log('[FileEventManager] ✗ No valid queue data to restore');
        console.log('[FileEventManager] ========== LOAD PERSISTED QUEUE END (NO DATA) ==========');
      }
    } catch (error) {
      console.error('[FileEventManager] ✗ Failed to load persisted queue:', error);
      console.error('[FileEventManager] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : typeof error
      });
      console.log('[FileEventManager] ========== LOAD PERSISTED QUEUE END (ERROR) ==========');
    }
  }
  
  /**
   * Persist queue to plugin data
   */
  private async persistQueue(): Promise<void> {
    try {
      const plugin = this.plugin as any;
      if (!plugin.loadData || !plugin.saveData) return;
      
      // Only persist startup strategy queues
      if (this.embeddingStrategy.type !== 'startup') return;
      
      const data = await plugin.loadData() || {};
      const queueArray = Array.from(this.fileQueue.values());
      
      data.fileEventQueue = queueArray;
      await plugin.saveData(data);
      
      console.log(`[FileEventManager] Persisted ${queueArray.length} queue items`);
    } catch (error) {
      console.warn('[FileEventManager] Failed to persist queue:', error);
    }
  }
  
  /**
   * Clear persisted queue from plugin data
   */
  private async clearPersistedQueue(): Promise<void> {
    try {
      const plugin = this.plugin as any;
      if (!plugin.loadData || !plugin.saveData) return;
      
      const data = await plugin.loadData() || {};
      delete data.fileEventQueue;
      await plugin.saveData(data);
      
      console.log('[FileEventManager] Cleared persisted queue');
    } catch (error) {
      console.warn('[FileEventManager] Failed to clear persisted queue:', error);
    }
  }
  
  /**
   * Manually trigger embedding for specific files
   */
  async indexFiles(filePaths: string[]): Promise<void> {
    console.log(`[FileEventManager] Manual indexing requested for ${filePaths.length} files`);
    
    // Queue high priority events
    for (const path of filePaths) {
      this.queueFileEvent({
        path,
        operation: 'modify',
        timestamp: Date.now(),
        isSystemOperation: false,
        source: 'manual',
        priority: 'high'
      });
    }
    
    // Process immediately
    await this.processQueue();
  }
  
  /**
   * Manually trigger startup embedding for testing
   */
  async triggerStartupEmbedding(): Promise<void> {
    console.log('[FileEventManager] Manually triggering startup embedding for testing...');
    await this.processQueue();
  }
}