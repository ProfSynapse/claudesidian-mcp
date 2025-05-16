import { BaseMode } from '../../baseMode';
import { SemanticSearchParams, SemanticSearchResult } from '../types';
import { VaultLibrarianAgent } from '../vaultLibrarian';
import { ToolActivityEmbedder } from '../tool-activity-embedder';

/**
 * Mode for semantic search using vector embeddings
 */
export class SemanticSearchMode extends BaseMode<SemanticSearchParams, SemanticSearchResult> {
  private activityEmbedder: ToolActivityEmbedder | null = null;
  
  /**
   * Create a new SemanticSearchMode
   * @param agent VaultLibrarian agent instance
   */
  constructor(private agent: VaultLibrarianAgent) {
    super(
      'semanticSearch',
      'Semantic Search',
      'Search using vector embeddings',
      '1.0.0'
    );
    
    // Initialize the activity embedder if we have a provider
    if (agent.getProvider()) {
      this.activityEmbedder = new ToolActivityEmbedder(agent.getProvider());
    }
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with result
   */
  async execute(params: SemanticSearchParams): Promise<SemanticSearchResult> {
    try {
      const { 
        query, 
        limit, 
        threshold, 
        workspaceContext, 
        handoff,
        useGraphBoost,
        graphBoostFactor,
        graphMaxDistance,
        seedNotes
      } = params;
      
      if (!query || query.trim() === '') {
        return this.prepareResult(false, undefined, 'Query is required');
      }
      
      // Execute semantic search
      const result = await this.agent.semanticSearch(
        query,
        limit || 10,
        threshold || 0.7,
        useGraphBoost || false,
        graphBoostFactor || 0.3,
        graphMaxDistance || 1,
        seedNotes || []
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
        workspaceContext
      );
      
      // Handle handoff if requested
      if (handoff) {
        return this.handleHandoff(handoff, response);
      }
      
      return response;
    } catch (error) {
      return this.prepareResult(false, undefined, `Error performing semantic search: ${error.message}`);
    }
  }
  
  /**
   * Record search activity in workspace memory
   * @param params Parameters used for search
   * @param result Result of search operation
   */
  private async recordActivity(params: SemanticSearchParams, result: any): Promise<void> {
    if (!params.workspaceContext?.workspaceId || !this.activityEmbedder) {
      return; // Skip if no workspace context or embedder
    }
    
    try {
      // Initialize the activity embedder
      await this.activityEmbedder.initialize();
      
      // Get workspace path (or use just the ID if no path provided)
      const workspacePath = params.workspaceContext.workspacePath || [params.workspaceContext.workspaceId];
      
      // Create a descriptive content about this search operation
      const matchCount = result.matches?.length || 0;
      const topMatches = result.matches?.slice(0, 3).map((m: any) => m.filePath) || [];
      
      const content = `Semantic search: "${params.query}"\n` +
                      `Matches found: ${matchCount}\n` +
                      (topMatches.length > 0 ? `Top matches: ${topMatches.join(', ')}\n` : '') +
                      (result.error ? `Error: ${result.error}\n` : '');
      
      // Record the activity in workspace memory
      await this.activityEmbedder.recordActivity(
        params.workspaceContext.workspaceId,
        workspacePath,
        'research', // Most appropriate type for searches
        content,
        {
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
            topMatches
          }
        },
        topMatches // Related files
      );
    } catch (error) {
      // Log but don't fail the main operation
      console.error('Failed to record search activity:', error);
    }
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
    return this.getMergedSchema(modeSchema);
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
                  },
                  links: {
                    type: 'object',
                    properties: {
                      outgoing: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            displayText: {
                              type: 'string',
                              description: 'Displayed text of the link'
                            },
                            targetPath: {
                              type: 'string',
                              description: 'Target path of the link'
                            }
                          }
                        },
                        description: 'Outgoing links'
                      },
                      incoming: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            sourcePath: {
                              type: 'string',
                              description: 'Source path of the link'
                            },
                            displayText: {
                              type: 'string',
                              description: 'Displayed text of the link'
                            }
                          }
                        },
                        description: 'Incoming links'
                      }
                    },
                    description: 'Links in the document'
                  }
                },
                description: 'Additional metadata'
              }
            },
            required: ['similarity', 'content', 'filePath']
          },
          description: 'Matching results'
        }
      },
      required: ['matches']
    };
    
    return baseSchema;
  }
}