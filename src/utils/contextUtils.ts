import { CommonParameters, CommonResult } from '../types';

/**
 * Interface for workspace context
 */
export interface WorkspaceContext {
  workspaceId: string;
  workspacePath?: string[];
  activeWorkspace?: boolean;
}

/**
 * Parse workspace context from parameters
 * @param workspaceContext String or object representation of workspace context
 * @param fallbackId Optional fallback workspace ID if parsing fails
 * @returns Parsed workspace context or null if not provided
 */
export function parseWorkspaceContext(
  workspaceContext: CommonParameters['workspaceContext'] | null | undefined,
  fallbackId: string = 'default-workspace'
): WorkspaceContext | null {
  if (!workspaceContext) {
    return null;
  }

  let parsedContext: Partial<WorkspaceContext> = {};

  // Handle string vs object format
  if (typeof workspaceContext === 'string') {
    try {
      parsedContext = JSON.parse(workspaceContext);
    } catch (e) {
      console.warn('Invalid workspace context JSON:', e);
      return {
        workspaceId: fallbackId,
        workspacePath: [],
        activeWorkspace: true
      };
    }
  } else if (typeof workspaceContext === 'object' && workspaceContext !== null) {
    parsedContext = workspaceContext;
  }

  // Extract and validate workspaceId
  const workspaceId = parsedContext.workspaceId;
  
  if (!workspaceId) {
    console.warn('workspaceId is required in workspaceContext but was not provided');
    return {
      workspaceId: fallbackId,
      workspacePath: [],
      activeWorkspace: true
    };
  }

  return {
    workspaceId: workspaceId,
    workspacePath: parsedContext.workspacePath || [],
    activeWorkspace: parsedContext.activeWorkspace !== undefined ? parsedContext.activeWorkspace : true
  };
}

/**
 * Serialize workspace context to a string (for storage or parameters)
 * @param context Workspace context object
 * @returns Serialized JSON string
 */
export function serializeWorkspaceContext(context: WorkspaceContext): string {
  return JSON.stringify(context);
}