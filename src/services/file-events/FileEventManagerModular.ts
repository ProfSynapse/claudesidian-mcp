import { App, Plugin, TAbstractFile } from 'obsidian';
import { MemoryService } from "../../agents/memoryManager/services/MemoryService";
import { WorkspaceService } from '../../agents/memoryManager/services/WorkspaceService';
import { EmbeddingService } from '../../database/services/core/EmbeddingService';
import { EventManager } from '../EventManager';

// Import all the modular services
import { 
    IFileEventManagerDependencies,
    EmbeddingStrategy,
    FileEvent,
    FileOperation 
} from './interfaces/IFileEventServices';
import { FileEventQueue } from './services/FileEventQueue';
import { FileEventProcessor } from './services/FileEventProcessor';
import { EmbeddingScheduler } from './services/EmbeddingScheduler';
import { ActivityTracker } from './services/ActivityTracker';
import { SessionTracker } from './services/SessionTracker';
import { FileMonitor } from './services/FileMonitor';
import { FileEventCoordinator } from './services/FileEventCoordinator';

/**
 * Modular File Event Manager
 * 
 * This is the new SOLID-compliant implementation that replaces the monolithic FileEventManager.
 * It follows the Single Responsibility Principle by delegating specific responsibilities
 * to focused service classes, and uses Dependency Injection for loose coupling.
 */
export class FileEventManagerModular {
    private dependencies!: IFileEventManagerDependencies;
    private coordinator!: FileEventCoordinator;
    private isProcessingStartupQueue = false;
    
    // Event handlers for session management
    private sessionCreateHandler!: (data: any) => void;
    private sessionEndHandler!: (data: any) => void;

    // Lazy service getters (can be overridden for dependency injection)
    private getMemoryService: () => Promise<MemoryService | null>;
    private getWorkspaceService: () => Promise<WorkspaceService | null>;
    private getEmbeddingService: () => Promise<EmbeddingService | null>;

    constructor(
        private app: App,
        private plugin: Plugin,
        private memoryService: MemoryService | null,
        private workspaceService: WorkspaceService | null,
        private embeddingService: EmbeddingService | null,
        private eventManager: EventManager,
        private embeddingStrategy: EmbeddingStrategy
    ) {
        // Set up default service getters with lazy loading
        this.getMemoryService = async () => {
            if (!this.memoryService) {
                // Try to get from service manager
                const plugin = this.app.plugins.getPlugin('claudesidian-mcp') as any;
                if (plugin?.getService) {
                    this.memoryService = await plugin.getService('memoryService');
                }
            }
            return this.memoryService;
        };
        
        this.getWorkspaceService = async () => {
            if (!this.workspaceService) {
                // Try to get from service manager
                const plugin = this.app.plugins.getPlugin('claudesidian-mcp') as any;
                if (plugin?.getService) {
                    this.workspaceService = await plugin.getService('workspaceService');
                }
            }
            return this.workspaceService;
        };
        
        this.getEmbeddingService = async () => {
            if (!this.embeddingService) {
                // Try to get from service manager
                const plugin = this.app.plugins.getPlugin('claudesidian-mcp') as any;
                if (plugin?.getService) {
                    this.embeddingService = await plugin.getService('embeddingService');
                }
            }
            return this.embeddingService;
        };
        
        this.initializeDependencies();
        this.coordinator = new FileEventCoordinator(
            this.app,
            this.plugin,
            this.dependencies
        );
        this.bindSessionHandlers();
    }

    /**
     * Initialize the file event manager
     */
    async initialize(): Promise<void> {
        try {
            
            // Initialize the coordinator which handles the orchestration
            await this.coordinator.initialize();
            
            // Set the embedding strategy
            this.coordinator.setEmbeddingStrategy(this.embeddingStrategy);
            
            // Register session event handlers
            this.registerSessionHandlers();
            
        } catch (error) {
            console.error('[FileEventManagerModular] Initialization failed:', error);
            throw error;
        }
    }
    
    /**
     * Ensure vector dependencies are initialized before processing
     */
    async ensureVectorDependencies(): Promise<void> {
        await this.initializeVectorDependencies();
    }

    /**
     * Shutdown the file event manager
     */
    async shutdown(): Promise<void> {
        try {
            
            // Unregister session handlers
            this.unregisterSessionHandlers();
            
            // Shutdown the coordinator
            await this.coordinator.shutdown();
            
        } catch (error) {
            console.error('[FileEventManagerModular] Shutdown error:', error);
        }
    }

    /**
     * Start a system operation to prevent event loops
     */
    startSystemOperation(): void {
        this.coordinator.setSystemOperation(true);
    }


    /**
     * Process all queued files for startup embedding strategy
     */
    async processStartupQueue(): Promise<void> {
        if (this.isProcessingStartupQueue) {
            return;
        }

        this.isProcessingStartupQueue = true;
        
        try {
            // Check queue size - startup mode only processes manually queued files
            const initialQueueSize = this.dependencies.fileEventQueue.size();
            
            if (initialQueueSize === 0) {
                return;
            }

            
            // Wait for vector dependencies to be ready with retry logic
            await this.waitForVectorDependencies();
            await this.coordinator.processStartupQueue();
            
            const remainingEvents = this.dependencies.fileEventQueue.size();
            
        } catch (error) {
            console.error('[FileEventManager] Error during background startup queue processing:', error);
            // Don't throw - background processing shouldn't break plugin functionality
        } finally {
            this.isProcessingStartupQueue = false;
        }
    }

    /**
     * Wait for vector dependencies with retry logic for background processing
     */
    private async waitForVectorDependencies(): Promise<void> {
        const maxRetries = 10;
        const retryDelay = 2000; // 2 seconds
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await this.ensureVectorDependencies();
                return;
            } catch (error) {
                
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                } else {
                    throw new Error(`Vector dependencies not ready after ${maxRetries} attempts`);
                }
            }
        }
    }

    /**
     * Activate vector services for real-time processing (called when first needed)
     */
    async activateVectorServices(): Promise<void> {
        try {
            await this.ensureVectorDependencies();
        } catch (error) {
            console.warn('[FileEventManagerModular] Failed to activate vector services:', error);
        }
    }

    /**
     * End a system operation
     */
    endSystemOperation(): void {
        this.coordinator.setSystemOperation(false);
    }

    /**
     * Manually queue a file event
     */
    queueFileEvent(event: FileEvent): void {
        this.dependencies.fileEventQueue.addEvent(event);
    }

    /**
     * Process the queue manually
     */
    async processQueue(): Promise<void> {
        await this.coordinator.processQueue();
    }

    /**
     * Update the embedding strategy
     */
    setEmbeddingStrategy(strategy: EmbeddingStrategy): void {
        this.embeddingStrategy = strategy;
        this.coordinator.setEmbeddingStrategy(strategy);
    }

    /**
     * Get current embedding strategy
     */
    getEmbeddingStrategy(): EmbeddingStrategy {
        // Return stored strategy if embeddingScheduler not yet initialized
        if (!this.dependencies.embeddingScheduler) {
            return this.embeddingStrategy;
        }
        return this.dependencies.embeddingScheduler.getStrategy();
    }

    /**
     * Get queue status
     */
    getQueueStatus(): {
        size: number;
        processing: boolean;
        events: FileEvent[];
    } {
        return {
            size: this.dependencies.fileEventQueue.size(),
            processing: false, // Would need to expose this from coordinator
            events: this.dependencies.fileEventQueue.getEvents()
        };
    }

    /**
     * Get session information
     */
    getSessionInfo(): {
        activeSessions: Record<string, string>;
        sessionCount: number;
    } {
        const activeSessions = this.dependencies.sessionTracker.getActiveSessions();
        return {
            activeSessions,
            sessionCount: this.dependencies.sessionTracker.getSessionCount()
        };
    }

    /**
     * Set active session for a workspace
     */
    setActiveSession(workspaceId: string, sessionId: string): void {
        this.dependencies.sessionTracker.setActiveSession(workspaceId, sessionId);
    }

    /**
     * Clear all caches (useful for testing or reset)
     */
    clearCaches(): void {
        this.dependencies.fileMonitor.clearCaches();
        this.dependencies.activityTracker.clearCache();
    }

    /**
     * Get diagnostic information
     */
    getDiagnostics(): any {
        return {
            queue: {
                size: this.dependencies.fileEventQueue.size(),
                events: this.dependencies.fileEventQueue.getEvents().map(e => ({
                    path: e.path,
                    operation: e.operation,
                    priority: e.priority,
                    timestamp: e.timestamp
                }))
            },
            monitor: this.dependencies.fileMonitor.getCacheStats(),
            activity: this.dependencies.activityTracker.getCacheStats(),
            sessions: this.getSessionInfo(),
            embeddingStrategy: this.getEmbeddingStrategy()
        };
    }

    // Private methods
    private initializeDependencies(): void {
        this.dependencies = {
            fileEventQueue: new FileEventQueue(this.plugin),
            // Initialize with minimal dependencies for now
            // These will be enhanced with vector services when they become available
            fileEventProcessor: null as any, // Lazy initialized
            embeddingScheduler: null as any, // Lazy initialized
            activityTracker: null as any, // Lazy initialized
            sessionTracker: new SessionTracker(),
            fileMonitor: new FileMonitor(this.app)
        };
    }
    
    /**
     * Initialize vector-dependent services lazily
     */
    private async initializeVectorDependencies(): Promise<void> {
        if (this.dependencies.fileEventProcessor) {
            return; // Already initialized
        }
        
        try {
            const memoryService = await this.getMemoryService();
            const workspaceService = await this.getWorkspaceService();
            const embeddingService = await this.getEmbeddingService();
            
            if (!memoryService || !workspaceService || !embeddingService) {
                console.warn('[FileEventManagerModular] Required services not available yet:', {
                    memoryService: !!memoryService,
                    workspaceService: !!workspaceService,
                    embeddingService: !!embeddingService
                });
                throw new Error('Required services not available');
            }
            
            this.dependencies.fileEventProcessor = new FileEventProcessor(
                this.app,
                memoryService,
                workspaceService
            );
            
            this.dependencies.embeddingScheduler = new EmbeddingScheduler(
                this.plugin,
                embeddingService,
                this.embeddingStrategy
            );
            
            // Set up callback for idle-triggered queue processing
            this.dependencies.embeddingScheduler.setQueueProcessingCallback(async () => {
                await this.coordinator.processIdleQueue();
            });
            
            this.dependencies.activityTracker = new ActivityTracker(
                this.app,
                memoryService,
                workspaceService
            );
            
            
        } catch (error) {
            console.warn('[FileEventManagerModular] Failed to initialize vector dependencies:', error);
            throw error;
        }
    }

    private bindSessionHandlers(): void {
        this.sessionCreateHandler = (data: any) => {
            if (data && data.workspaceId && data.sessionId) {
                this.setActiveSession(data.workspaceId, data.sessionId);
            }
        };

        this.sessionEndHandler = (data: any) => {
            if (data && data.workspaceId) {
                this.dependencies.sessionTracker.removeSession(data.workspaceId);
            }
        };
    }

    private registerSessionHandlers(): void {
        this.eventManager.on('session:create', this.sessionCreateHandler);
        this.eventManager.on('session:end', this.sessionEndHandler);
    }

    private unregisterSessionHandlers(): void {
        this.eventManager.off('session:create', this.sessionCreateHandler);
        this.eventManager.off('session:end', this.sessionEndHandler);
    }

    // Expose dependencies for testing or advanced usage
    getDependencies(): IFileEventManagerDependencies {
        return this.dependencies;
    }

    getCoordinator(): FileEventCoordinator {
        return this.coordinator;
    }

    /**
     * Update file activity - bridge method for compatibility
     * This method provides the expected interface for recording file activities
     * from other parts of the codebase while delegating to the proper ActivityTracker
     */
    async updateFileActivity(filePath: string, operation: string): Promise<void> {
        try {
            // Ensure vector dependencies are initialized (ActivityTracker may not be ready)
            if (!this.dependencies.activityTracker) {
                await this.ensureVectorDependencies();
                
                // If still not available, this means services aren't ready yet
                if (!this.dependencies.activityTracker) {
                    console.warn('[FileEventManagerModular] ActivityTracker not available yet, skipping file activity recording');
                    return;
                }
            }
            
            // Create a FileEvent object from the simple parameters
            const fileEvent: FileEvent = {
                path: filePath,
                operation: operation as FileOperation,
                timestamp: Date.now(),
                isSystemOperation: false, // User-initiated operations are not system operations
                source: 'manual', // This is a manual recording, not from file system events
                priority: 'normal'
            };
            
            // Delegate to the ActivityTracker
            await this.dependencies.activityTracker.recordFileActivity(fileEvent);
            
        } catch (error) {
            console.error('[FileEventManagerModular] Error recording file activity:', error);
            // Don't throw - file activity recording shouldn't break the calling operation
        }
    }

    /**
     * Unload the file event manager (for compatibility)
     */
    async unload(): Promise<void> {
        await this.shutdown();
    }

    /**
     * Reload configuration - updates embedding strategy from current settings
     */
    reloadConfiguration(): void {
        try {
            // Get current settings from the plugin
            const plugin = this.app.plugins.getPlugin('claudesidian-mcp') as any;
            if (plugin && plugin.settings && plugin.settings.settings.memory) {
                const memorySettings = plugin.settings.settings.memory;
                
                // Create new embedding strategy from current settings
                const newStrategy = {
                    type: memorySettings.embeddingStrategy || 'idle',
                    idleTimeThreshold: memorySettings.idleTimeThreshold || 60000,
                    batchSize: 10,
                    processingDelay: 1000
                };
                
                this.setEmbeddingStrategy(newStrategy);
            } else {
                console.warn('[FileEventManagerModular] Could not reload configuration - settings not available');
            }
        } catch (error) {
            console.error('[FileEventManagerModular] Error reloading configuration:', error);
        }
    }
}