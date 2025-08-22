import { Plugin, TFile, TFolder, TAbstractFile, prepareFuzzySearch } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { getErrorMessage } from '../../../utils/errorUtils';
import { CommonParameters } from '../../../types/mcp/AgentTypes';
import { WorkspaceService } from "../../memoryManager/services/WorkspaceService";

/**
 * Directory search parameters interface
 */
export interface SearchDirectoryParams extends CommonParameters {
  // REQUIRED PARAMETERS
  query: string;
  paths: string[];  // Cannot be empty - this is the key requirement

  // OPTIONAL PARAMETERS
  searchType?: 'files' | 'folders' | 'both';
  fileTypes?: string[];
  depth?: number;
  includeContent?: boolean;
  limit?: number;
  pattern?: string;
  dateRange?: {
    start?: string;
    end?: string;
  };
  workspaceId?: string;
}

interface SearchModeCapabilities {
  semanticSearch: boolean;
  workspaceFiltering: boolean;
  memorySearch: boolean;
  hybridSearch: boolean;
}

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

export interface SearchDirectoryResult {
  success: boolean;
  query: string;
  searchedPaths?: string[];
  results: DirectoryItem[];
  totalResults: number;
  executionTime?: number;
  searchCapabilities?: SearchModeCapabilities;
  error?: string;
}

/**
 * Unified search mode for both files and folders using fuzzy matching
 */
export class SearchDirectoryMode extends BaseMode<SearchDirectoryParams, SearchDirectoryResult> {
  private plugin: Plugin;
  private workspaceService?: WorkspaceService;

  constructor(plugin: Plugin, workspaceService?: WorkspaceService) {
    super(
      'searchDirectoryMode', 
      'Search Directory', 
      'FOCUSED directory search with REQUIRED paths parameter. Search for files and/or folders within specific directory paths using fuzzy matching and optional workspace context. Requires: query (search terms) and paths (directory paths to search - cannot be empty).', 
      '2.0.0'
    );
    
    this.plugin = plugin;
    this.workspaceService = workspaceService;
  }

  async execute(params: SearchDirectoryParams): Promise<SearchDirectoryResult> {
    const startTime = Date.now();

    try {
      // Simple parameter validation
      if (!params.query || params.query.trim().length === 0) {
        return this.prepareResult(false, {
          query: params.query || '',
          results: [],
          totalResults: 0,
          executionTime: Date.now() - startTime,
          searchCapabilities: this.getCapabilities()
        }, 'Query parameter is required and cannot be empty', params.context);
      }

      if (!params.paths || params.paths.length === 0) {
        return this.prepareResult(false, {
          query: params.query,
          results: [],
          totalResults: 0,
          executionTime: Date.now() - startTime,
          searchCapabilities: this.getCapabilities()
        }, 'Paths parameter is required and cannot be empty - specify directories to search', params.context);
      }

      const query = params.query.trim();
      const limit = params.limit || 20;
      const searchType = params.searchType || 'both';
      
      // Get items from specified directories
      const items = await this.getDirectoryItems(params.paths, searchType, params);
      
      // Apply workspace context if available
      const contextualItems = await this.applyWorkspaceContext(items, params.workspaceId);
      
      // Apply additional filters
      const filteredItems = this.applyFilters(contextualItems, params);
      
      // Perform fuzzy search
      const matches = this.performFuzzySearch(filteredItems, query);
      
      // Sort and limit results
      matches.sort((a, b) => b.score - a.score);
      const topMatches = matches.slice(0, limit);
      
      // Transform to enhanced format
      const results = await this.transformResults(topMatches, params);

      return {
        success: true,
        query: params.query,
        searchedPaths: params.paths,
        results: results,
        totalResults: matches.length,
        executionTime: Date.now() - startTime,
        searchCapabilities: this.getCapabilities()
      };
      
    } catch (error) {
      return this.prepareResult(false, {
        query: params.query || '',
        searchedPaths: params.paths || [],
        results: [],
        totalResults: 0,
        executionTime: Date.now() - startTime,
        searchCapabilities: this.getCapabilities()
      }, `Directory search failed: ${getErrorMessage(error)}`, params.context);
    }
  }

  private async getDirectoryItems(
    paths: string[], 
    searchType: 'files' | 'folders' | 'both',
    params: SearchDirectoryParams
  ): Promise<(TFile | TFolder)[]> {
    const allItems: (TFile | TFolder)[] = [];

    for (const path of paths) {
      const normalizedPath = this.normalizePath(path);
      
      if (normalizedPath === '/' || normalizedPath === '') {
        // Root path - get all vault items
        const vaultItems = this.plugin.app.vault.getAllLoadedFiles()
          .filter(file => this.matchesSearchType(file, searchType)) as (TFile | TFolder)[];
        allItems.push(...vaultItems);
      } else {
        // Specific directory
        const directoryItems = await this.getItemsInDirectory(normalizedPath, searchType, params);
        allItems.push(...directoryItems);
      }
    }

    // Remove duplicates
    return Array.from(new Map(allItems.map(item => [item.path, item])).values());
  }

  private applyFilters(items: (TFile | TFolder)[], params: SearchDirectoryParams): (TFile | TFolder)[] {
    let filtered = items;

    // File type filter (only applies to files)
    if (params.fileTypes && params.fileTypes.length > 0) {
      const allowedTypes = params.fileTypes.map(type => type.toLowerCase());
      filtered = filtered.filter(item => {
        if (item instanceof TFile) {
          return allowedTypes.includes(item.extension.toLowerCase());
        }
        return true; // Keep folders when file type filter is applied
      });
    }

    // Depth filter
    if (params.depth !== undefined) {
      filtered = filtered.filter(item => {
        const pathDepth = item.path.split('/').filter(p => p.length > 0).length;
        return pathDepth <= params.depth!;
      });
    }

    // Pattern filter
    if (params.pattern) {
      try {
        const regex = new RegExp(params.pattern, 'i');
        filtered = filtered.filter(item => {
          const name = item instanceof TFile ? item.basename : item.name;
          return regex.test(item.path) || regex.test(name);
        });
      } catch (error) {
      }
    }

    // Date range filter (only applies to files)
    if (params.dateRange) {
      const startDate = params.dateRange.start ? new Date(params.dateRange.start).getTime() : 0;
      const endDate = params.dateRange.end ? new Date(params.dateRange.end).getTime() : Date.now();
      
      filtered = filtered.filter(item => {
        if (item instanceof TFile) {
          const modified = item.stat.mtime;
          return modified >= startDate && modified <= endDate;
        }
        return true; // Keep folders when date filter is applied
      });
    }

    return filtered;
  }

  private performFuzzySearch(items: (TFile | TFolder)[], query: string): Array<{ item: TFile | TFolder; score: number; matchType: string }> {
    const fuzzySearch = prepareFuzzySearch(query);
    const matches: Array<{ item: TFile | TFolder; score: number; matchType: string }> = [];

    for (const item of items) {
      let bestScore = 0;
      let bestMatchType = '';

      // Get appropriate name for search
      const itemName = item instanceof TFile ? item.basename : item.name;

      // Search by name
      const nameResult = fuzzySearch(itemName);
      if (nameResult) {
        const normalizedScore = Math.max(0, Math.min(1, 1 + (nameResult.score / 100)));
        if (normalizedScore > bestScore) {
          bestScore = normalizedScore;
          bestMatchType = 'name';
        }
      }

      // Search by full path
      const pathResult = fuzzySearch(item.path);
      if (pathResult) {
        const normalizedScore = Math.max(0, Math.min(1, 1 + (pathResult.score / 100))) * 0.8; // Lower weight for path matches
        if (normalizedScore > bestScore) {
          bestScore = normalizedScore;
          bestMatchType = 'path';
        }
      }

      // Include item if it has any match
      if (bestScore > 0) {
        matches.push({ item, score: bestScore, matchType: bestMatchType });
      }
    }

    return matches;
  }

  private async transformResults(matches: Array<{ item: TFile | TFolder; score: number; matchType: string }>, params: SearchDirectoryParams): Promise<DirectoryItem[]> {
    const results: DirectoryItem[] = [];

    for (const match of matches) {
      const item = match.item;
      const isFile = item instanceof TFile;

      let snippet = '';
      if (isFile && params.includeContent !== false) {
        try {
          const content = await this.plugin.app.vault.read(item);
          const lines = content.split('\n');
          const firstFewLines = lines.slice(0, 3).join(' ');
          snippet = firstFewLines.length > 200 ? firstFewLines.substring(0, 200) + '...' : firstFewLines;
        } catch (error) {
          snippet = 'Content not available';
        }
      }

      const result: DirectoryItem = {
        path: item.path,
        name: isFile ? item.basename : item.name,
        type: isFile ? 'file' : 'folder',
        score: match.score,
        searchMethod: `fuzzy_${match.matchType}`,
        snippet: snippet || undefined,
        metadata: {}
      };

      // Add file-specific metadata
      if (isFile) {
        result.metadata = {
          fileType: item.extension,
          created: item.stat.ctime,
          modified: item.stat.mtime,
          size: item.stat.size
        };
      } else {
        // Add folder-specific metadata
        const folder = item as TFolder;
        const children = folder.children || [];
        const fileCount = children.filter(child => child instanceof TFile).length;
        const folderCount = children.filter(child => child instanceof TFolder).length;
        
        result.metadata = {
          depth: folder.path.split('/').filter(p => p.length > 0).length,
          fileCount: fileCount,
          folderCount: folderCount
        };
      }

      results.push(result);
    }

    return results;
  }

  private async getItemsInDirectory(
    directoryPath: string,
    searchType: 'files' | 'folders' | 'both',
    params: SearchDirectoryParams
  ): Promise<(TFile | TFolder)[]> {
    const folder = this.plugin.app.vault.getAbstractFileByPath(directoryPath);
    
    if (!folder || !('children' in folder)) {
      return [];
    }

    const items: (TFile | TFolder)[] = [];

    const collectItems = (currentFolder: TFolder, currentDepth: number = 0) => {
      if (params.depth && currentDepth >= params.depth) {
        return;
      }

      for (const child of currentFolder.children) {
        if (this.matchesSearchType(child, searchType)) {
          items.push(child as TFile | TFolder);
        }
        
        // Recursive traversal for folders
        if ('children' in child) {
          collectItems(child as TFolder, currentDepth + 1);
        }
      }
    };

    collectItems(folder as TFolder);
    return items;
  }

  private matchesSearchType(item: TAbstractFile, searchType: 'files' | 'folders' | 'both'): boolean {
    switch (searchType) {
      case 'files':
        return item instanceof TFile;
      case 'folders':
        return item instanceof TFolder;
      case 'both':
      default:
        return item instanceof TFile || item instanceof TFolder;
    }
  }

  private async applyWorkspaceContext(
    items: (TFile | TFolder)[],
    workspaceId?: string
  ): Promise<(TFile | TFolder)[]> {
    if (!this.workspaceService || !workspaceId || workspaceId === 'global-workspace-default') {
      return items;
    }

    try {
      const workspace = await this.workspaceService.getWorkspace(workspaceId);
      if (!workspace) {
        return items; // No workspace context, return all items
      }

      // For directory search, workspace context can boost relevance but doesn't filter
      // This maintains the explicit directory paths while adding workspace awareness
      return items;
      
    } catch (error) {
      console.warn(`Could not apply workspace context for ${workspaceId}:`, error);
      return items;
    }
  }

  private normalizePath(path: string): string {
    return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  }

  private getCapabilities(): SearchModeCapabilities {
    return {
      semanticSearch: false,
      workspaceFiltering: !!this.workspaceService,
      memorySearch: false,
      hybridSearch: false
    };
  }

  getParameterSchema() {
    const modeSchema = {
      type: 'object',
      title: 'Focused Directory Search Parameters',
      description: 'FOCUSED directory search with REQUIRED paths parameter. Search within specific directory paths for better organization and navigation.',
      properties: {
        query: {
          type: 'string',
          description: 'REQUIRED: Search query to find in file/folder names and paths',
          minLength: 1,
          examples: ['project', 'meeting notes', 'config', 'README']
        },
        paths: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'REQUIRED: Directory paths to search within. Cannot be empty. Specify the folder paths where you want to search for focused results.',
          examples: [
            ['Projects/WebApp'],
            ['Notes', 'Archive'], 
            ['/'],  // Search entire vault root
            ['Work/Current Projects', 'Personal/Ideas']
          ]
        },
        searchType: {
          type: 'string',
          enum: ['files', 'folders', 'both'],
          description: 'What to search for within the specified directories',
          default: 'both'
        },
        fileTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter results by file extensions (e.g., ["md", "txt"])',
          examples: [["md"], ["md", "txt"], ["pdf", "docx"]]
        },
        depth: {
          type: 'number',
          description: 'Maximum directory depth to include in results',
          minimum: 1,
          maximum: 10
        },
        pattern: {
          type: 'string',
          description: 'Regex pattern to filter paths',
          examples: ['^Archive/', '.*Projects.*', '[0-9]{4}']
        },
        dateRange: {
          type: 'object',
          properties: {
            start: {
              type: 'string',
              format: 'date',
              description: 'Start date for filtering results (ISO format)'
            },
            end: {
              type: 'string',
              format: 'date',
              description: 'End date for filtering results (ISO format)'
            }
          },
          description: 'Filter results by modification date range'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 20,
          minimum: 1,
          maximum: 100
        },
        includeContent: {
          type: 'boolean',
          description: 'Include file content snippets in results',
          default: true
        }
      },
      required: ['query', 'paths']
    };
    
    return this.getMergedSchema(modeSchema);
  }

  getResultSchema() {
    return {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the search was successful'
        },
        query: {
          type: 'string',
          description: 'The search query'
        },
        searchedPaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Directory paths that were searched'
        },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Full path to the item'
              },
              name: {
                type: 'string',
                description: 'Name of the item'
              },
              type: {
                type: 'string',
                enum: ['file', 'folder'],
                description: 'Type of the item'
              },
              score: {
                type: 'number',
                description: 'Search relevance score'
              },
              searchMethod: {
                type: 'string',
                description: 'Method used to find this result'
              },
              snippet: {
                type: 'string',
                description: 'Content snippet (files only)'
              },
              metadata: {
                type: 'object',
                properties: {
                  fileType: {
                    type: 'string',
                    description: 'File extension (files only)'
                  },
                  created: {
                    type: 'number',
                    description: 'Creation timestamp (files only)'
                  },
                  modified: {
                    type: 'number',
                    description: 'Last modified timestamp (files only)'
                  },
                  size: {
                    type: 'number',
                    description: 'File size in bytes (files only)'
                  },
                  depth: {
                    type: 'number',
                    description: 'Folder depth level (folders only)'
                  },
                  fileCount: {
                    type: 'number',
                    description: 'Number of files in folder (folders only)'
                  },
                  folderCount: {
                    type: 'number',
                    description: 'Number of subfolders (folders only)'
                  }
                }
              }
            }
          }
        },
        totalResults: {
          type: 'number',
          description: 'Total number of results found'
        },
        executionTime: {
          type: 'number',
          description: 'Search execution time in milliseconds'
        },
        searchCapabilities: {
          type: 'object',
          properties: {
            semanticSearch: { type: 'boolean' },
            workspaceFiltering: { type: 'boolean' },
            memorySearch: { type: 'boolean' },
            hybridSearch: { type: 'boolean' }
          }
        },
        error: {
          type: 'string',
          description: 'Error message if search failed'
        }
      },
      required: ['success', 'query', 'results', 'totalResults']
    };
  }
}