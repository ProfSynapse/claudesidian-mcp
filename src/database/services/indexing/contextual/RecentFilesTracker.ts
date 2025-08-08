/**
 * src/database/services/contextual/RecentFilesTracker.ts
 * 
 * Lightweight LRU cache for recently accessed files with embedding context.
 * Implements efficient tracking of file access patterns for contextual embedding loading.
 * 
 * Used by: ContextualEmbeddingManager for determining which embeddings to load
 * Dependencies: None (self-contained LRU implementation)
 */

export type FilePriority = 'high' | 'normal';

interface RecentFileEntry {
  filePath: string;
  timestamp: number;
  priority: FilePriority;
  accessCount: number;
}

/**
 * Lightweight LRU cache for tracking recently accessed files
 * Core component of context-aware embedding loading system
 */
export class RecentFilesTracker {
  private files: Map<string, RecentFileEntry> = new Map();
  private maxSize: number;
  private readonly defaultMaxSize = 75;

  constructor(maxSize?: number) {
    this.maxSize = maxSize || this.defaultMaxSize;
  }

  /**
   * Add a file to the recent files cache
   * @param filePath Normalized file path
   * @param priority Priority level for retention (high priority files kept longer)
   */
  addRecentFile(filePath: string, priority: FilePriority = 'normal'): void {
    const now = Date.now();
    const existing = this.files.get(filePath);

    if (existing) {
      // Update existing entry - move to end of insertion order
      existing.timestamp = now;
      existing.accessCount++;
      existing.priority = priority; // Update priority if provided
      
      // Re-insert to maintain LRU order in Map
      this.files.delete(filePath);
      this.files.set(filePath, existing);
    } else {
      // Add new entry
      const entry: RecentFileEntry = {
        filePath,
        timestamp: now,
        priority,
        accessCount: 1
      };
      
      this.files.set(filePath, entry);
    }

    // Enforce size limit with LRU eviction
    this.enforceSize();
  }

  /**
   * Get recent files up to the specified limit
   * @param limit Maximum number of files to return
   * @returns Array of file paths in access order (most recent first)
   */
  getRecentFiles(limit?: number): string[] {
    const entries = Array.from(this.files.values());
    
    // Sort by timestamp descending (most recent first)
    entries.sort((a, b) => b.timestamp - a.timestamp);
    
    const actualLimit = limit || this.maxSize;
    return entries.slice(0, actualLimit).map(entry => entry.filePath);
  }

  /**
   * Check if a file is in the recent files cache
   * @param filePath File path to check
   * @returns True if file is in cache
   */
  isRecentFile(filePath: string): boolean {
    return this.files.has(filePath);
  }

  /**
   * Boost a file's priority and move it to the front
   * @param filePath File path to boost
   */
  boostFile(filePath: string): void {
    const entry = this.files.get(filePath);
    if (entry) {
      entry.timestamp = Date.now();
      entry.priority = 'high';
      entry.accessCount++;
      
      // Re-insert to maintain LRU order
      this.files.delete(filePath);
      this.files.set(filePath, entry);
    }
  }

  /**
   * Get files organized by priority level
   * @returns Object with high and normal priority file arrays
   */
  getFilesByPriority(): { high: string[], normal: string[] } {
    const high: string[] = [];
    const normal: string[] = [];

    const entries = Array.from(this.files.values());
    entries.sort((a, b) => b.timestamp - a.timestamp);

    for (const entry of entries) {
      if (entry.priority === 'high') {
        high.push(entry.filePath);
      } else {
        normal.push(entry.filePath);
      }
    }

    return { high, normal };
  }

  /**
   * Set maximum cache size
   * @param maxFiles Maximum number of files to cache
   */
  setMaxSize(maxFiles: number): void {
    this.maxSize = Math.max(1, maxFiles); // Ensure at least size 1
    this.enforceSize();
  }

  /**
   * Get current cache size
   * @returns Number of files in cache
   */
  getSize(): number {
    return this.files.size;
  }

  /**
   * Clear all files from cache
   */
  clear(): void {
    this.files.clear();
  }

  /**
   * Remove specific file from cache
   * @param filePath File path to remove
   */
  removeFile(filePath: string): boolean {
    return this.files.delete(filePath);
  }

  /**
   * Get cache statistics for diagnostics
   * @returns Cache usage and priority statistics
   */
  getStats(): {
    totalFiles: number;
    highPriorityFiles: number;
    normalPriorityFiles: number;
    maxSize: number;
    utilizationPercent: number;
    averageAccessCount: number;
    oldestFileAge: number;
    newestFileAge: number;
  } {
    const entries = Array.from(this.files.values());
    const now = Date.now();
    
    let highPriorityCount = 0;
    let totalAccessCount = 0;
    let oldestTime = now;
    let newestTime = 0;

    for (const entry of entries) {
      if (entry.priority === 'high') {
        highPriorityCount++;
      }
      totalAccessCount += entry.accessCount;
      oldestTime = Math.min(oldestTime, entry.timestamp);
      newestTime = Math.max(newestTime, entry.timestamp);
    }

    return {
      totalFiles: entries.length,
      highPriorityFiles: highPriorityCount,
      normalPriorityFiles: entries.length - highPriorityCount,
      maxSize: this.maxSize,
      utilizationPercent: Math.round((entries.length / this.maxSize) * 100),
      averageAccessCount: entries.length > 0 ? Math.round(totalAccessCount / entries.length) : 0,
      oldestFileAge: entries.length > 0 ? now - oldestTime : 0,
      newestFileAge: entries.length > 0 ? now - newestTime : 0
    };
  }

  /**
   * Get files that haven't been accessed recently
   * @param maxAgeMs Maximum age in milliseconds (default: 1 hour)
   * @returns Array of stale file paths
   */
  getStaleFiles(maxAgeMs: number = 60 * 60 * 1000): string[] {
    const now = Date.now();
    const staleFiles: string[] = [];

    for (const [filePath, entry] of this.files.entries()) {
      if (now - entry.timestamp > maxAgeMs) {
        staleFiles.push(filePath);
      }
    }

    return staleFiles;
  }

  /**
   * Enforce maximum cache size using LRU eviction with priority consideration
   * High priority files are preserved longer than normal priority files
   */
  private enforceSize(): void {
    if (this.files.size <= this.maxSize) {
      return;
    }

    const entries = Array.from(this.files.entries());
    
    // Sort by priority (high first) then by timestamp (oldest first for eviction)
    entries.sort(([, a], [, b]) => {
      // High priority files should be kept longer
      if (a.priority !== b.priority) {
        return a.priority === 'high' ? 1 : -1; // High priority last (preserved)
      }
      // Within same priority, oldest first (for eviction)
      return a.timestamp - b.timestamp;
    });

    // Remove oldest, lowest priority files until we're under the limit
    const filesToRemove = this.files.size - this.maxSize;
    for (let i = 0; i < filesToRemove && i < entries.length; i++) {
      const [filePath] = entries[i];
      this.files.delete(filePath);
    }
  }

  /**
   * Export cache state for persistence (if needed)
   * @returns Serializable cache state
   */
  exportState(): { maxSize: number; entries: RecentFileEntry[] } {
    return {
      maxSize: this.maxSize,
      entries: Array.from(this.files.values())
    };
  }

  /**
   * Import cache state from persistence (if needed)
   * @param state Previously exported cache state
   */
  importState(state: { maxSize: number; entries: RecentFileEntry[] }): void {
    this.maxSize = state.maxSize || this.defaultMaxSize;
    this.files.clear();

    // Import entries and maintain LRU order
    const sortedEntries = state.entries.sort((a, b) => a.timestamp - b.timestamp);
    for (const entry of sortedEntries) {
      this.files.set(entry.filePath, entry);
    }

    // Enforce size limits in case imported data exceeds current limits
    this.enforceSize();
  }

  /**
   * Get diagnostic information for logging
   * @returns Human readable cache information
   */
  getDiagnosticInfo(): string {
    const stats = this.getStats();
    const recentFiles = this.getRecentFiles(5); // Show 5 most recent files
    
    return `[RecentFilesTracker] ${stats.totalFiles}/${stats.maxSize} files (${stats.utilizationPercent}% full), ` +
           `${stats.highPriorityFiles} high priority, avg ${stats.averageAccessCount} accesses. ` +
           `Recent: ${recentFiles.map(f => f.split('/').pop()).join(', ')}`;
  }
}