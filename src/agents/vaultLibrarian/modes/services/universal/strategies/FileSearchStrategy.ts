/**
 * FileSearchStrategy - Handles file name search
 * Follows Single Responsibility Principle by focusing only on file search
 */

import { Plugin, TFile, prepareFuzzySearch } from 'obsidian';
import { UniversalSearchResultItem } from '../../../../types';

export interface FileSearchResult {
  success: boolean;
  error?: string;
  results?: UniversalSearchResultItem[];
}

/**
 * Service responsible for file name search
 * Follows SRP by focusing only on file search operations
 */
export class FileSearchStrategy {
  constructor(private plugin: Plugin) {}

  /**
   * Search files by name using fuzzy search
   */
  async searchFiles(query: string, limit = 5): Promise<FileSearchResult> {
    try {
      if (!query || query.trim().length === 0) {
        return {
          success: true,
          results: []
        };
      }

      const normalizedQuery = query.toLowerCase().trim();
      
      // Get all files
      const allFiles = this.plugin.app.vault.getMarkdownFiles();
      
      // Use Obsidian's fuzzy search for file names
      const fuzzySearch = prepareFuzzySearch(normalizedQuery);
      const matchedFiles: Array<{ file: TFile; score: number }> = [];

      for (const file of allFiles) {
        const filename = file.basename;
        const result = fuzzySearch(filename);
        
        if (result) {
          matchedFiles.push({
            file,
            score: result.score
          });
        }
      }

      // Sort by score (higher is better for fuzzy search)
      matchedFiles.sort((a, b) => b.score - a.score);

      // Take top results and format
      const results = matchedFiles.slice(0, limit).map(({ file, score }) => ({
        id: file.path,
        title: file.basename,
        snippet: `File: ${file.path}`,
        score: this.normalizeScore(score),
        searchMethod: 'fuzzy' as const,
        metadata: {
          filePath: file.path,
          type: 'file',
          searchMethod: 'fuzzy',
          originalScore: score,
          fileExtension: file.extension,
          parentFolder: file.parent?.path || ''
        }
      }));

      return {
        success: true,
        results
      };
    } catch (error) {
      return {
        success: false,
        error: `File search failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Search files by path
   */
  async searchFilesByPath(query: string, limit = 5): Promise<FileSearchResult> {
    try {
      if (!query || query.trim().length === 0) {
        return {
          success: true,
          results: []
        };
      }

      const normalizedQuery = query.toLowerCase().trim();
      const allFiles = this.plugin.app.vault.getMarkdownFiles();
      const matchedFiles: Array<{ file: TFile; score: number }> = [];

      for (const file of allFiles) {
        const filePath = file.path.toLowerCase();
        
        if (filePath.includes(normalizedQuery)) {
          // Calculate score based on position and exactness
          const index = filePath.indexOf(normalizedQuery);
          const exactMatch = filePath === normalizedQuery;
          const startsWithMatch = filePath.startsWith(normalizedQuery);
          
          let score = 0.5; // Base score
          if (exactMatch) score = 1.0;
          else if (startsWithMatch) score = 0.8;
          else if (index === 0) score = 0.7;
          else score = Math.max(0.1, 0.5 - (index / filePath.length));

          matchedFiles.push({ file, score });
        }
      }

      // Sort by score
      matchedFiles.sort((a, b) => b.score - a.score);

      // Take top results and format
      const results = matchedFiles.slice(0, limit).map(({ file, score }) => ({
        id: file.path,
        title: file.basename,
        snippet: `Path: ${file.path}`,
        score,
        searchMethod: 'exact' as const,
        metadata: {
          filePath: file.path,
          type: 'file',
          searchMethod: 'path',
          fileExtension: file.extension,
          parentFolder: file.parent?.path || ''
        }
      }));

      return {
        success: true,
        results
      };
    } catch (error) {
      return {
        success: false,
        error: `File path search failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Search files by extension
   */
  async searchFilesByExtension(extension: string, limit = 5): Promise<FileSearchResult> {
    try {
      if (!extension || extension.trim().length === 0) {
        return {
          success: true,
          results: []
        };
      }

      const normalizedExtension = extension.toLowerCase().replace(/^\./, ''); // Remove leading dot
      const allFiles = this.plugin.app.vault.getAllLoadedFiles();
      const matchedFiles: TFile[] = [];

      for (const file of allFiles) {
        if (file instanceof TFile && file.extension === normalizedExtension) {
          matchedFiles.push(file);
        }
      }

      // Sort by name
      matchedFiles.sort((a, b) => a.basename.localeCompare(b.basename));

      // Take top results and format
      const results = matchedFiles.slice(0, limit).map(file => ({
        id: file.path,
        title: file.basename,
        snippet: `${file.extension.toUpperCase()} file: ${file.path}`,
        score: 0.8,
        searchMethod: 'exact' as const,
        metadata: {
          filePath: file.path,
          type: 'file',
          searchMethod: 'extension',
          fileExtension: file.extension,
          parentFolder: file.parent?.path || ''
        }
      }));

      return {
        success: true,
        results
      };
    } catch (error) {
      return {
        success: false,
        error: `Extension search failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Get recently modified files
   */
  async getRecentFiles(limit = 5): Promise<FileSearchResult> {
    try {
      const allFiles = this.plugin.app.vault.getMarkdownFiles();
      
      // Sort by modification time (newest first)
      const sortedFiles = allFiles.sort((a, b) => b.stat.mtime - a.stat.mtime);

      // Take top results and format
      const results = sortedFiles.slice(0, limit).map(file => ({
        id: file.path,
        title: file.basename,
        snippet: `Modified: ${new Date(file.stat.mtime).toLocaleString()}`,
        score: 0.9,
        searchMethod: 'exact' as const,
        metadata: {
          filePath: file.path,
          type: 'file',
          searchMethod: 'recent',
          fileExtension: file.extension,
          parentFolder: file.parent?.path || '',
          modifiedTime: file.stat.mtime,
          createdTime: file.stat.ctime
        }
      }));

      return {
        success: true,
        results
      };
    } catch (error) {
      return {
        success: false,
        error: `Recent files search failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Normalize fuzzy search score to 0-1 range
   */
  private normalizeScore(fuzzyScore: number): number {
    // Fuzzy search scores are negative (closer to 0 is better)
    // Convert to 0-1 range where 1 is best
    return Math.max(0, Math.min(1, 1 + (fuzzyScore / 100)));
  }

  /**
   * Get file statistics
   */
  async getFileStatistics(): Promise<{
    totalFiles: number;
    markdownFiles: number;
    otherFiles: number;
    extensions: Record<string, number>;
  }> {
    try {
      const allFiles = this.plugin.app.vault.getAllLoadedFiles();
      const markdownFiles = this.plugin.app.vault.getMarkdownFiles();
      const extensions: Record<string, number> = {};

      for (const file of allFiles) {
        if (file instanceof TFile) {
          extensions[file.extension] = (extensions[file.extension] || 0) + 1;
        }
      }

      return {
        totalFiles: allFiles.length,
        markdownFiles: markdownFiles.length,
        otherFiles: allFiles.length - markdownFiles.length,
        extensions
      };
    } catch (error) {
      return {
        totalFiles: 0,
        markdownFiles: 0,
        otherFiles: 0,
        extensions: {}
      };
    }
  }
}