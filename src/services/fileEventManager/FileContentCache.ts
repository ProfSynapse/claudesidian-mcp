import { App, TFile } from 'obsidian';
import { ContentCache } from '../../database/utils/ContentCache';

/**
 * Manages file content caching for change detection
 */
export class FileContentCache {
  private contentCache: ContentCache;
  private fileModificationTimes: Map<string, number> = new Map();
  private contentCachingTimer: NodeJS.Timeout | null = null;

  constructor(
    private app: App,
    maxSize: number = 10 * 1024 * 1024, // 10MB default
    ttl: number = 5 * 60 * 1000 // 5 minutes default
  ) {
    this.contentCache = new ContentCache(maxSize, ttl);
  }

  /**
   * Cache content for a file
   */
  async cacheFile(file: TFile): Promise<void> {
    try {
      const content = await this.app.vault.read(file);
      this.contentCache.set(file.path, content);
      console.log(`[FileContentCache] Cached content for file: ${file.path}`);
    } catch (err) {
      console.warn(`[FileContentCache] Failed to cache content for file ${file.path}:`, err);
    }
  }

  /**
   * Get cached content for a file
   */
  getCachedContent(path: string): string | undefined {
    return this.contentCache.get(path);
  }

  /**
   * Update cached content
   */
  setCachedContent(path: string, content: string): void {
    this.contentCache.set(path, content);
  }

  /**
   * Track file modification time
   */
  updateModificationTime(path: string, time: number): void {
    this.fileModificationTimes.set(path, time);
  }

  /**
   * Get last modification time
   */
  getModificationTime(path: string): number | undefined {
    return this.fileModificationTimes.get(path);
  }

  /**
   * Check if file has actually been modified
   */
  hasFileBeenModified(path: string, currentModTime: number): boolean {
    const lastModTime = this.fileModificationTimes.get(path);
    
    // Update the modification time
    this.fileModificationTimes.set(path, currentModTime);
    
    // Skip if modification time hasn't changed significantly
    if (lastModTime && Math.abs(currentModTime - lastModTime) < 1000) {
      console.log(`[FileContentCache] No actual content change detected for ${path}`);
      return false;
    }
    
    return true;
  }

  /**
   * Start periodic content caching
   */
  startPeriodicCaching(isExcludedPath: (path: string) => boolean): void {
    // Cache the currently open file immediately
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
      this.cacheFile(activeFile);
    }

    // Cache content every 60 seconds for recently modified files
    this.contentCachingTimer = setInterval(() => {
      this.cacheRecentFiles(isExcludedPath);
    }, 60000); // 60 seconds
  }

  /**
   * Stop periodic caching
   */
  stopPeriodicCaching(): void {
    if (this.contentCachingTimer) {
      clearInterval(this.contentCachingTimer);
      this.contentCachingTimer = null;
    }
  }

  /**
   * Cache contents of recently accessed files
   */
  private async cacheRecentFiles(isExcludedPath: (path: string) => boolean): Promise<void> {
    try {
      // Get all markdown files
      const markdownFiles = this.app.vault.getMarkdownFiles();
      
      // Cache contents for files that have been recently accessed or modified
      const now = Date.now();
      const recentThreshold = 5 * 60 * 1000; // 5 minutes
      
      let cachedCount = 0;
      for (const file of markdownFiles) {
        // Skip excluded paths
        if (isExcludedPath(file.path)) continue;
        
        // Skip if already cached recently (check cache freshness)
        if (this.contentCache.get(file.path)) continue;
        
        // Check if file was recently modified
        const modTime = file.stat.mtime;
        if (now - modTime < recentThreshold) {
          try {
            const content = await this.app.vault.read(file);
            this.contentCache.set(file.path, content);
            cachedCount++;
          } catch (err) {
            // Ignore errors
          }
        }
      }
      
      if (cachedCount > 0) {
        console.log(`[FileContentCache] Pre-cached content for ${cachedCount} recently modified files`);
      }
    } catch (error) {
      console.error('[FileContentCache] Error caching file contents:', error);
    }
  }

  /**
   * Clear a file from cache
   */
  clearFile(path: string): void {
    this.contentCache.delete(path);
    this.fileModificationTimes.delete(path);
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.contentCache.clear();
    this.fileModificationTimes.clear();
    this.stopPeriodicCaching();
  }
}