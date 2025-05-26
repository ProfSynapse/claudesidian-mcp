import { App, Plugin, TAbstractFile, TFile, debounce, Notice } from 'obsidian';
import { MemoryService } from '../database/services/MemoryService';
import { WorkspaceService } from '../database/services/WorkspaceService';
import { EmbeddingService } from '../database/services/EmbeddingService';
import { EventManager } from './EventManager';
import { HierarchyType } from '../database/workspace-types';
import { sanitizePath } from '../utils/pathUtils';

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
  
  // Track plugin startup to ignore initial file events
  private pluginStartTime: number = Date.now();
  private startupGracePeriod: number = 5000; // 5 seconds grace period
  
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
    
    // Reset startup time on construction
    this.pluginStartTime = Date.now();
    
    // Initialize handlers
    this.fileCreatedHandler = this.handleFileCreated.bind(this);
    this.fileModifiedHandler = this.handleFileModified.bind(this);
    this.fileDeletedHandler = this.handleFileDeleted.bind(this);
    this.sessionCreateHandler = this.handleSessionCreate.bind(this);
    this.sessionEndHandler = this.handleSessionEnd.bind(this);
    
    // Load configuration
    this.loadConfiguration();
    
    // Setup debounced processing based on strategy
    this.setupProcessingStrategy();
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
    
    // Handle startup embedding if configured
    if (this.embeddingStrategy.type === 'startup') {
      await this.handleStartupEmbedding();
    }
    
    this.isInitialized = true;
    console.log('[FileEventManager] Initialization complete');
  }
  
  /**
   * Unload the file event manager
   */
  unload(): void {
    console.log('[FileEventManager] Unloading');
    
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
    this.activeSessions = {};
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
    
    this.eventManager.off('session:create', this.sessionCreateHandler);
    this.eventManager.off('session:end', this.sessionEndHandler);
  }
  
  /**
   * Handle file creation
   */
  private handleFileCreated(file: TAbstractFile): void {
    if (!this.shouldProcessFile(file)) return;
    
    // Skip events during startup grace period to avoid processing existing files
    const timeSinceStartup = Date.now() - this.pluginStartTime;
    if (timeSinceStartup < this.startupGracePeriod) {
      console.log(`[FileEventManager] Skipping startup file event for ${file.path} (${timeSinceStartup}ms since startup)`);
      return;
    }
    
    // Store initial modification time
    const modTime = (file as TFile).stat?.mtime || Date.now();
    this.fileModificationTimes.set(file.path, modTime);
    
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
  private handleFileModified(file: TAbstractFile): void {
    if (!this.shouldProcessFile(file)) return;
    
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
   * Handle file deletion
   */
  private handleFileDeleted(file: TAbstractFile): void {
    if (!this.shouldProcessFile(file)) return;
    
    // Clean up modification time tracking
    this.fileModificationTimes.delete(file.path);
    
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
   * Batch process embeddings for multiple files
   */
  private async batchProcessEmbeddings(events: FileEvent[]): Promise<void> {
    const filePaths = events.map(e => e.path);
    
    console.log(`[FileEventManager] Batch processing embeddings for ${filePaths.length} files`);
    console.log('[FileEventManager] Files to embed:', filePaths);
    
    // Mark as system operation to prevent loops
    this.startSystemOperation();
    
    try {
      // Use the embedding service's incremental update
      await this.embeddingService.updateFileEmbeddings(filePaths);
      
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
   * Handle startup embedding
   */
  private async handleStartupEmbedding(): Promise<void> {
    console.log('[FileEventManager] Running startup embedding');
    
    const markdownFiles = this.app.vault.getMarkdownFiles();
    const searchService = (this.plugin as any).searchService;
    
    if (!searchService) return;
    
    try {
      // Get existing embeddings
      const existingEmbeddings = await searchService.getAllFileEmbeddings();
      const indexedPaths = new Set(existingEmbeddings.map((e: any) => e.filePath));
      
      // Find files that need indexing
      const filesToIndex = markdownFiles
        .filter(file => !indexedPaths.has(file.path))
        .filter(file => !this.isExcludedPath(file.path))
        .map(file => file.path);
      
      if (filesToIndex.length > 0) {
        console.log(`[FileEventManager] Found ${filesToIndex.length} files to index on startup`);
        
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
    
    // Extend startup grace period to prevent processing existing files
    this.pluginStartTime = Date.now();
    
    // Clear any pending queue to prevent processing stale events
    this.fileQueue.clear();
    console.log('[FileEventManager] Cleared pending file queue');
    
    // Load new configuration
    this.loadConfiguration();
    
    // Re-setup processing strategy
    this.setupProcessingStrategy();
    
    // If strategy changed to startup and we haven't run it yet, do it now
    if (this.embeddingStrategy.type === 'startup' && this.isInitialized) {
      this.handleStartupEmbedding();
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