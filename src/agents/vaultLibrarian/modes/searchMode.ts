import { Plugin } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { SemanticSearchService } from '../../../database/services/SemanticSearchService';
import { EmbeddingService } from '../../../database/services/EmbeddingService';
import { MemoryService } from '../../../database/services/MemoryService';
import { WorkspaceService } from '../../../database/services/WorkspaceService';
import { 
  UniversalSearchParams, 
  UniversalSearchResult
} from '../types';
import { getErrorMessage } from '../../../utils/errorUtils';
import { UniversalSearchService } from './services/UniversalSearchService';

/**
 * Universal search mode that searches across all content types intelligently
 * Updated to use SemanticSearchService instead of ChromaSearchService
 */
export class SearchMode extends BaseMode<UniversalSearchParams, UniversalSearchResult> {
  private universalSearchService: UniversalSearchService;
  private plugin: Plugin;

  constructor(
    plugin: Plugin,
    semanticSearchService?: SemanticSearchService,
    embeddingService?: EmbeddingService,
    memoryService?: MemoryService,
    workspaceService?: WorkspaceService
  ) {
    super('search', 'Universal Search', 'Search across ALL content types in one unified operation. Searches: FILE NAMES (fuzzy), FOLDER NAMES (fuzzy), FILE CONTENT (semantic/text), workspaces, sessions, snapshots, memory traces, tags, and properties. Replaces old separate search modes. Only requires a query parameter.', '2.0.0');
    
    this.plugin = plugin;
    this.universalSearchService = new UniversalSearchService(
      plugin,
      semanticSearchService,
      embeddingService, 
      memoryService,
      workspaceService
    );
  }

  /**
   * Execute universal search across all content types
   */
  async execute(params: UniversalSearchParams): Promise<UniversalSearchResult> {
    try {
      // Removed verbose debug logging for parameters
      // Validate required parameters
      if (!params.query || params.query.trim().length === 0) {
        return {
          success: false,
          error: 'Query parameter is required and cannot be empty'
        } as UniversalSearchResult;
      }

      // Get default threshold from plugin settings
      const defaultThreshold = (this.plugin as any).settings?.settings?.memory?.defaultThreshold || 0.7;
      
      // Set default values
      const searchParams: UniversalSearchParams = {
        ...params,
        limit: params.limit || 5,
        includeContent: params.includeContent !== false,
        semanticThreshold: params.semanticThreshold || defaultThreshold
      };

      // Execute the universal search
      const result = await this.universalSearchService.executeUniversalSearch(searchParams);
      
      return result;
      
    } catch (error) {
      console.error('Universal search failed:', error);
      return {
        success: false,
        error: `Search failed: ${getErrorMessage(error)}`
      } as UniversalSearchResult;
    }
  }

  /**
   * Get parameter schema for MCP tool definition
   */
  getParameterSchema() {
    const schema = {
      type: 'object',
      title: 'Universal Search Parameters',
      description: 'Search across ALL content types in one unified search. This replaces the old separate search modes (content/tag/property) with a single intelligent search that automatically handles all categories. Only the query parameter is required.',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find content across all categories. This UNIVERSAL search automatically searches: (1) FILE NAMES using fuzzy matching, (2) FOLDER NAMES using fuzzy matching, (3) FILE CONTENT using semantic/text search, (4) workspaces, sessions, snapshots, memory traces, (5) tags and properties. No type parameter needed - all categories are searched automatically.',
          examples: [
            'project planning', 
            'machine learning',
            'typescript', 
            'notes',
            'README',
            'config'
          ]
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results per category (default: 5)',
          minimum: 1,
          maximum: 50,
          default: 5
        },
        excludeCategories: {
          type: 'array',
          description: 'OPTIONAL: Categories to exclude from search. Use this to focus the search by removing irrelevant categories. Available categories: "files" (file names), "folders" (folder names), "content" (file contents), "workspaces", "sessions", "snapshots", "memory_traces", "tags", "properties"',
          items: {
            type: 'string',
            enum: ['files', 'folders', 'content', 'workspaces', 'sessions', 'snapshots', 'memory_traces', 'tags', 'properties']
          },
          examples: [
            ['tags', 'properties'],
            ['memory_traces', 'snapshots']
          ]
        },
        prioritizeCategories: {
          type: 'array', 
          description: 'OPTIONAL: Categories to prioritize (return more results from these). Categories: "files" (file names), "folders" (folder names), "content" (file contents), plus workspaces, sessions, etc.',
          items: {
            type: 'string',
            enum: ['files', 'folders', 'content', 'workspaces', 'sessions', 'snapshots', 'memory_traces', 'tags', 'properties']
          },
          examples: [
            ['content', 'files'],
            ['workspaces', 'sessions']
          ]
        },
        paths: {
          type: 'array',
          description: 'Restrict search to specific folder paths',
          items: {
            type: 'string'
          }
        },
        includeContent: {
          type: 'boolean',
          description: 'Whether to include contextual content around matches in results (default: true)',
          default: true
        },
        forceSemanticSearch: {
          type: 'boolean',
          description: 'Force semantic search even for categories that typically use exact matching (default: auto-detect)',
          default: false
        },
        semanticThreshold: {
          type: 'number',
          description: 'Similarity threshold for semantic search (0-1, uses plugin settings default if not specified)',
          minimum: 0,
          maximum: 1
        },
        // Graph boost options
        useGraphBoost: {
          type: 'boolean',
          description: 'Use graph connections to boost relevance of connected notes'
        },
        graphBoostFactor: {
          type: 'number',
          description: 'Strength of graph boost effect (default: 0.3)',
          minimum: 0,
          maximum: 2,
          default: 0.3
        },
        graphMaxDistance: {
          type: 'number',
          description: 'Maximum graph distance for boost effect (default: 1)',
          minimum: 1,
          maximum: 5,
          default: 1
        },
        seedNotes: {
          type: 'array',
          description: 'Seed notes to prioritize in graph boost',
          items: {
            type: 'string'
          }
        }
      },
      required: ['query'],
      additionalProperties: false
    };
    
    // Removed verbose debug logging for schema generation
    
    return schema;
  }

  /**
   * Get result schema for MCP tool definition
   */
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
          description: 'Original search query'
        },
        totalResults: {
          type: 'number',
          description: 'Total number of results across all categories'
        },
        executionTime: {
          type: 'number',
          description: 'Search execution time in milliseconds'
        },
        categories: {
          type: 'object',
          description: 'Search results organized by category',
          properties: {
            files: { $ref: '#/definitions/SearchResultCategory' },
            folders: { $ref: '#/definitions/SearchResultCategory' },
            content: { $ref: '#/definitions/SearchResultCategory' },
            workspaces: { $ref: '#/definitions/SearchResultCategory' },
            sessions: { $ref: '#/definitions/SearchResultCategory' },
            snapshots: { $ref: '#/definitions/SearchResultCategory' },
            memory_traces: { $ref: '#/definitions/SearchResultCategory' },
            tags: { $ref: '#/definitions/SearchResultCategory' },
            properties: { $ref: '#/definitions/SearchResultCategory' }
          }
        },
        searchStrategy: {
          type: 'object',
          description: 'Information about the search strategy used',
          properties: {
            semanticAvailable: {
              type: 'boolean',
              description: 'Whether semantic search was available'
            },
            categoriesSearched: {
              type: 'array',
              items: { type: 'string' },
              description: 'Categories that were searched'
            },
            categoriesExcluded: {
              type: 'array', 
              items: { type: 'string' },
              description: 'Categories that were excluded'
            },
            fallbacksUsed: {
              type: 'array',
              items: { type: 'string' },
              description: 'Categories that used fallback (non-semantic) search'
            }
          }
        },
        error: {
          type: 'string',
          description: 'Error message if search failed'
        }
      },
      definitions: {
        SearchResultCategory: {
          type: 'object',
          properties: {
            count: {
              type: 'number',
              description: 'Total number of results found in this category'
            },
            results: {
              type: 'array',
              description: 'Top results from this category',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Unique identifier' },
                  title: { type: 'string', description: 'Display title' },
                  snippet: { type: 'string', description: 'Content preview' },
                  score: { type: 'number', description: 'Relevance score (0-1)' },
                  searchMethod: { 
                    type: 'string', 
                    enum: ['semantic', 'fuzzy', 'exact', 'hybrid'],
                    description: 'Search method used'
                  },
                  metadata: { type: 'object', description: 'Category-specific metadata' },
                  content: { type: 'string', description: 'Full content (if requested)' }
                }
              }
            },
            hasMore: {
              type: 'boolean',
              description: 'Whether more results are available'
            },
            searchMethod: {
              type: 'string',
              enum: ['semantic', 'fuzzy', 'exact', 'hybrid'],
              description: 'Primary search method used for this category'
            },
            semanticAvailable: {
              type: 'boolean',
              description: 'Whether semantic search was available for this category'
            }
          }
        }
      },
      required: ['success'],
      additionalProperties: false
    };
  }
}