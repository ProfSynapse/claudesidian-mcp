import type { CommonResult } from '../types';

/**
 * Utility functions for handling JSON schemas in a DRY way
 */

/**
 * Get schema for workspace context parameters
 * @returns JSON schema for workspace context
 */
export function getWorkspaceContextSchema(): any {
  return {
    workspaceContext: {
      oneOf: [
        {
          type: 'object',
          properties: {
            workspaceId: { 
              type: 'string',
              description: 'Workspace identifier (optional - uses default workspace if not provided)' 
            },
            workspacePath: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Path from root workspace to specific phase/task'
            },
            contextDepth: {
              type: 'string',
              enum: ['minimal', 'standard', 'comprehensive'],
              description: 'Level of context to include in results'
            }
          },
          description: 'Optional workspace context object - if not provided, uses a default workspace'
        },
        {
          type: 'string',
          description: 'Optional workspace context as JSON string - must contain workspaceId field'
        }
      ],
      description: 'Optional workspace context - if not provided, uses a default workspace'
    }
  };
}

/**
 * Get schema for handoff parameters
 * @returns JSON schema for handoff
 */
export function getHandoffSchema(): any {
  return {
    handoff: {
      type: 'object',
      properties: {
        tool: { 
          type: 'string',
          description: 'Agent name to hand off to' 
        },
        mode: { 
          type: 'string',
          description: 'Mode to execute' 
        },
        parameters: { 
          type: 'object',
          description: 'Parameters to pass to the next mode'
        },
        returnHere: { 
          type: 'boolean',
          description: 'Whether to return results to original agent'
        }
      },
      required: ['tool', 'mode', 'parameters'],
      description: 'Optional handoff to another tool'
    }
  };
}

/**
 * Get schema for session parameters
 * @returns JSON schema for session parameters
 */
export function getSessionSchema(): any {
  return {
    sessionId: {
      type: 'string',
      description: 'Session identifier to track related tool calls'
    }
  };
}

/**
 * Get schema for context parameter
 * @returns JSON schema for context
 */
export function getContextSchema(): any {
  return {
    context: {
      type: 'string',
      description: 'Background information and purpose of this workspace/session/state - this will be preserved in memory',
      minLength: 1
    }
  };
}

export function getCommonParameterSchema(): any {
  return {
    ...getSessionSchema(),
    ...getWorkspaceContextSchema(),
    ...getHandoffSchema(),
    ...getContextSchema()
  };
}

/**
 * Get schema for common result
 * @returns JSON schema for common result
 */
export function getCommonResultSchema(): any {
  return {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the operation was successful'
      },
      error: {
        type: 'string',
        description: 'Error message if operation failed'
      },
      data: {
        type: 'object',
        description: 'Operation-specific result data'
      },
      context: {
        type: 'string',
        description: 'Background information and purpose for running this tool'
      },
      workspaceContext: {
        type: 'object',
        properties: {
          workspaceId: { 
            type: 'string',
            description: 'Workspace identifier'
          },
          workspacePath: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Path from root workspace to specific phase/task'
          },
          sessionId: {
            type: 'string',
            description: 'Session identifier used for this operation'
          },
          activeWorkspace: { 
            type: 'boolean',
            description: 'Whether this workspace is currently active'
          },
          contextDepth: {
            type: 'string',
            enum: ['minimal', 'standard', 'comprehensive'],
            description: 'Level of context included in results'
          }
        },
        description: 'Workspace context that was used'
      },
      handoffResult: {
        type: 'object',
        description: 'Result from handoff operation if one was performed'
      },
      sessionId: {
        type: 'string',
        description: 'Session identifier used for tracking tool calls'
      }
    },
    required: ['success', 'sessionId']
  };
}

/**
 * Merge custom parameter schema with common parameter schema
 * @param customSchema The mode-specific schema
 * @returns Merged schema with common parameters
 */
export function mergeWithCommonSchema(customSchema: any): any {
  const commonSchema = getCommonParameterSchema();
  
  return {
    type: 'object',
    properties: {
      ...customSchema.properties,
      ...commonSchema
    },
    required: [...(customSchema.required || []), 'sessionId', 'context']
  };
}

/**
 * Create a standardized result object
 * @param success Whether the operation was successful
 * @param data Operation-specific data
 * @param error Error message if operation failed
 * @param workspaceContext Workspace context used
 * @param handoffResult Result from handoff operation
 * @param sessionId Session identifier
 * @param context Contextual information
 * @param additionalProps Additional properties to include in the result
 * @returns Standardized result object
 */
export function createResult<T extends CommonResult>(
  success: boolean,
  data?: any,
  error?: string,
  workspaceContext?: CommonResult['workspaceContext'],
  handoffResult?: any,
  sessionId?: string,
  context?: string,
  additionalProps?: Record<string, any>
): T {
  const result: any = {
    success,
    ...(data !== undefined && { data }),
    ...(error !== undefined && { error }),
    ...(workspaceContext !== undefined && { workspaceContext }),
    ...(handoffResult !== undefined && { handoffResult }),
    ...(sessionId !== undefined && { sessionId }),
    ...(context !== undefined && { context })
  };
  
  // Add any additional properties
  if (additionalProps) {
    Object.assign(result, additionalProps);
  }
  
  return result as T;
}