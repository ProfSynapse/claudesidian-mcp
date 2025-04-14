import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { BatchSearchArgs, BatchSearchResult, SearchContentArgs, SearchContentResult } from '../types';
import { SearchOperations } from '../utils/SearchOperations';

/**
 * Mode for batch searching content in the vault
 */
export class BatchSearchMode extends BaseMode<BatchSearchArgs, BatchSearchResult> {
  private app: App;
  private searchOperations: SearchOperations;
  
  /**
   * Create a new BatchSearchMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'batchSearch',
      'Batch Search',
      'Search for multiple queries in the vault',
      '1.0.0'
    );
    
    this.app = app;
    this.searchOperations = new SearchOperations(app);
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the search results
   */
  async execute(params: BatchSearchArgs): Promise<BatchSearchResult> {
    // Validate queries array
    if (!params || !params.queries) {
      throw new Error('Missing required parameter: queries');
    }
    
    if (!Array.isArray(params.queries)) {
      throw new Error('Invalid queries parameter: must be an array');
    }
    
    const { queries } = params;
    
    // Log the queries for debugging
    console.log(`BatchSearchMode: Processing ${queries.length} queries`);
    
    // Validate each query
    const validatedQueries: SearchContentArgs[] = [];
    const errors: Record<string, string> = {};
    
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      
      if (!query || typeof query !== 'object') {
        errors[`index_${i}`] = `Invalid query at index ${i}: query must be an object`;
        continue;
      }
      
      if (!query.query || typeof query.query !== 'string') {
        errors[`index_${i}`] = `Invalid query at index ${i}: query.query must be a string`;
        continue;
      }
      
      validatedQueries.push(query);
    }
    
    // If there are validation errors and no valid queries, return the errors
    if (Object.keys(errors).length > 0 && validatedQueries.length === 0) {
      return {
        results: [],
        total: 0,
        errors
      };
    }
    
    // Execute the batch search operation with validated queries
    console.log(`BatchSearchMode: Searching ${validatedQueries.length} valid queries`);
    
    const results: SearchContentResult[] = [];
    
    // Process each query
    for (let i = 0; i < validatedQueries.length; i++) {
      try {
        const query = validatedQueries[i];
        
        // Convert paths to a single path if needed
        const path = query.paths && query.paths.length > 0 ? query.paths[0] : undefined;
        
        // Use SearchOperations to perform the search
        const utilResults = await this.searchOperations.search(query.query, {
          path,
          limit: query.limit,
          includeMetadata: query.includeMetadata !== false, // Default to true
          searchFields: query.searchFields || ['title', 'content', 'tags'],
          weights: query.weights,
          includeContent: query.includeContent || false
        });
        
        // Convert to VaultLibrarian search result format
        const searchResults = utilResults.map(result => {
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
            snippet = this.searchOperations.getSnippet(result.content, bestMatch.term);
            
            // Calculate line and position
            const lines = result.content.split('\n');
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
            score: result.score
          };
        });
        
        // Calculate average score
        const calculateAverageScore = (results: any[]): number | undefined => {
          if (results.length === 0) {
            return undefined;
          }
          
          if (results[0].score !== undefined) {
            const sum = results.reduce((total, result) => total + result.score, 0);
            return sum / results.length;
          }
          
          return undefined;
        };
        
        // Create the search result
        const searchResult: SearchContentResult = {
          results: searchResults,
          total: searchResults.length,
          averageScore: calculateAverageScore(searchResults),
          topResult: searchResults.length > 0 ? searchResults[0].path : undefined
        };
        
        results.push(searchResult);
      } catch (error) {
        console.error(`BatchSearchMode: Error processing query at index ${i}:`, error);
        errors[`index_${i}`] = error.message || `Failed to process query at index ${i}`;
      }
    }
    
    // Return the batch search results
    return {
      results,
      total: results.length,
      errors: Object.keys(errors).length > 0 ? errors : undefined
    };
  }
  
  /**
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
    return {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Query to search for'
              },
              paths: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Paths to search in (optional)'
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results to return (optional)'
              },
              includeMetadata: {
                type: 'boolean',
                description: 'Whether to include metadata in the search (optional, default: true)'
              },
              searchFields: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: ['title', 'content', 'tags', 'category', 'description']
                },
                description: 'Fields to search in (optional, default: ["title", "content", "tags"])'
              },
              includeContent: {
                type: 'boolean',
                description: 'Whether to include content in the results (optional, default: false)'
              }
            },
            required: ['query'],
            description: 'Search query parameters'
          },
          description: 'Array of search queries'
        }
      },
      required: ['queries'],
      description: 'Batch search for multiple queries in the vault'
    };
  }
}