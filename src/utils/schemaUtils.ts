import { CommonParameters, CommonResult } from '../types';

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
        contextDepth: {
          type: 'string',
          enum: ['minimal', 'standard', 'comprehensive'],
          description: 'Level of context to include in results'
        }
      },
      required: ['workspaceId'],
      description: 'Optional workspace context'
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
 * Get complete common parameter schema
 * @returns JSON schema object for common parameters
 */
export function getCommonParameterSchema(): any {
  return {
    ...getSessionSchema(),
    ...getWorkspaceContextSchema(),
    ...getHandoffSchema()
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
            description: 'Session identifier used for this operation (required)'
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
        required: ['workspaceId', 'sessionId'],
        description: 'Workspace context that was used'
      },
      handoffResult: {
        type: 'object',
        description: 'Result from handoff operation if one was performed'
      }
    },
    required: ['success']
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
    required: [...(customSchema.required || []), 'sessionId']
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
 * @returns Standardized result object
 */
export function createResult<T extends CommonResult>(
  success: boolean,
  data?: any,
  error?: string,
  workspaceContext?: CommonResult['workspaceContext'],
  handoffResult?: any,
  sessionId?: string
): T {
  return {
    success,
    data,
    error,
    workspaceContext,
    handoffResult,
    sessionId
  } as T;
}