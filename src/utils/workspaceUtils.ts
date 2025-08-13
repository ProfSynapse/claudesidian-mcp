import { normalizePath } from "obsidian";
import { WorkspaceService } from '../agents/memoryManager/services/WorkspaceService';
import { ProjectWorkspace } from "../database/workspace-types";

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
  for (const folder of (workspace.relatedFolders || [])) {
    const normalizedFolder = normalizePath(folder);
    if (normalizedFilePath.startsWith(normalizedFolder + '/') || 
        normalizedFilePath === normalizedFolder) {
      return true;
    }
  }
  
  // Check individual related files
  if (workspace.relatedFiles) {
    for (const file of workspace.relatedFiles) {
      const normalizedFile = normalizePath(file);
      if (normalizedFilePath === normalizedFile) {
        return true;
      }
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
 * Find the "best" workspace for a file based on folder path specificity
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
  
  // Multiple workspaces match, find the best one based on path specificity
  const workspaces: ProjectWorkspace[] = [];
  for (const id of workspaceIds) {
    const workspace = await workspaceService.getWorkspace(id);
    if (workspace) {
      workspaces.push(workspace);
    }
  }
  
  // Prioritize by folder path length (longer paths are more specific)
  const normalizedFilePath = normalizePath(filePath);
  
  // Sort by the closest folder match
  workspaces.sort((a, b) => {
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
        context: filePath
      });
    } catch (error) {
      console.error(`Error updating activity for workspace ${workspaceId}:`, error);
    }
  }
}