/**
 * RecentFilesCollector - Collects recent files for workspace context
 * Follows Single Responsibility Principle by focusing only on recent file discovery
 */

import { App } from 'obsidian';
import { CacheManager } from '../../../../../../database/services/CacheManager';
import { sanitizePath } from '../../../../../../utils/pathUtils';

export interface RecentFile {
  path: string;
  name: string;
  lastModified: number;
  size?: number;
  extension?: string;
}

export interface RecentFilesOptions {
  limit?: number;
  includeFolders?: boolean;
  fileTypes?: string[];
  excludePatterns?: RegExp[];
}

/**
 * Service responsible for collecting recent files within a workspace
 * Follows SRP by focusing only on recent file discovery and collection
 */
export class RecentFilesCollector {
  constructor(
    private app: App,
    private cacheManager?: CacheManager
  ) {}

  /**
   * Get recent files for a workspace
   */
  async getRecentFiles(
    workspace: { rootFolder: string; id: string },
    options: RecentFilesOptions = {}
  ): Promise<string[]> {
    const {
      limit = 10,
      includeFolders = false,
      fileTypes = [],
      excludePatterns = []
    } = options;

    // Try cache first if available
    if (this.cacheManager) {
      const cachedFiles = await this.getRecentFilesFromCache(workspace, limit);
      if (cachedFiles.length > 0) {
        return cachedFiles;
      }
    }

    // Fallback to file system scan
    return this.getRecentFilesFromFileSystem(workspace, {
      limit,
      includeFolders,
      fileTypes,
      excludePatterns
    });
  }

  /**
   * Get recent files from cache if available
   */
  private async getRecentFilesFromCache(
    workspace: { rootFolder: string; id: string },
    limit: number
  ): Promise<string[]> {
    if (!this.cacheManager) {
      return [];
    }

    try {
      // Get recent files from cache filtered by workspace folder
      const recentFiles = this.cacheManager.getRecentFiles(limit, workspace.rootFolder);
      
      // Sort and return paths (already filtered by workspace)
      const workspaceFiles = recentFiles
        .sort((a: any, b: any) => (b.lastModified || 0) - (a.lastModified || 0))
        .map((file: any) => file.path);

      return workspaceFiles;
    } catch (error) {
      console.warn('Error getting recent files from cache:', error);
      return [];
    }
  }

  /**
   * Get recent files by scanning the file system
   */
  private async getRecentFilesFromFileSystem(
    workspace: { rootFolder: string; id: string },
    options: RecentFilesOptions
  ): Promise<string[]> {
    const {
      limit = 10,
      includeFolders = false,
      fileTypes = [],
      excludePatterns = []
    } = options;

    try {
      const filesWithTimestamps = new Map<string, number>();
      const normalizedWorkspaceRoot = sanitizePath(workspace.rootFolder);

      // Get all files in the vault
      const allFiles = this.app.vault.getAllLoadedFiles();

      for (const file of allFiles) {
        // Skip folders unless explicitly included
        if (!includeFolders && !('extension' in file)) {
          continue;
        }

        const normalizedPath = sanitizePath(file.path);
        
        // Check if file is in workspace
        if (!normalizedPath.startsWith(normalizedWorkspaceRoot)) {
          continue;
        }

        // Apply file type filter
        if (fileTypes.length > 0 && 'extension' in file) {
          const extension = (file as any).extension?.toLowerCase();
          if (!fileTypes.includes(extension)) {
            continue;
          }
        }

        // Apply exclude patterns
        if (excludePatterns.some(pattern => pattern.test(file.path))) {
          continue;
        }

        // Get modification time
        const stat = await this.app.vault.adapter.stat(file.path);
        const lastModified = stat?.mtime || 0;

        filesWithTimestamps.set(file.path, lastModified);
      }

      // Sort by timestamp, most recent first
      const result = Array.from(filesWithTimestamps.entries())
        .sort((a, b) => b[1] - a[1])
        .map(entry => entry[0])
        .slice(0, limit);

      return result;
    } catch (error) {
      console.error('Error scanning file system for recent files:', error);
      return [];
    }
  }

  /**
   * Get detailed recent file information
   */
  async getRecentFilesDetailed(
    workspace: { rootFolder: string; id: string },
    options: RecentFilesOptions = {}
  ): Promise<RecentFile[]> {
    const filePaths = await this.getRecentFiles(workspace, options);
    const detailedFiles: RecentFile[] = [];

    for (const path of filePaths) {
      try {
        const stat = await this.app.vault.adapter.stat(path);
        const file = this.app.vault.getAbstractFileByPath(path);
        
        if (file) {
          detailedFiles.push({
            path,
            name: file.name,
            lastModified: stat?.mtime || 0,
            size: stat?.size,
            extension: 'extension' in file ? (file as any).extension : undefined
          });
        }
      } catch (error) {
        console.warn(`Error getting details for file ${path}:`, error);
        // Still include basic info
        detailedFiles.push({
          path,
          name: path.split('/').pop() || path,
          lastModified: 0
        });
      }
    }

    return detailedFiles;
  }

  /**
   * Get recent files with content preview
   */
  async getRecentFilesWithPreview(
    workspace: { rootFolder: string; id: string },
    options: RecentFilesOptions & { previewLength?: number } = {}
  ): Promise<Array<RecentFile & { preview?: string }>> {
    const { previewLength = 200 } = options;
    const detailedFiles = await this.getRecentFilesDetailed(workspace, options);
    
    const filesWithPreview = await Promise.all(
      detailedFiles.map(async (file) => {
        try {
          // Only get preview for text files
          if (file.extension && ['md', 'txt', 'json'].includes(file.extension.toLowerCase())) {
            const content = await this.app.vault.adapter.read(file.path);
            const preview = content.substring(0, previewLength);
            
            return {
              ...file,
              preview: preview + (content.length > previewLength ? '...' : '')
            };
          }
          
          return file;
        } catch (error) {
          console.warn(`Error getting preview for ${file.path}:`, error);
          return file;
        }
      })
    );

    return filesWithPreview;
  }

  /**
   * Get files modified within a specific time range
   */
  async getFilesModifiedInRange(
    workspace: { rootFolder: string; id: string },
    startTime: number,
    endTime: number,
    options: Omit<RecentFilesOptions, 'limit'> = {}
  ): Promise<string[]> {
    try {
      const filesInRange: Array<{ path: string; mtime: number }> = [];
      const normalizedWorkspaceRoot = sanitizePath(workspace.rootFolder);

      // Get all files in the vault
      const allFiles = this.app.vault.getAllLoadedFiles();

      for (const file of allFiles) {
        // Skip folders unless explicitly included
        if (!options.includeFolders && !('extension' in file)) {
          continue;
        }

        const normalizedPath = sanitizePath(file.path);
        
        // Check if file is in workspace
        if (!normalizedPath.startsWith(normalizedWorkspaceRoot)) {
          continue;
        }

        // Get modification time
        const stat = await this.app.vault.adapter.stat(file.path);
        const mtime = stat?.mtime || 0;

        // Check if within time range
        if (mtime >= startTime && mtime <= endTime) {
          filesInRange.push({ path: file.path, mtime });
        }
      }

      // Sort by modification time, most recent first
      return filesInRange
        .sort((a, b) => b.mtime - a.mtime)
        .map(f => f.path);
    } catch (error) {
      console.error('Error getting files in time range:', error);
      return [];
    }
  }
}