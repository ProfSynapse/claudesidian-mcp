import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { CombinedSearchParams, SemanticSearchResult } from '../types';
import { VaultLibrarianAgent } from '../vaultLibrarian';
import { ToolActivityEmbedder } from '../../../database/tool-activity-embedder';
import { parseWorkspaceContext } from '../../../utils/contextUtils';

/**
 * Mode for combined search with filters and semantic search
 */
export class CombinedSearchMode extends BaseMode<CombinedSearchParams, SemanticSearchResult> {
  private activityEmbedder: ToolActivityEmbedder | null = null;
  
  /**
   * Create a new CombinedSearchMode
   * @param app Obsidian app instance 
   */
  constructor(private app: App) {
    super(
      'combinedSearch',
      'Combined Search',
      'Hybrid metadata/semantic search',
      '1.0.0'
    );
    
    // Initialize the activity embedder if possible
    // Since we don't have direct access to VaultLibrarian, this needs to be set up differently
    // We'll rely on getting the provider through the plugin if needed
    try {
      const plugin = this.app.plugins?.getPlugin('claudesidian-mcp');
      if (plugin?.connector?.getVaultLibrarian) {
        const vaultLibrarian = plugin.connector.getVaultLibrarian();
        if (vaultLibrarian?.getProvider) {
          const provider = vaultLibrarian.getProvider();
          if (provider) {
            this.activityEmbedder = new ToolActivityEmbedder(provider);
          }
        }
      }
    } catch (error) {
      console.error("Failed to initialize activity embedder for combined search:", error);
    }
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with result
   */
  async execute(params: CombinedSearchParams): Promise<SemanticSearchResult> {
    try {
      const { query, filters, limit, threshold, workspaceContext, handoff } = params;
      
      if (!query || query.trim() === '') {
        return this.prepareResult(false, undefined, 'Query is required');
      }
      
      // Execute combined search by getting access to the VaultLibrarian
      let result = { success: false, matches: [], error: "VaultLibrarian not found" };
      
      try {
        const plugin = this.app.plugins?.getPlugin('claudesidian-mcp');
        if (plugin?.connector?.getVaultLibrarian) {
          const vaultLibrarian = plugin.connector.getVaultLibrarian();
          if (vaultLibrarian?.combinedSearch) {
            result = await vaultLibrarian.combinedSearch(
              query,
              filters || {},
              limit || 10,
              threshold || 0.7
            );
          } else {
            return this.prepareResult(false, undefined, "VaultLibrarian combinedSearch method not available");
          }
        } else {
          return this.prepareResult(false, undefined, "VaultLibrarian not available through connector");
        }
      } catch (error) {
        return this.prepareResult(false, undefined, `Error performing combined search: ${error.message}`);
      }
      
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
      return this.prepareResult(false, undefined, `Error performing combined search: ${error.message}`);
    }
  }
  
  /**
   * Record search activity in workspace memory
   * @param params Parameters used for search
   * @param result Result of search operation
   */
  private async recordActivity(
    params: CombinedSearchParams, 
    result: {
      success?: boolean;
      matches?: Array<{filePath: string}>;
      error?: string;
    }
  ): Promise<void> {
    // Parse workspace context
    const parsedContext = parseWorkspaceContext(params.workspaceContext);
    
    if (!parsedContext?.workspaceId || !this.activityEmbedder) {
      return; // Skip if no workspace context or embedder
    }
    
    try {
      // Initialize the activity embedder
      await this.activityEmbedder.initialize();
      
      // Get workspace path (or use just the ID if no path provided)
      const workspacePath = parsedContext.workspacePath || [parsedContext.workspaceId];
      
      // Create a descriptive content about this search operation
      const matchCount = result.matches?.length || 0;
      const topMatches = result.matches?.slice(0, 3).map(m => m.filePath) || [];
      
      let filtersDesc = '';
      if (params.filters) {
        const parts = [];
        if (params.filters.tags && params.filters.tags.length > 0) {
          parts.push(`tags: ${params.filters.tags.join(', ')}`);
        }
        if (params.filters.paths && params.filters.paths.length > 0) {
          parts.push(`paths: ${params.filters.paths.join(', ')}`);
        }
        if (params.filters.properties && Object.keys(params.filters.properties).length > 0) {
          parts.push(`properties: ${JSON.stringify(params.filters.properties)}`);
        }
        if (params.filters.dateRange) {
          parts.push(`dateRange: ${JSON.stringify(params.filters.dateRange)}`);
        }
        
        if (parts.length > 0) {
          filtersDesc = `Filters: ${parts.join('; ')}\n`;
        }
      }
      
      const content = `Combined search: "${params.query}"\n` +
                      filtersDesc +
                      `Matches found: ${matchCount}\n` +
                      (topMatches.length > 0 ? `Top matches: ${topMatches.join(', ')}\n` : '') +
                      (result.error ? `Error: ${result.error}\n` : '');
      
      // Record the activity in workspace memory
      await this.activityEmbedder.recordActivity(
        parsedContext.workspaceId,
        workspacePath,
        'research', // Most appropriate type for searches
        content,
        {
          tool: 'CombinedSearchMode',
          params: {
            query: params.query,
            filters: params.filters,
            limit: params.limit,
            threshold: params.threshold
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
  getParameterSchema(): Record<string, any> {
    return {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The query to search for'
        },
        filters: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Tags to filter by'
            },
            paths: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Paths to filter by'
            },
            properties: {
              type: 'object',
              description: 'Properties to filter by'
            },
            dateRange: {
              type: 'object',
              properties: {
                start: {
                  type: 'string',
                  description: 'Start date in ISO format'
                },
                end: {
                  type: 'string',
                  description: 'End date in ISO format'
                }
              },
              description: 'Date range to filter by'
            }
          },
          description: 'Filters to apply to the search'
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
        ...this.getCommonParameterSchema()
      },
      required: ['query']
    };
  }
  
  /**
   * Get the JSON schema for the mode's result
   * @returns JSON schema object
   */
  getResultSchema(): Record<string, any> {
    return {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the operation succeeded'
        },
        error: {
          type: 'string',
          description: 'Error message if success is false'
        },
        data: {
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
        },
        workspaceContext: {
          type: 'object',
          properties: {
            workspaceId: {
              type: 'string',
              description: 'ID of the workspace'
            },
            workspacePath: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Path of the workspace'
            },
            activeWorkspace: {
              type: 'boolean',
              description: 'Whether this is the active workspace'
            }
          }
        },
        handoffResult: {
          type: 'object',
          description: 'Result of the handoff operation'
        }
      },
      required: ['success']
    };
  }
}