/**
 * Cache Types
 * Extracted from workspace-types.ts for better organization
 */

/**
 * In-memory cache for workspace data
 */
export interface WorkspaceCache {
  /**
   * Hot cache (in-memory, limited size, instant access)
   */
  hotCache: Map<string, {
    embedding: number[];
    metadata: any;
    lastAccessed: number;
    accessCount: number;
  }>;
  
  /**
   * IndexedDB store prefix for this workspace
   */
  warmCachePrefix: string;
  
  /**
   * Usage statistics
   */
  cacheHits: number;
  cacheMisses: number;
  
  /**
   * Cache management settings
   */
  maxHotCacheSize: number;
  pruneThreshold: number;
}