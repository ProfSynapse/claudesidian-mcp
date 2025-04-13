import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { SearchContentArgs, SearchContentResult } from '../types';
import { SearchOperations } from '../utils/SearchOperations';

/**
 * Tool for searching content in the vault
 */
export class SearchContentTool extends BaseTool<SearchContentArgs, SearchContentResult> {
  private app: App;
  private searchOperations: SearchOperations;
  
  /**
   * Create a new SearchContentTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'searchContent',
      'Search for content in the vault',
      '1.1.0'
    );
    
    this.app = app;
    this.searchOperations = new SearchOperations(app);
  }
  
  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the search results
   */
  async execute(args: SearchContentArgs): Promise<SearchContentResult> {
    const { query, paths, limit, includeMetadata = true, searchFields, weights, includeContent = false } = args;
    
    try {
      // Convert paths to a single path if needed
      const path = paths && paths.length > 0 ? paths[0] : undefined;
      
      // Use SearchOperations directly
      const utilResults = await this.searchOperations.search(query, {
        path,
        limit,
        includeMetadata,
        searchFields: searchFields || ['title', 'content', 'tags'],
        weights,
        includeContent
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
      
      // Enhanced result with more metadata
      return {
        results,
        total: results.length,
        // Add additional metadata
        averageScore: this.calculateAverageScore(results),
        topResult: results.length > 0 ? results[0].path : undefined
      };
    } catch (error) {
      console.error('Failed to search content:', error);
      
      return {
        results: [],
        total: 0
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
   * Get the JSON schema for the tool
   * @returns JSON schema object
   */
  getSchema(): any {
    return {
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
      description: 'Search for content in the vault with advanced options'
    };
  }
}