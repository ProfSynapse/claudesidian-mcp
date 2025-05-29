import { normalizePath } from "obsidian";
import { WorkspaceService } from "../database/services/WorkspaceService";
import { ProjectWorkspace } from "../database/workspace-types";
import { getErrorMessage } from "./errorUtils";

/**
 * Utility functions for working with workspaces and files
 */

/**
 * Check if a file is within a workspace
 * @param filePath Path of the file to check
 * @param workspace Workspace to check against
 * @returns True if the file is in the workspace, false otherwise
 */
export function fileIsInWorkspace(filePath: string, workspace: ProjectWorkspace): boolean {
  const normalizedFilePath = normalizePath(filePath);
  const normalizedRootFolder = normalizePath(workspace.rootFolder);
  
  // Check if file is in the root folder
  if (normalizedFilePath.startsWith(normalizedRootFolder + '/') || 
      normalizedFilePath === normalizedRootFolder) {
    return true;
  }
  
  // Check related folders
  for (const folder of workspace.relatedFolders) {
    const normalizedFolder = normalizePath(folder);
    if (normalizedFilePath.startsWith(normalizedFolder + '/') || 
        normalizedFilePath === normalizedFolder) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get all workspaces that contain a file
 * @param filePath Path of the file to check
 * @param workspaceService WorkspaceService instance
 * @returns Promise resolving to an array of workspace IDs that contain the file
 */
export async function getWorkspacesForFile(
  filePath: string, 
  workspaceService: WorkspaceService
): Promise<string[]> {
  // Get all workspaces
  const workspaces = await workspaceService.getWorkspaces();
  const matchingWorkspaceIds: string[] = [];
  
  // Normalize the file path
  const normalizedFilePath = normalizePath(filePath);
  
  // Check each workspace
  for (const workspace of workspaces) {
    if (fileIsInWorkspace(normalizedFilePath, workspace)) {
      matchingWorkspaceIds.push(workspace.id);
    }
  }
  
  return matchingWorkspaceIds;
}

/**
 * Find the "best" workspace for a file based on hierarchy type and folder depth
 * @param filePath Path of the file to check
 * @param workspaceService WorkspaceService instance
 * @returns Promise resolving to the best matching workspace ID or undefined if none found
 */
export async function getBestWorkspaceForFile(
  filePath: string, 
  workspaceService: WorkspaceService
): Promise<string | undefined> {
  // Get all workspaces that contain this file
  const workspaceIds = await getWorkspacesForFile(filePath, workspaceService);
  
  if (workspaceIds.length === 0) {
    return undefined;
  }
  
  if (workspaceIds.length === 1) {
    return workspaceIds[0];
  }
  
  // Multiple workspaces match, find the best one
  const workspaces: ProjectWorkspace[] = [];
  for (const id of workspaceIds) {
    const workspace = await workspaceService.getWorkspace(id);
    if (workspace) {
      workspaces.push(workspace);
    }
  }
  
  // Sort workspaces by hierarchy type - prioritize "task" level, then "phase", then "workspace"
  // This ensures we assign the file to the most specific context possible
  workspaces.sort((a, b) => {
    const hierarchyOrder = {
      task: 0,
      phase: 1,
      workspace: 2
    };
    
    return hierarchyOrder[a.hierarchyType] - hierarchyOrder[b.hierarchyType];
  });
  
  // If hierarchy types are the same, prioritize by folder path length (longer paths are more specific)
  const normalizedFilePath = normalizePath(filePath);
  
  for (const hierarchyType of ['task', 'phase', 'workspace']) {
    const matchingByType = workspaces.filter(w => w.hierarchyType === hierarchyType);
    
    if (matchingByType.length > 0) {
      // Sort by the closest folder match
      matchingByType.sort((a, b) => {
        const aPath = normalizePath(a.rootFolder);
        const bPath = normalizePath(b.rootFolder);
        
        // If the file is directly in one of the folders, prioritize that one
        const directlyInA = normalizedFilePath.indexOf(aPath) === 0 && 
                          normalizedFilePath.substring(aPath.length).split('/').filter(Boolean).length === 0;
        const directlyInB = normalizedFilePath.indexOf(bPath) === 0 && 
                          normalizedFilePath.substring(bPath.length).split('/').filter(Boolean).length === 0;
        
        if (directlyInA && !directlyInB) return -1;
        if (directlyInB && !directlyInA) return 1;
        
        // Otherwise take the longest matching path (most specific)
        return bPath.length - aPath.length;
      });
      
      return matchingByType[0].id;
    }
  }
  
  // If all else fails, just take the first one
  return workspaces[0].id;
}

/**
 * Update the activity history for all relevant workspaces when a file is modified
 * @param filePath Path of the file that was modified
 * @param action The action performed ('create', 'edit', 'delete' - will be mapped to valid activity types)
 * @param workspaceService WorkspaceService instance
 * @remarks 'delete' actions will be recorded as 'view' in the workspace activity history
 */
export async function updateWorkspaceActivityForFile(
  filePath: string,
  action: 'create' | 'edit' | 'delete',
  workspaceService: WorkspaceService
): Promise<void> {
  // Get all workspaces that contain this file
  const workspaceIds = await getWorkspacesForFile(filePath, workspaceService);
  
  // Map our action types to the ones expected by workspace activity
  // For 'delete' actions, use 'view' as it's a valid action type
  const activityAction = action === 'delete' ? 'view' : 
                     action === 'create' ? 'create' : 'edit';
  
  // Record the activity for each workspace
  for (const workspaceId of workspaceIds) {
    try {
      await workspaceService.addActivity(workspaceId, {
        timestamp: Date.now(),
        action: activityAction,
        duration: 0, // Instant action
        hierarchyPath: [filePath]
      });
    } catch (error) {
      console.error(`Error updating activity for workspace ${workspaceId}:`, error);
    }
  }
}

/**
 * Get or create a default workspace for sessions
 * @param workspaceService WorkspaceService instance
 * @returns Promise resolving to the default workspace ID
 */
export async function getOrCreateDefaultWorkspace(workspaceService: WorkspaceService): Promise<string> {
  try {
    // Try to get existing workspaces, sorted by last accessed
    const workspaces = await workspaceService.getWorkspaces({ 
      sortBy: 'lastAccessed', 
      sortOrder: 'desc', 
    });
    
    if (workspaces && workspaces.length > 0) {
      return workspaces[0].id;
    }
    
    // Create a default workspace if none exists
    const defaultWorkspace = await workspaceService.createWorkspace({
      name: 'Default Workspace',
      description: 'Automatically created default workspace',
      rootFolder: '/',
      hierarchyType: 'workspace',
      created: Date.now(),
      lastAccessed: Date.now(),
      childWorkspaces: [],
      path: [],
      relatedFolders: [],
      relevanceSettings: {
        folderProximityWeight: 0.5,
        recencyWeight: 0.7,
        frequencyWeight: 0.3
      },
      activityHistory: [],
      completionStatus: {},
      status: 'active'
    });
    
    return defaultWorkspace.id;
  } catch (error) {
    console.warn(`Error getting/creating default workspace: ${getErrorMessage(error)}`);
    // Fallback to a default workspace ID
    return 'default-workspace';
  }
}