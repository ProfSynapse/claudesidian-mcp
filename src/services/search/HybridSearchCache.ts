/**
 * HybridSearchCache.ts - Intelligent caching service for hybrid search results
 * Location: src/services/search/HybridSearchCache.ts
 * Purpose: Provides efficient caching with TTL, LRU eviction, and cache statistics
 * Used by: HybridSearchService to cache search results and improve performance
 */

import { HybridSearchResult, CachedSearchResult } from '../../types/search/SearchResults';
import { CacheConfiguration, CacheStats } from '../../types/search/SearchMetadata';

export interface HybridSearchCacheInterface {
  get(key: string): Promise<HybridSearchResult[] | null>;
  set(key: string, results: HybridSearchResult[], ttl?: number): Promise<void>;
  invalidate(pattern: string): Promise<number>;
  clear(): Promise<number>;
  getStats(): Promise<CacheStats>;
  getConfiguration(): CacheConfiguration;
  updateConfiguration(config: Partial<CacheConfiguration>): Promise<void>;
}

export class HybridSearchCache implements HybridSearchCacheInterface {
  private cache = new Map<string, CachedSearchResult>();
  private accessOrder = new Map<string, number>(); // For LRU tracking
  private config: CacheConfiguration;
  private stats = {
    totalHits: 0,
    totalMisses: 0,
    evictions: 0,
    totalSets: 0
  };

  constructor(config?: Partial<CacheConfiguration>) {
    this.config = {
      maxSize: 1000,
      ttl: 300000, // 5 minutes default
      enableCompression: false,
      evictionStrategy: 'lru',
      enablePersistence: false,
      ...config
    };
  }

  /**
   * Retrieves cached search results
   */
  async get(key: string): Promise<HybridSearchResult[] | null> {
    const cached = this.cache.get(key);
    
    if (!cached) {
      this.stats.totalMisses++;
      return null;
    }

    // Check TTL expiration
    if (this.isExpired(cached)) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.stats.totalMisses++;
      return null;
    }

    // Update access tracking for LRU
    this.accessOrder.set(key, Date.now());
    cached.hits = (cached.hits || 0) + 1;
    this.stats.totalHits++;

    return cached.results;
  }

  /**
   * Stores search results in cache
   */
  async set(key: string, results: HybridSearchResult[], ttl?: number): Promise<void> {
    const effectiveTtl = ttl ?? this.config.ttl;
    
    const cachedResult: CachedSearchResult = {
      results,
      timestamp: Date.now(),
      query: key, // Using key as query for simplicity
      key,
      hits: 0
    };

    // Check if we need to evict entries
    if (this.cache.size >= this.config.maxSize) {
      await this.evictEntries(1);
    }

    this.cache.set(key, cachedResult);
    this.accessOrder.set(key, Date.now());
    this.stats.totalSets++;
  }

  /**
   * Invalidates cache entries matching pattern
   */
  async invalidate(pattern: string): Promise<number> {
    let removed = 0;

    if (pattern === '*') {
      // Clear all entries
      removed = this.cache.size;
      this.cache.clear();
      this.accessOrder.clear();
    } else {
      // Pattern matching
      const keysToRemove: string[] = [];
      
      for (const key of this.cache.keys()) {
        if (this.matchesPattern(key, pattern)) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => {
        this.cache.delete(key);
        this.accessOrder.delete(key);
        removed++;
      });
    }

    return removed;
  }

  /**
   * Clears entire cache
   */
  async clear(): Promise<number> {
    const size = this.cache.size;
    this.cache.clear();
    this.accessOrder.clear();
    return size;
  }

  /**
   * Gets cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const totalOperations = this.stats.totalHits + this.stats.totalMisses;
    const hitRate = totalOperations > 0 ? this.stats.totalHits / totalOperations : 0;
    const missRate = totalOperations > 0 ? this.stats.totalMisses / totalOperations : 0;

    // Calculate memory usage estimate
    let memoryUsage = 0;
    let totalEntries = 0;
    
    for (const cached of this.cache.values()) {
      const entrySize = this.estimateEntrySize(cached);
      memoryUsage += entrySize;
      totalEntries++;
    }

    const averageEntrySize = totalEntries > 0 ? memoryUsage / totalEntries : 0;

    return {
      size: this.cache.size,
      hitRate,
      missRate,
      totalHits: this.stats.totalHits,
      totalMisses: this.stats.totalMisses,
      evictions: this.stats.evictions,
      memoryUsage,
      averageEntrySize
    };
  }

  /**
   * Gets current cache configuration
   */
  getConfiguration(): CacheConfiguration {
    return { ...this.config };
  }

  /**
   * Updates cache configuration
   */
  async updateConfiguration(config: Partial<CacheConfiguration>): Promise<void> {
    const oldMaxSize = this.config.maxSize;
    this.config = { ...this.config, ...config };

    // If max size was reduced, evict excess entries
    if (config.maxSize && config.maxSize < oldMaxSize && this.cache.size > config.maxSize) {
      await this.evictEntries(this.cache.size - config.maxSize);
    }
  }

  /**
   * Generates cache key from query and options
   */
  generateCacheKey(query: string, options?: Record<string, any>): string {
    const normalizedQuery = query.toLowerCase().trim();
    const optionsHash = options ? this.hashObject(options) : '';
    return `${normalizedQuery}:${optionsHash}`;
  }

  // Private helper methods

  private isExpired(cached: CachedSearchResult): boolean {
    return Date.now() - cached.timestamp > this.config.ttl;
  }

  private async evictEntries(count: number): Promise<void> {
    if (count <= 0) return;

    let evicted = 0;
    const keysToEvict: string[] = [];

    switch (this.config.evictionStrategy) {
      case 'lru':
        // Sort by access time (oldest first)
        const sortedByAccess = Array.from(this.accessOrder.entries())
          .sort(([, a], [, b]) => a - b);
        
        for (let i = 0; i < Math.min(count, sortedByAccess.length); i++) {
          keysToEvict.push(sortedByAccess[i][0]);
        }
        break;

      case 'fifo':
        // Sort by insertion time (oldest first)
        const sortedByTime = Array.from(this.cache.entries())
          .sort(([, a], [, b]) => a.timestamp - b.timestamp);
        
        for (let i = 0; i < Math.min(count, sortedByTime.length); i++) {
          keysToEvict.push(sortedByTime[i][0]);
        }
        break;

      case 'ttl':
        // Evict expired entries first
        const now = Date.now();
        for (const [key, cached] of this.cache.entries()) {
          if (now - cached.timestamp > this.config.ttl) {
            keysToEvict.push(key);
            if (keysToEvict.length >= count) break;
          }
        }

        // If not enough expired entries, fall back to LRU
        if (keysToEvict.length < count) {
          const remaining = count - keysToEvict.length;
          const lruKeys = Array.from(this.accessOrder.entries())
            .filter(([key]) => !keysToEvict.includes(key))
            .sort(([, a], [, b]) => a - b)
            .slice(0, remaining)
            .map(([key]) => key);
          
          keysToEvict.push(...lruKeys);
        }
        break;
    }

    // Remove selected entries
    keysToEvict.forEach(key => {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      evicted++;
    });

    this.stats.evictions += evicted;
  }

  private matchesPattern(key: string, pattern: string): boolean {
    if (pattern === '*') return true;
    
    // Simple pattern matching with * wildcard
    const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
    return regex.test(key);
  }

  private estimateEntrySize(cached: CachedSearchResult): number {
    // Rough estimate of memory usage
    let size = 0;
    
    // Key size
    size += cached.key.length * 2; // Assuming 2 bytes per character
    
    // Results size
    cached.results.forEach(result => {
      size += (result.title?.length || 0) * 2;
      size += (result.snippet?.length || 0) * 2;
      size += (result.content?.length || 0) * 2;
      size += JSON.stringify(result.metadata || {}).length * 2;
      size += 100; // Overhead for other properties
    });
    
    // Other properties
    size += 50; // timestamp, hits, etc.
    
    return size;
  }

  private hashObject(obj: Record<string, any>): string {
    // Simple hash function for cache key generation
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    let hash = 0;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return hash.toString(36);
  }

  /**
   * Cleanup expired entries (can be called periodically)
   */
  async cleanupExpiredEntries(): Promise<number> {
    const now = Date.now();
    const keysToRemove: string[] = [];

    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp > this.config.ttl) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => {
      this.cache.delete(key);
      this.accessOrder.delete(key);
    });

    return keysToRemove.length;
  }
}