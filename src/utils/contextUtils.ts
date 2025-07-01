import { CommonParameters, CommonResult, ModeCallResult, ModeCall } from '../types';

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
  fallbackId = 'default-workspace'
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

/**
 * Merge workspace contexts from two different sources
 * Handles conflicts by prioritizing the context from the priority source
 * 
 * @param context1 First workspace context
 * @param context2 Second workspace context
 * @param priorityContext Which context to prioritize if both have the same workspace ID ('first' or 'second')
 * @returns Merged workspace context or null if contexts are from different workspaces
 */
export function mergeWorkspaceContexts(
  context1: WorkspaceContext | null | undefined,
  context2: WorkspaceContext | null | undefined,
  priorityContext: 'first' | 'second' = 'first'
): WorkspaceContext | null {
  // Handle null/undefined cases
  if (!context1 && !context2) {
    return null;
  }
  
  if (!context1) {
    return context2 || null;
  }
  
  if (!context2) {
    return context1;
  }
  
  // If the contexts are from different workspaces, return the priority one
  if (context1.workspaceId !== context2.workspaceId) {
    return priorityContext === 'first' ? context1 : context2;
  }
  
  // Same workspace, so merge them with priority
  const priority = priorityContext === 'first' ? context1 : context2;
  const secondary = priorityContext === 'first' ? context2 : context1;
  
  return {
    workspaceId: priority.workspaceId,
    // Combine paths if both have workspace paths (using priority's if only one has a path)
    workspacePath: priority.workspacePath || secondary.workspacePath || [],
    // Use priority's activeWorkspace flag if present
    activeWorkspace: priority.activeWorkspace !== undefined ? 
      priority.activeWorkspace : 
      secondary.activeWorkspace !== undefined ? 
        secondary.activeWorkspace : 
        true
  };
}

/**
 * Track and merge workspace contexts from multiple mode calls
 * This function processes an array of mode call results and returns the best workspace context
 * 
 * @param results Array of mode call results
 * @param originalContext Original workspace context (optional baseline)
 * @returns The most appropriate workspace context to use
 */
export function trackWorkspaceContexts(
  results: ModeCallResult[],
  originalContext?: WorkspaceContext | null
): WorkspaceContext | null {
  if (!results || results.length === 0) {
    return originalContext || null;
  }
  
  // Filter only successful results with workspace context
  const successfulResults = results.filter(r => r.success && r.workspaceContext);
  
  if (successfulResults.length === 0) {
    return originalContext || null;
  }
  
  // Start with the original context
  let currentContext = originalContext || null;
  
  // Process each result in sequence, merging contexts as we go
  for (const result of successfulResults) {
    currentContext = mergeWorkspaceContexts(currentContext, result.workspaceContext, 'second');
  }
  
  return currentContext;
}

/**
 * Prepare mode call parameters with appropriate context
 * This helps maintain consistent session and workspace context
 * 
 * @param modeCall Mode call definition
 * @param sessionId Current session ID
 * @param currentContext Current workspace context
 * @returns Prepared parameters with context
 */
export function prepareModeCallParams(
  modeCall: ModeCall,
  sessionId: string | undefined,
  currentContext: WorkspaceContext | null | undefined
): any {
  // Start with a copy of the original parameters
  const params = { ...modeCall.parameters };
  
  // Apply session ID if not already present
  if (sessionId && !params.sessionId) {
    params.sessionId = sessionId;
  }
  
  // Apply workspace context if not already present
  if (currentContext && (!params.workspaceContext || !parseWorkspaceContext(params.workspaceContext)?.workspaceId)) {
    params.workspaceContext = currentContext;
  }
  
  return params;
}

/**
 * Extract context information from parameters for use in prepareResult calls
 * This function handles both legacy string context and enhanced object context
 * @param params Parameters object that may contain context information
 * @returns Context suitable for prepareResult calls
 */
export function extractContextFromParams(params: any): CommonResult['context'] {
  if (params.context !== undefined) {
    return normalizeContextForResult(params.context);
  }
  return undefined;
}

/**
 * Normalize context for result output - handles both string and object formats
 * @param context Context in either string or enhanced object format
 * @returns Normalized context for result
 */
export function normalizeContextForResult(context: any): CommonResult['context'] {
  if (typeof context === 'string') {
    return context;
  } else if (typeof context === 'object' && context !== null) {
    // Return the enhanced context object as-is
    return context;
  }
  return undefined;
}