/**
 * Core Workspace Types
 * Extracted from workspace-types.ts for better organization
 */

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