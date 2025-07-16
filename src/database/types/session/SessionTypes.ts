/**
 * Session Types
 * Extracted from workspace-types.ts for better organization
 */

/**
 * Session tracking for workspace activities
 */
export interface WorkspaceSession {
  /**
   * Unique session identifier
   */
  id: string;
  
  /**
   * Associated workspace ID
   */
  workspaceId: string;
  
  /**
   * Session start time
   */
  startTime: number;
  
  /**
   * Session end time (if session is complete)
   */
  endTime?: number;
  
  /**
   * Whether the session is currently active
   */
  isActive: boolean;
  
  /**
   * Optional session name
   */
  name?: string;
  
  /**
   * Optional session description
   */
  description?: string;
  
  /**
   * Number of tool calls in this session
   */
  toolCalls: number;
  
  /**
   * Auto-generated summary of session activity
   */
  activitySummary?: string;
}

/**
 * Workspace state snapshot for persistence
 */
export interface WorkspaceStateSnapshot {
  /**
   * Unique snapshot identifier
   */
  id: string;
  
  /**
   * Associated workspace ID
   */
  workspaceId: string;
  
  /**
   * Associated session ID
   */
  sessionId: string;
  
  /**
   * Snapshot creation timestamp
   */
  timestamp: number;
  
  /**
   * User-friendly snapshot name
   */
  name: string;
  
  /**
   * Optional snapshot description
   */
  description?: string;
  
  /**
   * Snapshot state data
   */
  state: {
    /**
     * Workspace data at snapshot time
     */
    workspace: any; // Reference to ProjectWorkspace (to avoid circular dependency)
    
    /**
     * IDs of recent memory traces
     */
    recentTraces: string[];
    
    /**
     * Key files at snapshot time
     */
    contextFiles: string[];
    
    /**
     * Custom metadata for the snapshot
     */
    metadata: Record<string, any>;
  };
}