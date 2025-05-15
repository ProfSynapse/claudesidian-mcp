import { WorkspaceMemoryTrace, HierarchyType } from './workspace-types';
import { IndexedDBWorkspaceDatabase } from './db/workspace-db';
import { EmbeddingProvider } from '../../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Class for creating and storing memory traces from tool activities
 */
export class ToolActivityEmbedder {
  private workspaceDb: IndexedDBWorkspaceDatabase;
  private embeddingProvider: EmbeddingProvider;
  
  /**
   * Create a new ToolActivityEmbedder
   * @param embeddingProvider Provider for generating embeddings
   */
  constructor(embeddingProvider: EmbeddingProvider) {
    this.workspaceDb = new IndexedDBWorkspaceDatabase();
    this.embeddingProvider = embeddingProvider;
  }
  
  /**
   * Initialize embedder
   */
  async initialize(): Promise<void> {
    await this.workspaceDb.initialize();
  }
  
  /**
   * Record a tool activity and create a memory trace
   * @param workspaceId Workspace ID
   * @param workspacePath Complete path from root workspace
   * @param activityType Type of activity
   * @param content Activity content
   * @param metadata Additional metadata
   * @param relatedFiles Files referenced in the activity
   */
  async recordActivity(
    workspaceId: string,
    workspacePath: string[],
    activityType: 'project_plan' | 'question' | 'checkpoint' | 'completion' | 'research',
    content: string,
    metadata: {
      tool: string;
      params: any;
      result: any;
    },
    relatedFiles: string[] = []
  ): Promise<string> {
    try {
      // Get the workspace to update its activity history
      const workspace = await this.workspaceDb.getWorkspace(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace with ID ${workspaceId} not found`);
      }
      
      // Determine context level from path
      let contextLevel: HierarchyType = 'workspace';
      if (workspacePath.length > 1) {
        const lastId = workspacePath[workspacePath.length - 1];
        const lastNode = await this.workspaceDb.getWorkspace(lastId);
        if (lastNode) {
          contextLevel = lastNode.hierarchyType;
        }
      }
      
      // Generate embedding for the content
      const embedding = await this.embeddingProvider.getEmbedding(content);
      
      // Calculate importance score (0-1)
      const importance = this.calculateImportance(content, activityType);
      
      // Generate descriptive tags
      const tags = await this.generateTags(content, activityType);
      
      // Create the memory trace
      const trace: WorkspaceMemoryTrace = {
        id: uuidv4(),
        workspaceId,
        workspacePath,
        contextLevel,
        timestamp: Date.now(),
        activityType,
        content,
        embedding,
        metadata: {
          ...metadata,
          relatedFiles
        },
        importance,
        tags
      };
      
      // Store the trace
      const traceId = await this.workspaceDb.storeMemoryTrace(trace);
      
      // Update the workspace's activity history
      await this.workspaceDb.addActivity(workspaceId, {
        timestamp: trace.timestamp,
        action: 'tool',
        toolName: metadata.tool,
        hierarchyPath: workspacePath
      });
      
      return traceId;
      
    } catch (error) {
      console.error('Failed to record activity:', error);
      throw error;
    }
  }
  
  /**
   * Calculate importance score for content
   * In a real implementation, this would use more sophisticated analysis
   * @param content Content to analyze
   * @param activityType Type of activity
   * @returns Importance score (0-1)
   */
  private calculateImportance(
    content: string,
    activityType: 'project_plan' | 'question' | 'checkpoint' | 'completion' | 'research'
  ): number {
    // Simple heuristics for importance
    let score = 0.5; // Base score
    
    // Activity type boosts
    if (activityType === 'project_plan') score += 0.2;
    if (activityType === 'checkpoint') score += 0.1;
    if (activityType === 'completion') score += 0.15;
    if (activityType === 'research') score += 0.1;
    
    // Content-based boosts
    if (content.length > 500) score += 0.1; // Longer content may be more important
    if (content.toLowerCase().includes('important') || 
        content.toLowerCase().includes('critical') ||
        content.toLowerCase().includes('essential')) {
      score += 0.15;
    }
    
    // Presence of decision markers
    if (content.toLowerCase().includes('decided') || 
        content.toLowerCase().includes('conclusion') ||
        content.toLowerCase().includes('resolved')) {
      score += 0.1;
    }
    
    // Cap at 0-1 range
    return Math.min(Math.max(score, 0), 1);
  }
  
  /**
   * Generate descriptive tags for content
   * In a real implementation, this would use AI to extract key concepts
   * @param content Content to analyze
   * @param activityType Type of activity
   * @returns Array of tags
   */
  private async generateTags(
    content: string,
    activityType: 'project_plan' | 'question' | 'checkpoint' | 'completion' | 'research'
  ): Promise<string[]> {
    // Basic tag extraction
    const tags = [activityType]; // Always include activity type
    
    // Extract potential keywords (very basic implementation)
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .split(/\s+/) // Split on whitespace
      .filter(w => w.length > 3) // Only words longer than 3 chars
      .filter(w => !this.isStopWord(w)); // Remove common stop words
    
    // Count word frequency
    const wordCounts = new Map<string, number>();
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
    
    // Sort by frequency
    const sortedWords = Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5) // Take top 5
      .map(([word]) => word);
    
    return [...tags, ...sortedWords];
  }
  
  /**
   * Check if a word is a common stop word
   * @param word Word to check
   * @returns True if it's a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'but', 'for', 'nor', 'yet', 'with', 'this', 'that', 'these', 'those',
      'them', 'they', 'their', 'what', 'which', 'who', 'whom', 'whose', 'when', 'where',
      'why', 'how', 'have', 'has', 'had', 'having', 'been', 'being', 'from', 'into'
    ]);
    return stopWords.has(word);
  }
  
  /**
   * Get recent memory traces for a workspace
   * @param workspaceId Workspace ID
   * @param limit Maximum number of traces to return
   */
  async getRecentTraces(workspaceId: string, limit = 10): Promise<WorkspaceMemoryTrace[]> {
    return this.workspaceDb.getMemoryTraces(workspaceId, limit);
  }
  
  /**
   * Search for related memory traces
   * @param workspaceId Workspace ID
   * @param query Text to find similar traces for
   * @param options Search options
   */
  async searchRelatedTraces(
    workspaceId: string,
    query: string,
    options: {
      workspacePath?: string[];
      limit?: number;
      threshold?: number;
    } = {}
  ): Promise<Array<{
    trace: WorkspaceMemoryTrace;
    similarity: number;
  }>> {
    try {
      // Generate embedding for the query
      const embedding = await this.embeddingProvider.getEmbedding(query);
      
      // Search for similar traces
      return this.workspaceDb.searchMemoryTraces(embedding, {
        workspaceId,
        workspacePath: options.workspacePath,
        limit: options.limit,
        threshold: options.threshold
      });
      
    } catch (error) {
      console.error('Failed to search related traces:', error);
      return [];
    }
  }
}