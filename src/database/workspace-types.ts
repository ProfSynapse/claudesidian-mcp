import { CommonParameters, CommonResult } from '../types';

/**
 * File embedding interface
 */
export interface FileEmbedding {
  /**
   * Unique identifier
   */
  id: string;
  
  /**
   * Path to the file
   */
  filePath: string;
  
  /**
   * Creation timestamp
   */
  timestamp: number;
  
  /**
   * Associated workspace ID (optional)
   */
  workspaceId?: string;
  
  /**
   * Embedding vector
   */
  vector: number[];
  
  /**
   * Additional metadata
   */
  metadata?: any;
}

/**
 * Hierarchical project workspace types
 * Supports workspace→phase→task structure
 */
export type HierarchyType = 'workspace' | 'phase' | 'task';

/**
 * Status types for workspaces
 */
export type WorkspaceStatus = 'active' | 'paused' | 'completed';

/**
 * Status types for individual items within a workspace
 */
export type ItemStatus = 'not_started' | 'in_progress' | 'completed';

/**
 * Project workspace interface
 * Defines a workspace, phase, or task within the workspace hierarchy
 */
export interface ProjectWorkspace {
  /**
   * Unique workspace identifier
   */
  id: string;
  
  /**
   * User-friendly name
   */
  name: string;
  
  /**
   * Optional description
   */
  description?: string;
  
  /**
   * Creation timestamp
   */
  created: number;
  
  /**
   * Last access timestamp
   */
  lastAccessed: number;
  
  /**
   * Hierarchy information
   */
  hierarchyType: HierarchyType;
  
  /**
   * Parent workspace/phase ID if applicable
   */
  parentId?: string;
  
  /**
   * IDs of child workspaces/phases/tasks
   */
  childWorkspaces: string[];
  
  /**
   * Path from root workspace to this node
   */
  path: string[];
  
  /**
   * Context boundaries
   */
  rootFolder: string;
  
  /**
   * Additional related folders
   */
  relatedFolders: string[];
  
  /**
   * Memory tuning parameters
   */
  relevanceSettings: {
    /**
     * Importance of folder proximity (0-1)
     */
    folderProximityWeight: number;
    
    /**
     * Importance of recency (0-1)
     */
    recencyWeight: number;
    
    /**
     * Importance of access frequency (0-1)
     */
    frequencyWeight: number;
  };
  
  /**
   * Lightweight activity tracking
   */
  activityHistory: Array<{
    timestamp: number;
    action: 'view' | 'edit' | 'create' | 'tool';
    toolName?: string;
    duration?: number;
    hierarchyPath?: string[];
  }>;
  
  /**
   * User-defined workspace preferences
   */
  preferences?: Record<string, any>;
  
  /**
   * Project management info
   */
  projectPlan?: string;
  
  /**
   * Project milestones/checkpoints
   */
  checkpoints?: Array<{
    id: string;
    date: number;
    description: string;
    completed: boolean;
    hierarchyPath?: string[];
  }>;
  
  /**
   * Task/phase progress tracking
   */
  completionStatus: Record<string, {
    status: ItemStatus;
    completedDate?: number;
    completionNotes?: string;
  }>;
  
  /**
   * Overall workspace status
   */
  status: WorkspaceStatus;
}

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
 * Memory trace for workspace activity
 * Records tool interactions with embedding for similarity search
 */
export interface WorkspaceMemoryTrace {
  /**
   * Unique identifier
   */
  id: string;
  
  /**
   * Associated workspace ID
   */
  workspaceId: string;
  
  /**
   * Full workspace path (main→phase→task)
   */
  workspacePath: string[];
  
  /**
   * Which level this applies to
   */
  contextLevel: HierarchyType;
  
  /**
   * When this interaction occurred
   */
  timestamp: number;
  
  /**
   * Type of project management activity
   */
  activityType: 'project_plan' | 'question' | 'checkpoint' | 'completion' | 'research';
  
  /**
   * The actual interaction content
   */
  content: string;
  
  /**
   * Vector representation for similarity search
   */
  embedding: number[];
  
  /**
   * Additional information about the interaction
   */
  metadata: {
    tool: string;
    params: any;
    result: any;
    relatedFiles: string[];
  };
  
  /**
   * Auto-scored importance (0-1)
   */
  importance: number;
  
  /**
   * Automatically generated descriptive tags
   */
  tags: string[];
  
  /**
   * Associated session ID (if created during a session)
   */
  sessionId?: string;
  
  /**
   * Sequence number within the session (for ordering)
   */
  sequenceNumber?: number;
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
    workspace: ProjectWorkspace;
    
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

/**
 * In-memory cache for workspace data
 */
export interface WorkspaceCache {
  /**
   * Hot cache (in-memory, limited size, instant access)
   */
  hotCache: Map<string, {
    embedding: number[];
    metadata: any;
    lastAccessed: number;
    accessCount: number;
  }>;
  
  /**
   * IndexedDB store prefix for this workspace
   */
  warmCachePrefix: string;
  
  /**
   * Usage statistics
   */
  cacheHits: number;
  cacheMisses: number;
  
  /**
   * Cache management settings
   */
  maxHotCacheSize: number;
  pruneThreshold: number;
}

/**
 * Parameter interface for workspace operations
 */
export interface WorkspaceParameters extends CommonParameters {
  /**
   * Context depth for operations
   * - minimal: Just basic information
   * - standard: Regular level of detail (default)
   * - comprehensive: Maximum detail and context
   */
  contextDepth?: 'minimal' | 'standard' | 'comprehensive';
}

/**
 * Result interface for workspace operations
 */
export interface WorkspaceResult extends CommonResult {
  data?: {
    workspace?: ProjectWorkspace;
    context?: {
      recentFiles: string[];
      keyFiles: string[];
      relatedConcepts: string[];
      allFiles?: string[];
    };
    summary?: string;
  };
}

/**
 * List workspaces parameters
 */
export interface ListWorkspacesParameters extends WorkspaceParameters {
  sortBy?: 'name' | 'created' | 'lastAccessed';
  order?: 'asc' | 'desc';
  parentId?: string;
  hierarchyType?: HierarchyType;
}

/**
 * List workspaces result
 */
export interface ListWorkspacesResult extends CommonResult {
  data: {
    workspaces: Array<{
      id: string;
      name: string;
      description?: string;
      rootFolder: string;
      lastAccessed: number;
      status: WorkspaceStatus;
      hierarchyType: HierarchyType;
      parentId?: string;
      childCount: number;
    }>;
  };
}

/**
 * Create workspace parameters
 */
export interface CreateWorkspaceParameters extends WorkspaceParameters {
  name: string;
  description?: string;
  rootFolder: string;
  relatedFolders?: string[];
  preferences?: Record<string, any>;
  hierarchyType?: HierarchyType;
  parentId?: string;
}

/**
 * Create workspace result
 */
export interface CreateWorkspaceResult extends WorkspaceResult {
  data: {
    workspaceId: string;
    workspace: ProjectWorkspace;
  };
}

/**
 * Edit workspace parameters
 */
export interface EditWorkspaceParameters extends WorkspaceParameters {
  id: string;
  name?: string;
  description?: string;
  rootFolder?: string;
  relatedFolders?: string[];
  preferences?: Record<string, any>;
  status?: WorkspaceStatus;
  parentId?: string;
}

/**
 * Delete workspace parameters
 */
export interface DeleteWorkspaceParameters extends WorkspaceParameters {
  id: string;
  deleteChildren?: boolean;
  preserveSettings?: boolean;
}

/**
 * Load workspace parameters
 */
export interface LoadWorkspaceParameters extends WorkspaceParameters {
  id: string;
  contextDepth?: 'minimal' | 'standard' | 'comprehensive';
  includeChildren?: boolean;
  specificPhaseId?: string;
}

/**
 * Load workspace result
 */
export interface LoadWorkspaceResult extends CommonResult {
  data: {
    workspace?: {
      id: string;
      name: string;
      description?: string;
      rootFolder: string;
      summary: string;
      hierarchyType: HierarchyType;
      path: string[];
      children?: Array<{
        id: string;
        name: string;
        hierarchyType: HierarchyType;
      }>;
    };
    context: {
      recentFiles: string[];
      keyFiles: string[];
      relatedConcepts: string[];
      allFiles: string[];
    };
  };
}