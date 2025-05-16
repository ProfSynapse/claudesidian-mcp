/**
 * Utility functions for handling workspace context
 */

/**
 * Interface for workspace context structure
 */
export interface WorkspaceContext {
  /**
   * Workspace identifier
   */
  workspaceId: string;
  
  /**
   * Optional path within the workspace hierarchy
   */
  workspacePath?: string[];
  
  /**
   * Whether this is the active workspace
   */
  activeWorkspace?: boolean;
}

/**
 * Safely parse and access workspace context properties
 * 
 * @param workspaceContext - The workspace context, can be a string or object
 * @param fallbackId - Optional fallback workspace ID if context is invalid or missing workspaceId
 * @returns Parsed workspace context object with workspaceId and workspacePath
 */
export function parseWorkspaceContext(
  workspaceContext?: string | WorkspaceContext | Record<string, any> | null,
  fallbackId: string = 'default-workspace'
): WorkspaceContext {
  // If no context provided, return fallback
  if (!workspaceContext) {
    return {
      workspaceId: fallbackId,
      workspacePath: [],
      activeWorkspace: true
    };
  }

  // If it's a string, try to parse as JSON
  if (typeof workspaceContext === 'string') {
    try {
      const parsed = JSON.parse(workspaceContext);
      
      // If parsed is null or not an object, return fallback
      if (!parsed || typeof parsed !== 'object') {
        console.warn('Workspace context parsed to a non-object value');
        return {
          workspaceId: fallbackId,
          workspacePath: [],
          activeWorkspace: true
        };
      }
      
      // If parsed has no workspaceId, return fallback
      if (!parsed.workspaceId) {
        console.warn('workspaceId is required in workspaceContext but was not provided');
        return {
          workspaceId: fallbackId,
          workspacePath: [],
          activeWorkspace: true
        };
      }
      
      // Return well-formed context
      return {
        workspaceId: parsed.workspaceId,
        workspacePath: Array.isArray(parsed.workspacePath) ? parsed.workspacePath : [],
        activeWorkspace: parsed.activeWorkspace ?? true
      };
    } catch (e) {
      console.warn('Invalid workspace context JSON:', e);
      return {
        workspaceId: fallbackId,
        workspacePath: [],
        activeWorkspace: true
      };
    }
  }
  
  // It's already an object, use it directly
  const ctx = workspaceContext as Record<string, any>;
  
  // If object has no workspaceId, return fallback
  if (!ctx.workspaceId) {
    console.warn('workspaceId is required in workspaceContext but was not provided');
    return {
      workspaceId: fallbackId,
      workspacePath: [],
      activeWorkspace: true
    };
  }
  
  // Return well-formed context
  return {
    workspaceId: ctx.workspaceId,
    workspacePath: Array.isArray(ctx.workspacePath) ? ctx.workspacePath : [],
    activeWorkspace: ctx.activeWorkspace ?? true
  };
}

/**
 * Serialize workspace context to a JSON string
 * Useful for passing context between modes
 * 
 * @param context The workspace context to serialize
 * @returns JSON string representation
 */
export function serializeWorkspaceContext(context: WorkspaceContext): string {
  return JSON.stringify({
    workspaceId: context.workspaceId,
    workspacePath: context.workspacePath || [],
    activeWorkspace: context.activeWorkspace ?? true
  });
}