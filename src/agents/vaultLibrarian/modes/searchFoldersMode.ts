import { Plugin } from 'obsidian';
import { CommonParameters } from '../../../types';
import { BaseMode } from '../../baseMode';
import { getErrorMessage } from '../../../utils/errorUtils';
import { UniversalSearchService } from './services/UniversalSearchService';
import { HnswSearchService } from '../../../database/providers/chroma/services/HnswSearchService';
import { EmbeddingService } from '../../../database/services/EmbeddingService';
import { MemoryService } from '../../../database/services/MemoryService';
import { WorkspaceService } from '../../../database/services/WorkspaceService';

export interface SearchFoldersParams extends CommonParameters {
  query: string;
  depth?: number;
  pattern?: string;
  limit?: number;
}

export interface SearchFoldersResult {
  success: boolean;
  query: string;
  results: Array<{
    path: string;
    name: string;
    depth: number;
    fileCount: number;
    folderCount: number;
    searchMethod: string;
    score: number;
  }>;
  totalResults: number;
  error?: string;
}

/**
 * Search mode focused on folder names and paths
 */
export class SearchFoldersMode extends BaseMode<SearchFoldersParams, SearchFoldersResult> {
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
      'searchFolders', 
      'Search Folders', 
      'Search for folder names and paths in the vault. Helps locate folder structures.', 
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

  async execute(params: SearchFoldersParams): Promise<SearchFoldersResult> {
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

      // Execute search with folder-specific categories
      const results = await this.universalSearchService.executeConsolidatedSearch({
        query: params.query,
        limit: params.limit || 20,
        sessionId: params.sessionId,
        context: params.context
      });

      // Transform ConsolidatedSearchResult to expected format first
      const transformedResults = results.map((result, index) => ({
        path: result.filePath,
        title: result.filePath.split('/').pop() || result.filePath,
        searchMethod: result.snippets[0]?.searchMethod || 'unknown',
        score: 0.8 - (index * 0.01),
        metadata: {
          fileCount: 0, // Would need directory scanning to get accurate count
          folderCount: 0
        }
      }));

      // Filter by depth if specified
      let filteredResults = transformedResults;
      if (params.depth !== undefined) {
        filteredResults = transformedResults.filter(result => {
          const pathDepth = result.path.split('/').filter(p => p.length > 0).length;
          return pathDepth <= params.depth!;
        });
      }

      // Filter by pattern if specified
      if (params.pattern) {
        const regex = new RegExp(params.pattern, 'i');
        filteredResults = filteredResults.filter(result => 
          regex.test(result.path)
        );
      }

      // Transform results to folder-specific format
      const folderResults = filteredResults.map(result => ({
        path: result.path,
        name: result.title || result.path.split('/').pop() || '',
        depth: result.path.split('/').filter(p => p.length > 0).length,
        fileCount: result.metadata?.fileCount || 0,
        folderCount: result.metadata?.folderCount || 0,
        searchMethod: result.searchMethod,
        score: result.score
      }));

      return {
        success: true,
        query: params.query,
        results: folderResults.slice(0, params.limit || 20),
        totalResults: folderResults.length
      };
      
    } catch (error) {
      console.error('Folder search failed:', error);
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
      title: 'Search Folders Parameters',
      description: 'Search for folder names and paths in the vault',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find in folder names and paths',
          minLength: 1
        },
        depth: {
          type: 'number',
          description: 'Maximum folder depth to include in results',
          minimum: 1,
          maximum: 10
        },
        pattern: {
          type: 'string',
          description: 'Regex pattern to filter folder paths',
          examples: ['^Archive/', '.*Projects.*', '[0-9]{4}']
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 20,
          minimum: 1,
          maximum: 100
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
                description: 'Full folder path'
              },
              name: {
                type: 'string',
                description: 'Folder name'
              },
              depth: {
                type: 'number',
                description: 'Folder depth level'
              },
              fileCount: {
                type: 'number',
                description: 'Number of files in the folder'
              },
              folderCount: {
                type: 'number',
                description: 'Number of subfolders'
              },
              searchMethod: {
                type: 'string',
                description: 'Method used to find this result'
              },
              score: {
                type: 'number',
                description: 'Search relevance score'
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