import { Plugin } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { EmbeddingService } from '../../../database/services/EmbeddingService';
import { MemoryService } from '../../../database/services/MemoryService';
import { WorkspaceService } from '../../../database/services/WorkspaceService';
import { 
  UniversalSearchParams, 
  UniversalSearchResult
} from '../types';
import { getErrorMessage } from '../../../utils/errorUtils';
import { UniversalSearchService } from './services/universal/UniversalSearchService';
import { globalValidationErrorMonitor } from './services/universal/validation/ValidationErrorMonitor';
import { UniversalSearchValidator } from './services/universal/validation/UniversalSearchValidator';

/**
 * Universal search mode that searches across all content types intelligently
 * Uses ChromaDB for semantic search via HybridSearchService
 */
export class SearchMode extends BaseMode<UniversalSearchParams, UniversalSearchResult> {
  private universalSearchService: UniversalSearchService;
  private plugin: Plugin;
  private validator: UniversalSearchValidator;

  constructor(
    plugin: Plugin,
    embeddingService?: EmbeddingService,
    memoryService?: MemoryService,
    workspaceService?: WorkspaceService
  ) {
    super('search', 'Universal Search', 'Search across ALL content types in one unified operation. Searches: FILE NAMES (fuzzy), FOLDER NAMES (fuzzy), FILE CONTENT (semantic/text), workspaces, sessions, snapshots, memory traces, tags, and properties. Replaces old separate search modes. Only requires a query parameter.', '2.0.0');
    
    this.plugin = plugin;
    this.universalSearchService = new UniversalSearchService(
      plugin,
      embeddingService, 
      memoryService,
      workspaceService
    );
    
    // Initialize validator for display operations
    this.validator = new UniversalSearchValidator(globalValidationErrorMonitor);
  }

  /**
   * Execute universal search across all content types
   */
  async execute(params: UniversalSearchParams): Promise<any> {
    const startTime = performance.now();
    
    try {
      
      
      // Validate required parameters
      if (!params.query || params.query.trim().length === 0) {
        return {
          success: false,
          error: 'Query parameter is required and cannot be empty'
        };
      }

      // Set default values
      const searchParams: UniversalSearchParams = {
        ...params,
        limit: params.limit || 10,
        includeContent: params.includeContent !== false
      };


      // Execute the consolidated search (new format)
      const consolidatedResults = await this.universalSearchService.executeConsolidatedSearch(searchParams);
      
      // Validation system monitoring for error prevention
      const errorSummary = globalValidationErrorMonitor.getErrorSummary();
      
      const executionTime = performance.now() - startTime;
      
      // Validate file paths in results for display operations
      if (consolidatedResults.length > 0) {
        consolidatedResults.slice(0, Math.min(3, consolidatedResults.length)).forEach((result, i) => {
          // Create validation context for display operations
          const displayContext = this.validator.createValidationContext('SearchMode', 'execute', 'display_preview');
          
          // Validate filePath before split() operation to prevent undefined.split() errors
          const validatedFilePath = this.validator.validateFilePath(result.filePath, displayContext);
          
          // Safe to perform split() operation on validated filePath
          try {
            const title = validatedFilePath.split('/').pop()?.replace(/\.md$/, '') || 'Untitled';
          } catch (splitError) {
            throw splitError;
          }
        });
      }
      
      
      return {
        success: true,
        query: params.query,
        results: consolidatedResults,
        totalResults: consolidatedResults.length,
        executionTime
      };
      
    } catch (error) {
      const executionTime = performance.now() - startTime;
      
      return {
        success: false,
        error: `Search failed: ${getErrorMessage(error)}`
      };
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
        queryType: {
          type: 'string',
          description: 'REQUIRED: Search strategy to use for content search. Choose based on query intent:\n• "exact" (70% keyword, 20% semantic, 10% fuzzy) - Use for specific terms, technical words, exact phrases. Best for queries like "clustering", "neural networks", "typescript"\n• "conceptual" (60% semantic, 30% keyword, 10% fuzzy) - Use for broader topics and concepts. Best for "machine learning algorithms", "project management"\n• "exploratory" (80% semantic, 15% fuzzy, 5% keyword) - Use for questions, discovery, open-ended queries. Best for "how does X work?", "examples of Y"\n• "mixed" (40% semantic, 40% keyword, 20% fuzzy) - Use for balanced queries with both specific and conceptual elements',
          enum: ['exact', 'conceptual', 'exploratory', 'mixed'],
          default: 'mixed',
          examples: [
            'exact',
            'conceptual', 
            'exploratory',
            'mixed'
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
      required: ['query', 'queryType'],
      additionalProperties: false
    };
    
    
    // Merge with common schema (sessionId and context)
    return this.getMergedSchema(schema);
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
        results: {
          type: 'array',
          description: 'Consolidated search results grouped by file',
          items: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: 'Path to the file containing search matches'
              },
              frontmatter: {
                type: 'object',
                description: 'File frontmatter including tags and properties',
                additionalProperties: true
              },
              snippets: {
                type: 'array',
                description: 'All relevant content snippets from different search methods',
                items: {
                  type: 'object',
                  properties: {
                    content: {
                      type: 'string',
                      description: 'The content snippet'
                    },
                    searchMethod: {
                      type: 'string',
                      enum: ['semantic', 'keyword', 'fuzzy'],
                      description: 'Search method that found this snippet'
                    }
                  },
                  required: ['content', 'searchMethod']
                }
              },
              connectedNotes: {
                type: 'array',
                items: { type: 'string' },
                description: 'File paths of notes connected via wikilinks'
              }
            },
            required: ['filePath', 'snippets', 'connectedNotes']
          }
        },
        totalResults: {
          type: 'number',
          description: 'Total number of files returned'
        },
        executionTime: {
          type: 'number',
          description: 'Search execution time in milliseconds'
        },
        error: {
          type: 'string',
          description: 'Error message if search failed'
        }
      },
      required: ['success'],
      additionalProperties: false
    };
  }
}