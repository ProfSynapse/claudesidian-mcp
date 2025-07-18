import { Plugin, TFile, TFolder, TAbstractFile, prepareFuzzySearch } from 'obsidian';
import { CommonParameters } from '../../../types';
import { BaseMode } from '../../baseMode';
import { getErrorMessage } from '../../../utils/errorUtils';

export interface SearchDirectoryParams extends CommonParameters {
  query: string;
  searchType: 'files' | 'folders' | 'both';
  fileTypes?: string[];
  depth?: number;
  pattern?: string;
  dateRange?: {
    start?: string;
    end?: string;
  };
  limit?: number;
  includeContent?: boolean;
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
  results: DirectoryItem[];
  totalResults: number;
  error?: string;
}

/**
 * Unified search mode for both files and folders using fuzzy matching
 */
export class SearchDirectoryMode extends BaseMode<SearchDirectoryParams, SearchDirectoryResult> {
  private plugin: Plugin;

  constructor(plugin: Plugin) {
    super(
      'searchDirectory', 
      'Search Directory', 
      'Search for files and/or folders using fuzzy matching. Unified search for vault navigation.', 
      '1.0.0'
    );
    
    this.plugin = plugin;
  }

  async execute(params: SearchDirectoryParams): Promise<SearchDirectoryResult> {
    try {
      if (!params.query || params.query.trim().length === 0) {
        return {
          success: false,
          query: params.query || '',
          results: [],
          totalResults: 0,
          error: 'Query parameter is required and cannot be empty'
        };
      }

      const query = params.query.trim();
      const limit = params.limit || 20;
      const searchType = params.searchType || 'both';
      
      // Get items based on search type
      const items = this.getSearchItems(searchType);
      
      // Apply filters
      const filteredItems = this.applyFilters(items, params);
      
      // Perform fuzzy search
      const matches = this.performFuzzySearch(filteredItems, query);
      
      // Sort and limit results
      matches.sort((a, b) => b.score - a.score);
      const topMatches = matches.slice(0, limit);
      
      // Transform to unified format
      const results = await this.transformResults(topMatches, params);

      return {
        success: true,
        query: params.query,
        results: results,
        totalResults: matches.length
      };
      
    } catch (error) {
      console.error('Directory search failed:', error);
      return {
        success: false,
        query: params.query,
        results: [],
        totalResults: 0,
        error: `Search failed: ${getErrorMessage(error)}`
      };
    }
  }

  private getSearchItems(searchType: 'files' | 'folders' | 'both'): (TFile | TFolder)[] {
    const allFiles = this.plugin.app.vault.getAllLoadedFiles();
    
    switch (searchType) {
      case 'files':
        return allFiles.filter(file => file instanceof TFile) as TFile[];
      case 'folders':
        return allFiles.filter(file => file instanceof TFolder) as TFolder[];
      case 'both':
      default:
        return allFiles.filter(file => file instanceof TFile || file instanceof TFolder) as (TFile | TFolder)[];
    }
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
        console.warn('Invalid regex pattern:', params.pattern);
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

  getParameterSchema() {
    const modeSchema = {
      type: 'object',
      title: 'Search Directory Parameters',
      description: 'Search for files and/or folders using fuzzy matching',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find in file/folder names and paths',
          minLength: 1
        },
        searchType: {
          type: 'string',
          enum: ['files', 'folders', 'both'],
          description: 'What to search for: files only, folders only, or both',
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
      required: ['query']
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
        error: {
          type: 'string',
          description: 'Error message if search failed'
        }
      },
      required: ['success', 'query', 'results', 'totalResults']
    };
  }
}