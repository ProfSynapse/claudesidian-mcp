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
   * Get memory settings from plugin
   * @returns Memory settings object or null if not available
   */
  private getMemorySettings(): any {
    try {
      const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
      if (plugin && plugin.settings && plugin.settings.settings && plugin.settings.settings.memory) {
        return plugin.settings.settings.memory;
      }
    } catch (error) {
      console.warn('Failed to get memory settings:', error);
    }
    return null;
  }

  /**
   * Get the backlinkEnabled setting value from plugin settings
   * Used to determine the default value for useGraphBoost
   * @returns Whether backlink boost is enabled in settings
   */
  private getBacklinksEnabledSetting(): boolean {
    const settings = this.getMemorySettings();
    return settings?.backlinksEnabled ?? true;
  }

  /**
   * Get the default threshold from plugin settings
   * @returns Default similarity threshold
   */
  private getDefaultThreshold(): number {
    const settings = this.getMemorySettings();
    return settings?.defaultThreshold ?? 0.7;
  }

  /**
   * Get the graph boost factor from plugin settings
   * @returns Graph boost factor
   */
  private getGraphBoostFactor(): number {
    const settings = this.getMemorySettings();
    return settings?.graphBoostFactor ?? 0.3;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with search results
   */
  async execute(params: VectorSearchParams): Promise<VectorSearchResult> {
    console.log('[VectorMode] Execute called with query:', params.query, 'threshold:', params.threshold);
    
    
    // Validate parameters
    if (!params.query && !params.embedding) {
      return this.prepareResult(
        false,
        undefined,
        'Either query or embedding must be provided'
      );
    }
    
    // Get the parent VaultLibrarian agent to make sure search service is initialized
    const vaultLibrarian = this.app.plugins.getPlugin('claudesidian-mcp')?.getConnector?.()?.getVaultLibrarian?.();
    if (vaultLibrarian && typeof vaultLibrarian.initializeSearchService === 'function') {
      console.log('Initializing VaultLibrarian search service before executing vector search');
      try {
        await vaultLibrarian.initializeSearchService();
        
        // If the parent VaultLibrarian has a search service, use it
        if ((vaultLibrarian as any).searchService && !this.searchService) {
          console.log('Using search service from parent VaultLibrarian');
          this.searchService = (vaultLibrarian as any).searchService;
        }
      } catch (error) {
        console.warn('Error initializing VaultLibrarian search service:', error);
      }
    }
    
    // Try to use ChromaDB implementation if available
    console.log('[VectorMode] searchService exists:', !!this.searchService);
    console.log('[VectorMode] vectorStore exists:', !!(this.searchService?.vectorStore));
    
    if (this.searchService && this.searchService.vectorStore) {
      try {
        console.log('Executing search with ChromaDB using configured search service');
        const result = await this.executeWithChromaDB(params);
        console.log('[VectorMode] executeWithChromaDB result:', result);
        
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
    } else if (this.searchService) {
      console.warn('Search service exists but vectorStore is null or undefined');
    }
    
    // Try to get services and vector store from plugin if not passed in constructor
    try {
      console.log('Trying to get services from plugin');
      const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
      if (plugin) {
        // Try getting vectorStore directly
        if (plugin.vectorStore) {
          console.log('Found vector store directly on plugin');
          
          // If we have searchService, connect the vectorStore
          if (this.searchService) {
            console.log('Connecting vector store to existing search service');
            this.searchService.vectorStore = plugin.vectorStore;
            
            // Try again with the connected service
            const result = await this.executeWithChromaDB(params);
            await this.recordActivity(params, result);
            return result;
          }
        }
        
        // Try getting searchService from plugin services
        if (plugin.services) {
          if (!this.searchService && plugin.services.searchService) {
            console.log('Using search service from plugin services');
            this.searchService = plugin.services.searchService;
            
            // Try again with the newly found service
            const result = await this.executeWithChromaDB(params);
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
      } else {
        console.warn('Plugin not found');
      }
    } catch (error) {
      console.error('Error accessing plugin services:', error);
    }
    
    // Fallback message if nothing else worked
    console.error('Vector search failed - ChromaDB services not found or not properly initialized');
    return this.prepareResult(
      false,
      undefined,
      'Vector search is not available - Vector store factory not found or not properly initialized'
    );
  }
  
  /**
   * Execute the search using ChromaDB services
   * @param params Mode parameters
   * @returns Promise that resolves with search results
   */
  private async executeWithChromaDB(params: VectorSearchParams): Promise<VectorSearchResult> {
    console.log('[VectorMode.executeWithChromaDB] Called with params:', params);
    
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
      threshold: params.threshold ?? this.getDefaultThreshold(), // Use settings default if not provided
      filters: params.filters,
      // Use the provided useGraphBoost parameter if available, otherwise use the backlinksEnabled setting
      useGraphBoost: params.useGraphBoost !== undefined ? params.useGraphBoost : this.getBacklinksEnabledSetting(),
      graphBoostFactor: params.graphBoostFactor ?? this.getGraphBoostFactor(), // Use settings default if not provided
      graphMaxDistance: params.graphMaxDistance,
      seedNotes: params.seedNotes,
      // IMPORTANT: Default to file_embeddings collection if not specified
      collectionName: params.collectionName || 'file_embeddings'
    };
    
    console.log('[VectorMode] Search options:', JSON.stringify({
      query: params.query,
      collectionName: searchOptions.collectionName,
      threshold: searchOptions.threshold,
      limit: searchOptions.limit
    }));
    
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
      console.log('[VectorMode] Calling semanticSearch');
      result = await this.searchService.semanticSearch(
        params.query,
        searchOptions
      );
      console.log('[VectorMode] Got', result.matches?.length || 0, 'matches');
    } else {
      throw new Error('No valid search parameters');
    }
      
    // Process and return the result with proper error handling
    // If the result is already in the expected format, return it directly
    if (result.matches) {
      // Enrich matches with frontmatter and file context
      const enrichedMatches = await this.enrichMatchesWithFileContext(result.matches || []);
      return this.prepareResult(
        result.success !== false,
        {
          matches: enrichedMatches
        },
        result.error
      );
    }
    
    // Otherwise, for direct query results from queryCollection, convert the format
    if (result && result.ids && result.ids.length > 0) {
      const formattedMatches = this.formatCollectionQueryResults(result);
      const enrichedMatches = await this.enrichMatchesWithFileContext(formattedMatches);
      return this.prepareResult(
        true,
        {
          matches: enrichedMatches
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
  }
  
  /**
   * Enrich search results with frontmatter and file context
   * @param matches Array of search matches to enrich
   * @returns Promise resolving to enriched matches
   */
  private async enrichMatchesWithFileContext(matches: Array<{
    similarity: number;
    content: string;
    filePath: string;
    lineStart?: number;
    lineEnd?: number;
    metadata?: any;
  }>): Promise<Array<{
    similarity: number;
    content: string;
    filePath: string;
    lineStart?: number;
    lineEnd?: number;
    metadata?: any;
  }>> {
    const enrichedMatches = [];
    
    for (const match of matches) {
      try {
        // Get the file from Obsidian
        const file = this.app.vault.getFileByPath(match.filePath);
        if (!file) {
          // If file doesn't exist, return match as-is
          enrichedMatches.push(match);
          continue;
        }
        
        // Read the file content
        const fileContent = await this.app.vault.read(file);
        
        // Extract frontmatter
        const frontmatterMatch = fileContent.match(/^---\n([\s\S]*?)\n---\n/);
        let frontmatter: Record<string, any> = {};
        
        if (frontmatterMatch) {
          try {
            // Parse YAML frontmatter
            const yaml = require('js-yaml');
            frontmatter = yaml.load(frontmatterMatch[1]) || {};
          } catch (yamlError) {
            console.warn('Failed to parse frontmatter for', match.filePath, yamlError);
          }
        }
        
        // Check if chunk already has frontmatter from first chunk
        let finalFrontmatter = frontmatter;
        if (match.metadata?.frontmatter) {
          // Use stored frontmatter if available (from first chunk)
          finalFrontmatter = match.metadata.frontmatter;
        }
        
        // Enhance the content with file context if it's just a chunk
        let enhancedContent = match.content;
        
        // If this is a chunk (not full document), optionally add some file context
        const isChunk = match.metadata && ('chunkIndex' in match.metadata || match.lineStart !== undefined);
        if (isChunk && Object.keys(finalFrontmatter).length > 0) {
          // Add frontmatter context to the beginning
          const frontmatterText = Object.entries(finalFrontmatter)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');
          enhancedContent = `[File: ${match.filePath}] [${frontmatterText}]\n\n${match.content}`;
        } else if (isChunk) {
          // Just add file path context
          enhancedContent = `[File: ${match.filePath}]\n\n${match.content}`;
        }
        
        // Create enriched match
        enrichedMatches.push({
          ...match,
          content: enhancedContent,
          metadata: {
            ...match.metadata,
            frontmatter: finalFrontmatter,
            tags: match.metadata?.tags || this.extractTagsFromContent(fileContent)
          }
        });
        
      } catch (error) {
        console.warn('Failed to enrich match with file context:', match.filePath, error);
        // Return original match if enrichment fails
        enrichedMatches.push(match);
      }
    }
    
    return enrichedMatches;
  }
  
  /**
   * Extract tags from file content
   * @param content File content
   * @returns Array of tags found in the content
   */
  private extractTagsFromContent(content: string): string[] {
    const tags: string[] = [];
    
    // Extract hashtags from content
    const hashtagMatches = content.match(/#[\w\-\/]+/g);
    if (hashtagMatches) {
      tags.push(...hashtagMatches.map(tag => tag.slice(1))); // Remove # prefix
    }
    
    // Extract tags from frontmatter if any
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    if (frontmatterMatch) {
      try {
        const yaml = require('js-yaml');
        const frontmatter = yaml.load(frontmatterMatch[1]);
        if (frontmatter?.tags) {
          if (Array.isArray(frontmatter.tags)) {
            tags.push(...frontmatter.tags);
          } else if (typeof frontmatter.tags === 'string') {
            tags.push(frontmatter.tags);
          }
        }
      } catch (error) {
        // Ignore YAML parsing errors
      }
    }
    
    // Remove duplicates and return
    return [...new Set(tags)];
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
      
      // Debug logging
      console.log(`[VectorMode formatCollectionQueryResults] ChromaDB distance: ${distance}, converted similarity: ${similarity}`);
      
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
  override getParameterSchema(): any {
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
          description: 'Maximum number of results to return. Defaults to the value configured in settings.',
          default: this.getMemorySettings()?.defaultResultLimit ?? 10
        },
        threshold: {
          type: 'number',
          description: 'Similarity threshold (0-1). Defaults to the value configured in settings.',
          minimum: 0,
          maximum: 1,
          default: this.getDefaultThreshold()
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
          description: 'Whether to use graph-based relevance boosting. Defaults to the value of backlinksEnabled in settings.',
        },
        graphBoostFactor: {
          type: 'number',
          description: 'Graph boost factor (0-1). Defaults to the value configured in settings.',
          minimum: 0,
          maximum: 1,
          default: this.getGraphBoostFactor()
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
  override getResultSchema(): any {
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