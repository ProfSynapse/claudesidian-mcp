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
  
  // Rate limiting
  private lastActivityTimes: Record<string, number> = {};
  private activityRateLimit: number = 5000; // 5 seconds
  
  // Configuration
  private excludePaths: string[] = [];
  private isInitialized: boolean = false;
  
  // Track vault loading state to ignore startup file events
  private vaultIsReady: boolean = false;
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
    this.fileOpenHandler = this.handleFileOpen.bind(this);
    this.activeLeafChangeHandler = this.handleActiveLeafChange.bind(this);
    this.sessionCreateHandler = this.handleSessionCreate.bind(this);
    this.sessionEndHandler = this.handleSessionEnd.bind(this);
    
    // Load configuration
    this.loadConfiguration();
    
    // Setup debounced processing based on strategy
    this.setupProcessingStrategy();
    
    // Initialize content cache (10MB max size, 5 minute TTL)
    this.contentCache = new ContentCache(10 * 1024 * 1024, 5 * 60 * 1000);
  }
  
  /**
   * Initialize the file event manager
   */
  async initialize(): Promise<void> {
    console.log('[FileEventManager] Initializing unified file event system');
    
    // Load workspace roots for faster lookups
    await this.refreshWorkspaceRoots();
    
    // Load active sessions
    await this.refreshActiveSessions();
    
    // Register event listeners
    this.registerEventListeners();
    
    // Start monitoring for vault ready state
    this.startVaultReadyDetection();
    
    // Handle startup embedding if configured (but only after vault is ready)
    // Note: The 'startup' strategy automatically indexes all non-indexed files when Obsidian starts
    // This ensures that new files created outside of Obsidian are indexed on the next launch
    if (this.embeddingStrategy.type === 'startup') {
      await this.waitForVaultReady();
      await this.handleStartupEmbedding();
    }
    
    // Start periodic content caching for existing files
    this.startContentCaching();
    
    this.isInitialized = true;
    console.log('[FileEventManager] Initialization complete');
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
    this.startupCheckTimer = setTimeout(() => {
      this.checkVaultReady();
    }, 2000); // Initial check after 2 seconds
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
    
    console.log(`[FileEventManager] File created: ${file.path}`);
    
    this.queueFileEvent({
      path: file.path,
      operation: 'create',
      timestamp: Date.now(),
      isSystemOperation: this.isSystemOperation,
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
    
    // Skip if modification time hasn't changed (file was just touched, not actually modified)
    if (lastModTime && Math.abs(currentModTime - lastModTime) < 1000) {
      console.log(`[FileEventManager] Skipping file ${file.path} - no actual content change detected`);
      return;
    }
    
    console.log(`[FileEventManager] File modified: ${file.path}, isSystemOperation: ${this.isSystemOperation}`);
    
    this.queueFileEvent({
      path: file.path,
      operation: 'modify',
      timestamp: Date.now(),
      isSystemOperation: this.isSystemOperation,
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
    
    console.log(`[FileEventManager] File deleted: ${file.path}`);
    
    this.queueFileEvent({
      path: file.path,
      operation: 'delete',
      timestamp: Date.now(),
      isSystemOperation: this.isSystemOperation,
      source: 'vault',
      priority: 'high' // Delete operations are high priority
    });
  }
  
  /**
   * Check if a file should be processed
   */
  private shouldProcessFile(file: TAbstractFile): boolean {
    // Only process markdown files
    if (!(file instanceof TFile) || file.extension !== 'md') {
      return false;
    }
    
    // Skip if not initialized
    if (!this.isInitialized) {
      return false;
    }
    
    // Skip excluded paths
    if (this.isExcludedPath(file.path)) {
      return false;
    }
    
    // Skip if already processing
    if (this.processingFiles.has(file.path)) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Check if a path is excluded
   */
  private isExcludedPath(path: string): boolean {
    const lowerPath = path.toLowerCase();
    
    // Always exclude system paths
    if (lowerPath.includes('chroma-db') || 
        lowerPath.includes('.obsidian') ||
        lowerPath.includes('/data/') ||
        lowerPath.includes('/collection')) {
      return true;
    }
    
    // Check configured exclude paths
    return this.excludePaths.some(pattern => {
      // Simple pattern matching (could be enhanced with glob)
      return path.includes(pattern.replace('/**/*', ''));
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
    
    console.log(`[FileEventManager] Queueing file event: ${event.operation} ${event.path} (system: ${event.isSystemOperation})`);
    
    // Deduplicate by keeping the latest event for each file
    const existingEvent = this.fileQueue.get(event.path);
    if (existingEvent) {
      // Update priority if new event is higher priority
      if (event.priority === 'high' || 
          (event.priority === 'normal' && existingEvent.priority === 'low')) {
        existingEvent.priority = event.priority;
      }
      // Update operation (delete takes precedence)
      if (event.operation === 'delete') {
        existingEvent.operation = 'delete';
      }
      existingEvent.timestamp = event.timestamp;
    } else {
      this.fileQueue.set(event.path, event);
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
      
      // Clear the queue
      this.fileQueue.clear();
      
      // Group events by operation for batch processing
      const deleteEvents = events.filter(e => e.operation === 'delete');
      const createEvents = events.filter(e => e.operation === 'create');
      const modifyEvents = events.filter(e => e.operation === 'modify');
      
      // Process deletes first (they're usually high priority)
      for (const event of deleteEvents) {
        await this.processFileEvent(event);
      }
      
      // Process creates and modifies based on embedding strategy
      const eventsToEmbed = [...createEvents, ...modifyEvents];
      
      if (this.embeddingStrategy.type !== 'manual' && eventsToEmbed.length > 0) {
        // Batch process embeddings
        await this.batchProcessEmbeddings(eventsToEmbed);
      }
      
      // Record activities for all events
      for (const event of eventsToEmbed) {
        await this.recordFileActivity(event);
      }
      
    } catch (error) {
      console.error('[FileEventManager] Error processing queue:', error);
      new Notice(`Error processing file events: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.isProcessingQueue = false;
      
      // If new events were added during processing, schedule another run
      if (this.fileQueue.size > 0) {
        console.log(`[FileEventManager] ${this.fileQueue.size} new events queued during processing`);
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
   * Batch process embeddings for multiple files
   */
  private async batchProcessEmbeddings(events: FileEvent[]): Promise<void> {
    console.log(`[FileEventManager] Batch processing embeddings for ${events.length} files`);
    
    // Mark as system operation to prevent loops
    this.startSystemOperation();
    
    try {
      // Process each file individually to use chunk-level updates when possible
      for (const event of events) {
        try {
          // Get the current file
          const file = this.app.vault.getAbstractFileByPath(event.path);
          if (!(file instanceof TFile)) continue;
          
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
          } else {
            // Otherwise, use full file embedding
            if (event.operation === 'modify' && !oldContent) {
              console.log(`[FileEventManager] No old content cached for ${event.path}, using full file embedding`);
            } else {
              console.log(`[FileEventManager] Using full file embedding for ${event.path} (operation: ${event.operation})`);
            }
            await this.embeddingService.updateFileEmbeddings([event.path]);
            // Cache the content for next time
            this.contentCache.set(event.path, newContent);
          }
          
        } catch (error) {
          console.error(`[FileEventManager] Error processing embeddings for ${event.path}:`, error);
        }
      }
      
      // Mark all as successfully embedded
      for (const event of events) {
        const result = this.completedFiles.get(event.path) || { success: true };
        result.embeddingCreated = true;
        this.completedFiles.set(event.path, result);
      }
    } catch (error) {
      console.error('[FileEventManager] Error batch processing embeddings:', error);
      // Don't throw - activities can still be recorded
    } finally {
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
   * Handle startup embedding - index all non-indexed files
   * 
   * This method is called when the embedding strategy is set to 'startup'.
   * It performs the following actions on plugin/vault startup:
   * 1. Retrieves all markdown files in the vault
   * 2. Checks which files already have embeddings in the database
   * 3. Filters out excluded paths based on user settings
   * 4. Indexes any files that don't have embeddings yet
   * 
   * This is useful for:
   * - Indexing files that were created outside of Obsidian
   * - Catching up on files that failed to index previously
   * - Ensuring comprehensive coverage of vault content
   * 
   * The operation is marked as a system operation to prevent recursive file events
   */
  private async handleStartupEmbedding(): Promise<void> {
    console.log('[FileEventManager] Running startup embedding');
    
    const markdownFiles = this.app.vault.getMarkdownFiles();
    const searchService = (this.plugin as any).searchService;
    
    if (!searchService) return;
    
    try {
      // Get existing embeddings from the database
      const existingEmbeddings = await searchService.getAllFileEmbeddings();
      const indexedPaths = new Set(existingEmbeddings.map((e: any) => e.filePath));
      
      // Find files that need indexing (not in database and not excluded)
      const filesToIndex = markdownFiles
        .filter(file => !indexedPaths.has(file.path))
        .filter(file => !this.isExcludedPath(file.path))
        .map(file => file.path);
      
      if (filesToIndex.length > 0) {
        console.log(`[FileEventManager] Found ${filesToIndex.length} files to index on startup`);
        
        // Mark as system operation to prevent file event loops
        this.startSystemOperation();
        try {
          await this.embeddingService.batchIndexFiles(filesToIndex);
        } finally {
          this.endSystemOperation();
        }
      }
    } catch (error) {
      console.error('[FileEventManager] Error during startup embedding:', error);
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
    
    // Clear any pending queue to prevent processing stale events
    this.fileQueue.clear();
    console.log('[FileEventManager] Cleared pending file queue');
    
    // Load new configuration
    this.loadConfiguration();
    
    // Re-setup processing strategy
    this.setupProcessingStrategy();
    
    // Restart vault ready detection after a brief delay
    setTimeout(() => {
      this.startupFileEventCount = 0;
      this.startVaultReadyDetection();
    }, 500);
    
    // If strategy changed to startup and we haven't run it yet, do it now
    if (this.embeddingStrategy.type === 'startup' && this.isInitialized) {
      this.waitForVaultReady().then(() => {
        this.handleStartupEmbedding();
      });
    }
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
}