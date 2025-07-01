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
                console.log('[FileEventCoordinator] Startup phase ended - now monitoring for new file changes');
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
            console.log('[FileEventCoordinator] Shutting down...');
            
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
            
            console.log('[FileEventCoordinator] Shutdown complete');
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
        
        console.log(`[FileEventCoordinator] New file created: ${file.path}`);
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
        
        console.log(`[FileEventCoordinator] File modified: ${file.path}`);
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


            // Group events by operation for efficient processing
            const deleteEvents = events.filter(e => e.operation === 'delete');
            const createModifyEvents = events.filter(e => e.operation === 'create' || e.operation === 'modify');

            // Process deletes first (they're usually high priority)
            for (const event of deleteEvents) {
                await this.dependencies.fileEventProcessor.processEvent(event);
                this.dependencies.fileEventQueue.removeEvent(event.path);
            }

            // Handle embeddings for create/modify events
            if (createModifyEvents.length > 0) {
                // Check if we should process embeddings now or just queue them
                const strategy = this.dependencies.embeddingScheduler.getStrategy();
                
                if (strategy.type === 'startup') {
                    // For startup strategy, just queue events - don't process them
                    console.log(`[FileEventCoordinator] Queuing ${createModifyEvents.length} events for startup processing`);
                } else {
                    // For other strategies, process immediately
                    await this.dependencies.embeddingScheduler.scheduleEmbedding(createModifyEvents);
                }
                
                // Process remaining events for activity tracking (but keep them in queue for startup strategy)
                for (const event of createModifyEvents) {
                    if (!this.dependencies.fileEventProcessor.isProcessing(event.path)) {
                        await this.dependencies.activityTracker.recordFileActivity(event);
                        
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
        this.dependencies.embeddingScheduler.setStrategy(strategy);
    }

    setSystemOperation(isSystem: boolean): void {
        this.dependencies.fileMonitor.setSystemOperation(isSystem);
    }

    /**
     * Process all queued files for startup embedding strategy
     */
    async processStartupQueue(): Promise<void> {
        const queuedEvents = this.dependencies.fileEventQueue.getEvents();
        if (queuedEvents.length === 0) {
            return;
        }

        console.log(`[FileEventCoordinator] Processing ${queuedEvents.length} queued events from startup`);
        
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
            console.log(`[FileEventCoordinator] Filtered out ${invalidCount} invalid files from queue`);
        }
        
        if (validEvents.length > 0) {
            console.log(`[FileEventCoordinator] Processing ${validEvents.length} valid files for embedding`);
            await this.dependencies.embeddingScheduler.forceProcessEmbeddings(validEvents);
        }
        
        // Clear queue after processing
        this.dependencies.fileEventQueue.clear();
        await this.dependencies.fileEventQueue.persist();
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