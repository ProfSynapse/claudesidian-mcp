import { IUsageStatsService, UsageStats, USAGE_EVENTS } from '../interfaces/IUsageStatsService';
import { TokenUsageService } from './TokenUsageService';
import { CollectionStatsService } from './CollectionStatsService';
import { ITokenTrackingProvider } from '../interfaces/IEmbeddingProvider';
import { EventManager } from '../../services/EventManager';

/**
 * Refactored Usage Statistics Service
 * Coordinates between token usage and collection statistics services
 * Removes circular dependencies and separates concerns properly
 */
export class RefactoredUsageStatsService implements IUsageStatsService {
  private tokenService: TokenUsageService;
  private collectionService: CollectionStatsService;
  private eventManager: EventManager;
  private settings: any;

  // Flags to prevent recursion
  private isRefreshing = false;
  private lastRefreshTime = 0;
  private readonly MIN_REFRESH_INTERVAL = 2000; // 2 seconds

  constructor(
    tokenService: TokenUsageService,
    collectionService: CollectionStatsService,
    settings: any,
    eventManager: EventManager
  ) {
    this.tokenService = tokenService;
    this.collectionService = collectionService;
    this.settings = settings;
    this.eventManager = eventManager;

    this.setupEventListeners();
  }

  /**
   * Get combined usage statistics
   */
  async getUsageStats(): Promise<UsageStats> {
    try {
      // Get token usage (without provider dependency)
      const tokenUsage = await this.tokenService.getTokenUsage();
      
      // Get collection stats
      const collectionStats = await this.collectionService.getCollectionStats();

      // Combine the stats
      const stats: UsageStats = {
        ...tokenUsage,
        ...collectionStats
      };

      return stats;
    } catch (error) {
      console.error('Error getting usage stats:', error);
      return this.getDefaultStats();
    }
  }

  /**
   * Update collection statistics
   */
  async updateCollectionStats(updates: Partial<any>): Promise<void> {
    await this.collectionService.updateCollectionStats(updates);
    this.eventManager.emit(USAGE_EVENTS.STATS_UPDATED, updates);
  }

  /**
   * Get collection statistics only
   */
  async getCollectionStats(): Promise<any> {
    return await this.collectionService.getCollectionStats();
  }

  /**
   * Reset all statistics
   */
  async resetStats(): Promise<void> {
    try {
      // Reset token usage (provider will be injected when needed)
      await this.tokenService.resetTokenUsage();
      
      // Collection stats don't need resetting, they're derived from vector store
      
      this.eventManager.emit(USAGE_EVENTS.STATS_RESET, null);
      
      // Refresh after reset
      await this.refreshStats();
    } catch (error) {
      console.error('Error resetting stats:', error);
    }
  }

  /**
   * Force refresh of all statistics
   */
  async refreshStats(): Promise<UsageStats> {
    const now = Date.now();
    
    // Prevent too frequent refreshes
    if (now - this.lastRefreshTime < this.MIN_REFRESH_INTERVAL) {
      console.log(`Refresh too soon, skipping`);
      return this.getDefaultStats();
    }
    
    // Prevent concurrent refreshes
    if (this.isRefreshing) {
      console.log('Refresh already in progress, skipping');
      return this.getDefaultStats();
    }

    try {
      this.isRefreshing = true;
      this.lastRefreshTime = now;

      console.log('Refreshing usage stats...');

      // Refresh collection cache first
      await this.collectionService.refreshCollectionCache();
      
      // Get fresh stats
      const stats = await this.getUsageStats();
      
      // Emit refresh event
      this.eventManager.emit(USAGE_EVENTS.STATS_REFRESHED, stats);
      
      return stats;
    } catch (error) {
      console.error('Error refreshing stats:', error);
      return this.getDefaultStats();
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Update token usage (called by external services)
   */
  async updateTokenUsage(tokens: number, model: string, provider?: ITokenTrackingProvider): Promise<void> {
    await this.tokenService.trackTokenUsage(tokens, model, provider);
    this.eventManager.emit(USAGE_EVENTS.TOKEN_USAGE_UPDATED, { tokens, model });
  }

  /**
   * Register event listener
   */
  on(event: string, callback: (data: any) => void): void {
    this.eventManager.on(event, callback);
  }

  /**
   * Remove event listener
   */
  off(event: string, callback: (data: any) => void): void {
    this.eventManager.off(event, callback);
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Listen for collection changes
    this.eventManager.on('collection-stats-updated', () => {
      // Debounced refresh
      setTimeout(() => {
        if (!this.isRefreshing) {
          this.refreshStats();
        }
      }, 1000);
    });

    // Listen for token usage updates
    this.eventManager.on('token-usage-updated', () => {
      this.eventManager.emit(USAGE_EVENTS.STATS_UPDATED, null);
    });

    // Listen for external events (localStorage, etc.)
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === 'claudesidian-collection-deleted' || 
            event.key === 'claudesidian-collections-purged') {
          setTimeout(() => {
            if (!this.isRefreshing) {
              this.refreshStats();
            }
          }, 3000);
        }
      });
    }
  }

  /**
   * Get default statistics
   */
  private getDefaultStats(): UsageStats {
    return {
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
  }
}
