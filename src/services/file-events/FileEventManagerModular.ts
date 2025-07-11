import { App, Plugin, TAbstractFile } from 'obsidian';
import { MemoryService } from '../../database/services/MemoryService';
import { WorkspaceService } from '../../database/services/WorkspaceService';
import { EmbeddingService } from '../../database/services/EmbeddingService';
import { EventManager } from '../EventManager';

// Import all the modular services
import { 
    IFileEventManagerDependencies,
    EmbeddingStrategy,
    FileEvent 
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
    private getMemoryService: () => Promise<MemoryService>;
    private getWorkspaceService: () => Promise<WorkspaceService>;
    private getEmbeddingService: () => Promise<EmbeddingService>;

    constructor(
        private app: App,
        private plugin: Plugin,
        private memoryService: MemoryService | null,
        private workspaceService: WorkspaceService | null,
        private embeddingService: EmbeddingService | null,
        private eventManager: EventManager,
        private embeddingStrategy: EmbeddingStrategy
    ) {
        // Set up default service getters
        this.getMemoryService = async () => this.memoryService!;
        this.getWorkspaceService = async () => this.workspaceService!;
        this.getEmbeddingService = async () => this.embeddingService!;
        
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
        const queueSize = this.dependencies.fileEventQueue.size();
        
        try {
            if (queueSize === 0) {
                return;
            }

            
            // Ensure vector dependencies are ready before processing
            await this.ensureVectorDependencies();
            await this.coordinator.processStartupQueue();
            
            const remainingEvents = this.dependencies.fileEventQueue.size();
            
        } catch (error) {
            console.error('[FileEventManagerModular] Error during startup queue processing:', error);
            throw error;
        } finally {
            this.isProcessingStartupQueue = false;
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
     * Unload the file event manager (for compatibility)
     */
    async unload(): Promise<void> {
        await this.shutdown();
    }

    /**
     * Reload configuration (for compatibility)
     */
    reloadConfiguration(): void {
        // In the modular version, you would update the embedding strategy
        // This is a placeholder for compatibility
        if (this.embeddingStrategy) {
            this.setEmbeddingStrategy(this.embeddingStrategy);
        }
    }
}