import { App, Plugin, TAbstractFile, TFile, debounce } from 'obsidian';
import { 
    IFileEventCoordinator, 
    IFileEventManagerDependencies,
    FileEvent,
    EmbeddingStrategy 
} from '../interfaces/IFileEventServices';
import { IncompleteFilesStateManager } from '../../../database/services/indexing/state/IncompleteFilesStateManager';

export class FileEventCoordinator implements IFileEventCoordinator {
    private isProcessingQueue = false;
    private processQueueDebounced!: () => void;
    private isStartupPhase = true;
    private startupTimeout: NodeJS.Timeout | null = null;
    private embeddingStrategy: EmbeddingStrategy = { type: 'idle', idleTimeThreshold: 10000, batchSize: 10, processingDelay: 1000 };
    private notifiedFiles = new Set<string>(); // Track files we've already notified about
    private incompleteFilesManager: IncompleteFilesStateManager;

    // Event handlers
    private fileCreatedHandler!: (file: TAbstractFile) => void;
    private fileModifiedHandler!: (file: TAbstractFile) => void;
    private fileDeletedHandler!: (file: TAbstractFile) => void;
    private fileRenamedHandler!: (file: TAbstractFile, oldPath: string) => void;

    constructor(
        private app: App,
        private plugin: Plugin,
        private dependencies: IFileEventManagerDependencies
    ) {
        this.incompleteFilesManager = new IncompleteFilesStateManager(plugin);
        this.initializeDebounce();
        this.bindEventHandlers();
    }

    /**
     * Get the incomplete files state manager for deferred migration
     */
    getIncompleteFilesManager(): IncompleteFilesStateManager {
        return this.incompleteFilesManager;
    }

    async initialize(): Promise<void> {
        try {
            
            // Initialize incomplete files tracking (includes migration)
            await this.incompleteFilesManager.initialize();
            
            // Initialize all dependencies
            this.dependencies.fileMonitor.startMonitoring();
            
            // Restore persisted queue
            await this.dependencies.fileEventQueue.restore();
            
            // Register vault event handlers
            this.registerVaultEventHandlers();
            
            // End startup phase after 5 seconds to allow initial vault events to settle
            this.startupTimeout = setTimeout(() => {
                this.isStartupPhase = false;
            }, 5000);
            
            // Start processing any existing queue
            if (this.dependencies.fileEventQueue.size() > 0) {
                this.processQueueDebounced();
            }
            
        } catch (error) {
            console.error('[FileEventCoordinator] Initialization failed:', error);
            throw error;
        }
    }

    async shutdown(): Promise<void> {
        try {
            
            // Clear startup timeout
            if (this.startupTimeout) {
                clearTimeout(this.startupTimeout);
                this.startupTimeout = null;
            }
            
            // Unregister event handlers
            this.unregisterVaultEventHandlers();
            
            // Stop monitoring
            this.dependencies.fileMonitor.stopMonitoring();
            
            // Persist any remaining queue
            await this.dependencies.fileEventQueue.persist();
            
        } catch (error) {
            console.error('[FileEventCoordinator] Shutdown error:', error);
        }
    }

    async handleFileCreated(file: TAbstractFile): Promise<void> {
        if (!this.dependencies.fileMonitor.shouldProcessFile(file)) return;
        
        if (!this.dependencies.fileMonitor.isVaultReady()) {
            this.dependencies.fileMonitor.incrementStartupEventCount();
            return;
        }

        // Ignore events during startup phase (these are existing files, not new ones)
        if (this.isStartupPhase) {
            return;
        }

        // Mark new file for embedding
        if (file instanceof TFile) {
            try {
                const content = await this.app.vault.read(file);
                const newHash = await this.calculateContentHash(content);
                
                await this.incompleteFilesManager.markForReembedding(
                    file.path,
                    '', // No old hash for new files
                    newHash,
                    'create',
                    'new_file'
                );
            } catch (error) {
                console.error(`[FileEventCoordinator] Failed to calculate hash for new file ${file.path}:`, error);
            }
        }

        // Check if this is a system operation
        const isSystemOp = this.dependencies.fileMonitor.isSystemOperation();
        
        this.queueFileEvent({
            path: file.path,
            operation: 'create',
            timestamp: Date.now(),
            isSystemOperation: isSystemOp,
            source: 'vault',
            priority: 'normal'
        });
    }

    async handleFileModified(file: TAbstractFile): Promise<void> {
        if (!this.dependencies.fileMonitor.shouldProcessFile(file)) return;
        
        if (!this.dependencies.fileMonitor.isVaultReady()) {
            this.dependencies.fileMonitor.incrementStartupEventCount();
            return;
        }

        // Ignore events during startup phase
        if (this.isStartupPhase) {
            return;
        }

        // Check if file has actually changed content
        if (file instanceof TFile) {
            const hasChanged = await this.dependencies.fileMonitor.hasContentChanged(file);
            if (!hasChanged) {
                return;
            }
        }

        // Check if we should skip rapid updates
        if (this.dependencies.fileMonitor.shouldSkipEmbeddingUpdate(file.path)) {
            return;
        }

        // Calculate content hash and mark for re-embedding
        if (file instanceof TFile) {
            try {
                const content = await this.app.vault.read(file);
                const newHash = await this.calculateContentHash(content);
                const oldHash = this.getStoredHash(file.path) || '';
                
                await this.incompleteFilesManager.markForReembedding(
                    file.path,
                    oldHash,
                    newHash,
                    'modify',
                    'content_changed'
                );
            } catch (error) {
                console.error(`[FileEventCoordinator] Failed to calculate hash for ${file.path}:`, error);
            }
        }

        const isSystemOp = this.dependencies.fileMonitor.isSystemOperation();
        
        this.queueFileEvent({
            path: file.path,
            operation: 'modify',
            timestamp: Date.now(),
            isSystemOperation: isSystemOp,
            source: 'vault',
            priority: 'normal'
        });
    }

    async handleFileDeleted(file: TAbstractFile): Promise<void> {
        if (!this.dependencies.fileMonitor.shouldProcessFile(file)) return;
        
        
        this.queueFileEvent({
            path: file.path,
            operation: 'delete',
            timestamp: Date.now(),
            isSystemOperation: false, // Deletions are usually user-initiated
            source: 'vault',
            priority: 'high' // Process deletions with high priority
        });
    }

    async handleFileRenamed(file: TAbstractFile, oldPath: string): Promise<void> {
        
        // Treat rename as delete old + create new
        this.queueFileEvent({
            path: oldPath,
            operation: 'delete',
            timestamp: Date.now(),
            isSystemOperation: false,
            source: 'vault',
            priority: 'high'
        });
        
        this.queueFileEvent({
            path: file.path,
            operation: 'create',
            timestamp: Date.now() + 1, // Ensure create happens after delete
            isSystemOperation: false,
            source: 'vault',
            priority: 'normal'
        });
    }

    async processQueue(): Promise<void> {
        if (this.isProcessingQueue) {
            return;
        }

        this.isProcessingQueue = true;
        
        try {
            const events = this.dependencies.fileEventQueue.getEvents();
            
            if (events.length === 0) {
                return;
            }

            // Check if we need vector services for processing
            const needsVectorServices = events.some(e => e.operation === 'create' || e.operation === 'modify' || e.operation === 'delete');
            
            if (needsVectorServices && !this.dependencies.fileEventProcessor) {
                // Try to initialize vector services on-demand
                try {
                    const plugin = (this.app as any).plugins?.plugins?.['claudesidian-mcp'];
                    if (plugin?.getServiceContainer) {
                        const serviceContainer = plugin.getServiceContainer();
                        const fileEventManager = await serviceContainer.get('fileEventManager');
                        if (fileEventManager && typeof fileEventManager.activateVectorServices === 'function') {
                            await fileEventManager.activateVectorServices();
                        }
                    }
                } catch (error) {
                    console.warn('[FileEventCoordinator] Failed to activate vector services on-demand:', error);
                }
                
                // If still not available, queue for later
                if (!this.dependencies.fileEventProcessor) {
                    return;
                }
            }

            // Group events by operation for efficient processing
            const deleteEvents = events.filter(e => e.operation === 'delete');
            const createModifyEvents = events.filter(e => e.operation === 'create' || e.operation === 'modify');

            // Process deletes first (they're usually high priority)
            for (const event of deleteEvents) {
                if (this.dependencies.fileEventProcessor) {
                    await this.dependencies.fileEventProcessor.processEvent(event);
                }
                this.dependencies.fileEventQueue.removeEvent(event.path);
            }

            // Handle embeddings for create/modify events
            if (createModifyEvents.length > 0 && this.dependencies.embeddingScheduler) {
                // Check if we should process embeddings now or just queue them
                const strategy = this.dependencies.embeddingScheduler.getStrategy();
                
                if (strategy.type === 'startup') {
                    // For startup strategy: Record activity but keep in queue for startup processing
                    for (const event of createModifyEvents) {
                        if (this.dependencies.activityTracker) {
                            await this.dependencies.activityTracker.recordFileActivity(event);
                        }
                        // DON'T remove from queue - these will be processed on plugin startup
                    }
                } else if (strategy.type === 'idle') {
                    // For idle strategy, notify scheduler about new events but don't process yet
                    // Filter out files we've already notified about to prevent infinite loop
                    const newFiles = createModifyEvents.filter(event => !this.notifiedFiles.has(event.path));
                    if (newFiles.length > 0) {
                        this.dependencies.embeddingScheduler.notifyFileEvents(newFiles);
                        // Track that we've notified about these files
                        newFiles.forEach(event => this.notifiedFiles.add(event.path));
                    } else {
                    }
                    
                    // Record activity but keep in queue for idle processing
                    for (const event of createModifyEvents) {
                        if (this.dependencies.activityTracker) {
                            await this.dependencies.activityTracker.recordFileActivity(event);
                        }
                        // DON'T remove from queue - these will be processed when idle
                    }
                } else {
                    // For other strategies, process immediately and remove from queue
                    await this.dependencies.embeddingScheduler.scheduleEmbedding(createModifyEvents);
                    
                    // Process and remove from queue
                    for (const event of createModifyEvents) {
                        if (this.dependencies.activityTracker) {
                            await this.dependencies.activityTracker.recordFileActivity(event);
                        }
                        this.dependencies.fileEventQueue.removeEvent(event.path);
                    }
                }
            }

            // Persist updated queue
            await this.dependencies.fileEventQueue.persist();

        } catch (error) {
            console.error('[FileEventCoordinator] Error processing queue:', error);
        } finally {
            this.isProcessingQueue = false;
            
            // Only trigger recursion if we're not in startup mode with persistent queue
            const strategy = this.dependencies.embeddingScheduler?.getStrategy();
            const hasNewEvents = this.dependencies.fileEventQueue.size() > 0;
            const shouldRecurse = hasNewEvents && strategy?.type !== 'startup';
            
            if (shouldRecurse) {
                this.processQueueDebounced();
            } else if (hasNewEvents && strategy?.type === 'startup') {
            }
        }
    }

    // Public API for configuration
    setEmbeddingStrategy(strategy: EmbeddingStrategy): void {
        if (this.dependencies.embeddingScheduler) {
            this.dependencies.embeddingScheduler.setStrategy(strategy);
            // Set up callback for idle-triggered queue processing
            this.dependencies.embeddingScheduler.setQueueProcessingCallback(async () => {
                await this.processIdleQueue();
            });
        }
        // Store strategy for when embeddingScheduler becomes available
        this.embeddingStrategy = strategy;
    }

    setSystemOperation(isSystem: boolean): void {
        this.dependencies.fileMonitor.setSystemOperation(isSystem);
    }

    /**
     * Process queue specifically for idle mode - forces processing and clears queue
     */
    async processIdleQueue(): Promise<void> {
        if (this.isProcessingQueue) {
            return;
        }

        this.isProcessingQueue = true;
        
        try {
            const events = this.dependencies.fileEventQueue.getEvents();
            
            if (events.length === 0) {
                return;
            }

            // Filter for create/modify events that need embedding
            const createModifyEvents = events.filter(e => e.operation === 'create' || e.operation === 'modify');
            
            if (createModifyEvents.length > 0 && this.dependencies.embeddingScheduler) {
                // Force process embeddings (bypass idle check since we know we're idle)
                await this.dependencies.embeddingScheduler.forceProcessEmbeddings(createModifyEvents);
                
                // Clear processed events from queue
                for (const event of createModifyEvents) {
                    this.dependencies.fileEventQueue.removeEvent(event.path);
                }
            }

            // Handle any delete events
            const deleteEvents = events.filter(e => e.operation === 'delete');
            for (const event of deleteEvents) {
                if (this.dependencies.fileEventProcessor) {
                    await this.dependencies.fileEventProcessor.processEvent(event);
                }
                this.dependencies.fileEventQueue.removeEvent(event.path);
            }

            // Persist updated queue
            await this.dependencies.fileEventQueue.persist();
            
            // Clear notification tracking for processed files
            createModifyEvents.forEach(event => this.notifiedFiles.delete(event.path));

        } catch (error) {
            console.error('[FileEventCoordinator] Error processing idle queue:', error);
        } finally {
            this.isProcessingQueue = false;
        }
    }

    /**
     * Process files incrementally, removing them from queue as they succeed
     */
    private async processFilesIncrementally(events: FileEvent[]): Promise<void> {
        const batchSize = 50; // Process in smaller batches to allow progress tracking
        
        for (let i = 0; i < events.length; i += batchSize) {
            const batch = events.slice(i, i + batchSize);
            
            
            try {
                // Process this batch
                await this.dependencies.embeddingScheduler!.forceProcessEmbeddings(batch);
                
                // Remove successfully processed files from queue and incomplete tracking
                for (const event of batch) {
                    this.dependencies.fileEventQueue.removeEvent(event.path);
                    await this.incompleteFilesManager.markAsCompleted(event.path);
                }
                
                // Persist progress after each batch
                await this.dependencies.fileEventQueue.persist();
                
                
            } catch (error) {
                console.error(`[FileEventCoordinator] Error processing batch ${Math.floor(i/batchSize) + 1}:`, error);
                
                // Try to process files individually in this batch to isolate the problem
                await this.processIndividuallyWithErrorHandling(batch);
            }
        }
    }

    /**
     * Process files individually when batch processing fails
     */
    private async processIndividuallyWithErrorHandling(events: FileEvent[]): Promise<void> {
        
        for (const event of events) {
            try {
                await this.dependencies.embeddingScheduler!.forceProcessEmbeddings([event]);
                
                // Remove successful file from queue
                this.dependencies.fileEventQueue.removeEvent(event.path);
                
            } catch (error) {
                console.error(`[FileEventCoordinator] Failed to process ${event.path}:`, error);
                // Leave failed file in queue for retry on next startup
            }
        }
        
        // Persist progress after individual processing
        await this.dependencies.fileEventQueue.persist();
    }

    /**
     * Process all queued files for startup embedding strategy
     */
    async processStartupQueue(): Promise<void> {
        const queuedEvents = this.dependencies.fileEventQueue.getEvents();
        
        
        if (queuedEvents.length === 0) {
            return;
        }

        const startTime = Date.now();
        
        try {
            // Filter out files that no longer exist, aren't processable, or don't need re-embedding
            const validEvents = queuedEvents.filter(event => {
                // Delete events don't need to exist
                if (event.operation === 'delete') {
                    return true;
                }
                
                const file = this.app.vault.getAbstractFileByPath(event.path);
                if (!file || ('children' in file) || !this.dependencies.fileMonitor.shouldProcessFile(file)) {
                    return false;
                }
                
                // Only process files that are marked as needing re-embedding
                if (!this.incompleteFilesManager.needsReembedding(event.path)) {
                    return false;
                }
                
                return true;
            });
            
            const invalidCount = queuedEvents.length - validEvents.length;
            if (invalidCount > 0) {
            }
            
            
            if (validEvents.length > 0) {
                // Count file types for better logging
        const newFiles = validEvents.filter(e => e.source === 'initial_scan').length;
        const modifiedFiles = validEvents.filter(e => e.operation === 'modify').length;
        const createdFiles = validEvents.filter(e => e.operation === 'create' && e.source !== 'initial_scan').length;
        
                
                if (!this.dependencies.embeddingScheduler) {
                    throw new Error('Embedding scheduler not available for startup queue processing');
                }
                
                // Process files and remove them from queue incrementally
                await this.processFilesIncrementally(validEvents);
                
                const duration = Date.now() - startTime;
            } else {
            }
            
            // Persist queue state after incremental processing
            await this.dependencies.fileEventQueue.persist();
            
        } catch (error) {
            console.error('[FileEventCoordinator] Error during startup queue processing:', error);
            // Don't clear queue on error so we can retry later
            throw error;
        }
    }

    // Private helper methods
    private queueFileEvent(event: FileEvent): void {
        this.dependencies.fileEventQueue.addEvent(event);
        this.processQueueDebounced();
    }

    private initializeDebounce(): void {
        // Debounce queue processing to batch events
        this.processQueueDebounced = debounce(
            () => this.processQueue(), 
            1000, // 1 second debounce
            true  // leading edge
        );
    }

    private bindEventHandlers(): void {
        this.fileCreatedHandler = (file: TAbstractFile) => this.handleFileCreated(file);
        this.fileModifiedHandler = (file: TAbstractFile) => this.handleFileModified(file);
        this.fileDeletedHandler = (file: TAbstractFile) => this.handleFileDeleted(file);
        this.fileRenamedHandler = (file: TAbstractFile, oldPath: string) => this.handleFileRenamed(file, oldPath);
    }

    private registerVaultEventHandlers(): void {
        this.app.vault.on('create', this.fileCreatedHandler as any);
        this.app.vault.on('modify', this.fileModifiedHandler as any);
        this.app.vault.on('delete', this.fileDeletedHandler as any);
        this.app.vault.on('rename', this.fileRenamedHandler as any);
        
    }

    private unregisterVaultEventHandlers(): void {
        this.app.vault.off('create', this.fileCreatedHandler as any);
        this.app.vault.off('modify', this.fileModifiedHandler as any);
        this.app.vault.off('delete', this.fileDeletedHandler as any);
        this.app.vault.off('rename', this.fileRenamedHandler as any);
        
    }

    /**
     * Calculate MD5 hash of content
     */
    private async calculateContentHash(content: string): Promise<string> {
        // Use the existing ContentHashService if available
        try {
            const plugin = this.app.plugins.getPlugin('claudesidian-mcp') as any;
            const contentHashService = plugin?.services?.contentHashService;
            if (contentHashService && typeof contentHashService.generateHash === 'function') {
                return await contentHashService.generateHash(content);
            }
        } catch (error) {
            console.warn('[FileEventCoordinator] ContentHashService not available, using fallback hash');
        }
        
        // Fallback: simple hash implementation
        return this.simpleHash(content);
    }

    /**
     * Simple hash fallback (not cryptographically secure, but sufficient for change detection)
     */
    private simpleHash(content: string): string {
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16);
    }

    /**
     * Get stored hash for file (from old ProcessedFilesStateManager or other sources)
     */
    private getStoredHash(filePath: string): string | null {
        // Try to get from existing processedFiles if still available
        try {
            const plugin = this.app.plugins.getPlugin('claudesidian-mcp') as any;
            const storedHash = plugin?.settings?.settings?.processedFiles?.files?.[filePath]?.contentHash;
            return storedHash || null;
        } catch (error) {
            return null;
        }
    }
}