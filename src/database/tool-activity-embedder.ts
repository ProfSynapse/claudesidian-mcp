import { WorkspaceMemoryTrace, HierarchyType, WorkspaceSession } from './workspace-types';
import { IndexedDBWorkspaceDatabase } from './workspace-db';
import { EmbeddingProvider } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Class for creating and storing memory traces from tool activities
 */
export class ToolActivityEmbedder {
  private workspaceDb: IndexedDBWorkspaceDatabase;
  private embeddingProvider: EmbeddingProvider;
  private activeSessions: Map<string, string> = new Map(); // Map of workspaceId -> active sessionId
  private sequenceCounts: Map<string, number> = new Map(); // Map of sessionId -> current sequence count
  
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
    // Check if we have a valid embedding provider
    if (!this.embeddingProvider) {
      throw new Error("No embedding provider available. Embeddings may be disabled in settings.");
    }
    
    await this.workspaceDb.initialize();
    await this.loadActiveSessions();
  }
  
  /**
   * Load active sessions for all workspaces
   * Private method to initialize the active sessions map
   */
  private async loadActiveSessions(): Promise<void> {
    try {
      // Get all workspaces
      const workspaces = await this.workspaceDb.getWorkspaces();
      
      // For each workspace, check if there's an active session
      for (const workspace of workspaces) {
        const sessions = await this.workspaceDb.getSessions(workspace.id, true);
        if (sessions.length > 0) {
          // Use the most recently created active session
          const mostRecent = sessions.sort((a, b) => b.startTime - a.startTime)[0];
          this.activeSessions.set(workspace.id, mostRecent.id);
          this.sequenceCounts.set(mostRecent.id, 0);
        }
      }
    } catch (error) {
      console.error('Failed to load active sessions:', error);
    }
  }
  
  /**
   * Get the active session for a workspace
   * @param workspaceId Workspace ID
   * @returns Active session ID or undefined
   */
  getActiveSession(workspaceId: string): string | undefined {
    return this.activeSessions.get(workspaceId);
  }
  
  /**
   * Create a new session for a workspace
   * @param workspaceId Workspace ID
   * @param name Optional session name
   * @param description Optional session description
   * @returns New session ID
   */
  async createSession(workspaceId: string, name?: string, description?: string): Promise<string> {
    try {
      // End any existing active session for this workspace
      const existingSessionId = this.activeSessions.get(workspaceId);
      if (existingSessionId) {
        await this.endSession(existingSessionId);
      }
      
      // Create a new session
      const sessionId = uuidv4();
      const session: WorkspaceSession = {
        id: sessionId,
        workspaceId,
        startTime: Date.now(),
        isActive: true,
        name: name || `Session ${new Date().toLocaleString()}`,
        description,
        toolCalls: 0
      };
      
      // Store in database
      await this.workspaceDb.createSession(session);
      
      // Update local cache
      this.activeSessions.set(workspaceId, sessionId);
      this.sequenceCounts.set(sessionId, 0);
      
      return sessionId;
    } catch (error) {
      console.error('Failed to create session:', error);
      throw error;
    }
  }
  
  /**
   * End an active session
   * @param sessionId Session ID
   * @param summary Optional summary of the session
   */
  async endSession(sessionId: string): Promise<void> {
    try {
      // Get the session from the database
      const session = await this.workspaceDb.getSession(sessionId);
      if (!session) {
        throw new Error(`Session with ID ${sessionId} not found`);
      }
      
      // Only proceed if the session is active
      if (!session.isActive) {
        return;
      }
      
      // End the session
      await this.workspaceDb.endSession(sessionId);
      
      // Remove from active sessions map
      this.activeSessions.delete(session.workspaceId);
      this.sequenceCounts.delete(sessionId);
    } catch (error) {
      console.error('Failed to end session:', error);
      throw error;
    }
  }
  
  /**
   * Record a tool activity and create a memory trace
   * @param workspaceId Workspace ID
   * @param workspacePath Complete path from root workspace
   * @param activityType Type of activity
   * @param content Activity content
   * @param metadata Additional metadata
   * @param relatedFiles Files referenced in the activity
   * @param sessionId Optional specific session ID to associate with this activity (if not provided, the active session will be used)
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
    relatedFiles: string[] = [],
    sessionId?: string
  ): Promise<string> {
    try {
      // Get the workspace to update its activity history
      const workspace = await this.workspaceDb.getWorkspace(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace with ID ${workspaceId} not found`);
      }
      
      // Handle session tracking
      let activeSessionId = sessionId;
      
      // If no session specified, try to get the active session
      if (!activeSessionId) {
        activeSessionId = this.activeSessions.get(workspaceId);
        
        // If no active session, create one
        if (!activeSessionId) {
          activeSessionId = await this.createSession(workspaceId);
        }
      }
      
      // Increment sequence number for this session
      let sequenceNumber = 0;
      if (activeSessionId) {
        sequenceNumber = (this.sequenceCounts.get(activeSessionId) || 0) + 1;
        this.sequenceCounts.set(activeSessionId, sequenceNumber);
        
        // Also update the tool calls count in the session
        const session = await this.workspaceDb.getSession(activeSessionId);
        if (session) {
          await this.workspaceDb.updateSession(activeSessionId, {
            toolCalls: (session.toolCalls || 0) + 1
          });
        }
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
        tags,
        sessionId: activeSessionId,
        sequenceNumber
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
      sessionId?: string;
    } = {}
  ): Promise<Array<{
    trace: WorkspaceMemoryTrace;
    similarity: number;
  }>> {
    try {
      // Generate embedding for the query
      const embedding = await this.embeddingProvider.getEmbedding(query);
      
      // Search for similar traces
      const searchOptions: {
        workspaceId: string,
        workspacePath?: string[],
        limit?: number,
        threshold?: number,
        sessionId?: string
      } = {
        workspaceId
      };
      
      if (options.workspacePath) searchOptions.workspacePath = options.workspacePath;
      if (options.limit) searchOptions.limit = options.limit;
      if (options.threshold) searchOptions.threshold = options.threshold;
      if (options.sessionId) searchOptions.sessionId = options.sessionId;
      
      return this.workspaceDb.searchMemoryTraces(embedding, searchOptions);
      
    } catch (error) {
      console.error('Failed to search related traces:', error);
      return [];
    }
  }
  
  /**
   * Create a session state snapshot
   * @param name User-friendly name for the snapshot
   * @param description Optional description of the snapshot
   * @param sessionId Session ID to snapshot (required)
   * @returns The ID of the created snapshot
   */
  async createStateSnapshot(
    sessionIdOrWorkspaceId: string,
    name: string,
    description?: string,
    optionalSessionId?: string
  ): Promise<string> {
    try {
      let targetSessionId: string;
      let workspaceId: string;
      let workspace: any;
      
      // Handle different ways this method could be called
      if (optionalSessionId) {
        // If both are provided, use them directly
        targetSessionId = optionalSessionId;
        workspaceId = sessionIdOrWorkspaceId;
        
        // Get the workspace
        workspace = await this.workspaceDb.getWorkspace(workspaceId);
        if (!workspace) {
          console.warn(`Workspace ${workspaceId} not found, trying to get it from session`);
          const session = await this.workspaceDb.getSession(targetSessionId);
          if (session) {
            workspaceId = session.workspaceId;
            workspace = await this.workspaceDb.getWorkspace(workspaceId);
          }
        }
      } else {
        // Only one ID provided - determine if it's a session or workspace ID
        try {
          // First try to get it as a session ID
          const session = await this.workspaceDb.getSession(sessionIdOrWorkspaceId);
          if (session) {
            targetSessionId = sessionIdOrWorkspaceId;
            workspaceId = session.workspaceId;
            workspace = await this.workspaceDb.getWorkspace(workspaceId);
          } else {
            // If not a session, try as a workspace
            workspace = await this.workspaceDb.getWorkspace(sessionIdOrWorkspaceId);
            if (workspace) {
              workspaceId = sessionIdOrWorkspaceId;
              // Get the active session for this workspace
              targetSessionId = this.activeSessions.get(workspaceId) || "";
              if (!targetSessionId) {
                // Create a new session if none exists
                console.log(`No active session found for workspace ${workspaceId}, creating one`);
                targetSessionId = await this.createSession(
                  workspaceId,
                  `Session for state: ${name}`,
                  `Auto-created session for state "${name}"`
                );
              }
            } else {
              throw new Error(`Could not determine if ${sessionIdOrWorkspaceId} is a session or workspace ID`);
            }
          }
        } catch (error) {
          throw new Error(`Could not find session or workspace: ${error.message}`);
        }
      }
      
      // At this point we should have both a valid session ID and workspace
      if (!targetSessionId) {
        throw new Error('No session ID found or created');
      }
      
      if (!workspace) {
        throw new Error('Could not determine workspace for the session');
      }
      
      console.log(`Creating state snapshot for session ${targetSessionId} in workspace ${workspaceId}`);
      
      // Get recent traces for context
      let recentTraces: WorkspaceMemoryTrace[] = [];
      try {
        recentTraces = await this.workspaceDb.getSessionTraces(targetSessionId, 20);
        console.log(`Retrieved ${recentTraces.length} traces for session ${targetSessionId}`);
      } catch (traceError: any) {
        console.warn(`Failed to get session traces: ${traceError.message}`);
        console.warn('Continuing with empty traces');
        // Continue with empty traces rather than failing the whole operation
      }
      
      const recentTraceIds = recentTraces.map(trace => trace.id);
      
      // Extract key files from recent traces
      const contextFiles = new Set<string>();
      recentTraces.forEach(trace => {
        if (trace.metadata?.relatedFiles && Array.isArray(trace.metadata.relatedFiles)) {
          trace.metadata.relatedFiles.forEach((file: string) => contextFiles.add(file));
        }
      });
      
      // Create the snapshot object
      const snapshot = {
        id: uuidv4(),
        workspaceId,
        sessionId: targetSessionId,
        timestamp: Date.now(),
        name,
        description,
        state: {
          workspace: { ...workspace },
          recentTraces: recentTraceIds,
          contextFiles: Array.from(contextFiles),
          metadata: {
            snapshotCreationTime: new Date().toISOString(),
            recentTraceCount: recentTraceIds.length
          }
        }
      };
      
      // Store the snapshot
      return this.workspaceDb.createSnapshot(snapshot);
    } catch (error) {
      console.error('Failed to create state snapshot:', error);
      throw error;
    }
  }
  
  /**
   * Restore a workspace state from a snapshot
   * @param snapshotId Snapshot ID to restore
   * @returns The workspace ID of the restored workspace
   */
  async restoreStateSnapshot(snapshotId: string): Promise<string> {
    try {
      // Get the snapshot
      const snapshot = await this.workspaceDb.getSnapshot(snapshotId);
      if (!snapshot) {
        throw new Error(`Snapshot with ID ${snapshotId} not found`);
      }
      
      // Update the workspace with the snapshot state
      await this.workspaceDb.updateWorkspace(
        snapshot.workspaceId, 
        { ...snapshot.state.workspace }
      );
      
      // Create a new session for the restored state
      const sessionId = await this.createSession(
        snapshot.workspaceId,
        `Restored from ${snapshot.name}`,
        `Session restored from snapshot '${snapshot.name}' (${new Date(snapshot.timestamp).toLocaleString()})`
      );
      
      return snapshot.workspaceId;
    } catch (error) {
      console.error('Failed to restore state snapshot:', error);
      throw error;
    }
  }
}