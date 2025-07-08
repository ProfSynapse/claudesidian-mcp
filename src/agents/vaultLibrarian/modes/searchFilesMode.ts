import { Plugin } from 'obsidian';
import { CommonParameters } from '../../../types';
import { BaseMode } from '../../baseMode';
import { HnswSearchService } from '../../../database/services/hnsw/HnswSearchService';
import { EmbeddingService } from '../../../database/services/EmbeddingService';
import { MemoryService } from '../../../database/services/MemoryService';
import { WorkspaceService } from '../../../database/services/WorkspaceService';
import { getErrorMessage } from '../../../utils/errorUtils';
import { UniversalSearchService } from './services/UniversalSearchService';

export interface SearchFilesParams extends CommonParameters {
  query: string;
  fileTypes?: string[];
  dateRange?: {
    start?: string;
    end?: string;
  };
  limit?: number;
  includeContent?: boolean;
  semanticThreshold?: number;
}

export interface SearchFilesResult {
  success: boolean;
  query: string;
  results: Array<{
    path: string;
    title: string;
    snippet: string;
    score: number;
    searchMethod: string;
    metadata: {
      fileType: string;
      created: number;
      modified: number;
      size: number;
    };
  }>;
  totalResults: number;
  error?: string;
}

/**
 * Search mode focused on file content and names
 */
export class SearchFilesMode extends BaseMode<SearchFilesParams, SearchFilesResult> {
  private universalSearchService: UniversalSearchService;
  private plugin: Plugin;

  constructor(
    plugin: Plugin,
    hnswSearchService?: HnswSearchService,
    embeddingService?: EmbeddingService,
    memoryService?: MemoryService,
    workspaceService?: WorkspaceService
  ) {
    super(
      'searchFiles', 
      'Search Files', 
      'Search file contents and names using semantic and fuzzy search. Focuses specifically on vault files.', 
      '1.0.0'
    );
    
    this.plugin = plugin;
    this.universalSearchService = new UniversalSearchService(
      plugin,
      hnswSearchService,
      embeddingService, 
      memoryService,
      workspaceService
    );
  }

  async execute(params: SearchFilesParams): Promise<SearchFilesResult> {
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

      const defaultThreshold = (this.plugin as any).settings?.settings?.memory?.defaultThreshold || 0.7;
      
      // Execute search with file-specific categories
      const results = await this.universalSearchService.executeConsolidatedSearch({
        query: params.query,
        limit: params.limit || 10,
        includeContent: params.includeContent !== false,
        semanticThreshold: params.semanticThreshold || defaultThreshold,
        sessionId: params.sessionId,
        context: params.context
      });

      // Transform ConsolidatedSearchResult to expected format
      const transformedResults = await Promise.all(results.map(async (result, index) => {
        const file = this.plugin.app.vault.getAbstractFileByPath(result.filePath);
        let stat = null;
        try {
          if (file) {
            stat = await this.plugin.app.vault.adapter.stat(result.filePath);
          }
        } catch (error) {
          // File might not exist or be accessible
          console.warn(`Could not get stat for ${result.filePath}:`, error);
        }
        
        return {
          path: result.filePath,
          title: result.filePath.split('/').pop()?.replace(/\.md$/, '') || result.filePath,
          snippet: result.snippets.map(s => s.content).join(' ').substring(0, 200) + '...',
          score: 0.8 - (index * 0.01), // Decreasing score based on position
          searchMethod: result.snippets[0]?.searchMethod || 'unknown',
          metadata: {
            fileType: result.filePath.split('.').pop() || 'unknown',
            created: stat?.ctime || 0,
            modified: stat?.mtime || 0,
            size: stat?.size || 0
          }
        };
      }));

      // Filter by file types if specified
      let filteredResults = transformedResults;
      if (params.fileTypes && params.fileTypes.length > 0) {
        filteredResults = transformedResults.filter(result => {
          const extension = result.path.split('.').pop()?.toLowerCase();
          return params.fileTypes!.some(type => type.toLowerCase() === extension);
        });
      }

      // Filter by date range if specified
      if (params.dateRange) {
        const startDate = params.dateRange.start ? new Date(params.dateRange.start).getTime() : 0;
        const endDate = params.dateRange.end ? new Date(params.dateRange.end).getTime() : Date.now();
        
        filteredResults = filteredResults.filter(result => {
          const modified = result.metadata?.modified || 0;
          return modified >= startDate && modified <= endDate;
        });
      }

      return {
        success: true,
        query: params.query,
        results: filteredResults.slice(0, params.limit || 10),
        totalResults: filteredResults.length
      };
      
    } catch (error) {
      console.error('File search failed:', error);
      return {
        success: false,
        query: params.query,
        results: [],
        totalResults: 0,
        error: `Search failed: ${getErrorMessage(error)}`
      };
    }
  }

  getParameterSchema() {
    // Create the mode-specific schema
    const modeSchema = {
      type: 'object',
      title: 'Search Files Parameters',
      description: 'Search file contents and names in the vault',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find in file contents and names',
          minLength: 1
        },
        fileTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter results by file extensions (e.g., ["md", "txt"])',
          examples: [["md"], ["md", "txt"], ["pdf", "docx"]]
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
          default: 10,
          minimum: 1,
          maximum: 100
        },
        includeContent: {
          type: 'boolean',
          description: 'Include full file content in results',
          default: true
        },
        semanticThreshold: {
          type: 'number',
          description: 'Minimum similarity score for semantic search (0-1)',
          default: 0.7,
          minimum: 0,
          maximum: 1
        }
      },
      required: ['query']
    };
    
    // Merge with common schema (sessionId and context)
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
                description: 'File path relative to vault root'
              },
              title: {
                type: 'string',
                description: 'File name without extension'
              },
              snippet: {
                type: 'string',
                description: 'Relevant content snippet from the file'
              },
              score: {
                type: 'number',
                description: 'Search relevance score'
              },
              searchMethod: {
                type: 'string',
                description: 'Method used to find this result'
              },
              metadata: {
                type: 'object',
                properties: {
                  fileType: {
                    type: 'string',
                    description: 'File extension'
                  },
                  created: {
                    type: 'number',
                    description: 'Creation timestamp'
                  },
                  modified: {
                    type: 'number',
                    description: 'Last modified timestamp'
                  },
                  size: {
                    type: 'number',
                    description: 'File size in bytes'
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