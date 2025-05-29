/**
 * Interface for usage statistics service
 */
export interface IUsageStatsService {
  /**
   * Get current usage statistics
   */
  getUsageStats(): Promise<UsageStats>;

  /**
   * Update collection statistics
   */
  updateCollectionStats(stats: Partial<CollectionStats>): Promise<void>;

  /**
   * Get collection statistics
   */
  getCollectionStats(): Promise<CollectionStats>;

  /**
   * Reset all statistics
   */
  resetStats(): Promise<void>;

  /**
   * Force refresh of all statistics
   */
  refreshStats(): Promise<UsageStats>;

  /**
   * Register event listener
   */
  on(event: string, callback: (data: any) => void): void;

  /**
   * Remove event listener
   */
  off(event: string, callback: (data: any) => void): void;
}

/**
 * Collection statistics
 */
export interface CollectionStats {
  totalEmbeddings: number;
  dbSizeMB: number;
  lastIndexedDate: string;
  indexingInProgress: boolean;
  collectionStats: CollectionStat[];
}

/**
 * Individual collection statistic
 */
export interface CollectionStat {
  name: string;
  count: number;
  color: string;
}

/**
 * Combined usage statistics
 */
export interface UsageStats extends CollectionStats {
  tokensThisMonth: number;
  estimatedCost: number;
  tokensAllTime: number;
  estimatedCostAllTime: number;
  modelUsage: ModelCostMap;
}

/**
 * Model cost mapping
 */
export interface ModelCostMap {
  [key: string]: number;
}

/**
 * Usage statistics events
 */
export const USAGE_EVENTS = {
  STATS_UPDATED: 'usage-stats-updated',
  STATS_RESET: 'usage-stats-reset',
  STATS_REFRESHED: 'usage-stats-refreshed',
  COLLECTIONS_PURGED: 'collections-purged',
  TOKEN_USAGE_UPDATED: 'token-usage-updated'
} as const;
