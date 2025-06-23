import { EmbeddingService } from './EmbeddingService';
import { IVectorStore } from '../interfaces/IVectorStore';
import { EventManager } from '../../services/EventManager';
import { 
    ITokenStatsHandler, 
    ICollectionStatsHandler, 
    ILocalStorageManager, 
    IRefreshManager,
    LocalStorageManager,
    TokenStatsHandler,
    CollectionStatsHandler,
    ProviderCapabilityChecker,
    RefreshManager
} from './usage';

/**
 * Type definition for model cost map
 */
export type ModelCostMap = {
    [key: string]: number; // Allow indexing with string keys
} & {
    'text-embedding-3-small'?: number;
    'text-embedding-3-large'?: number;
};

/**
 * Type definition for collection statistics
 */
export type CollectionStat = {
    name: string;
    count: number;
    color: string;
};

/**
 * Type definition for usage statistics
 */
export type UsageStats = {
    tokensThisMonth: number;
    totalEmbeddings: number;
    dbSizeMB: number;
    memoryDbSizeMB: number;
    lastIndexedDate: string;
    indexingInProgress: boolean;
    estimatedCost?: number;
    tokensAllTime?: number;
    estimatedCostAllTime?: number;
    modelUsage?: ModelCostMap;
    collectionStats?: CollectionStat[];
};

// Event names for the UsageStatsService
export const USAGE_EVENTS = {
    STATS_UPDATED: 'usage-stats-updated',
    STATS_RESET: 'usage-stats-reset',
    STATS_REFRESHED: 'usage-stats-refreshed',
    COLLECTIONS_PURGED: 'collections-purged'
};

/**
 * Service for tracking and managing usage statistics
 * Centralizes all usage-related functionality in one place and provides an event system for updates
 */
export class UsageStatsService {
    private tokenStatsHandler: ITokenStatsHandler;
    private collectionStatsHandler: ICollectionStatsHandler;
    private localStorageManager: ILocalStorageManager;
    private refreshManager: IRefreshManager;
    private eventManager: EventManager;
    
    private defaultStats: UsageStats = {
        tokensThisMonth: 0,
        totalEmbeddings: 0,
        dbSizeMB: 0,
        memoryDbSizeMB: 0,
        lastIndexedDate: '',
        indexingInProgress: false,
        estimatedCost: 0,
        tokensAllTime: 0,
        estimatedCostAllTime: 0,
        modelUsage: {},
        collectionStats: []
    };

    /**
     * Create a new UsageStatsService
     * @param embeddingService Embedding service for provider access
     * @param vectorStore Vector store for collection stats
     * @param settings Settings for cost calculations
     * @param eventManager Optional event manager instance
     */
    constructor(
        embeddingService: EmbeddingService | null, 
        vectorStore: IVectorStore, 
        settings: any,
        eventManager?: EventManager
    ) {
        if (!embeddingService) {
            console.warn('UsageStatsService initialized with null embeddingService');
        }
        
        this.eventManager = eventManager || new EventManager();
        
        // Initialize components following Dependency Injection pattern
        const capabilityChecker = new ProviderCapabilityChecker();
        this.localStorageManager = new LocalStorageManager(settings);
        this.tokenStatsHandler = new TokenStatsHandler(
            embeddingService, 
            this.localStorageManager, 
            capabilityChecker, 
            settings
        );
        this.collectionStatsHandler = new CollectionStatsHandler(vectorStore);
        this.refreshManager = new RefreshManager();

        this.setupEventListeners();
    }

    /**
     * Set up event listeners for token usage changes
     */
    private setupEventListeners(): void {
        if (typeof localStorage !== 'undefined' && typeof window !== 'undefined') {
            // We're completely disabling auto-refresh on storage events to break the cycle
            // Token updates will be reflected when the user manually interacts with the UI
            
            // We'll just listen for explicit collection deletion/purge events
            window.addEventListener('storage', (event) => {
                if (event.key === 'claudesidian-collection-deleted' || event.key === 'claudesidian-collections-purged') {
                    console.log(`Collection change event detected: ${event.key}`);
                    // We'll use a long timeout to ensure we're not in a refresh cycle
                    setTimeout(() => {
                        if (this.refreshManager.canRefresh()) {
                            console.log('Scheduling refresh after collection change');
                            this.refreshStats();
                        }
                    }, 3000); // Wait 3 seconds
                }
            });
        }

        // Set up listeners for custom events from the OpenAIProvider or other components
        try {
            const app = (window as any).app;
            const plugin = app?.plugins?.getPlugin('claudesidian-mcp');
            
            if (plugin?.eventManager) {
                // Listen for token usage reset event only - this is important enough to always process
                plugin.eventManager.on('token-usage-reset', (data: any) => {
                    console.log('Token usage reset event received:', data);
                    setTimeout(() => {
                        if (this.refreshManager.canRefresh()) {
                            this.refreshStats();
                        }
                    }, 2000); // Delay refresh to avoid conflicts
                });
                
            }
        } catch (error) {
            console.warn('Failed to set up plugin event listeners:', error);
        }
    }
    
    private debounce(func: () => void, wait: number): () => void {
        let timeout: NodeJS.Timeout | null = null;
        return () => {
            if (timeout) {
                clearTimeout(timeout);
            }
            timeout = setTimeout(() => {
                timeout = null;
                func();
            }, wait);
        };
    }

    private resetDefaultStats(): void {
        this.defaultStats = {
            tokensThisMonth: 0,
            totalEmbeddings: 0,
            dbSizeMB: 0,
            memoryDbSizeMB: 0,
            lastIndexedDate: '',
            indexingInProgress: false,
            estimatedCost: 0,
            tokensAllTime: 0,
            estimatedCostAllTime: 0,
            modelUsage: {},
            collectionStats: []
        };
    }

    private async forceVectorStoreRefresh(): Promise<void> {
        // This assumes we have access to vectorStore through some means
        // If not, we could inject this capability through the constructor
        const app = (window as any).app;
        const plugin = app?.plugins?.getPlugin('claudesidian-mcp');
        const vectorStore = plugin?.services?.vectorStore;
        
        if (vectorStore && typeof (vectorStore as any).refreshCollections === 'function') {
            await (vectorStore as any).refreshCollections();
            console.log('Successfully refreshed vector store collections');
        }
    }
    
    /**
     * Get current usage statistics
     * @param skipEvents Whether to skip emitting events (used internally to prevent loops)
     * @returns Promise resolving to usage statistics object
     */
    async getUsageStats(skipEvents: boolean = false): Promise<UsageStats> {
        console.log('UsageStatsService.getUsageStats called');
        
        const stats = { ...this.defaultStats };
        
        try {
            await this.tokenStatsHandler.updateTokenStats(stats);
            await this.collectionStatsHandler.updateCollectionStats(stats);
            
            if (!skipEvents) {
                this.eventManager.emit(USAGE_EVENTS.STATS_UPDATED, stats);
            }
            
            return stats;
        } catch (error) {
            console.error('Error getting usage stats:', error);
            return stats;
        }
    }





    async resetUsageStats(): Promise<void> {
        try {
            await this.tokenStatsHandler.resetTokenStats();
            this.eventManager.emit(USAGE_EVENTS.STATS_RESET, null);
            await this.refreshStats();
        } catch (error) {
            console.error('Error resetting usage stats:', error);
        }
    }

    async updateUsageStats(tokenCount: number, model?: string): Promise<void> {
        try {
            await this.tokenStatsHandler.updateTokenUsage(tokenCount, model);
            this.eventManager.emit(USAGE_EVENTS.STATS_UPDATED, null);
            await this.refreshStats();
        } catch (error) {
            console.error('Error updating usage stats:', error);
        }
    }

    async refreshStats(): Promise<UsageStats> {
        if (!this.refreshManager.canRefresh()) {
            return this.defaultStats;
        }
        
        console.log('Refreshing usage stats...');
        
        try {
            this.refreshManager.startRefresh();
            
            this.resetDefaultStats();
            const stats = await this.getUsageStats(true);
            
            this.eventManager.emit(USAGE_EVENTS.STATS_REFRESHED, stats);
            return stats;
        } catch (error) {
            console.error('Error during stats refresh:', error);
            return this.defaultStats;
        } finally {
            this.refreshManager.endRefresh();
        }
    }
    
    async forceCompleteRefresh(): Promise<UsageStats> {
        if (!this.refreshManager.canRefresh()) {
            return this.defaultStats;
        }
        
        console.log('Forcing complete stats refresh with collection cache invalidation...');
        
        try {
            this.refreshManager.startRefresh();
            
            // Force cache reset if supported
            await this.forceVectorStoreRefresh();
            
            this.resetDefaultStats();
            const stats = await this.getUsageStats(true);
            
            this.eventManager.emit(USAGE_EVENTS.COLLECTIONS_PURGED, {
                timestamp: Date.now(),
                source: 'force-complete-refresh'
            });
            
            this.eventManager.emit(USAGE_EVENTS.STATS_REFRESHED, stats);
            return stats;
        } catch (error) {
            console.error('Error during complete refresh:', error);
            return this.defaultStats;
        } finally {
            this.refreshManager.endRefresh();
        }
    }

    /**
     * Register event listener
     * @param event Event name
     * @param callback Callback function
     */
    on(event: string, callback: (data: any) => void): void {
        this.eventManager.on(event, callback);
    }

    /**
     * Remove event listener
     * @param event Event name
     * @param callback Callback function
     */
    off(event: string, callback: (data: any) => void): void {
        this.eventManager.off(event, callback);
    }
}