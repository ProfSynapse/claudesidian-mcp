/**
 * Location: src/database/services/cache/strategies/BaseCacheStrategy.ts
 *
 * Purpose: Base implementation of cache strategy with common logic
 * Implements Strategy pattern with Template Method for customization
 *
 * Used by: Specific cache strategies (FileCache, EmbeddingCache, etc.)
 * Dependencies: CacheStrategy interface
 */

import { CachedEntry, CacheStrategy, CacheStatistics } from './CacheStrategy';

/**
 * Base cache strategy with common implementation
 */
export abstract class BaseCacheStrategy<T extends CachedEntry> implements CacheStrategy<T> {
  protected cache = new Map<string, T>();

  set(key: string, entry: T): void {
    this.cache.set(key, entry);
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccess = Date.now();

    return entry;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  getAll(): Map<string, T> {
    return new Map(this.cache);
  }

  getStatistics(): CacheStatistics {
    const entries = Array.from(this.cache.values());
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

  cleanup(now: number): number {
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry, now)) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  protected isExpired(entry: T, now?: number): boolean {
    const currentTime = now || Date.now();
    return (currentTime - entry.timestamp) > entry.ttl;
  }
}
