import { App, Plugin, TAbstractFile, TFile, debounce } from 'obsidian';
import { 
    IFileEventCoordinator, 
    IFileEventManagerDependencies,
    FileEvent,
    EmbeddingStrategy 
} from '../interfaces/IFileEventServices';

export class FileEventCoordinator implements IFileEventCoordinator {
    private isProcessingQueue = false;
    private processQueueDebounced!: () => void;
    private isStartupPhase = true;
    private startupTimeout: NodeJS.Timeout | null = null;
    private embeddingStrategy: EmbeddingStrategy = { type: 'idle', idleTimeThreshold: 60000, batchSize: 10, processingDelay: 1000 };

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
        this.initializeDebounce();
        this.bindEventHandlers();
    }

    async initialize(): Promise<void> {
        try {
            
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
                    // For startup strategy, just queue events - don't process them immediately
                } else {
                    // For other strategies, process immediately
                    await this.dependencies.embeddingScheduler.scheduleEmbedding(createModifyEvents);
                }
                
                // Process remaining events for activity tracking (but keep them in queue for startup strategy)
                for (const event of createModifyEvents) {
                    if (this.dependencies.fileEventProcessor && !this.dependencies.fileEventProcessor.isProcessing(event.path)) {
                        if (this.dependencies.activityTracker) {
                            await this.dependencies.activityTracker.recordFileActivity(event);
                        }
                        
                        // Only remove from queue if not using startup strategy
                        if (strategy.type !== 'startup') {
                            this.dependencies.fileEventQueue.removeEvent(event.path);
                        }
                    }
                }
            }

            // Persist updated queue
            await this.dependencies.fileEventQueue.persist();

        } catch (error) {
            console.error('[FileEventCoordinator] Error processing queue:', error);
        } finally {
            this.isProcessingQueue = false;
            
            // If new events were added during processing, schedule another run
            if (this.dependencies.fileEventQueue.size() > 0) {
                this.processQueueDebounced();
            }
        }
    }

    // Public API for configuration
    setEmbeddingStrategy(strategy: EmbeddingStrategy): void {
        if (this.dependencies.embeddingScheduler) {
            this.dependencies.embeddingScheduler.setStrategy(strategy);
        }
        // Store strategy for when embeddingScheduler becomes available
        this.embeddingStrategy = strategy;
    }

    setSystemOperation(isSystem: boolean): void {
        this.dependencies.fileMonitor.setSystemOperation(isSystem);
    }

    /**
     * Process all queued files for startup embedding strategy
     */
    async processStartupQueue(): Promise<void> {
        const queuedEvents = this.dependencies.fileEventQueue.getEvents();
        
        console.log('[FileEventCoordinator] Processing startup queue:', {
            queuedEventsCount: queuedEvents.length,
            hasEmbeddingScheduler: !!this.dependencies.embeddingScheduler,
            hasFileEventProcessor: !!this.dependencies.fileEventProcessor,
            strategy: this.dependencies.embeddingScheduler?.getStrategy()
        });
        
        if (queuedEvents.length === 0) {
            console.log('[FileEventCoordinator] No events in startup queue');
            return;
        }

        const startTime = Date.now();
        
        try {
            // Filter out files that no longer exist or aren't processable
            const validEvents = queuedEvents.filter(event => {
                // Delete events don't need to exist
                if (event.operation === 'delete') {
                    return true;
                }
                
                const file = this.app.vault.getAbstractFileByPath(event.path);
                return file && !('children' in file) && this.dependencies.fileMonitor.shouldProcessFile(file);
            });
            
            const invalidCount = queuedEvents.length - validEvents.length;
            if (invalidCount > 0) {
            }
            
            console.log('[FileEventCoordinator] Event filtering results:', {
                totalEvents: queuedEvents.length,
                validEvents: validEvents.length,
                invalidCount,
                validEventPaths: validEvents.map(e => e.path)
            });
            
            if (validEvents.length > 0) {
                // Count file types for better logging
        const newFiles = validEvents.filter(e => e.source === 'initial_scan').length;
        const modifiedFiles = validEvents.filter(e => e.operation === 'modify').length;
        const createdFiles = validEvents.filter(e => e.operation === 'create' && e.source !== 'initial_scan').length;
        
        console.log(`[FileEventCoordinator] Processing embeddings: {newFiles: ${newFiles}, modifiedFiles: ${modifiedFiles}, createdFiles: ${createdFiles}}`);
                
                if (!this.dependencies.embeddingScheduler) {
                    throw new Error('Embedding scheduler not available for startup queue processing');
                }
                
                await this.dependencies.embeddingScheduler.forceProcessEmbeddings(validEvents);
                
                const duration = Date.now() - startTime;
                console.log(`[FileEventCoordinator] ✓ Completed in ${duration}ms`);
            } else {
                console.log('[FileEventCoordinator] No valid events to process after filtering');
            }
            
            // Clear queue after successful processing
            this.dependencies.fileEventQueue.clear();
            await this.dependencies.fileEventQueue.persist();
            console.log('[FileEventCoordinator] ✓ Startup queue cleared and persisted');
            
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
        
        console.log('[FileEventCoordinator] Vault event handlers unregistered');
    }
}