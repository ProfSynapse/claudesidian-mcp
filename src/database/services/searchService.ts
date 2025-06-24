import { App, Plugin } from 'obsidian';
import { parseWorkspaceContext } from '../../utils/contextUtils';
import { EmbeddingService } from './EmbeddingService';
import { SemanticSearchService } from './SemanticSearchService';
import { MemoryService } from './MemoryService';
import ClaudesidianPlugin from '../../main';
import { getErrorMessage } from '../../utils/errorUtils';

/**
 * Handles semantic and combined search operations using ChromaDB
 * Updated to use the new SemanticSearchService instead of ChromaSearchService
 */
export class SearchService {
  private app: App;
  private plugin: ClaudesidianPlugin;
  // The plugin property is used for initialization in the constructor
  private embeddingService: EmbeddingService;
  private semanticSearchService: SemanticSearchService;
  private memoryService: MemoryService;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin as ClaudesidianPlugin;
    
    // Get the new services from the plugin
    this.embeddingService = this.plugin.services?.embeddingService;
    this.semanticSearchService = this.plugin.services?.semanticSearchService;
    this.memoryService = this.plugin.services?.memoryService;
  }

  /**
   * Perform semantic search across the vault using ChromaDB
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
    threshold?: number,
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
      // Ensure ChromaDB services are available
      if (!this.semanticSearchService || !this.embeddingService) {
        // Try to get services from the plugin if not available
        const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
        if (plugin?.services) {
          this.semanticSearchService = plugin.services.semanticSearchService;
          this.embeddingService = plugin.services.embeddingService;
          this.memoryService = plugin.services.memoryService;
        }
      }
      
      if (!this.semanticSearchService || !this.embeddingService) {
        return {
          success: false,
          error: 'Semantic search services are not available. Please restart Obsidian.'
        };
      }
      
      // Check if embeddings are enabled
      if (!this.embeddingService.areEmbeddingsEnabled()) {
        return {
          success: false,
          error: 'Embeddings functionality is currently disabled. Please enable embeddings and provide a valid API key in settings to use semantic search.'
        };
      }
      
      // Validate input parameters
      if (!query || query.trim().length === 0) {
        throw new Error('Query text is required');
      }
      
      // Ensure limit is a positive number
      limit = Math.max(1, Math.min(50, limit));
      
      // Use semantic threshold from settings if not provided
      if (threshold === undefined) {
        threshold = this.plugin.settings?.settings?.memory?.semanticThreshold ?? 0.5;
      }
      
      // Ensure threshold is between 0 and 1, and handle undefined case
      threshold = Math.max(0, Math.min(1, threshold ?? 0.5));
      
      // Parse workspace context
      const workspaceContext = parseWorkspaceContext(params?.workspaceContext);
      const workspaceId = workspaceContext?.workspaceId;
      
      // SessionId might be passed through params directly or through workspaceContext
      const sessionId = params?.sessionId || (params?.workspaceContext as any)?.sessionId;
      
      // Use SemanticSearchService directly
      const searchParams = {
        query: query.trim(),
        workspaceId: workspaceId,
        sessionId: sessionId,
        limit: limit * (useGraphBoost ? 2 : 1), // Get more results when using graph boost
        threshold: threshold,
        useGraphBoost: useGraphBoost,
        graphBoostFactor: graphBoostFactor
      };
      
      // Perform search
      const searchResult = await this.semanticSearchService.semanticSearch(searchParams.query, {
        workspaceId: searchParams.workspaceId,
        sessionId: searchParams.sessionId,
        limit: searchParams.limit,
        threshold: searchParams.threshold,
        useGraphBoost: searchParams.useGraphBoost,
        graphBoostFactor: searchParams.graphBoostFactor
      });
      
      if (!searchResult.success || !searchResult.matches) {
        return searchResult;
      }
      
      // Format the results to match the expected return format
      let matches = searchResult.matches.map(match => ({
        similarity: match.similarity,
        content: match.content,
        filePath: match.filePath,
        lineStart: match.metadata?.lineStart || 0,
        lineEnd: match.metadata?.lineEnd || 0,
        metadata: {
          frontmatter: match.metadata?.frontmatter || {},
          tags: match.metadata?.tags || [],
          links: {
            outgoing: match.metadata?.links?.outgoing || [],
            incoming: match.metadata?.links?.incoming || []
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
          const recordsWithSimilarity = matches.map(match => ({
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
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);
        } catch (boostError) {
          console.error('Error applying graph boost:', boostError);
          // Continue with unboosted results
        }
      }
      
      // Record this activity if in a workspace context
      if (workspaceId && this.memoryService) {
        try {
          await this.memoryService.recordActivityTrace(
            workspaceId,
            {
              type: 'research',
              content: `Semantic search for "${query.trim()}" found ${matches.length} results`,
              metadata: {
                tool: 'SemanticSearchMode',
                params: {
                  query: query.trim(),
                  limit,
                  threshold
                },
                result: {
                  success: true,
                  matchCount: matches.length
                },
                relatedFiles: matches.map(m => m.filePath)
              },
              sessionId: params?.sessionId || (params?.workspaceContext as any)?.sessionId
            }
          );
        } catch (error) {
          console.error('Error recording search activity:', error);
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
        error: `Error performing semantic search: ${getErrorMessage(error)}`
      };
    }
  }

  /**
   * Combine semantic search with metadata filtering using ChromaDB
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
    threshold?: number
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
      // Use semantic threshold from settings if not provided
      if (threshold === undefined) {
        threshold = this.plugin.settings?.settings?.memory?.semanticThreshold ?? 0.5;
      }
      
      // Ensure threshold is valid
      threshold = threshold ?? 0.5;
      
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
        error: `Error performing combined search: ${getErrorMessage(error)}`
      };
    }
  }
}