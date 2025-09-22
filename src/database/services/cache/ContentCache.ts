/**
 * Location: src/database/services/cache/ContentCache.ts
 * 
 * Summary: Consolidated content caching service that provides high-level content
 * caching operations including file content, metadata, searchs, and search results.
 * Consolidates caching functionality from multiple specialized cache services into
 * a unified interface with TTL, memory management, and cache invalidation.
 * 
 * Used by: All services requiring content caching capabilities
 * Dependencies: EntityCache, VaultFileIndex, PrefetchManager patterns
 */

import { EventEmitter } from 'events';
import { Plugin, TFile, Vault } from 'obsidian';
import { getErrorMessage } from '../../../utils/errorUtils';

export interface ContentCacheOptions {
  enableFileContentCache?: boolean;
  enableMetadataCache?: boolean;
  enablesearchDataCache?: boolean;
  enableSearchCache?: boolean;
  defaultTTL?: number;
  maxCacheSize?: number;
  maxMemoryMB?: number;
}

export interface CachedContent {
  data: any;
  timestamp: number;
  size: number;
  ttl: number;
  accessCount: number;
  lastAccess: number;
}

export interface FileContent extends CachedContent {
  filePath: string;
  content: string;
  metadata?: any;
  hash?: string;
}

export interface searchContent extends CachedContent {
  filePath: string;
  search: number[];
  model: string;
  chunkIndex?: number;
}

export interface SearchResult extends CachedContent {
  query: string;
  results: any[];
  type: string;
}

export interface CacheStats {
  totalEntries: number;
  totalSizeMB: number;
  hitRate: number;
  memoryUsageMB: number;
  cachesByType: Record<string, {
    count: number;
    sizeMB: number;
    oldestEntry: number;
    newestEntry: number;
  }>;
}

/**
 * Content Cache Service
 * 
 * Provides unified caching for:
 * - File content and metadata
 * - search data and results
 * - Search results and queries
 * - Computed values and transformations
 */
export class ContentCache extends EventEmitter {
  // Cache storage maps by type
  private fileContentCache = new Map<string, FileContent>();
  private metadataCache = new Map<string, CachedContent>();
  private searchDataCache = new Map<string, searchContent>();
  private searchResultsCache = new Map<string, SearchResult>();
  private computedCache = new Map<string, CachedContent>();

  // Cache statistics
  private hits = 0;
  private misses = 0;
  private currentMemoryMB = 0;

  // Configuration
  private readonly defaultTTL: number;
  private readonly maxCacheSize: number;
  private readonly maxMemoryMB: number;
  
  // Cleanup timer
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private plugin: Plugin,
    private options: ContentCacheOptions = {}
  ) {
    super();

    // Apply default configuration
    this.defaultTTL = options.defaultTTL || 30 * 60 * 1000; // 30 minutes
    this.maxCacheSize = options.maxCacheSize || 1000;
    this.maxMemoryMB = options.maxMemoryMB || 100; // 100MB default

    // Start periodic cleanup
    this.startCleanupTimer();
  }

  // =============================================================================
  // FILE CONTENT CACHING
  // =============================================================================

  /**
   * Cache file content with metadata
   */
  async cacheFileContent(
    filePath: string,
    content: string,
    metadata?: any,
    ttl?: number
  ): Promise<void> {
    if (!this.options.enableFileContentCache) {
      return;
    }

    const size = this.estimateSize(content);
    const cacheEntry: FileContent = {
      filePath,
      content,
      metadata,
      hash: this.generateHash(content),
      data: { content, metadata },
      timestamp: Date.now(),
      size,
      ttl: ttl || this.defaultTTL,
      accessCount: 1,
      lastAccess: Date.now()
    };

    this.fileContentCache.set(filePath, cacheEntry);
    this.currentMemoryMB += size / (1024 * 1024);

    this.emit('cached', { type: 'file', filePath, size });
    this.enforceMemoryLimits();
  }

  /**
   * Get cached file content
   */
  getCachedFileContent(filePath: string): FileContent | null {
    const cached = this.fileContentCache.get(filePath);
    
    if (!cached) {
      this.misses++;
      return null;
    }

    if (this.isExpired(cached)) {
      this.fileContentCache.delete(filePath);
      this.misses++;
      return null;
    }

    // Update access statistics
    cached.accessCount++;
    cached.lastAccess = Date.now();
    this.hits++;

    return cached;
  }

  /**
   * Cache file content from TFile
   */
  async cacheFile(file: TFile, ttl?: number): Promise<void> {
    try {
      const content = await this.plugin.app.vault.read(file);
      const metadata = this.plugin.app.metadataCache.getFileCache(file);
      
      await this.cacheFileContent(file.path, content, metadata, ttl);
    } catch (error) {
      console.error(`[ContentCache] Failed to cache file ${file.path}:`, error);
    }
  }

  // =============================================================================
  // search CACHING
  // =============================================================================

  /**
   * Cache search data
   */
  cachesearch(
    filePath: string,
    search: number[],
    model: string,
    chunkIndex?: number,
    ttl?: number
  ): void {
    if (!this.options.enablesearchDataCache) {
      return;
    }

    const cacheKey = this.getsearchDataCacheKey(filePath, model, chunkIndex);
    const size = this.estimateSize(search);

    const cacheEntry: searchContent = {
      filePath,
      search,
      model,
      chunkIndex,
      data: search,
      timestamp: Date.now(),
      size,
      ttl: ttl || this.defaultTTL,
      accessCount: 1,
      lastAccess: Date.now()
    };

    this.searchDataCache.set(cacheKey, cacheEntry);
    this.currentMemoryMB += size / (1024 * 1024);

    this.emit('cached', { type: 'search', filePath, model, size });
    this.enforceMemoryLimits();
  }

  /**
   * Get cached search
   */
  getCachedsearch(
    filePath: string,
    model: string,
    chunkIndex?: number
  ): searchContent | null {
    const cacheKey = this.getsearchDataCacheKey(filePath, model, chunkIndex);
    const cached = this.searchDataCache.get(cacheKey);

    if (!cached) {
      this.misses++;
      return null;
    }

    if (this.isExpired(cached)) {
      this.searchDataCache.delete(cacheKey);
      this.misses++;
      return null;
    }

    cached.accessCount++;
    cached.lastAccess = Date.now();
    this.hits++;

    return cached;
  }

  // =============================================================================
  // SEARCH RESULT CACHING
  // =============================================================================

  /**
   * Cache search results
   */
  cacheSearchResults(
    query: string,
    results: any[],
    searchType: string,
    ttl?: number
  ): void {
    if (!this.options.enableSearchCache) {
      return;
    }

    const cacheKey = this.getSearchCacheKey(query, searchType);
    const size = this.estimateSize(results);

    const cacheEntry: SearchResult = {
      query,
      results,
      type: searchType,
      data: results,
      timestamp: Date.now(),
      size,
      ttl: ttl || this.defaultTTL / 2, // Search results expire faster
      accessCount: 1,
      lastAccess: Date.now()
    };

    this.searchResultsCache.set(cacheKey, cacheEntry);
    this.currentMemoryMB += size / (1024 * 1024);

    this.emit('cached', { type: 'search', query, searchType, size });
    this.enforceMemoryLimits();
  }

  /**
   * Get cached search results
   */
  getCachedSearchResults(query: string, searchType: string): SearchResult | null {
    const cacheKey = this.getSearchCacheKey(query, searchType);
    const cached = this.searchResultsCache.get(cacheKey);

    if (!cached) {
      this.misses++;
      return null;
    }

    if (this.isExpired(cached)) {
      this.searchResultsCache.delete(cacheKey);
      this.misses++;
      return null;
    }

    cached.accessCount++;
    cached.lastAccess = Date.now();
    this.hits++;

    return cached;
  }

  // =============================================================================
  // GENERIC COMPUTED VALUE CACHING
  // =============================================================================

  /**
   * Cache computed value with custom key
   */
  cacheValue(key: string, value: any, ttl?: number): void {
    const size = this.estimateSize(value);

    const cacheEntry: CachedContent = {
      data: value,
      timestamp: Date.now(),
      size,
      ttl: ttl || this.defaultTTL,
      accessCount: 1,
      lastAccess: Date.now()
    };

    this.computedCache.set(key, cacheEntry);
    this.currentMemoryMB += size / (1024 * 1024);

    this.emit('cached', { type: 'computed', key, size });
    this.enforceMemoryLimits();
  }

  /**
   * Get cached computed value
   */
  getCachedValue(key: string): any | null {
    const cached = this.computedCache.get(key);

    if (!cached) {
      this.misses++;
      return null;
    }

    if (this.isExpired(cached)) {
      this.computedCache.delete(key);
      this.misses++;
      return null;
    }

    cached.accessCount++;
    cached.lastAccess = Date.now();
    this.hits++;

    return cached.data;
  }

  // =============================================================================
  // CACHE INVALIDATION AND MANAGEMENT
  // =============================================================================

  /**
   * Invalidate all caches for a specific file
   */
  invalidateFile(filePath: string): void {
    // Remove file content cache
    this.fileContentCache.delete(filePath);

    // Remove search caches for this file
    const searchKeys = Array.from(this.searchDataCache.keys())
      .filter(key => key.startsWith(`${filePath}:`));
    
    for (const key of searchKeys) {
      this.searchDataCache.delete(key);
    }

    // Remove metadata cache
    this.metadataCache.delete(filePath);

    this.emit('invalidated', { type: 'file', filePath });
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    this.fileContentCache.clear();
    this.metadataCache.clear();
    this.searchDataCache.clear();
    this.searchResultsCache.clear();
    this.computedCache.clear();
    
    this.currentMemoryMB = 0;
    this.hits = 0;
    this.misses = 0;

    this.emit('cleared');
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    // Clean file content cache
    for (const [key, entry] of this.fileContentCache.entries()) {
      if (this.isExpired(entry, now)) {
        this.fileContentCache.delete(key);
        cleanedCount++;
      }
    }

    // Clean search data cache
    for (const [key, entry] of this.searchDataCache.entries()) {
      if (this.isExpired(entry, now)) {
        this.searchDataCache.delete(key);
        cleanedCount++;
      }
    }

    // Clean search results cache
    for (const [key, entry] of this.searchResultsCache.entries()) {
      if (this.isExpired(entry, now)) {
        this.searchResultsCache.delete(key);
        cleanedCount++;
      }
    }

    // Clean computed cache
    for (const [key, entry] of this.computedCache.entries()) {
      if (this.isExpired(entry, now)) {
        this.computedCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.emit('cleaned', { removedEntries: cleanedCount });
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? this.hits / totalRequests : 0;

    return {
      totalEntries: this.getTotalEntries(),
      totalSizeMB: this.currentMemoryMB,
      hitRate,
      memoryUsageMB: this.currentMemoryMB,
      cachesByType: {
        fileContent: this.getCacheTypeStats(this.fileContentCache),
        searchData: this.getCacheTypeStats(this.searchDataCache),
        searchResults: this.getCacheTypeStats(this.searchResultsCache),
        computed: this.getCacheTypeStats(this.computedCache)
      }
    };
  }

  /**
   * Shutdown the cache service
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    this.clearAll();
    this.removeAllListeners();
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  private startCleanupTimer(): void {
    // Clean up every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  private isExpired(entry: CachedContent, now?: number): boolean {
    const currentTime = now || Date.now();
    return (currentTime - entry.timestamp) > entry.ttl;
  }

  private enforceMemoryLimits(): void {
    if (this.currentMemoryMB <= this.maxMemoryMB) {
      return;
    }

    // Remove least recently used entries until under limit
    const allEntries: { key: string; entry: CachedContent; type: string }[] = [];

    // Collect all entries with their keys and types
    this.fileContentCache.forEach((entry, key) => 
      allEntries.push({ key, entry, type: 'file' }));
    this.searchDataCache.forEach((entry, key) =>
      allEntries.push({ key, entry, type: 'searchData' }));
    this.searchResultsCache.forEach((entry, key) =>
      allEntries.push({ key, entry, type: 'searchResults' }));
    this.computedCache.forEach((entry, key) => 
      allEntries.push({ key, entry, type: 'computed' }));

    // Sort by last access time (oldest first)
    allEntries.sort((a, b) => a.entry.lastAccess - b.entry.lastAccess);

    // Remove entries until under memory limit
    let removedCount = 0;
    for (const { key, entry, type } of allEntries) {
      if (this.currentMemoryMB <= this.maxMemoryMB * 0.8) {
        break; // Stop when under 80% of limit
      }

      this.removeEntry(key, type);
      this.currentMemoryMB -= entry.size / (1024 * 1024);
      removedCount++;
    }

    if (removedCount > 0) {
      this.emit('memoryLimitEnforced', { removedEntries: removedCount });
    }
  }

  private removeEntry(key: string, type: string): void {
    switch (type) {
      case 'file':
        this.fileContentCache.delete(key);
        break;
      case 'searchData':
        this.searchDataCache.delete(key);
        break;
      case 'searchResults':
        this.searchResultsCache.delete(key);
        break;
      case 'computed':
        this.computedCache.delete(key);
        break;
    }
  }

  private getTotalEntries(): number {
    return this.fileContentCache.size + this.searchDataCache.size +
           this.searchResultsCache.size + this.computedCache.size + this.metadataCache.size;
  }

  private getCacheTypeStats(cache: Map<string, any>): any {
    const entries = Array.from(cache.values());
    const count = entries.length;
    
    if (count === 0) {
      return { count: 0, sizeMB: 0, oldestEntry: 0, newestEntry: 0 };
    }

    const sizeMB = entries.reduce((sum, entry) => sum + (entry.size / (1024 * 1024)), 0);
    const timestamps = entries.map(entry => entry.timestamp);
    
    return {
      count,
      sizeMB,
      oldestEntry: Math.min(...timestamps),
      newestEntry: Math.max(...timestamps)
    };
  }

  private estimateSize(data: any): number {
    // Rough estimation of object size in bytes
    try {
      const jsonString = JSON.stringify(data);
      return jsonString.length * 2; // Assume 2 bytes per character for Unicode
    } catch {
      return 1024; // Default 1KB if cannot stringify
    }
  }

  private generateHash(content: string): string {
    // Simple hash function for content comparison
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private getsearchDataCacheKey(
    filePath: string, 
    model: string, 
    chunkIndex?: number
  ): string {
    return `${filePath}:${model}${chunkIndex !== undefined ? `:${chunkIndex}` : ''}`;
  }

  private getSearchCacheKey(query: string, searchType: string): string {
    return `${searchType}:${this.generateHash(query)}`;
  }
}