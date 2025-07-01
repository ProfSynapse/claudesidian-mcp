/**
 * Cache Manager
 * Provides in-memory LRU cache and file-based cache implementations
 */

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { logger } from './Logger';

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl?: number;
  hits: number;
}

export interface CacheConfig {
  maxSize: number;
  defaultTTL: number; // in milliseconds
  persistToDisk: boolean;
  cacheDir: string;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
}

export abstract class BaseCache<T> {
  protected config: CacheConfig;
  protected metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0
  };

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize || 1000,
      defaultTTL: config.defaultTTL || 3600000, // 1 hour default
      persistToDisk: config.persistToDisk || false,
      cacheDir: config.cacheDir || '.cache'
    };
  }

  abstract get(key: string): Promise<T | null>;
  abstract set(key: string, value: T, ttl?: number): Promise<void>;
  abstract delete(key: string): Promise<boolean>;
  abstract clear(): Promise<void>;
  abstract size(): number;

  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  protected isExpired(entry: CacheEntry<T>): boolean {
    if (!entry.ttl) return false;
    return Date.now() - entry.timestamp > entry.ttl;
  }

  protected generateHash(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }
}

export class LRUCache<T> extends BaseCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private accessOrder = new Map<string, number>();
  private accessCounter = 0;

  async get(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.metrics.misses++;
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.metrics.misses++;
      this.metrics.size--;
      return null;
    }

    // Update access order and hit count
    entry.hits++;
    this.accessOrder.set(key, ++this.accessCounter);
    this.metrics.hits++;
    
    return entry.value;
  }

  async set(key: string, value: T, ttl?: number): Promise<void> {
    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.metrics.size--;
    }

    // Evict LRU entries if at capacity
    while (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.config.defaultTTL,
      hits: 0
    };

    this.cache.set(key, entry);
    this.accessOrder.set(key, ++this.accessCounter);
    this.metrics.size++;

    if (this.config.persistToDisk) {
      await this.persistEntry(key, entry);
    }
  }

  async delete(key: string): Promise<boolean> {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.accessOrder.delete(key);
      this.metrics.size--;
    }
    return deleted;
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.accessOrder.clear();
    this.metrics.size = 0;
    this.metrics.evictions = 0;
  }

  size(): number {
    return this.cache.size;
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, accessTime] of this.accessOrder) {
      if (accessTime < oldestAccess) {
        oldestAccess = accessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
      this.metrics.evictions++;
      this.metrics.size--;
    }
  }

  private async persistEntry(key: string, entry: CacheEntry<T>): Promise<void> {
    try {
      await fs.mkdir(this.config.cacheDir, { recursive: true });
      const filePath = join(this.config.cacheDir, `${this.generateHash(key)}.json`);
      await fs.writeFile(filePath, JSON.stringify({ key, entry }));
    } catch (error) {
      logger.warn('Failed to persist cache entry:', { error: (error as Error).message });
    }
  }
}

export class FileCache<T> extends BaseCache<T> {
  private memoryCache = new Map<string, CacheEntry<T>>();

  constructor(config: Partial<CacheConfig> = {}) {
    super({ ...config, persistToDisk: true });
    this.initializeCache();
  }

  async get(key: string): Promise<T | null> {
    // Check memory first
    let entry = this.memoryCache.get(key);
    
    // If not in memory, try disk
    if (!entry) {
      entry = (await this.loadFromDisk(key)) || undefined;
      if (entry) {
        this.memoryCache.set(key, entry);
      }
    }

    if (!entry) {
      this.metrics.misses++;
      return null;
    }

    if (this.isExpired(entry)) {
      await this.delete(key);
      this.metrics.misses++;
      return null;
    }

    entry.hits++;
    this.metrics.hits++;
    return entry.value;
  }

  async set(key: string, value: T, ttl?: number): Promise<void> {
    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.config.defaultTTL,
      hits: 0
    };

    this.memoryCache.set(key, entry);
    await this.saveToDisk(key, entry);
    this.metrics.size++;
  }

  async delete(key: string): Promise<boolean> {
    const memoryDeleted = this.memoryCache.delete(key);
    const diskDeleted = await this.deleteFromDisk(key);
    
    if (memoryDeleted || diskDeleted) {
      this.metrics.size--;
      return true;
    }
    return false;
  }

  async clear(): Promise<void> {
    this.memoryCache.clear();
    try {
      await fs.rm(this.config.cacheDir, { recursive: true, force: true });
    } catch (error) {
      logger.warn('Failed to clear disk cache:', { error: (error as Error).message });
    }
    this.metrics.size = 0;
  }

  size(): number {
    return this.memoryCache.size;
  }

  private async initializeCache(): Promise<void> {
    try {
      await fs.mkdir(this.config.cacheDir, { recursive: true });
    } catch (error) {
      logger.warn('Failed to initialize cache directory:', { error: (error as Error).message });
    }
  }

  private async loadFromDisk(key: string): Promise<CacheEntry<T> | null> {
    try {
      const filePath = join(this.config.cacheDir, `${this.generateHash(key)}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      return parsed.entry;
    } catch (error) {
      return null;
    }
  }

  private async saveToDisk(key: string, entry: CacheEntry<T>): Promise<void> {
    try {
      const filePath = join(this.config.cacheDir, `${this.generateHash(key)}.json`);
      await fs.writeFile(filePath, JSON.stringify({ key, entry }));
    } catch (error) {
      logger.warn('Failed to save cache entry to disk:', { error: (error as Error).message });
    }
  }

  private async deleteFromDisk(key: string): Promise<boolean> {
    try {
      const filePath = join(this.config.cacheDir, `${this.generateHash(key)}.json`);
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }
}

export class CacheManager {
  private static instances = new Map<string, BaseCache<any>>();

  static createLRUCache<T>(name: string, config?: Partial<CacheConfig>): LRUCache<T> {
    const cache = new LRUCache<T>(config);
    this.instances.set(name, cache);
    return cache;
  }

  static createFileCache<T>(name: string, config?: Partial<CacheConfig>): FileCache<T> {
    const cache = new FileCache<T>(config);
    this.instances.set(name, cache);
    return cache;
  }

  static getCache<T>(name: string): BaseCache<T> | null {
    return this.instances.get(name) || null;
  }

  static async clearAll(): Promise<void> {
    for (const cache of this.instances.values()) {
      await cache.clear();
    }
  }

  static getAllMetrics(): Record<string, CacheMetrics> {
    const metrics: Record<string, CacheMetrics> = {};
    for (const [name, cache] of this.instances.entries()) {
      metrics[name] = cache.getMetrics();
    }
    return metrics;
  }
}