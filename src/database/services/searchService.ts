import { App } from 'obsidian';
import { EmbeddingManager } from './embeddingManager';
import { parseWorkspaceContext } from '../../utils/contextUtils';

/**
 * Handles semantic and combined search operations
 */
export class SearchService {
  private app: App;
  private embeddingManager: EmbeddingManager;

  constructor(app: App, embeddingManager: EmbeddingManager) {
    this.app = app;
    this.embeddingManager = embeddingManager;
  }

  /**
   * Perform semantic search across the vault
   * @param query Query text to search for
   * @param limit Maximum number of results to return
   * @param threshold Minimum similarity threshold (0-1)
   * @param useGraphBoost Whether to use graph boosting (default: false)
   * @param graphBoostFactor Graph boost factor between 0-1 (default: 0.3)
   * @param graphMaxDistance Maximum distance for graph connections (default: 1)
   * @param seedNotes Optional list of seed note paths to prioritize
   * @param params Optional params including workspace context
   */
  async semanticSearch(
    query: string, 
    limit: number = 10, 
    threshold: number = 0.7,
    useGraphBoost: boolean = false,
    graphBoostFactor: number = 0.3,
    graphMaxDistance: number = 1,
    seedNotes: string[] = [],
    params?: any
  ): Promise<{
    success: boolean;
    matches?: Array<{
      similarity: number;
      content: string;
      filePath: string;
      lineStart: number;
      lineEnd: number;
      metadata?: {
        frontmatter?: Record<string, unknown>;
        tags?: string[];
        links?: {
          outgoing?: Array<{displayText: string; targetPath: string}>;
          incoming?: Array<{sourcePath: string; displayText: string}>;
        };
      };
    }>;
    error?: string;
  }> {
    try {
      // Check if embeddings are enabled and provider exists
      if (!this.embeddingManager.areEmbeddingsEnabled()) {
        return {
          success: false,
          error: 'Embeddings functionality is currently disabled or no provider is available. Please enable embeddings and provide a valid API key in settings to use semantic search.'
        };
      }
      
      // Validate input parameters
      if (!query || query.trim().length === 0) {
        throw new Error('Query text is required');
      }
      
      // Ensure limit is a positive number
      limit = Math.max(1, Math.min(50, limit));
      
      // Ensure threshold is between 0 and 1
      threshold = Math.max(0, Math.min(1, threshold));
      
      // Check if we have a valid OpenAI API key
      if (!this.embeddingManager.getSettings()?.openaiApiKey) {
        console.warn('No OpenAI API key available for semantic search. Results may not be accurate.');
      }
      
      // 1. Convert the query to an embedding vector
      const queryEmbedding = await this.embeddingManager.getEmbedding(query.trim());
      if (!queryEmbedding) {
        throw new Error('Failed to generate embedding for query');
      }
      
      // 2. Use workspace-db to search for similar content
      const plugin = (this.app as any).plugins?.getPlugin('claudesidian-mcp');
      const workspaceDb = plugin?.workspaceDb || plugin?.services?.workspaceDb;
      if (!workspaceDb) {
        console.error('Workspace database not found on plugin or services');
        throw new Error('Workspace database not available');
      }
      
      // Initialize database if needed
      if (!workspaceDb.db && typeof workspaceDb.initialize === 'function') {
        try {
          await workspaceDb.initialize();
          console.log("Initialized workspace database on demand");
        } catch (initError) {
          console.error("Failed to initialize workspace database on demand:", initError);
          throw new Error('Failed to initialize workspace database: ' + initError.message);
        }
      }
      
      // Get search results from the database
      const searchResults = await workspaceDb.searchMemoryTraces(queryEmbedding, {
        workspaceId: params?.workspaceContext?.workspaceId,
        workspacePath: params?.workspaceContext?.workspacePath,
        sessionId: params?.workspaceContext?.sessionId,
        limit: limit * (useGraphBoost ? 2 : 1), // Get more results when using graph boost
        threshold: threshold
      });
      
      // 3. Format the results
      let matches = searchResults.map((result: any) => ({
        similarity: result.similarity,
        content: result.content,
        filePath: result.filePath,
        lineStart: result.metadata?.lineStart || 0,
        lineEnd: result.metadata?.lineEnd || 0,
        metadata: {
          frontmatter: result.metadata?.frontmatter || {},
          tags: result.metadata?.tags || [],
          links: {
            outgoing: result.metadata?.links?.outgoing || [],
            incoming: result.metadata?.links?.incoming || []
          }
        }
      }));
      
      // 4. Apply graph boosting if enabled
      if (useGraphBoost && matches.length > 0) {
        try {
          // Import dynamically to avoid circular dependencies
          const { GraphOperations } = await import('../utils/graph/GraphOperations');
          const graphOps = new GraphOperations();
          
          // Convert to format expected by GraphOperations
          const recordsWithSimilarity = matches.map((match: any) => ({
            record: {
              id: match.filePath,
              filePath: match.filePath,
              content: match.content,
              metadata: match.metadata || {}
            },
            similarity: match.similarity
          }));
          
          // Apply graph boost
          const boostedRecords = graphOps.applyGraphBoost(
            recordsWithSimilarity,
            {
              useGraphBoost,
              boostFactor: graphBoostFactor,
              maxDistance: graphMaxDistance,
              seedNotes
            }
          );
          
          // Convert back to original format
          matches = boostedRecords.map(item => ({
            similarity: item.similarity,
            content: item.record.content,
            filePath: item.record.filePath,
            lineStart: item.record.metadata?.lineStart || 0,
            lineEnd: item.record.metadata?.lineEnd || 0,
            metadata: {
              frontmatter: item.record.metadata?.frontmatter || {},
              tags: item.record.metadata?.tags || [],
              links: item.record.metadata?.links || {
                outgoing: [],
                incoming: []
              }
            }
          }));
          
          // Re-sort by similarity and limit results
          matches = matches
            .sort((a: any, b: any) => b.similarity - a.similarity)
            .slice(0, limit);
        } catch (boostError) {
          console.error('Error applying graph boost:', boostError);
          // Continue with unboosted results
        }
      }
      
      // Return the results
      return {
        success: true,
        matches
      };
    } catch (error) {
      console.error('Error in semantic search:', error);
      return {
        success: false,
        error: `Error performing semantic search: ${error.message}`
      };
    }
  }

  /**
   * Combine semantic search with metadata filtering
   * @param query Query text to search for
   * @param filters Optional filters to apply to results
   * @param limit Maximum number of results to return
   * @param threshold Minimum similarity threshold (0-1)
   */
  async combinedSearch(
    query: string, 
    filters: {
      tags?: string[];
      paths?: string[];
      properties?: Record<string, any>;
      dateRange?: {
        start?: string;
        end?: string;
      };
      graphOptions?: {
        useGraphBoost?: boolean;
        boostFactor?: number;
        maxDistance?: number;
        seedNotes?: string[];
      };
    } = {},
    limit: number = 10,
    threshold: number = 0.7
  ): Promise<{
    success: boolean;
    matches?: Array<{
      similarity: number;
      content: string;
      filePath: string;
      lineStart: number;
      lineEnd: number;
      metadata?: any;
    }>;
    error?: string;
  }> {
    try {
      // Check if embeddings are enabled and provider exists
      if (!this.embeddingManager.areEmbeddingsEnabled()) {
        return {
          success: false,
          error: 'Embeddings functionality is currently disabled or no provider is available. Please enable embeddings and provide a valid API key in settings to use semantic search.'
        };
      }
      
      // Extract graph options
      const graphOptions = filters.graphOptions || {};
      
      // Perform semantic search first
      const semanticResults = await this.semanticSearch(
        query, 
        limit * 2, 
        threshold,
        graphOptions.useGraphBoost || false,
        graphOptions.boostFactor || 0.3,
        graphOptions.maxDistance || 1,
        graphOptions.seedNotes || []
      );
      
      if (!semanticResults.success || !semanticResults.matches) {
        return semanticResults;
      }
      
      // Apply filters to the results
      let filtered = semanticResults.matches;
      
      // Filter by tags
      if (filters.tags && filters.tags.length > 0) {
        filtered = filtered.filter(m => {
          const fileTags = m.metadata?.tags || [];
          return filters.tags!.some(tag => fileTags.includes(tag));
        });
      }
      
      // Filter by paths
      if (filters.paths && filters.paths.length > 0) {
        filtered = filtered.filter(m => {
          return filters.paths!.some(path => m.filePath.startsWith(path));
        });
      }
      
      // Filter by properties
      if (filters.properties && Object.keys(filters.properties).length > 0) {
        filtered = filtered.filter(m => {
          const frontmatter = m.metadata?.frontmatter || {};
          return Object.entries(filters.properties!).every(([key, value]) => {
            if (Array.isArray(value)) {
              return value.includes(frontmatter[key]);
            }
            return frontmatter[key] === value;
          });
        });
      }
      
      // Filter by date range
      if (filters.dateRange) {
        const { start, end } = filters.dateRange;
        if (start || end) {
          const startDate = start ? new Date(start).getTime() : 0;
          const endDate = end ? new Date(end).getTime() : Date.now();
          
          filtered = filtered.filter(m => {
            const created = m.metadata?.frontmatter?.created;
            if (!created) return true; // Skip if no date
            
            // Handle different types that 'created' might be
            const fileDate = created && (typeof created === 'string' || typeof created === 'number' || created instanceof Date)
                ? new Date(created as string | number | Date).getTime() 
                : 0;
            return fileDate >= startDate && fileDate <= endDate;
          });
        }
      }
      
      // Limit results
      filtered = filtered.slice(0, limit);
      
      return {
        success: true,
        matches: filtered
      };
    } catch (error) {
      return {
        success: false,
        error: `Error performing combined search: ${error.message}`
      };
    }
  }
}