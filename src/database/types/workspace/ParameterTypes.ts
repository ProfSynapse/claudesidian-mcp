/**
 * Workspace Parameter Types
 * Extracted from workspace-types.ts for better organization
 */

import { CommonParameters, CommonResult } from '../../../types/mcp';
import { DirectoryTreeNode } from '../../../utils/directoryTreeUtils';
import { ProjectWorkspace, HierarchyType, WorkspaceStatus } from './WorkspaceTypes';

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