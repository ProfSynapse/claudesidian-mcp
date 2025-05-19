import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { CommonParameters, CommonResult } from '../../../types';
import { MemoryService } from '../../../database/services/MemoryService';
import { ChromaSearchService } from '../../../database/services/ChromaSearchService';
import { EmbeddingService } from '../../../database/services/EmbeddingService';
import { parseWorkspaceContext } from '../../../utils/contextUtils';

/**
 * Vector search parameters
 */
export interface VectorSearchParams extends CommonParameters {
  /**
   * Text query for the search
   */
  query?: string;
  
  /**
   * Embedding vector to search with directly (alternative to query)
   */
  embedding?: number[];
  
  /**
   * Collection name to search in (optional, will use default if not specified)
   */
  collectionName?: string;
  
  /**
   * Maximum number of results to return
   */
  limit?: number;
  
  /**
   * Similarity threshold (0-1)
   */
  threshold?: number;
  
  /**
   * Flag to use existing embeddings without regenerating them
   * When true, will search using existing embeddings even without OpenAI API key
   */
  embeddings?: boolean;
  
  /**
   * Flag to use direct collection query for backward compatibility
   * When true, uses queryCollection instead of semanticSearch with collection parameter
   */
  useDirectQuery?: boolean;
  
  /**
   * Optional filters to apply to the search
   */
  filters?: {
    /**
     * Filter by file tags
     */
    tags?: string[];
    
    /**
     * Filter by file paths
     */
    paths?: string[];
    
    /**
     * Filter by frontmatter properties
     */
    properties?: Record<string, any>;
    
    /**
     * Filter by date range
     */
    dateRange?: {
      start?: string;
      end?: string;
    };
  };

  /**
   * Whether to use graph-based relevance boosting
   */
  useGraphBoost?: boolean;

  /**
   * Graph boost factor (0-1)
   */
  graphBoostFactor?: number;

  /**
   * Maximum distance for graph connections
   */
  graphMaxDistance?: number;

  /**
   * List of seed note paths to prioritize in results
   */
  seedNotes?: string[];
}

/**
 * Vector search result
 */
export interface VectorSearchResult extends CommonResult {
  /**
   * Array of matches found by the vector search
   */
  matches?: Array<{
    /**
     * Similarity score (0-1)
     */
    similarity: number;
    
    /**
     * Chunk content
     */
    content: string;
    
    /**
     * Path to the file
     */
    filePath: string;
    
    /**
     * Starting line in the file
     */
    lineStart?: number;
    
    /**
     * Ending line in the file
     */
    lineEnd?: number;
    
    /**
     * Metadata about the match
     */
    metadata?: {
      /**
       * Frontmatter properties
       */
      frontmatter?: Record<string, any>;
      
      /**
       * Tags in the document
       */
      tags?: string[];
    };
  }>;
}

/**
 * Mode for vector (semantic) search in the vault
 */
export class VectorMode extends BaseMode<VectorSearchParams, VectorSearchResult> {
  private app: App;
  private memoryService: MemoryService | null = null;
  private searchService: ChromaSearchService | null = null;
  private embeddingService: EmbeddingService | null = null;
  
  /**
   * Create a new VectorMode
   * @param app Obsidian app instance
   * @param memoryService Optional memory service for recording activity
   * @param searchService Optional search service for performing search
   * @param embeddingService Optional embedding service for creating embeddings
   */
  constructor(
    app: App, 
    memoryService?: MemoryService | null,
    searchService?: ChromaSearchService | null,
    embeddingService?: EmbeddingService | null
  ) {
    super(
      'vector',
      'Vector Search',
      'Search the vault using vector embeddings for semantic matching',
      '1.0.0'
    );
    
    this.app = app;
    this.memoryService = memoryService || null;
    this.searchService = searchService || null;
    this.embeddingService = embeddingService || null;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with search results
   */
  async execute(params: VectorSearchParams): Promise<VectorSearchResult> {
    // Validate parameters
    if (!params.query && !params.embedding) {
      return this.prepareResult(
        false,
        undefined,
        'Either query or embedding must be provided'
      );
    }
    
    // Try to use ChromaDB implementation if available
    if (this.searchService) {
      try {
        const result = await this.executeWithChromaDB(params);
        
        // Record this activity if in a workspace context
        await this.recordActivity(params, result);
        
        return result;
      } catch (error) {
        console.error('Error executing with ChromaDB:', error);
        return this.prepareResult(
          false,
          undefined,
          error instanceof Error ? error.message : 'Vector search failed'
        );
      }
    }
    
    // Try to get services from plugin if not passed in constructor
    try {
      const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
      if (plugin?.services) {
        if (!this.searchService && plugin.services.searchService) {
          this.searchService = plugin.services.searchService;
          
          // Try again with the newly found service
          const result = await this.executeWithChromaDB(params);
          
          // Record this activity if in a workspace context
          await this.recordActivity(params, result);
          
          return result;
        }
        
        if (!this.memoryService && plugin.services.memoryService) {
          this.memoryService = plugin.services.memoryService;
        }
        
        if (!this.embeddingService && plugin.services.embeddingService) {
          this.embeddingService = plugin.services.embeddingService;
        }
      }
    } catch (error) {
      console.error('Error accessing plugin services:', error);
    }
    
    // Fallback message if nothing else worked
    return this.prepareResult(
      false,
      undefined,
      'Vector search is not available - ChromaDB services not found'
    );
  }
  
  /**
   * Execute the search using ChromaDB services
   * @param params Mode parameters
   * @returns Promise that resolves with search results
   */
  private async executeWithChromaDB(params: VectorSearchParams): Promise<VectorSearchResult> {
    if (!this.searchService) {
      throw new Error('ChromaDB search service not available');
    }
    
    let queryEmbedding: number[] | undefined = undefined;
    
    // Only use an embedding if directly provided in the request
    if (params.embedding) {
      queryEmbedding = params.embedding;
    }
    else if (!params.query) {
      throw new Error('Either query text or embedding vector must be provided');
    }
    
    // Create search options
    const searchOptions = {
      limit: params.limit || 10,
      threshold: params.threshold || 0.7,
      filters: params.filters,
      useGraphBoost: params.useGraphBoost,
      graphBoostFactor: params.graphBoostFactor,
      graphMaxDistance: params.graphMaxDistance,
      seedNotes: params.seedNotes,
      collectionName: params.collectionName
    };
    
    let result;
    
    // If we need to use the direct queryCollection method for backward compatibility
    if (params.collectionName && params.query && params.useDirectQuery) {
      // Build ChromaDB query parameters for direct collection query
      const queryParams: any = {
        nResults: params.limit || 10,
        where: this.buildChromaWhereClause(params.filters),
        include: ['metadatas', 'documents', 'distances']
      };
      
      // Add either queryEmbeddings or queryTexts
      if (queryEmbedding) {
        queryParams.queryEmbeddings = [queryEmbedding];
      } else if (params.query) {
        queryParams.queryTexts = [params.query];
      }
      
      // Execute collection query directly
      result = await this.searchService.queryCollection(
        params.collectionName,
        queryParams
      );
    }
    // Otherwise use the integrated search methods that now support collection filtering
    else if (queryEmbedding) {
      result = await this.searchService.semanticSearchWithEmbedding(
        queryEmbedding,
        searchOptions
      );
    } else if (params.query) {
      result = await this.searchService.semanticSearch(
        params.query,
        { ...searchOptions, skipEmbeddingGeneration: true }
      );
    } else {
      throw new Error('No valid search parameters');
    }
      
    // Process and return the result with proper error handling
    // If the result is already in the expected format, return it directly
    if (result.matches) {
      return this.prepareResult(
        result.success !== false,
        {
          matches: result.matches || []
        },
        result.error
      );
    }
    
    // Otherwise, for direct query results from queryCollection, convert the format
    if (result && result.ids && result.ids.length > 0) {
      return this.prepareResult(
        true,
        {
          matches: this.formatCollectionQueryResults(result)
        }
      );
    }
    
    // If no results were found
    return this.prepareResult(
      true,
      {
        matches: []
      }
    );
      
      return this.prepareResult(
        result.success !== false, // Handle case where success is not explicitly set
        {
          matches: result.matches || []
        },
        result.error
      );
    }
  }
  
  /**
   * Build a ChromaDB where clause from filter options
   * @param filters Filter options
   * @returns ChromaDB where clause object
   */
  private buildChromaWhereClause(filters?: VectorSearchParams['filters']): Record<string, any> | undefined {
    if (!filters) {
      return undefined;
    }
    
    const where: Record<string, any> = {};
    
    // Add tag filters
    if (filters.tags && filters.tags.length > 0) {
      where['metadata.tags'] = { $in: filters.tags };
    }
    
    // Add path filters
    if (filters.paths && filters.paths.length > 0) {
      where['metadata.path'] = { $in: filters.paths };
    }
    
    // Add property filters
    if (filters.properties) {
      for (const [key, value] of Object.entries(filters.properties)) {
        where[`metadata.frontmatter.${key}`] = value;
      }
    }
    
    // Add date range filters
    if (filters.dateRange) {
      const dateFilters: any = {};
      
      if (filters.dateRange.start) {
        dateFilters.$gte = filters.dateRange.start;
      }
      
      if (filters.dateRange.end) {
        dateFilters.$lte = filters.dateRange.end;
      }
      
      if (Object.keys(dateFilters).length > 0) {
        where['metadata.created'] = dateFilters;
      }
    }
    
    return Object.keys(where).length > 0 ? where : undefined;
  }
  
  /**
   * Format collection query results into vector search results
   * @param result Raw ChromaDB collection query result
   * @returns Formatted vector search results
   */
  private formatCollectionQueryResults(result: any): Array<{
    similarity: number;
    content: string;
    filePath: string;
    lineStart?: number;
    lineEnd?: number;
    metadata?: any;
  }> {
    const matches: Array<{
      similarity: number;
      content: string;
      filePath: string;
      lineStart?: number;
      lineEnd?: number;
      metadata?: any;
    }> = [];
    
    // Extract data from result
    const { ids, distances, documents, metadatas } = result;
    
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const distance = distances ? distances[i] : null;
      const document = documents ? documents[i] : null;
      const metadata = metadatas ? metadatas[i] : null;
      
      // Convert distance to similarity score (ChromaDB distances are dissimilarity)
      const similarity = distance !== null ? 1 - distance : 1;
      
      matches.push({
        similarity,
        content: document || '',
        filePath: metadata?.path || id,
        lineStart: metadata?.lineStart,
        lineEnd: metadata?.lineEnd,
        metadata: {
          frontmatter: metadata?.frontmatter,
          tags: metadata?.tags
        }
      });
    }
    
    return matches;
  }
  
  /**
   * Record search activity in workspace memory
   * @param params Parameters used for search
   * @param result Result of search operation
   */
  private async recordActivity(params: VectorSearchParams, result: VectorSearchResult): Promise<void> {
    // Parse workspace context
    const parsedContext = parseWorkspaceContext(params.workspaceContext);
    
    if (!parsedContext?.workspaceId) {
      return; // Skip if no workspace context
    }
    
    // Try using memory service directly if available
    if (this.memoryService) {
      try {
        const matchCount = result.matches?.length || 0;
        const topMatches = result.matches?.slice(0, 3).map(m => m.filePath) || [];
        
        const content = `Vector search: "${params.query || 'Using direct embedding vector'}"\n` +
                        `Matches found: ${matchCount}\n` +
                        (topMatches.length > 0 ? `Top matches: ${topMatches.join(', ')}\n` : '') +
                        (result.error ? `Error: ${result.error}\n` : '');
        
        // Use memory service to record activity trace
        await this.memoryService.recordActivityTrace(
          parsedContext.workspaceId,
          {
            type: 'research',
            content,
            metadata: {
              tool: 'VectorMode',
              params: {
                query: params.query,
                embeddingProvided: !!params.embedding,
                limit: params.limit,
                threshold: params.threshold,
                filters: params.filters
              },
              result: {
                matchCount,
                topMatches
              },
              relatedFiles: topMatches
            },
            sessionId: params.sessionId
          }
        );
        
        return;
      } catch (error) {
        console.error('Error recording activity with memory service:', error);
      }
    }
  }
  
  /**
   * Helper to prepare a structured result
   * @param success Whether the operation was successful
   * @param data Optional result data
   * @param error Optional error message
   * @returns Formatted result object
   */
  protected prepareResult(
    success: boolean,
    data?: { matches: any[] },
    error?: string
  ): VectorSearchResult {
    return {
      success,
      ...data && { matches: data.matches },
      ...error && { error }
    };
  }
  
  /**
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
    // Create the mode-specific schema
    const modeSchema = {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session identifier to track related tool calls'
        },
        query: {
          type: 'string',
          description: 'Text query for the search'
        },
        embedding: {
          type: 'array',
          items: {
            type: 'number'
          },
          description: 'Embedding vector to search with directly (alternative to query)'
        },
        embeddings: {
          type: 'boolean',
          description: 'Set to true to use existing embeddings without regenerating them',
          default: false
        },
        useDirectQuery: {
          type: 'boolean',
          description: 'Set to true to use direct collection query for backward compatibility',
          default: false
        },
        collectionName: {
          type: 'string',
          description: 'Collection name to search in (optional, will use default if not specified)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 10
        },
        threshold: {
          type: 'number',
          description: 'Similarity threshold (0-1)',
          default: 0.7
        },
        filters: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by file tags'
            },
            paths: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by file paths'
            },
            properties: {
              type: 'object',
              description: 'Filter by frontmatter properties'
            },
            dateRange: {
              type: 'object',
              properties: {
                start: { type: 'string', description: 'Start date (ISO format)' },
                end: { type: 'string', description: 'End date (ISO format)' }
              },
              description: 'Filter by date range'
            }
          },
          description: 'Optional filters to apply to the search'
        },
        useGraphBoost: {
          type: 'boolean',
          description: 'Whether to use graph-based relevance boosting',
          default: false
        },
        graphBoostFactor: {
          type: 'number',
          description: 'Graph boost factor (0-1)',
          default: 0.3
        },
        graphMaxDistance: {
          type: 'number',
          description: 'Maximum distance for graph connections',
          default: 1
        },
        seedNotes: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of seed note paths to prioritize in results'
        }
      },
      required: ['sessionId'],
      oneOf: [
        { required: ['query'] },
        { required: ['embedding'] }
      ],
      description: 'Search the vault using vector embeddings for semantic matching'
    };
    
    // Merge with common schema (workspace context and handoff)
    return super.getMergedSchema(modeSchema);
  }
  
  /**
   * Get the JSON schema for the mode's result
   * @returns JSON schema object
   */
  getResultSchema(): any {
    return {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the operation was successful'
        },
        error: {
          type: 'string',
          description: 'Error message if the operation failed'
        },
        matches: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              similarity: {
                type: 'number',
                description: 'Similarity score (0-1)'
              },
              content: {
                type: 'string',
                description: 'Chunk content'
              },
              filePath: {
                type: 'string',
                description: 'Path to the file'
              },
              lineStart: {
                type: 'number',
                description: 'Starting line in the file'
              },
              lineEnd: {
                type: 'number',
                description: 'Ending line in the file'
              },
              metadata: {
                type: 'object',
                properties: {
                  frontmatter: {
                    type: 'object',
                    description: 'Frontmatter properties'
                  },
                  tags: {
                    type: 'array',
                    items: {
                      type: 'string'
                    },
                    description: 'Tags in the document'
                  }
                }
              }
            },
            required: ['similarity', 'content', 'filePath']
          },
          description: 'Array of matches found by the vector search'
        }
      },
      required: ['success']
    };
  }
}