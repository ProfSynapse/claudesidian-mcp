import { Plugin, TFile, TFolder, TAbstractFile, prepareFuzzySearch } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { getErrorMessage } from '../../../utils/errorUtils';
import { CommonParameters } from '../../../types/mcp/AgentTypes';
import { WorkspaceService } from '../../../services/WorkspaceService';

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
      // Validate query parameter
      if (!params.query || params.query.trim().length === 0) {
        return this.prepareResult(false, {
          query: params.query || '',
          results: [],
          totalResults: 0,
          executionTime: Date.now() - startTime,
          searchCapabilities: this.getCapabilities(),
          error: 'Query parameter is required and cannot be empty',
          parameterHints: '🔍 The "query" parameter is REQUIRED. Provide the search term you want to find.\n\nExample: { "query": "fallujah", "paths": ["/"] }',
          suggestions: [
            'Use "query" (not "filter") for the search term',
            'Provide a simple text search term without wildcards',
            'Example: "query": "fallujah"'
          ],
          providedParams: params
        }, 'Query parameter is required and cannot be empty', params.context);
      }

      // Validate paths parameter
      if (!params.paths || params.paths.length === 0) {
        return this.prepareResult(false, {
          query: params.query,
          results: [],
          totalResults: 0,
          executionTime: Date.now() - startTime,
          searchCapabilities: this.getCapabilities(),
          error: 'Paths parameter is required and cannot be empty',
          parameterHints: '📁 The "paths" parameter is REQUIRED and must be a non-empty array.\n\nSpecify which directories to search:\n- Use ["/"] to search the entire vault\n- Use ["FolderName"] for a specific folder\n- Use ["Folder1", "Folder2"] for multiple folders',
          suggestions: [
            'Provide a "paths" array with at least one directory',
            'Example for whole vault: "paths": ["/"]',
            'Example for specific folder: "paths": ["Projects"]',
            'Example for multiple folders: "paths": ["Work", "Personal"]'
          ],
          providedParams: params,
          expectedParams: {
            query: 'string (e.g., "fallujah")',
            paths: 'array of strings (e.g., ["/"] or ["Projects"])'
          }
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
      const errorMessage = getErrorMessage(error);
      return this.prepareResult(false, {
        query: params.query || '',
        searchedPaths: params.paths || [],
        results: [],
        totalResults: 0,
        executionTime: Date.now() - startTime,
        searchCapabilities: this.getCapabilities(),
        error: `Directory search failed: ${errorMessage}`,
        parameterHints: '💡 Check that your parameters are correctly formatted:\n- query: string (search term)\n- paths: array of directory paths (e.g., ["/"])',
        suggestions: [
          'Verify that the specified directories exist in your vault',
          'Check that paths are formatted correctly (use "/" for root)',
          'Ensure query is a non-empty string',
          'Try simplifying your search parameters'
        ],
        providedParams: params
      }, `Directory search failed: ${errorMessage}`, params.context);
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
      title: 'Search Directory Mode - Find Files and Folders',
      description: 'Search for files and/or folders within specific directory paths. CRITICAL: Use "query" parameter (NOT "filter") for the search term, and "paths" array is REQUIRED.',
      properties: {
        query: {
          type: 'string',
          description: '🔍 REQUIRED: The search term to find in file/folder names and paths. Use simple text without wildcards (fuzzy matching is automatic). Examples: "fallujah", "project", "meeting notes"',
          minLength: 1,
          examples: ['fallujah', 'project', 'meeting notes', 'config', 'README']
        },
        paths: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: '📁 REQUIRED: Array of directory paths to search within. Cannot be empty. Use ["/"] to search the entire vault root. Examples: ["/"] for whole vault, ["Projects/WebApp"] for specific folder, ["Notes", "Archive"] for multiple folders.',
          examples: [
            ['/'],  // Search entire vault root
            ['Projects/WebApp'],
            ['Notes', 'Archive'], 
            ['Work/Current Projects', 'Personal/Ideas']
          ]
        },
        searchType: {
          type: 'string',
          enum: ['files', 'folders', 'both'],
          description: '🎯 What to search for: "files" (only files), "folders" (only folders), or "both" (files and folders). Default: "both"',
          default: 'both'
        },
        fileTypes: {
          type: 'array',
          items: { type: 'string' },
          description: '📄 Optional: Filter by file extensions without dots. Examples: ["md"], ["md", "txt"], ["pdf", "docx"]',
          examples: [['md'], ['md', 'txt'], ['pdf', 'docx']]
        },
        depth: {
          type: 'number',
          description: '🔢 Optional: Maximum directory depth to search (1-10). Limits how deep into subdirectories to look.',
          minimum: 1,
          maximum: 10
        },
        pattern: {
          type: 'string',
          description: '🔎 Optional: Regular expression pattern to filter paths. Advanced users only. Examples: "^Archive/", ".*Projects.*", "[0-9]{4}"',
          examples: ['^Archive/', '.*Projects.*', '[0-9]{4}']
        },
        dateRange: {
          type: 'object',
          properties: {
            start: {
              type: 'string',
              format: 'date',
              description: '📅 Start date in ISO format (YYYY-MM-DD)'
            },
            end: {
              type: 'string',
              format: 'date',
              description: '📅 End date in ISO format (YYYY-MM-DD)'
            }
          },
          description: '🗓️ Optional: Filter results by modification date range (ISO format dates)'
        },
        limit: {
          type: 'number',
          description: '🔢 Optional: Maximum number of results to return (1-100). Default: 20',
          default: 20,
          minimum: 1,
          maximum: 100
        },
        includeContent: {
          type: 'boolean',
          description: '📝 Optional: Include content snippets from files in results. Default: true',
          default: true
        }
      },
      required: ['query', 'paths'],
      additionalProperties: true,
      errorHelp: {
        missingQuery: 'The "query" parameter is required. Do NOT use "filter" - use "query" instead. Example: { "query": "fallujah", "paths": ["/"] }',
        missingPaths: 'The "paths" parameter is required and must be a non-empty array. Specify directories to search. Example: { "query": "fallujah", "paths": ["/"] }',
        emptyPaths: 'The "paths" array cannot be empty. Provide at least one directory path to search within.',
        commonMistakes: [
          'Using "filter" instead of "query" - always use "query"',
          'Forgetting the "paths" array - it\'s required',
          'Using wildcards (*) in query - just use plain text',
          'Providing paths as a string instead of array - wrap in brackets: ["/"]'
        ]
      }
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