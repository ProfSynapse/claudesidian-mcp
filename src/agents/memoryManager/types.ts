import { CommonParameters, CommonResult } from '../../types';
import { 
  WorkspaceParameters, 
  WorkspaceResult, 
  WorkspaceMemoryTrace, 
  WorkspaceStateSnapshot,
  WorkspaceSession
} from '../../database/workspace-types';

/**
 * Base parameters for memory management operations
 */
export interface MemoryParameters extends WorkspaceParameters {
  /**
   * Optional context depth for memory operations
   * - minimal: Just basic information
   * - standard: Regular level of detail (default)
   * - comprehensive: Maximum detail and context
   */
  contextDepth?: 'minimal' | 'standard' | 'comprehensive';
}

/**
 * Base result for memory management operations
 */
export interface MemoryResult extends CommonResult {
  /**
   * Optional contextual information about the memory operation
   */
  context?: {
    /**
     * When the operation occurred
     */
    timestamp: number;
    
    /**
     * Tags associated with this memory operation
     */
    tags?: string[];
  };
}

/**
 * Session-related parameter and result types
 */

// Parameters for creating a session
export interface CreateSessionParams extends MemoryParameters {
  /**
   * Session name (optional, generates default if not provided)
   */
  name?: string;
  
  /**
   * Session description (optional)
   */
  description?: string;
  
  /**
   * Whether to generate an initial memory trace with session context (default: true)
   */
  generateContextTrace?: boolean;
  
  /**
   * The goal or purpose of this session (for memory context)
   */
  sessionGoal?: string;
  
  /**
   * Reference to previous session ID to establish continuity
   */
  previousSessionId?: string;
  
  /**
   * Tags to associate with this session
   */
  tags?: string[];
}

// Parameters for listing sessions
export interface ListSessionsParams extends MemoryParameters {
  /**
   * Whether to only include active sessions
   */
  activeOnly?: boolean;
  
  /**
   * Maximum number of sessions to return
   */
  limit?: number;
  
  /**
   * Sort order for sessions (default: desc - newest first)
   */
  order?: 'asc' | 'desc';
  
  /**
   * Filter sessions by tags
   */
  tags?: string[];
}

// Parameters for editing a session
export interface EditSessionParams extends MemoryParameters {
  /**
   * ID of the session to edit
   */
  sessionId: string;
  
  /**
   * New session name (optional)
   */
  name?: string;
  
  /**
   * New session description (optional)
   */
  description?: string;
  
  /**
   * New session goal (optional)
   */
  sessionGoal?: string;
  
  /**
   * Whether the session is active or completed
   */
  isActive?: boolean;
  
  /**
   * Add additional tags to session
   */
  addTags?: string[];
  
  /**
   * Remove specific tags from session
   */
  removeTags?: string[];
}

// Parameters for deleting a session
export interface DeleteSessionParams extends MemoryParameters {
  /**
   * ID of the session to delete
   */
  sessionId: string;
  
  /**
   * Whether to also delete associated memory traces
   */
  deleteMemoryTraces?: boolean;
  
  /**
   * Whether to also delete associated states/snapshots
   */
  deleteAssociatedStates?: boolean;
}

// Result for session operations
export interface SessionResult extends MemoryResult {
  data?: {
    /**
     * Session ID
     */
    sessionId?: string;
    
    /**
     * Session name
     */
    name?: string;
    
    /**
     * Session description
     */
    description?: string;
    
    /**
     * Workspace ID
     */
    workspaceId?: string;
    
    /**
     * Session start time
     */
    startTime?: number;
    
    /**
     * Session end time (if completed)
     */
    endTime?: number;
    
    /**
     * Whether the session is active
     */
    isActive?: boolean;
    
    /**
     * List of sessions (for listing operations)
     */
    sessions?: Array<{
      id: string;
      name: string;
      workspaceId: string;
      startTime: number;
      endTime?: number;
      isActive: boolean;
      description?: string;
      toolCalls: number;
      tags?: string[];
    }>;
  };
}

/**
 * State-related parameter and result types
 */

// Parameters for creating a state
export interface CreateStateParams extends MemoryParameters {
  /**
   * State name
   */
  name: string;
  
  /**
   * State description (optional)
   */
  description?: string;
  
  /**
   * Target session ID (optional, uses active session if not provided)
   * This is different from the top-level sessionId which is for tracking tool calls
   */
  targetSessionId?: string;
  
  /**
   * Whether to include state summary
   */
  includeSummary?: boolean;
  
  /**
   * Whether to include files content in the state
   */
  includeFileContents?: boolean;
  
  /**
   * Maximum number of files to include
   */
  maxFiles?: number;
  
  /**
   * Maximum number of memory traces to include
   */
  maxTraces?: number;
  
  /**
   * Tags to associate with this state
   */
  tags?: string[];
  
  /**
   * Reason for creating this state
   */
  reason?: string;
}

// Parameters for listing states
export interface ListStatesParams extends MemoryParameters {
  /**
   * Whether to include state context information
   */
  includeContext?: boolean;
  
  /**
   * Maximum number of states to return
   */
  limit?: number;
  
  /**
   * Filter states by target session ID
   */
  targetSessionId?: string;
  
  /**
   * Sort order for states (default: desc - newest first)
   */
  order?: 'asc' | 'desc';
  
  /**
   * Filter states by tags
   */
  tags?: string[];
}

// Parameters for loading a state
export interface LoadStateParams extends MemoryParameters {
  /**
   * ID of the state to load
   */
  stateId: string;
  
  /**
   * Custom name for the new continuation session (optional)
   */
  sessionName?: string;
  
  /**
   * Custom description for the new continuation session (optional)
   */
  sessionDescription?: string;
  
  /**
   * Restoration goal - what the user intends to do after restoring
   */
  restorationGoal?: string;
  
  /**
   * Whether to automatically start a new session (default: true)
   */
  createContinuationSession?: boolean;
  
  /**
   * Tags to associate with the continuation session
   */
  tags?: string[];
}

// Parameters for editing a state
export interface EditStateParams extends MemoryParameters {
  /**
   * ID of the state to edit
   */
  stateId: string;
  
  /**
   * New state name (optional)
   */
  name?: string;
  
  /**
   * New state description (optional)
   */
  description?: string;
  
  /**
   * Add additional tags to state
   */
  addTags?: string[];
  
  /**
   * Remove specific tags from state
   */
  removeTags?: string[];
}

// Parameters for deleting a state
export interface DeleteStateParams extends MemoryParameters {
  /**
   * ID of the state to delete
   */
  stateId: string;
}

// Result for state operations
export interface StateResult extends MemoryResult {
  data?: {
    /**
     * State ID
     */
    stateId?: string;
    
    /**
     * State name
     */
    name?: string;
    
    /**
     * State description
     */
    description?: string;
    
    /**
     * Workspace ID
     */
    workspaceId?: string;
    
    /**
     * Session ID
     */
    sessionId?: string;
    
    /**
     * Creation timestamp
     */
    timestamp?: number;
    
    /**
     * New session ID when loading a state
     */
    newSessionId?: string;
    
    /**
     * List of states (for listing operations)
     */
    states?: Array<{
      id: string;
      name: string;
      workspaceId: string;
      sessionId: string;
      timestamp: number;
      description?: string;
      context?: {
        files: string[];
        traceCount: number;
        tags: string[];
        summary?: string;
      };
    }>;
    
    /**
     * Total number of states matching criteria before limit applied
     */
    total?: number;
    
    /**
     * Context information for the restored state
     */
    restoredContext?: {
      summary: string;
      relevantFiles: string[];
      stateCreatedAt: string;
      originalSessionId: string;
      continuationHistory?: Array<{
        timestamp: number;
        description: string;
      }>;
      tags: string[];
    };
  };
}