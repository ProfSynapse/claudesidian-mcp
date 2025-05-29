import { App, Plugin, debounce, Notice } from 'obsidian';
import { MemoryService } from '../database/services/MemoryService';
import { WorkspaceService } from '../database/services/WorkspaceService';
import { EmbeddingService } from '../database/services/EmbeddingService';
import { EventManager } from './EventManager';
import {
  FileEvent,
  EmbeddingStrategy,
  FileEventManagerConfig,
  FileEventQueue,
  FileContentCache,
  WorkspaceActivityRecorder,
  EmbeddingProcessor,
  VaultReadyDetector,
  FileEventHandlers
} from './fileEventManager/index';

/**
 * Unified File Event Manager
 * 
 * This service is the single source of truth for all file-related events in the vault.
 * It coordinates multiple specialized components to handle:
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
  
  // Modular components
  private eventQueue: FileEventQueue;
  private contentCache: FileContentCache;
  private activityRecorder: WorkspaceActivityRecorder;
  private embeddingProcessor: EmbeddingProcessor;
  private vaultReadyDetector: VaultReadyDetector;
  private eventHandlers: FileEventHandlers;
  
  // Processing state
  private isSystemOperation: boolean = false;
  
  // Configuration
  private config: FileEventManagerConfig;
  private processQueueDebounced!: () => void;
  private isInitialized: boolean = false;
  
  // Session event handlers
  private sessionCreateHandler: (data: any) => void;
  private sessionEndHandler: (data: any) => void;
  
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
    
    // Load configuration
    this.config = this.loadConfiguration();
    
    // Initialize modular components
    this.eventQueue = new FileEventQueue();
    this.contentCache = new FileContentCache(app, 10 * 1024 * 1024, 5 * 60 * 1000);
    this.activityRecorder = new WorkspaceActivityRecorder(
      app,
      memoryService,
      workspaceService,
      this.config.cacheExpiry,
      this.config.activityRateLimit
    );
    this.embeddingProcessor = new EmbeddingProcessor(
      app,
      plugin,
      embeddingService,
      this.contentCache,
      this.config.embeddingStrategy
    );
    this.vaultReadyDetector = new VaultReadyDetector();
    this.eventHandlers = new FileEventHandlers(
      app,
      this.contentCache,
      this.vaultReadyDetector,
      this.eventQueue,
      {
        isSystemOperation: () => this.isSystemOperation,
        isExcludedPath: this.isExcludedPath.bind(this),
        onFileEvent: this.queueFileEvent.bind(this)
      }
    );
    
    // Initialize session handlers
    this.sessionCreateHandler = this.handleSessionCreate.bind(this);
    this.sessionEndHandler = this.handleSessionEnd.bind(this);
    
    // Setup debounced processing based on strategy
    this.setupProcessingStrategy();
  }
  
  /**
   * Initialize the file event manager
   */
  async initialize(): Promise<void> {
    console.log('[FileEventManager] Initializing unified file event system');
    
    // Initialize components
    await this.activityRecorder.initialize();
    
    // Register event listeners
    this.registerEventListeners();
    
    // Start monitoring for vault ready state
    this.vaultReadyDetector.startDetection();
    
    // Handle startup embedding if configured (but only after vault is ready)
    if (this.config.embeddingStrategy.type === 'startup') {
      await this.vaultReadyDetector.waitForReady();
      await this.embeddingProcessor.handleStartupEmbedding(this.isExcludedPath.bind(this));
    }
    
    // Start periodic content caching for existing files
    this.contentCache.startPeriodicCaching(this.isExcludedPath.bind(this));
    
    this.isInitialized = true;
    console.log('[FileEventManager] Initialization complete');
  }
  
  /**
   * Unload the file event manager
   */
  unload(): void {
    console.log('[FileEventManager] Unloading');
    
    // Unload components
    this.vaultReadyDetector.unload();
    this.contentCache.stopPeriodicCaching();
    
    // Process any remaining events
    if (this.eventQueue.getQueueSize() > 0) {
      this.processQueue();
    }
    
    // Unregister event listeners
    this.unregisterEventListeners();
    
    // Clear all component data
    this.eventQueue.clear();
    this.contentCache.clear();
    this.activityRecorder.clear();
  }
  
  
  /**
   * Load configuration from plugin settings
   */
  private loadConfiguration(): FileEventManagerConfig {
    const settings = (this.plugin as any).settings?.settings?.memory;
    
    return {
      embeddingStrategy: {
        type: settings?.embeddingStrategy || 'manual',
        idleTimeThreshold: settings?.idleTimeThreshold || 60000,
        batchSize: settings?.batchSize || 10,
        processingDelay: settings?.processingDelay || 1000
      },
      excludePaths: settings?.excludePaths || ['.obsidian/**/*', 'node_modules/**/*'],
      activityRateLimit: 5000, // 5 seconds
      cacheExpiry: 30 * 60 * 1000 // 30 minutes
    };
  }
  
  /**
   * Setup processing strategy based on configuration
   */
  private setupProcessingStrategy(): void {
    if (this.config.embeddingStrategy.type === 'idle') {
      // Create debounced processor for idle strategy
      this.processQueueDebounced = debounce(
        () => this.processQueue(),
        this.config.embeddingStrategy.idleTimeThreshold
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
    // Register file event handlers
    this.eventHandlers.registerEventListeners();
    
    // Session events
    this.eventManager.on('session:create', this.sessionCreateHandler);
    this.eventManager.on('session:end', this.sessionEndHandler);
  }
  
  /**
   * Unregister event listeners
   */
  private unregisterEventListeners(): void {
    // Unregister file event handlers
    this.eventHandlers.unregisterEventListeners();
    
    // Session events
    this.eventManager.off('session:create', this.sessionCreateHandler);
    this.eventManager.off('session:end', this.sessionEndHandler);
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
    return this.config.excludePaths.some((pattern: string) => {
      // Simple pattern matching (could be enhanced with glob)
      return path.includes(pattern.replace('/**/*', ''));
    });
  }
  
  /**
   * Queue a file event for processing
   */
  private queueFileEvent(event: FileEvent): void {
    // Add to queue
    this.eventQueue.queueEvent(event);
    
    console.log(`[FileEventManager] Queue size: ${this.eventQueue.getQueueSize()}, Strategy: ${this.config.embeddingStrategy.type}`);
    
    // Trigger processing based on strategy
    if (this.config.embeddingStrategy.type === 'manual' && event.operation === 'delete') {
      // Process deletes immediately in manual mode
      this.processQueue();
    } else if (this.config.embeddingStrategy.type === 'idle') {
      // Use debounced processing for idle strategy
      console.log(`[FileEventManager] Triggering debounced processing (${this.config.embeddingStrategy.idleTimeThreshold}ms)`);
      this.processQueueDebounced();
    }
  }
  
  /**
   * Process the file event queue
   */
  private async processQueue(): Promise<void> {
    if (this.eventQueue.getProcessingState() || this.eventQueue.getQueueSize() === 0) {
      return;
    }
    
    this.eventQueue.setProcessingState(true);
    const queueSize = this.eventQueue.getQueueSize();
    console.log(`[FileEventManager] Processing ${queueSize} queued file events`);
    
    try {
      // Get all events from queue (already sorted by priority)
      const events = this.eventQueue.dequeueAll();
      console.log('[FileEventManager] Processing files:', events.map(e => e.path));
      
      // Group events by operation for batch processing
      const deleteEvents = events.filter((e: FileEvent) => e.operation === 'delete');
      const createEvents = events.filter((e: FileEvent) => e.operation === 'create');
      const modifyEvents = events.filter((e: FileEvent) => e.operation === 'modify');
      
      // Process deletes first (they're usually high priority)
      for (const event of deleteEvents) {
        await this.processFileEvent(event);
      }
      
      // Process creates and modifies based on embedding strategy
      const eventsToEmbed = [...createEvents, ...modifyEvents];
      
      if (this.config.embeddingStrategy.type !== 'manual' && eventsToEmbed.length > 0) {
        // Mark as system operation to prevent loops
        this.startSystemOperation();
        try {
          // Batch process embeddings
          await this.embeddingProcessor.batchProcessEmbeddings(eventsToEmbed);
          
          // Mark all as successfully embedded
          for (const event of eventsToEmbed) {
            this.eventQueue.markCompleted(event.path, {
              success: true,
              embeddingCreated: true
            });
          }
        } finally {
          this.endSystemOperation();
        }
      }
      
      // Record activities for all events
      for (const event of eventsToEmbed) {
        await this.activityRecorder.recordFileActivity(event);
      }
      
    } catch (error) {
      console.error('[FileEventManager] Error processing queue:', error);
      new Notice(`Error processing file events: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.eventQueue.setProcessingState(false);
      
      // If new events were added during processing, schedule another run
      if (this.eventQueue.getQueueSize() > 0) {
        console.log(`[FileEventManager] ${this.eventQueue.getQueueSize()} new events queued during processing`);
        this.processQueueDebounced();
      }
    }
  }
  
  /**
   * Process a single file event
   */
  private async processFileEvent(event: FileEvent): Promise<void> {
    this.eventQueue.markProcessing(event.path);
    
    try {
      if (event.operation === 'delete') {
        // Handle deletion
        await this.embeddingProcessor.handleFileDeletion(event.path);
        // Clear from activity recorder cache
        this.activityRecorder.clearFileFromCache(event.path);
      } else {
        // For create/modify, record activity
        await this.activityRecorder.recordFileActivity(event);
      }
      
      // Mark as completed
      this.eventQueue.markCompleted(event.path, {
        success: true,
        embeddingCreated: false,
        activityRecorded: true
      });
      
    } catch (error) {
      console.error(`[FileEventManager] Error processing ${event.operation} for ${event.path}:`, error);
      this.eventQueue.markCompleted(event.path, {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  
  /**
   * Handle session creation
   */
  private handleSessionCreate(data: { id: string; workspaceId: string }): void {
    this.activityRecorder.handleSessionCreate(data);
  }
  
  /**
   * Handle session end
   */
  private handleSessionEnd(data: { id: string; workspaceId: string }): void {
    this.activityRecorder.handleSessionEnd(data);
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
    
    // Reset vault ready detector
    this.vaultReadyDetector.reset();
    
    // Clear any pending queue to prevent processing stale events
    this.eventQueue.clear();
    console.log('[FileEventManager] Cleared pending file queue');
    
    // Load new configuration
    this.config = this.loadConfiguration();
    
    // Update embedding processor strategy
    this.embeddingProcessor.updateStrategy(this.config.embeddingStrategy);
    
    // Re-setup processing strategy
    this.setupProcessingStrategy();
    
    // Restart vault ready detection after a brief delay
    setTimeout(() => {
      this.vaultReadyDetector.startDetection();
    }, 500);
    
    // If strategy changed to startup and we haven't run it yet, do it now
    if (this.config.embeddingStrategy.type === 'startup' && this.isInitialized) {
      this.vaultReadyDetector.waitForReady().then(() => {
        this.embeddingProcessor.handleStartupEmbedding(this.isExcludedPath.bind(this));
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
    const queueStats = this.eventQueue.getStats();
    return {
      queuedFiles: queueStats.queuedFiles,
      processingFiles: queueStats.processingFiles,
      completedFiles: queueStats.completedFiles,
      cachedWorkspaces: 0 // This info is now in WorkspaceActivityRecorder
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