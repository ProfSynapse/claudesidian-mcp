/**
 * Location: /src/agents/vaultLibrarian/services/SearchResultFormatter.ts
 * Purpose: Formats search results for directory search operations
 *
 * This service handles transforming search matches into enhanced result objects
 * with metadata, snippets, and type-specific formatting.
 *
 * Used by: SearchDirectoryMode for formatting search results
 * Integrates with: Obsidian Vault API for content access
 *
 * Responsibilities:
 * - Transform matches into DirectoryItem results
 * - Extract content snippets from files
 * - Format file and folder metadata
 */

import { TFile, TFolder } from 'obsidian';

/**
 * Directory item structure for search results
 */
export interface DirectoryItem {
  path: string;
  name: string;
  type: 'file' | 'folder';
  score: number;
  searchMethod: string;
  snippet?: string;
  metadata: {
    fileType?: string;
    created?: number;
    modified?: number;
    size?: number;
    depth?: number;
    fileCount?: number;
    folderCount?: number;
  };
}

/**
 * Match information from search operations
 */
export interface SearchMatch {
  item: TFile | TFolder;
  score: number;
  matchType: string;
}

/**
 * Service for formatting search results
 * Implements Single Responsibility Principle - only handles result formatting
 */
export class SearchResultFormatter {
  private app: any;

  constructor(app: any) {
    this.app = app;
  }

  /**
   * Transform search matches into formatted results
   * @param matches Array of search matches
   * @param includeContent Whether to include content snippets
   * @returns Array of formatted DirectoryItem results
   */
  async transformResults(
    matches: SearchMatch[],
    includeContent: boolean = true
  ): Promise<DirectoryItem[]> {
    const results: DirectoryItem[] = [];

    for (const match of matches) {
      const item = match.item;
      const isFile = item instanceof TFile;

      let snippet = '';
      if (isFile && includeContent) {
        snippet = await this.extractSnippet(item as TFile);
      }

      const result: DirectoryItem = {
        path: item.path,
        name: isFile ? (item as TFile).basename : item.name,
        type: isFile ? 'file' : 'folder',
        score: match.score,
        searchMethod: `fuzzy_${match.matchType}`,
        snippet: snippet || undefined,
        metadata: {}
      };

      // Add type-specific metadata
      if (isFile) {
        result.metadata = this.formatFileMetadata(item as TFile);
      } else {
        result.metadata = this.formatFolderMetadata(item as TFolder);
      }

      results.push(result);
    }

    return results;
  }

  /**
   * Extract content snippet from a file
   * @param file The file to extract from
   * @returns Content snippet or error message
   */
  private async extractSnippet(file: TFile): Promise<string> {
    try {
      const content = await this.app.vault.read(file);
      const lines = content.split('\n');
      const firstFewLines = lines.slice(0, 3).join(' ');
      return firstFewLines.length > 200
        ? firstFewLines.substring(0, 200) + '...'
        : firstFewLines;
    } catch (error) {
      return 'Content not available';
    }
  }

  /**
   * Format file metadata
   * @param file The file to format metadata for
   * @returns File metadata object
   */
  private formatFileMetadata(file: TFile): DirectoryItem['metadata'] {
    return {
      fileType: file.extension,
      created: file.stat.ctime,
      modified: file.stat.mtime,
      size: file.stat.size
    };
  }

  /**
   * Format folder metadata
   * @param folder The folder to format metadata for
   * @returns Folder metadata object
   */
  private formatFolderMetadata(folder: TFolder): DirectoryItem['metadata'] {
    const children = folder.children || [];
    const fileCount = children.filter(child => child instanceof TFile).length;
    const folderCount = children.filter(child => child instanceof TFolder).length;

    return {
      depth: folder.path.split('/').filter(p => p.length > 0).length,
      fileCount: fileCount,
      folderCount: folderCount
    };
  }
}
