import type { CommonResult } from '../types';
import { enhanceSchemaDocumentation } from './validationUtils';

/**
 * Utility functions for handling JSON schemas in a DRY way
 */

/**
 * Get schema for workspace context parameters
 * @returns JSON schema for workspace context
 */
export function getWorkspaceContextSchema(): any {
  return enhanceSchemaDocumentation({
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
  });
}

/**
 * Get schema for a single mode call
 * @returns JSON schema for a mode call
 */
export function getModeCallSchema(): any {
  return enhanceSchemaDocumentation({
    type: 'object',
    properties: {
      tool: { 
        type: 'string',
        description: 'Agent name to execute mode on' 
      },
      mode: { 
        type: 'string',
        description: 'Mode to execute' 
      },
      parameters: { 
        type: 'object',
        description: 'Parameters to pass to the mode'
      },
      returnHere: { 
        type: 'boolean',
        description: 'Whether to return results to original agent'
      },
      continueOnFailure: {
        type: 'boolean',
        description: 'Whether to continue execution if this mode fails'
      },
      strategy: {
        type: 'string',
        enum: ['serial', 'parallel'],
        description: 'Execution strategy for this mode call'
      },
      callName: {
        type: 'string',
        description: 'Optional name to identify this mode call in the results'
      }
    },
    required: ['tool', 'mode', 'parameters'],
    description: 'Mode call definition'
  });
}

/**
 * Get schema for handoff parameters
 * @returns JSON schema for handoff
 */
export function getHandoffSchema(): any {
  const modeCallSchema = getModeCallSchema();
  
  return enhanceSchemaDocumentation({
    handoff: {
      oneOf: [
        // Single mode call (backward compatibility)
        modeCallSchema,
        
        // Array of mode calls (multi-mode execution)
        {
          type: 'array',
          items: modeCallSchema,
          description: 'Array of mode calls to execute'
        }
      ],
      description: 'Optional handoff to another agent/mode(s)'
    }
  });
}

/**
 * Get schema for session parameters (now part of context - kept for backward compatibility)
 * @returns Empty schema since session fields are now in context
 */
export function getSessionSchema(): any {
  return {};
}

/**
 * Get schema for context parameter
 * @returns JSON schema for context
 */
export function getContextSchema(): any {
  return enhanceSchemaDocumentation({
    context: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: '2-4 word name for this session, or the session ID when provided by system'
        },
        workspaceId: {
          type: 'string',
          description: 'REQUIRED: Workspace identifier for associating this tool call with the correct workspace. Use the workspace ID from the most recent loadWorkspace call, or the workspace ID that was provided/discussed in the conversation. If no workspace has been loaded, use "default".'
        },
        sessionDescription: {
          type: 'string',
          description: 'Brief description of what this session is about - updates as conversation evolves',
          minLength: 10
        },
        sessionMemory: {
          type: 'string',
          description: 'Summary of what has happened in the conversation so far, including key decisions, actions taken, and important context',
          minLength: 10
        },
        toolContext: {
          type: 'string', 
          description: 'Specific context for why this tool/mode is being used at this moment',
          minLength: 5
        },
        primaryGoal: {
          type: 'string',
          description: 'The overarching goal of the current conversation/task',
          minLength: 5
        },
        subgoal: {
          type: 'string',
          description: 'What this specific tool call is trying to accomplish',
          minLength: 5
        }
      },
      required: ['sessionId', 'workspaceId', 'sessionDescription', 'sessionMemory', 'toolContext', 'primaryGoal', 'subgoal'],
      description: 'Rich contextual information for this tool call including session management'
    }
  });
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
  return enhanceSchemaDocumentation({
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
        description: 'Result from handoff operation if one was performed (legacy support)'
      },
      handoffResults: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Whether the operation succeeded'
            },
            error: {
              type: 'string', 
              description: 'Error message if operation failed'
            },
            data: {
              type: 'object',
              description: 'Operation-specific result data'
            },
            tool: {
              type: 'string',
              description: 'Agent name that executed the mode'
            },
            mode: {
              type: 'string',
              description: 'Mode that was executed'
            },
            callName: {
              type: 'string',
              description: 'Name of the mode call if specified'
            },
            sequence: {
              type: 'number',
              description: 'Sequence number of this mode call'
            },
            startTime: {
              type: 'number',
              description: 'Timestamp when the mode call started'
            },
            endTime: {
              type: 'number',
              description: 'Timestamp when the mode call completed'
            },
            duration: {
              type: 'number',
              description: 'Duration of the mode call in milliseconds'
            }
          },
          required: ['success', 'tool', 'mode'],
          description: 'Result of a single mode execution'
        },
        description: 'Results from multiple handoffs when executing multiple modes'
      },
      handoffSummary: {
        type: 'object',
        properties: {
          successCount: {
            type: 'number',
            description: 'Number of successful mode calls'
          },
          failureCount: {
            type: 'number',
            description: 'Number of failed mode calls'
          },
          startTime: {
            type: 'number',
            description: 'Timestamp when execution started'
          },
          endTime: {
            type: 'number',
            description: 'Timestamp when execution completed'
          },
          totalDuration: {
            type: 'number',
            description: 'Total duration of all handoffs in milliseconds'
          },
          executionStrategy: {
            type: 'string',
            enum: ['serial', 'parallel', 'mixed'],
            description: 'How modes were executed'
          }
        },
        required: ['successCount', 'failureCount', 'executionStrategy'],
        description: 'Summary of multi-mode execution results'
      },
      sessionId: {
        type: 'string',
        description: 'Session identifier used for tracking tool calls'
      }
    },
    required: ['success', 'sessionId']
  });
}

/**
 * Merge custom parameter schema with common parameter schema
 * @param customSchema The mode-specific schema
 * @returns Merged schema with common parameters
 */
export function mergeWithCommonSchema(customSchema: any): any {
  const commonSchema = getCommonParameterSchema();
  
  // Merge properties without duplication
  const mergedProperties = {
    ...customSchema.properties,
    ...commonSchema
  };
  
  // Merge required arrays without duplicates
  const customRequired = customSchema.required || [];
  const commonRequired = ['sessionId', 'context'];
  const mergedRequired = Array.from(new Set([...customRequired, ...commonRequired]));
  
  return {
    type: 'object',
    properties: mergedProperties,
    required: mergedRequired
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
 * @param context Contextual information (rich object or string for backward compatibility)
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
  context?: CommonResult['context'] | string,
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