import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { 
  SearchContentArgs, 
  SearchTagArgs,
  SearchPropertyArgs,
  GraphBoostOptions
} from '../types';
import { SearchOperations } from '../../../database/utils/SearchOperations';
import { ChromaSearchService } from '../../../database/services/ChromaSearchService';
import { CommonParameters, CommonResult } from '../../../types';

/**
 * Search type for unified search mode
 */
export type SearchType = 'content' | 'tag' | 'property';

/**
 * Unified search parameters
 */
export interface UnifiedSearchParams extends CommonParameters, GraphBoostOptions {
  /**
   * Type of search to perform
   */
  type: SearchType;

  /**
   * Query text (for content search)
   */
  query?: string;

  /**
   * Tag to search for (for tag search)
   */
  tag?: string;

  /**
   * Property key (for property search)
   */
  key?: string;

  /**
   * Property value (for property search, optional)
   */
  value?: string;

  /**
   * Paths to search in (optional for all search types)
   */
  paths?: string[];

  /**
   * Maximum number of results to return (optional for all search types)
   */
  limit?: number;

  /**
   * Whether to include metadata in the search (optional for content search)
   */
  includeMetadata?: boolean;

  /**
   * Fields to search in (optional for content search)
   */
  searchFields?: string[];

  /**
   * Custom weights for different search factors (optional for content search)
   */
  weights?: Record<string, number>;

  /**
   * Whether to include content in the results (optional for content search)
   */
  includeContent?: boolean;
}

/**
 * Unified search result
 */
export interface UnifiedSearchResult extends CommonResult {
  /**
   * Type of search performed
   */
  type: SearchType;

  /**
   * Content search results (if type is 'content')
   */
  contentResults?: {
    results: Array<{
      path: string;
      snippet: string;
      line: number;
      position: number;
      score?: number;
      frontmatter?: Record<string, any>; // Added frontmatter field
    }>;
    total: number;
    averageScore?: number;
    topResult?: string;
  };

  /**
   * Tag search results (if type is 'tag')
   */
  tagResults?: {
    files: string[];
    total: number;
  };

  /**
   * Property search results (if type is 'property')
   */
  propertyResults?: {
    files: Array<{
      path: string;
      value: string;
    }>;
    total: number;
  };
}

/**
 * Mode for unified searching in the vault (content, tags, properties)
 */
export class SearchMode extends BaseMode<UnifiedSearchParams, UnifiedSearchResult> {
  private app: App;
  private searchOperations: SearchOperations;
  private searchService: ChromaSearchService | null = null;
  
  /**
   * Create a new SearchMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'search',
      'Search',
      'Unified search for content, tags, or properties in the vault',
      '1.0.0'
    );
    
    this.app = app;
    this.searchOperations = new SearchOperations(app);
    
    // Initialize ChromaDB search service if available
    try {
      const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
      if (plugin?.services?.searchService) {
        this.searchService = plugin.services.searchService;
      }
    } catch (error) {
      console.error('Error initializing ChromaDB search service:', error);
    }
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the search results
   */
  async execute(params: UnifiedSearchParams): Promise<UnifiedSearchResult> {
    try {
      // Validate type parameter
      if (!params.type) {
        return {
          success: false,
          type: 'content', // default type for error reporting
          error: 'Search type is required (must be one of: content, tag, property)'
        };
      }
      
      const { type } = params;
      
      switch (type) {
        case 'content':
          return await this.executeContentSearch(params);
        case 'tag':
          return await this.executeTagSearch(params);
        case 'property':
          return await this.executePropertySearch(params);
        default:
          throw new Error(`Unsupported search type: ${type}`);
      }
    } catch (error) {
      return {
        success: false,
        type: params.type || 'content', // default type for error reporting
        error: error.message
      };
    }
  }
  
  /**
   * Execute content search
   * @param params Search parameters
   * @returns Promise that resolves with content search results
   */
  private async executeContentSearch(params: UnifiedSearchParams): Promise<UnifiedSearchResult> {
    if (!params.query) {
      throw new Error('Missing required parameter: query');
    }
    
    // Convert to content search parameters
    const contentParams: SearchContentArgs = {
      sessionId: params.sessionId,
      context: params.context || "Content search",
      query: params.query,
      paths: params.paths,
      limit: params.limit,
      includeMetadata: true, // Always include metadata to properly separate frontmatter
      searchFields: params.searchFields,
      weights: params.weights,
      includeContent: true // Always include content to separate frontmatter from snippet
    };
    
    // First check if we can use ChromaDB for this search
    if (this.searchService && this.isChromaCompatibleSearch(contentParams)) {
      return await this.executeChromaContentSearch(contentParams);
    }
    
    // Use standard search otherwise
    return await this.executeStandardContentSearch(contentParams);
  }
  
  /**
   * Execute search using ChromaDB
   * @param params Search parameters
   * @returns Search result using ChromaDB
   */
  private async executeChromaContentSearch(params: SearchContentArgs): Promise<UnifiedSearchResult> {
    try {
      if (!this.searchService) {
        throw new Error('ChromaDB search service is not available');
      }
      
      const { query, paths, limit, searchFields } = params;
      
      // Create a combined search config
      const filters: any = {};
      
      // Add path filters if provided
      if (paths && paths.length > 0) {
        filters.paths = paths;
      }
      
      // Add any specific search field filters
      if (searchFields && searchFields.length > 0) {
        // Map searchFields to ChromaDB filter fields if needed
      }
      
      // Execute combined search via ChromaDB service
      const searchResult = await this.searchService.combinedSearch(
        query,
        filters,
        limit || 10,
        0.6 // Lower threshold for content search
      );
      
      if (!searchResult.success || !searchResult.matches) {
        throw new Error(searchResult.error || 'Search failed');
      }
      
      // Convert ChromaDB results to SearchContentResult format
      const results = searchResult.matches.map(match => {
        // Extract frontmatter from metadata if available
        const frontmatter = match.metadata?.frontmatter || {};
        
        // Get content without frontmatter for snippet
        let snippetContent = match.content;
        // Trim the snippet to a reasonable length if it's too long
        if (snippetContent && snippetContent.length > 100) {
          snippetContent = snippetContent.substring(0, 97) + '...';
        }
        
        return {
          path: match.filePath,
          snippet: snippetContent,
          line: match.lineStart || 1,
          position: 0,
          score: match.similarity,
          frontmatter // Add frontmatter to results
        };
      });
      
      return {
        success: true,
        type: 'content',
        contentResults: {
          results,
          total: results.length,
          averageScore: this.calculateAverageScore(results),
          topResult: results.length > 0 ? results[0].path : undefined
        }
      };
    } catch (error) {
      console.error('Error in ChromaDB search:', error);
      
      // Fall back to standard search on ChromaDB error
      return this.executeStandardContentSearch(params);
    }
  }
  
  /**
   * Check if the search can be handled by ChromaDB
   * @param params Search parameters
   * @returns Whether ChromaDB can handle this search
   */
  private isChromaCompatibleSearch(params: SearchContentArgs): boolean {
    // For now, simple check if the search service is available
    // In the future, we could have more complex logic here
    return !!this.searchService;
  }
  
  /**
   * Execute standard content search
   * @param params Search parameters
   * @returns Search result using standard search
   */
  private async executeStandardContentSearch(params: SearchContentArgs): Promise<UnifiedSearchResult> {
    const { query, paths, limit, searchFields, weights } = params;
    
    // Always include metadata and content to properly separate frontmatter from snippets
    const includeMetadata = true;
    const includeContent = true;
    
    // Convert paths to a single path if needed
    const path = paths && paths.length > 0 ? paths[0] : undefined;
    
    // Use SearchOperations directly
    const utilResults = await this.searchOperations.search(query, {
      path,
      limit,
      includeMetadata,
      searchFields: searchFields || ['title', 'content', 'tags'],
      weights,
      includeContent,
      // Pass through graph boost parameters
      useGraphBoost: params.useGraphBoost,
      graphBoostFactor: params.graphBoostFactor,
      graphMaxDistance: params.graphMaxDistance,
      seedNotes: params.seedNotes
    });
    
    // Convert to VaultLibrarian search result format
    const results = utilResults.map(result => {
      // Find the best match to generate a snippet
      const bestMatch = result.matches.reduce((best, current) =>
        current.score > best.score ? current : best,
        { score: 0 } as any
      );
      
      // Generate snippet from content if available
      let snippet = '';
      let line = 1;
      let position = 0;
      
      if (result.content && bestMatch.term) {
        // Extract snippet from content (excluding frontmatter)
        const content = result.content;
        
        // Generate snippet from content (the helper will automatically handle frontmatter separation)
        snippet = this.searchOperations.getSnippet(content, bestMatch.term);
        
        // Calculate line and position
        const lines = content.split('\n');
        let currentPos = 0;
        
        for (let i = 0; i < lines.length; i++) {
          const lineText = lines[i];
          const linePos = lineText.toLowerCase().indexOf(bestMatch.term.toLowerCase());
          
          if (linePos !== -1) {
            line = i + 1;
            position = linePos;
            break;
          }
          
          currentPos += lineText.length + 1; // +1 for newline
        }
      } else {
        snippet = `Match found in ${result.file.path} (score: ${result.score.toFixed(2)})`;
      }
      
      return {
        path: result.file.path,
        snippet,
        line,
        position,
        score: result.score,
        frontmatter: result.metadata // Add frontmatter metadata
      };
    });
    
    // Enhanced result with more metadata
    return {
      success: true,
      type: 'content',
      contentResults: {
        results,
        total: results.length,
        averageScore: this.calculateAverageScore(results),
        topResult: results.length > 0 ? results[0].path : undefined
      }
    };
  }
  
  /**
   * Execute tag search
   * @param params Search parameters
   * @returns Promise that resolves with tag search results
   */
  private async executeTagSearch(params: UnifiedSearchParams): Promise<UnifiedSearchResult> {
    if (!params.tag) {
      throw new Error('Missing required parameter: tag');
    }
    
    // Convert to tag search parameters
    const tagParams: SearchTagArgs = {
      sessionId: params.sessionId,
      context: params.context || "Tag search",
      tag: params.tag,
      paths: params.paths,
      limit: params.limit
    };
    
    try {
      // Use the SearchOperations to find files with the tag
      const files = await this.searchOperations.searchByTag(tagParams.tag, {
        path: tagParams.paths && tagParams.paths.length > 0 ? tagParams.paths[0] : undefined,
        limit: tagParams.limit
      });
      
      // Convert to file paths
      const filePaths = files.map(file => file.path);
      
      return {
        success: true,
        type: 'tag',
        tagResults: {
          files: filePaths,
          total: filePaths.length
        }
      };
    } catch (error) {
      console.error('Error in tag search:', error);
      return {
        success: false,
        type: 'tag',
        error: error.message
      };
    }
  }
  
  /**
   * Execute property search
   * @param params Search parameters
   * @returns Promise that resolves with property search results
   */
  private async executePropertySearch(params: UnifiedSearchParams): Promise<UnifiedSearchResult> {
    if (!params.key) {
      throw new Error('Missing required parameter: key');
    }
    
    // Convert to property search parameters
    const propertyParams: SearchPropertyArgs = {
      sessionId: params.sessionId,
      context: params.context || "Property search",
      key: params.key,
      value: params.value,
      paths: params.paths,
      limit: params.limit
    };
    
    try {
      // Use the SearchOperations to find files with the property
      const results = await this.searchOperations.searchByProperty(
        propertyParams.key,
        propertyParams.value,
        {
          path: propertyParams.paths && propertyParams.paths.length > 0 ? propertyParams.paths[0] : undefined,
          limit: propertyParams.limit
        }
      );
      
      // Convert to property matches
      const files = results.map(file => {
        const cache = this.app.metadataCache.getFileCache(file);
        return {
          path: file.path,
          value: String(cache?.frontmatter?.[propertyParams.key] || '')
        };
      });
      
      return {
        success: true,
        type: 'property',
        propertyResults: {
          files,
          total: files.length
        }
      };
    } catch (error) {
      console.error('Error in property search:', error);
      return {
        success: false,
        type: 'property',
        error: error.message
      };
    }
  }
  
  /**
   * Calculate the average score of search results
   * @param results Search results
   * @returns Average score
   */
  private calculateAverageScore(results: any[]): number | undefined {
    if (results.length === 0) {
      return undefined;
    }
    
    // If results have a score property, calculate average
    if (results[0].score !== undefined) {
      const sum = results.reduce((total, result) => total + result.score, 0);
      return sum / results.length;
    }
    
    return undefined;
  }
  
  /**
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
    return {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session identifier to track related tool calls'
        },
        type: {
          type: 'string',
          enum: ['content', 'tag', 'property'],
          description: 'Type of search to perform (REQUIRED)'
        },
        query: {
          type: 'string',
          description: 'Query to search for (required for content search)'
        },
        tag: {
          type: 'string',
          description: 'Tag to search for (required for tag search)'
        },
        key: {
          type: 'string',
          description: 'Property key (required for property search)'
        },
        value: {
          type: 'string',
          description: 'Property value (optional for property search)'
        },
        paths: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Paths to search in (optional for all search types)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (optional for all search types)'
        },
        includeMetadata: {
          type: 'boolean',
          description: 'Whether to include metadata in the search (optional for content search)'
        },
        searchFields: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['title', 'content', 'tags', 'category', 'description']
          },
          description: 'Fields to search in (optional for content search)'
        },
        includeContent: {
          type: 'boolean',
          description: 'Whether to include content in the results (optional for content search)'
        },
        // Graph boost parameters
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
      required: ['type', 'sessionId', 'context'],
      allOf: [
        {
          if: {
            properties: {
              type: { enum: ['content'] }
            }
          },
          then: {
            required: ['query']
          }
        },
        {
          if: {
            properties: {
              type: { enum: ['tag'] }
            }
          },
          then: {
            required: ['tag']
          }
        },
        {
          if: {
            properties: {
              type: { enum: ['property'] }
            }
          },
          then: {
            required: ['key']
          }
        }
      ],
      description: 'Unified search for content, tags, or properties in the vault'
    };
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
        type: {
          type: 'string',
          enum: ['content', 'tag', 'property'],
          description: 'Type of search performed'
        },
        contentResults: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: {
                    type: 'string',
                    description: 'Path to the file'
                  },
                  snippet: {
                    type: 'string',
                    description: 'Snippet of content containing the match (excludes frontmatter)'
                  },
                  line: {
                    type: 'number',
                    description: 'Line number where the match was found'
                  },
                  position: {
                    type: 'number',
                    description: 'Position within the line where the match was found'
                  },
                  score: {
                    type: 'number',
                    description: 'Relevance score for the match'
                  },
                  frontmatter: {
                    type: 'object',
                    description: 'Frontmatter metadata from the file'
                  }
                }
              },
              description: 'Array of search results'
            },
            total: {
              type: 'number',
              description: 'Total number of results'
            },
            averageScore: {
              type: 'number',
              description: 'Average relevance score of results'
            },
            topResult: {
              type: 'string',
              description: 'Path to the top result'
            }
          },
          description: 'Content search results'
        },
        tagResults: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Array of file paths containing the tag'
            },
            total: {
              type: 'number',
              description: 'Total number of results'
            }
          },
          description: 'Tag search results'
        },
        propertyResults: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: {
                    type: 'string',
                    description: 'Path to the file'
                  },
                  value: {
                    type: 'string',
                    description: 'Value of the property'
                  }
                }
              },
              description: 'Array of property matches'
            },
            total: {
              type: 'number',
              description: 'Total number of results'
            }
          },
          description: 'Property search results'
        }
      },
      required: ['success', 'type'],
      description: 'Result of unified search in the vault'
    };
  }
}