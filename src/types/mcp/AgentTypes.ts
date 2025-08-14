/**
 * MCP Agent and Mode-related Types
 * Extracted from types.ts for better organization
 */

import { WorkspaceContext } from '../../utils/contextUtils';

/**
 * Mode call definition for chaining to another agent/mode
 */
export interface ModeCall {
  /**
   * Agent name to execute mode on
   */
  tool: string;
  
  /**
   * Mode to execute
   */
  mode: string;
  
  /**
   * Parameters to pass to the mode
   */
  parameters: any;
  
  /**
   * Whether to return results to original agent
   */
  returnHere?: boolean;
  
  /**
   * Whether this mode should be executed regardless of previous mode failures
   * Default is false - execution stops on first failure
   */
  continueOnFailure?: boolean;
  
  /**
   * Mode execution strategy
   * - serial: wait for previous modes to complete before executing (default)
   * - parallel: execute in parallel with other modes marked as parallel
   */
  strategy?: 'serial' | 'parallel';
  
  /**
   * Optional name to identify this mode call in the results
   */
  callName?: string;
}

/**
 * Common parameters structure for standardized agent modes
 * Provides session tracking, workspace context and handoff mechanism
 */
export interface CommonParameters {
  /**
   * Rich contextual information for this tool call including session management
   */
  context: {
    sessionId: string;
    workspaceId?: string;
    sessionDescription: string;
    sessionMemory: string;
    toolContext: string;
    primaryGoal: string;
    subgoal: string;
  };
  
  /**
   * Optional workspace context for scoping operations
   * Can be either an object with workspaceId or a JSON string representation
   */
  workspaceContext?: WorkspaceContext | string;
  
  /**
   * Optional handoff to another agent/mode for workflow chaining
   * Can be a single mode call or an array of mode calls for multi-mode execution
   */
  handoff?: ModeCall | ModeCall[];
}

/**
 * Common result structure for standardized agent responses
 */
export interface CommonResult {
  /**
   * Whether the operation succeeded
   */
  success: boolean;
  
  /**
   * Error message if success is false
   */
  error?: string;
  
  /**
   * Operation-specific result data
   */
  data?: any;
  
  /**
   * Contextual information for this tool call including session management
   * Results can contain string context for backward compatibility
   */
  context?: {
    sessionId: string;
    workspaceId?: string;
    sessionDescription: string;
    sessionMemory: string;
    toolContext: string;
    primaryGoal: string;
    subgoal: string;
  } | string;
  
  /**
   * Workspace context that was used (for continuity)
   */
  workspaceContext?: WorkspaceContext;
  
  /**
   * Handoff result if a single handoff was processed
   * @deprecated Use handoffResults for multi-mode execution
   */
  handoffResult?: any;
  
  /**
   * Results from multiple handoffs when executing multiple modes
   * Each entry contains the result of a single mode execution
   */
  handoffResults?: Array<ModeCallResult>;
  
  /**
   * Summary of multi-mode execution results
   */
  handoffSummary?: {
    /**
     * Number of successful mode calls
     */
    successCount: number;
    
    /**
     * Number of failed mode calls
     */
    failureCount: number;
    
    /**
     * Timestamp when execution started
     */
    startTime?: number;
    
    /**
     * Timestamp when execution completed
     */
    endTime?: number;
    
    /**
     * Total duration of all handoffs in milliseconds
     */
    totalDuration?: number;
    
    /**
     * How modes were executed (serial, parallel, mixed)
     */
    executionStrategy: 'serial' | 'parallel' | 'mixed';
  };
}

/**
 * Mode call result for tracking execution outcomes
 */
export interface ModeCallResult extends CommonResult {
  /**
   * Agent name that executed the mode
   */
  tool?: string;
  
  /**
   * Mode that was executed
   */
  mode?: string;
  
  /**
   * Name of the mode call if specified
   */
  callName?: string;
  
  /**
   * Sequence number of this mode call
   */
  sequence?: number;
  
  /**
   * Timestamp when the mode call started
   */
  startTime?: number;
  
  /**
   * Timestamp when the mode call completed
   */
  endTime?: number;
  
  /**
   * Duration of the mode call in milliseconds
   */
  duration?: number;
}