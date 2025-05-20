import { EmbeddingService } from './EmbeddingService';
import { IVectorStore } from '../interfaces/IVectorStore';
import { EventManager } from '../../services/EventManager';
import { ITokenTrackingProvider } from '../interfaces/IEmbeddingProvider';

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
    /**
     * Check if provider implements ITokenTrackingProvider interface
     * @param provider Provider to check
     * @returns true if provider implements ITokenTrackingProvider
     */
    private isTokenTrackingProvider(provider: any): provider is ITokenTrackingProvider {
        return (
            provider &&
            typeof provider.getTotalCost === 'function' &&
            typeof provider.getModelUsage === 'function' &&
            typeof provider.getTokensThisMonth === 'function' &&
            typeof provider.updateUsageStats === 'function' &&
            typeof provider.resetUsageStats === 'function'
        );
    }
    // We make this private based on constructor parameter
    private embeddingService: EmbeddingService;
    private vectorStore: IVectorStore;
    private settings: any;
    private eventManager: EventManager;
    
    private defaultStats: UsageStats = {
        tokensThisMonth: 0,
        totalEmbeddings: 0,
        dbSizeMB: 0,
        lastIndexedDate: '',
        indexingInProgress: false,
        estimatedCost: 0,
        tokensAllTime: 0,
        estimatedCostAllTime: 0,
        modelUsage: {
            'text-embedding-3-small': 0,
            'text-embedding-3-large': 0
        },
        collectionStats: []
    };

    // Color palette for collection stats
    private colors = [
        '#4285F4', '#EA4335', '#FBBC05', '#34A853', // Google colors
        '#3498DB', '#E74C3C', '#2ECC71', '#F39C12', // Flat UI colors
        '#9B59B6', '#1ABC9C', '#D35400', '#C0392B', // More colors
        '#8E44AD', '#16A085', '#27AE60', '#D35400', // Additional colors
        '#2980B9', '#E67E22', '#27AE60', '#2C3E50'  // Even more colors
    ];

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
        // Ensure embeddingService is not null
        if (!embeddingService) {
            console.warn('UsageStatsService initialized with null embeddingService');
        }
        // Cast null to EmbeddingService to satisfy TypeScript, we'll check it in methods
        this.embeddingService = embeddingService as unknown as EmbeddingService;
        this.vectorStore = vectorStore;
        this.settings = settings;
        
        // Use provided event manager or create a new one
        this.eventManager = eventManager || new EventManager();

        // Set up event listeners
        this.setupEventListeners();
    }

    /**
     * Set up event listeners for token usage changes
     */
    private setupEventListeners(): void {
        // Create a debounced refresh function to prevent multiple rapid refreshes
        const debouncedRefresh = this.debounce(() => {
            console.log('Debounced refresh triggered');
            this.refreshStats();
        }, 500);  // 500ms debounce delay
        
        if (typeof localStorage !== 'undefined' && typeof window !== 'undefined') {
            // Set up storage event listener to detect changes from other components
            window.addEventListener('storage', (event) => {
                if (event.key === 'claudesidian-tokens-used' || event.key === 'claudesidian-token-usage') {
                    console.log('Token usage updated in localStorage, triggering debounced refresh');
                    debouncedRefresh();
                }
            });
        }

        // Set up listeners for custom events from the OpenAIProvider or other components
        try {
            const app = (window as any).app;
            const plugin = app?.plugins?.getPlugin('claudesidian-mcp');
            
            if (plugin?.eventManager) {
                // Listen for token usage updated event
                plugin.eventManager.on('token-usage-updated', (data: any) => {
                    console.log('Token usage updated event received:', data);
                    debouncedRefresh();
                });
                
                // Listen for token usage reset event
                plugin.eventManager.on('token-usage-reset', (data: any) => {
                    console.log('Token usage reset event received:', data);
                    debouncedRefresh();
                });
                
                // Listen for batch embedding completed event
                plugin.eventManager.on('batch-embedding-completed', (data: any) => {
                    console.log('Batch embedding completed event received:', data);
                    debouncedRefresh();
                });
                
                console.log('UsageStatsService: Set up plugin event listeners successfully');
            }
        } catch (error) {
            console.warn('Failed to set up plugin event listeners:', error);
        }
    }
    
    /**
     * Simple debounce function to prevent too many calls in quick succession
     * @param func Function to debounce
     * @param wait Wait time in ms
     */
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

    // Flag to track if a refresh is in progress to prevent infinite loops
    private isRefreshing: boolean = false;
    
    /**
     * Get current usage statistics
     * @param skipEvents Whether to skip emitting events (used internally to prevent loops)
     * @returns Promise resolving to usage statistics object
     */
    async getUsageStats(skipEvents: boolean = false): Promise<UsageStats> {
        console.log('UsageStatsService.getUsageStats called');
        
        // Start with default stats
        const stats = { ...this.defaultStats };
        
        try {
            // Step 1: Get token usage and cost from embedding provider
            await this.updateTokenStats(stats);
            
            // Step 2: Get collection statistics from vector store
            await this.updateCollectionStats(stats);
            
            // Only emit event if not skipping events
            if (!skipEvents) {
                // Emit stats-updated event
                this.eventManager.emit(USAGE_EVENTS.STATS_UPDATED, stats);
            }
            
            return stats;
        } catch (error) {
            console.error('Error getting usage stats:', error);
            return stats;
        }
    }

    /**
     * Update token statistics in the provided stats object
     * @param stats Stats object to update
     */
    private async updateTokenStats(stats: UsageStats): Promise<void> {
        try {
            // Always check localStorage first for most recent values
            this.loadTokenStatsFromLocalStorage(stats);
            
            // Check if provider exists and log detailed info for debugging
            console.log('EmbeddingService available:', !!this.embeddingService);
            
            // Try to get from the embedding provider if available
            if (this.embeddingService && this.embeddingService.getProvider()) {
                const provider = this.embeddingService.getProvider();
                console.log('Provider type:', provider ? provider.constructor.name : 'null');
                
                if (provider) {
                    // Check if provider implements ITokenTrackingProvider interface
                    const isTokenTrackingProvider = this.isTokenTrackingProvider(provider);
                    console.log('Provider methods:', {
                        isTokenTrackingProvider: isTokenTrackingProvider,
                        hasTotalCost: typeof (provider as any).getTotalCost === 'function',
                        hasModelUsage: typeof (provider as any).getModelUsage === 'function',
                        hasTokensThisMonth: typeof (provider as any).getTokensThisMonth === 'function',
                        hasModelUsageObj: !!(provider as any).modelUsage
                    });
                    
                    if (isTokenTrackingProvider) {
                        // Use the standard interface
                        const trackingProvider = provider as ITokenTrackingProvider;
                        stats.estimatedCost = trackingProvider.getTotalCost() || stats.estimatedCost;
                        stats.modelUsage = trackingProvider.getModelUsage() || stats.modelUsage;
                        stats.tokensThisMonth = trackingProvider.getTokensThisMonth() || stats.tokensThisMonth;
                        
                        console.log('Retrieved token stats using ITokenTrackingProvider interface');
                    } else {
                        // Fall back to any casting for backward compatibility
                        console.log('Using fallback method for non-ITokenTrackingProvider');
                        
                        // Get total cost if the method exists
                        if (typeof (provider as any).getTotalCost === 'function') {
                            stats.estimatedCost = (provider as any).getTotalCost() || stats.estimatedCost;
                        }
                        
                        // Get model usage if the method exists
                        if (typeof (provider as any).getModelUsage === 'function') {
                            stats.modelUsage = (provider as any).getModelUsage() || stats.modelUsage;
                        }
                        // Direct access to modelUsage if available
                        else if ((provider as any).modelUsage) {
                            stats.modelUsage = { ...(provider as any).modelUsage };
                        }
                        
                        // Get total tokens for the month if the method exists
                        if (typeof (provider as any).getTokensThisMonth === 'function') {
                            stats.tokensThisMonth = (provider as any).getTokensThisMonth() || stats.tokensThisMonth;
                        } else {
                            // Fallback to calculating from model usage
                            stats.tokensThisMonth = Object.values(stats.modelUsage || {}).reduce((sum, count) => sum + count, 0);
                        }
                    }
                    
                    console.log('Loaded token usage stats from provider:', {
                        tokensThisMonth: stats.tokensThisMonth,
                        estimatedCost: stats.estimatedCost,
                        modelUsage: stats.modelUsage
                    });
                }
            }
        } catch (error) {
            console.error('Error updating token stats:', error);
        }
    }

    /**
     * Load token stats from localStorage if available
     * @param stats Stats object to update
     */
    private loadTokenStatsFromLocalStorage(stats: UsageStats): void {
        try {
            if (typeof localStorage !== 'undefined') {
                // Try different known localStorage keys for monthly usage
                const possibleMonthlyKeys = ['claudesidian-tokens-used', 'claudesidian-token-usage'];
                let parsedMonthlyUsage: any = null;
                
                // Check each possible key for monthly usage
                for (const key of possibleMonthlyKeys) {
                    const savedUsage = localStorage.getItem(key);
                    console.log(`Checking localStorage key '${key}':`, savedUsage ? 'found' : 'not found');
                    
                    if (savedUsage) {
                        try {
                            const parsed = JSON.parse(savedUsage);
                            if (typeof parsed === 'object' && parsed !== null) {
                                parsedMonthlyUsage = parsed;
                                console.log(`Successfully parsed token usage from key '${key}':`, parsed);
                                break;
                            }
                        } catch (parseError) {
                            console.warn(`Failed to parse token usage from key '${key}':`, parseError);
                        }
                    }
                }
                
                // Try to load all-time usage stats
                const allTimeUsage = localStorage.getItem('claudesidian-tokens-all-time');
                let parsedAllTimeUsage: any = null;
                
                if (allTimeUsage) {
                    try {
                        const parsed = JSON.parse(allTimeUsage);
                        if (typeof parsed === 'object' && parsed !== null) {
                            parsedAllTimeUsage = parsed;
                            console.log('Successfully parsed all-time token usage:', parsed);
                        }
                    } catch (parseError) {
                        console.warn('Failed to parse all-time token usage:', parseError);
                    }
                } else {
                    console.log("All-time token usage not found in localStorage");
                }
                
                // Initialize modelUsage if not present
                if (!stats.modelUsage) {
                    stats.modelUsage = {
                        'text-embedding-3-small': 0,
                        'text-embedding-3-large': 0
                    };
                }
                
                // Get the cost per thousand tokens
                const costPerThousandTokens = this.settings.costPerThousandTokens || {
                    'text-embedding-3-small': 0.00002,
                    'text-embedding-3-large': 0.00013
                };
                
                // If we found valid monthly usage data, update the stats
                if (parsedMonthlyUsage) {
                    // Copy all model usage values, not just the predefined ones
                    for (const model in parsedMonthlyUsage) {
                        if (typeof parsedMonthlyUsage[model] === 'number') {
                            stats.modelUsage[model] = parsedMonthlyUsage[model];
                        }
                    }
                    
                    // Calculate total tokens from model usage
                    stats.tokensThisMonth = Object.values(stats.modelUsage).reduce((sum, count) => sum + count, 0);
                    
                    // Calculate estimated cost based on model usage and configured costs
                    stats.estimatedCost = 0;
                    for (const model in stats.modelUsage) {
                        const tokens = stats.modelUsage[model as keyof ModelCostMap];
                        const costPerThousand = costPerThousandTokens[model] || 0;
                        stats.estimatedCost += (tokens / 1000) * costPerThousand;
                    }
                    
                    console.log('Loaded token usage stats from localStorage:', {
                        tokensThisMonth: stats.tokensThisMonth,
                        estimatedCost: stats.estimatedCost,
                        modelUsage: stats.modelUsage
                    });
                } else {
                    console.log('No valid monthly token usage data found in localStorage');
                }
                
                // If we found valid all-time usage data, update the stats
                if (parsedAllTimeUsage && typeof parsedAllTimeUsage.tokensAllTime === 'number') {
                    stats.tokensAllTime = parsedAllTimeUsage.tokensAllTime;
                    stats.estimatedCostAllTime = parsedAllTimeUsage.estimatedCostAllTime || 0;
                    
                    console.log('Loaded all-time token usage stats from localStorage:', {
                        tokensAllTime: stats.tokensAllTime,
                        estimatedCostAllTime: stats.estimatedCostAllTime
                    });
                } else {
                    // Initialize all-time stats if they don't exist
                    stats.tokensAllTime = stats.tokensThisMonth;
                    stats.estimatedCostAllTime = stats.estimatedCost;
                    
                    // Save initial all-time stats to localStorage
                    try {
                        localStorage.setItem('claudesidian-tokens-all-time', JSON.stringify({
                            tokensAllTime: stats.tokensAllTime,
                            estimatedCostAllTime: stats.estimatedCostAllTime,
                            lastUpdated: new Date().toISOString()
                        }));
                        console.log('Initialized all-time token usage stats in localStorage');
                    } catch (saveError) {
                        console.warn('Failed to save all-time token usage to localStorage:', saveError);
                    }
                }
                
            } else {
                console.log('localStorage not available');
            }
        } catch (localStorageError) {
            console.warn('Failed to load token usage from localStorage:', localStorageError);
        }
    }

    /**
     * Update collection statistics in the provided stats object
     * @param stats Stats object to update
     */
    private async updateCollectionStats(stats: UsageStats): Promise<void> {
        try {
            // Check if vector store exists and has been initialized
            // We're checking for the property ourselves since the interface doesn't define it
            if (!this.vectorStore || !(this.vectorStore as any).initialized) {
                console.log('Vector store not initialized, skipping collection stats');
                return;
            }
            
            // Get diagnostics for collection stats
            const diagnostics = await this.vectorStore.getDiagnostics();
            console.log('Vector store diagnostics:', diagnostics);
            
            // Update database size if available
            if (diagnostics.dbSizeMB) {
                stats.dbSizeMB = diagnostics.dbSizeMB;
            }
            
            // Check for collections data in diagnostics
            if (diagnostics.collections && diagnostics.collections.length > 0) {
                stats.collectionStats = [];
                let totalEmbeddings = 0;
                
                diagnostics.collections.forEach((collection: any, index: number) => {
                    if (collection.name && collection.itemCount !== undefined) {
                        stats.collectionStats!.push({
                            name: collection.name,
                            count: collection.itemCount,
                            color: this.colors[index % this.colors.length]
                        });
                        totalEmbeddings += collection.itemCount;
                    }
                });
                
                stats.totalEmbeddings = totalEmbeddings;
                console.log('Updated stats with collection data, total embeddings:', stats.totalEmbeddings);
            } else {
                // Fallback to manual collection stats gathering if diagnostics doesn't have them
                await this.getManualCollectionStats(stats);
            }
        } catch (error) {
            console.error('Error updating collection stats:', error);
        }
    }

    /**
     * Manually gather collection statistics
     * @param stats Stats object to update
     */
    private async getManualCollectionStats(stats: UsageStats): Promise<void> {
        try {
            const collections = await this.vectorStore.listCollections();
            console.log('Found collections:', collections);
            
            if (!collections || collections.length === 0) {
                console.log('No collections found');
                return;
            }
            
            stats.collectionStats = [];
            let totalEmbeddings = 0;
            
            // Get count for each collection
            for (let i = 0; i < collections.length; i++) {
                const name = collections[i];
                try {
                    const count = await this.vectorStore.count(name);
                    stats.collectionStats.push({
                        name,
                        count,
                        color: this.colors[i % this.colors.length]
                    });
                    totalEmbeddings += count;
                } catch (countError) {
                    console.error(`Error getting count for collection ${name}:`, countError);
                }
            }
            
            stats.totalEmbeddings = totalEmbeddings;
            console.log('Updated stats with manual collection data, total embeddings:', stats.totalEmbeddings);
        } catch (error) {
            console.error('Error getting manual collection stats:', error);
        }
    }

    /**
     * Reset usage statistics 
     */
    async resetUsageStats(): Promise<void> {
        try {
            // Try to reset through the embedding provider
            if (this.embeddingService && this.embeddingService.getProvider()) {
                const provider = this.embeddingService.getProvider();
                
                if (this.isTokenTrackingProvider(provider)) {
                    // Use the standard interface
                    await provider.resetUsageStats();
                    console.log('Reset usage stats using ITokenTrackingProvider interface');
                } else if (typeof (provider as any).resetUsageStats === 'function') {
                    // Fallback for backward compatibility
                    await (provider as any).resetUsageStats();
                    console.log('Reset usage stats using fallback method');
                } else {
                    console.warn('Provider does not support resetUsageStats method');
                }
                
                // Emit reset event
                this.eventManager.emit(USAGE_EVENTS.STATS_RESET, null);
                
                // Refresh stats after reset
                await this.refreshStats();
            }
        } catch (error) {
            console.error('Error resetting usage stats:', error);
        }
    }

    /**
     * Update usage statistics with a new token count
     * @param tokenCount Token count to update
     * @param model Optional specific model to update
     */
    async updateUsageStats(tokenCount: number, model?: string): Promise<void> {
        try {
            // Try to update through the embedding provider
            if (this.embeddingService && this.embeddingService.getProvider()) {
                const provider = this.embeddingService.getProvider();
                
                if (this.isTokenTrackingProvider(provider)) {
                    // Use the standard interface
                    await provider.updateUsageStats(tokenCount, model);
                    console.log(`Updated token usage stats using ITokenTrackingProvider interface: +${tokenCount} tokens`);
                } else if (typeof (provider as any).updateUsageStats === 'function') {
                    // Fallback for backward compatibility
                    await (provider as any).updateUsageStats(tokenCount, model);
                    console.log(`Updated token usage stats using fallback method: +${tokenCount} tokens`);
                } else {
                    console.warn('Provider does not support updateUsageStats method');
                }
                
                // Update all-time usage stats
                try {
                    if (typeof localStorage !== 'undefined') {
                        // Get current all-time stats
                        const allTimeUsageStr = localStorage.getItem('claudesidian-tokens-all-time');
                        let allTimeStats = {
                            tokensAllTime: 0,
                            estimatedCostAllTime: 0,
                            lastUpdated: new Date().toISOString()
                        };
                        
                        if (allTimeUsageStr) {
                            try {
                                const parsed = JSON.parse(allTimeUsageStr);
                                if (typeof parsed === 'object' && parsed !== null) {
                                    allTimeStats = parsed;
                                }
                            } catch (parseError) {
                                console.warn('Failed to parse all-time token usage:', parseError);
                            }
                        }
                        
                        // Add new tokens to all-time count
                        allTimeStats.tokensAllTime += tokenCount;
                        
                        // Calculate cost based on model
                        const costPerThousandTokens = this.settings.costPerThousandTokens || {
                            'text-embedding-3-small': 0.00002,
                            'text-embedding-3-large': 0.00013
                        };
                        
                        const modelToUse = model || 'text-embedding-3-small';
                        const costPerThousand = costPerThousandTokens[modelToUse] || 0.00002;
                        const cost = (tokenCount / 1000) * costPerThousand;
                        
                        // Add cost to all-time cost
                        allTimeStats.estimatedCostAllTime += cost;
                        allTimeStats.lastUpdated = new Date().toISOString();
                        
                        // Save updated all-time stats
                        localStorage.setItem('claudesidian-tokens-all-time', JSON.stringify(allTimeStats));
                        console.log(`Updated all-time token usage: +${tokenCount} tokens, +$${cost.toFixed(6)} cost. New total: ${allTimeStats.tokensAllTime} tokens, $${allTimeStats.estimatedCostAllTime.toFixed(6)} cost`);
                    }
                } catch (allTimeError) {
                    console.warn('Failed to update all-time token usage:', allTimeError);
                }
                
                // Emit update event
                this.eventManager.emit(USAGE_EVENTS.STATS_UPDATED, null);
                
                // Refresh stats after update
                await this.refreshStats();
            }
        } catch (error) {
            console.error('Error updating usage stats:', error);
        }
    }

    /**
     * Force refresh of statistics
     */
    async refreshStats(): Promise<UsageStats> {
        console.log('Refreshing usage stats...');
        
        // Prevent concurrent refreshes and infinite loops
        if (this.isRefreshing) {
            console.log('Refresh already in progress, skipping');
            return this.defaultStats;
        }
        
        try {
            this.isRefreshing = true;
            
            // Clear any cached data
            this.defaultStats = {
                tokensThisMonth: 0,
                totalEmbeddings: 0,
                dbSizeMB: 0,
                lastIndexedDate: '',
                indexingInProgress: false,
                estimatedCost: 0,
                modelUsage: {
                    'text-embedding-3-small': 0,
                    'text-embedding-3-large': 0
                },
                collectionStats: []
            };
            
            // Get fresh stats but don't emit events during the get operation
            const stats = await this.getUsageStats(true);
            
            // Now emit the refresh event once with the final stats
            this.eventManager.emit(USAGE_EVENTS.STATS_REFRESHED, stats);
            
            return stats;
        } finally {
            // Always reset the flag when done, even if there's an error
            this.isRefreshing = false;
        }
    }
    
    /**
     * Force a complete refresh with collection purging
     * This is a more aggressive refresh that ensures collection stats are accurate
     * by forcing a complete cache invalidation and reload
     */
    async forceCompleteRefresh(): Promise<UsageStats> {
        console.log('Forcing complete stats refresh with collection cache invalidation...');
        
        try {
            // Force a complete cache reset if vector store supports it
            if (this.vectorStore && typeof (this.vectorStore as any).refreshCollections === 'function') {
                await (this.vectorStore as any).refreshCollections();
                console.log('Successfully refreshed vector store collections');
            }
            
            // Completely clear the default stats
            this.defaultStats = {
                tokensThisMonth: 0,
                totalEmbeddings: 0,
                dbSizeMB: 0,
                lastIndexedDate: '',
                indexingInProgress: false,
                estimatedCost: 0,
                modelUsage: {
                    'text-embedding-3-small': 0,
                    'text-embedding-3-large': 0
                },
                collectionStats: []
            };
            
            // Get completely fresh stats
            const stats = await this.getUsageStats(true);
            
            // Emit multiple events to ensure all UI components update
            this.eventManager.emit(USAGE_EVENTS.COLLECTIONS_PURGED, {
                timestamp: Date.now(),
                source: 'force-complete-refresh'
            });
            
            this.eventManager.emit(USAGE_EVENTS.STATS_REFRESHED, stats);
            
            return stats;
        } catch (error) {
            console.error('Error during complete refresh:', error);
            // Still try to do a basic refresh even if the aggressive refresh fails
            return this.refreshStats();
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