import { CommonParameters, CommonResult } from '../types';
import { DirectoryTreeNode } from '../utils/directoryTreeUtils';

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
   * The text content that was embedded (optional)
   */
  content?: string;
  
  /**
   * Chunk index when file content is split into multiple chunks (0-based)
   */
  chunkIndex?: number;
  
  /**
   * Total number of chunks for this file
   */
  totalChunks?: number;
  
  /**
   * Content hash for identifying this chunk
   */
  chunkHash?: string;
  
  /**
   * Semantic boundary type (paragraph, heading, code-block, list)
   */
  semanticBoundary?: 'paragraph' | 'heading' | 'code-block' | 'list' | 'unknown';
  
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
   * Additional individual files to include in workspace context
   * These files are included regardless of their folder location
   */
  relatedFiles?: string[];
  
  /**
   * Associated notes that are automatically tracked when accessed during workspace sessions
   * These are files OUTSIDE the workspace folder that have been read/accessed while this workspace was active
   * Persisted permanently with the workspace (unlike session-derived associated notes)
   */
  associatedNotes?: string[];
  
  /**
   * Instructions for key file designation within workspace
   * Explains how to mark files as key files in frontmatter or by filename
   */
  keyFileInstructions?: string;
  
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
    context?: string;
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
  relatedFiles?: string[];
  preferences?: Record<string, any>;
  hierarchyType?: HierarchyType;
  parentId?: string;
  /**
   * Instructions for how to designate key files within this workspace
   * This will be displayed to AI to help it correctly mark or identify key files
   */
  keyFileInstructions?: string;
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
  relatedFiles?: string[];
  preferences?: Record<string, any>;
  status?: WorkspaceStatus;
  parentId?: string;
  /**
   * Instructions for how to designate key files within this workspace
   * This will be displayed to AI to help it correctly mark or identify key files
   */
  keyFileInstructions?: string;
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
  /**
   * Whether to include directory structure in the result
   */
  includeDirectoryStructure?: boolean;
  /**
   * Maximum depth for directory tree traversal (0 = unlimited)
   */
  directoryTreeMaxDepth?: number;
  /**
   * Maximum number of recent files to return (default: 5)
   */
  recentFilesLimit?: number;
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
      keyFileInstructions?: string;
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
      /**
       * Files associated with the workspace that are OUTSIDE the workspace root folder
       */
      associatedNotes: string[];
      /**
       * Sessions associated with this workspace
       */
      sessions: Array<{
        id: string;
        name: string;
        isActive: boolean;
        startTime: number;
        endTime?: number;
      }>;
      /**
       * Saved states associated with this workspace
       */
      states: Array<{
        id: string;
        name: string;
        timestamp: number;
      }>;
      /**
       * Hierarchical directory structure of the workspace
       * Provides a complete tree view of folders and files
       */
      directoryStructure?: {
        /**
         * Root folder directory tree
         */
        rootTree?: DirectoryTreeNode;
        /**
         * Directory trees for related folders
         */
        relatedTrees?: DirectoryTreeNode[];
        /**
         * Statistics about the directory structure
         */
        stats?: {
          totalFiles: number;
          totalFolders: number;
          keyFiles: number;
          relatedFiles: number;
          maxDepth: number;
        };
        /**
         * Text representation of the directory tree for easy reading
         */
        textView?: string;
      };
    };
  };
}

/**
 * Add files to workspace parameters
 * Simplified interface for adding individual files or folders to a workspace
 */
export interface AddFilesToWorkspaceParameters extends WorkspaceParameters {
  /**
   * ID of the workspace to modify
   */
  workspaceId: string;
  
  /**
   * Individual file paths to add
   */
  files?: string[];
  
  /**
   * Folder paths to add (all files in these folders will be included)
   */
  folders?: string[];
  
  /**
   * Whether to add files to relatedFiles (true) or try to move them to rootFolder (false)
   * Default: true (safer option - doesn't move files)
   */
  addAsRelated?: boolean;
  
  /**
   * Whether to mark added files as key files
   */
  markAsKeyFiles?: boolean;
}

/**
 * Add files to workspace result
 */
export interface AddFilesToWorkspaceResult extends CommonResult {
  data: {
    /**
     * Number of files successfully added
     */
    filesAdded: number;
    
    /**
     * Number of folders successfully added
     */
    foldersAdded: number;
    
    /**
     * Files that were added
     */
    addedFiles: string[];
    
    /**
     * Files that failed to add (with reasons)
     */
    failedFiles: Array<{
      path: string;
      reason: string;
    }>;
    
    /**
     * Updated workspace summary
     */
    workspace: {
      id: string;
      name: string;
      totalFiles: number;
      totalRelatedFiles: number;
    };
  };
}

/**
 * Quick workspace creation parameters
 * Simplified interface for creating workspaces with automatic file discovery
 */
export interface QuickCreateWorkspaceParameters extends WorkspaceParameters {
  /**
   * Workspace name
   */
  name: string;
  
  /**
   * Optional description
   */
  description?: string;
  
  /**
   * Root folder path
   */
  rootFolder: string;
  
  /**
   * Whether to automatically discover and add all files in root folder
   */
  autoDiscoverFiles?: boolean;
  
  /**
   * Whether to automatically detect key files
   */
  autoDetectKeyFiles?: boolean;
  
  /**
   * Additional files to include (outside of root folder)
   */
  additionalFiles?: string[];
  
  /**
   * Additional folders to include
   */
  additionalFolders?: string[];
}