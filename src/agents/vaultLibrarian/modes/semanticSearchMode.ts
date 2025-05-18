import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { SemanticSearchParams, SearchResult } from '../types';
import { MemoryService } from '../../../database/services/MemoryService';
import { ChromaSearchService } from '../../../database/services/ChromaSearchService';
import { parseWorkspaceContext } from '../../../utils/contextUtils';

/**
 * Mode for searching notes using an embedding-based semantic search
 */
export class SemanticSearchMode extends BaseMode<SemanticSearchParams, SearchResult> {
  private app: App;
  private memoryService: MemoryService | null = null;
  private searchService: ChromaSearchService | null = null;
  
  /**
   * Create a new SemanticSearchMode
   * @param app Obsidian app instance
   * @param memoryService Optional memory service for recording activity
   * @param searchService Optional search service for performing search
   */
  constructor(
    app: App, 
    memoryService?: MemoryService | null,
    searchService?: ChromaSearchService | null
  ) {
    super(
      'semanticSearch',
      'Semantic Search',
      'Search notes by semantic meaning using embeddings',
      '1.0.0'
    );
    
    this.app = app;
    this.memoryService = memoryService || null;
    this.searchService = searchService || null;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with search results
   */
  async execute(params: SemanticSearchParams): Promise<SearchResult> {
    // Try to use ChromaDB implementation first if available
    if (this.searchService) {
      try {
        const result = await this.executeWithChromaDB(params);
        return result;
      } catch (error) {
        console.error('Error executing with ChromaDB:', error);
        // Fall back to other methods
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
          if (result) {
            return result;
          }
        }
        
        if (!this.memoryService && plugin.services.memoryService) {
          this.memoryService = plugin.services.memoryService;
        }
      }
    } catch (error) {
      console.error('Error accessing plugin services:', error);
    }
    
    // Fallback message if nothing else worked
    return this.prepareResult(
      false,
      undefined,
      'Semantic search is not available - ChromaDB services not found',
      params.workspaceContext
    );
  }
  
  /**
   * Execute the search using ChromaDB services
   * @param params Mode parameters
   * @returns Promise that resolves with search results
   */
  private async executeWithChromaDB(params: SemanticSearchParams): Promise<SearchResult> {
    if (!this.searchService) {
      throw new Error('ChromaDB search service not available');
    }
    
    // Create filter options
    const searchOptions = {
      limit: params.limit,
      threshold: params.threshold,
      useGraphBoost: params.useGraphBoost,
      graphBoostFactor: params.graphBoostFactor,
      graphMaxDistance: params.graphMaxDistance,
      seedNotes: params.seedNotes
    };
    
    // Perform the search using the ChromaDB search service
    const result = await this.searchService.semanticSearch(
      params.query,
      searchOptions
    );
    
    // Record this activity if in a workspace context
    await this.recordActivity(params, result);
    
    // Prepare result with workspace context
    const response = this.prepareResult(
      result.success !== false, // Handle case where success is not explicitly set
      {
        matches: result.matches || []
      },
      result.error,
      params.workspaceContext
    );
    
    // Handle handoff if requested
    if (params.handoff) {
      return await super.handleHandoff(params.handoff, response);
    }
    
    return response;
  }
  
  /**
   * Record search activity in workspace memory
   * @param params Parameters used for search
   * @param result Result of search operation
   */
  private async recordActivity(params: SemanticSearchParams, result: any): Promise<void> {
    // Parse workspace context
    const parsedContext = parseWorkspaceContext(params.workspaceContext);
    
    if (!parsedContext?.workspaceId) {
      return; // Skip if no workspace context
    }
    
    // Try using memory service directly if available
    if (this.memoryService) {
      try {
        const matchCount = result.matches?.length || 0;
        const topMatches = result.matches?.slice(0, 3).map((m: any) => m.filePath) || [];
        
        const content = `Semantic search: "${params.query}"\n` +
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
              tool: 'SemanticSearchMode',
              params: {
                query: params.query,
                limit: params.limit,
                threshold: params.threshold,
                useGraphBoost: params.useGraphBoost,
                graphBoostFactor: params.graphBoostFactor,
                graphMaxDistance: params.graphMaxDistance
              },
              result: {
                matchCount,
                topMatches: topMatches
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
    
    // Try to get the memory service from the plugin directly if it wasn't passed to the constructor
    // This is a fallback in case the constructor isn't updated yet 
    if (!this.memoryService) {
      try {
        const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
        if (plugin?.services?.memoryService) {
          this.memoryService = plugin.services.memoryService;
          
          // Try again with the newly obtained memory service
          await this.recordActivity(params, result);
          return;
        }
      } catch (error) {
        console.error('Error accessing memory service from plugin:', error);
      }
    }
    
    // Log that we couldn't record the activity
    console.warn('Unable to record search activity - memory service unavailable');
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
        query: {
          type: 'string',
          description: 'The query to search for'
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
          items: {
            type: 'string'
          },
          description: 'List of seed note paths to prioritize in results'
        }
      },
      required: ['query']
    };
    
    // Merge with common schema (workspace context and handoff)
    return super.getMergedSchema(modeSchema);
  }
  
  /**
   * Get the JSON schema for the mode's result
   * @returns JSON schema object
   */
  getResultSchema(): any {
    // Use the base result schema from BaseMode, which includes common result properties
    const baseSchema = super.getResultSchema();
    
    // Add mode-specific data properties
    baseSchema.properties.data = {
      type: 'object',
      properties: {
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
          }
        }
      },
      required: ['matches']
    };
    
    return baseSchema;
  }
}