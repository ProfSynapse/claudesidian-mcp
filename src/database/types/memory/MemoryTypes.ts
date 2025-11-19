/**
 * Memory Types
 * Extracted from workspace-types.ts for better organization
 * Uses simplified JSON-based storage
 */

/**
 * Minimal set of fields recorded for every tool call trace.
 */
export interface TraceToolMetadata {
  id: string;
  agent: string;
  mode: string;
  callId?: string;
  pluginVersion?: string;
}

/**
 * Canonical context object that replaces the previous ad-hoc usage of params/result.
 * Additional context can be provided through the `additionalContext` property without
 * requiring a schema change.
 */
export interface TraceContextMetadata {
  workspaceId: string;
  sessionId: string;
  sessionDescription?: string;
  sessionMemory?: string;
  toolContext?: Record<string, any>;
  primaryGoal?: string;
  subgoal?: string;
  tags?: string[];
  additionalContext?: Record<string, any>;
}

/**
 * Tool input parameters that should be preserved for future reference.
 */
export interface TraceInputMetadata {
  arguments?: any;
  files?: string[];
  notes?: string;
}

/**
 * Outcome of the tool call. We only persist the durable signal (success/error)
 * instead of large response payloads.
 */
export interface TraceOutcomeMetadata {
  success: boolean;
  error?: {
    type?: string;
    message: string;
    code?: string | number;
  };
}

/**
 * Legacy blobs that we keep during migration for backward compatibility.
 */
export interface TraceLegacyMetadata {
  params?: any;
  result?: any;
  relatedFiles?: string[];
}

/**
 * Legacy metadata shape retained for compatibility with older callers.
 */
export interface LegacyWorkspaceTraceMetadata {
  tool?: string;
  params?: any;
  result?: any;
  relatedFiles?: string[];
  request?: Record<string, any>;
  response?: Record<string, any>;
  execution?: Record<string, any>;
  [key: string]: any;
}

/**
 * Canonical metadata structure saved with each memory trace.
 */
export interface TraceMetadata {
  schemaVersion: number;
  tool: TraceToolMetadata;
  context: TraceContextMetadata;
  input?: TraceInputMetadata;
  outcome: TraceOutcomeMetadata;
  legacy?: TraceLegacyMetadata;
}

/**
 * Memory trace for workspace activity
 * Records tool interactions for JSON-based storage and search
 */
export interface WorkspaceMemoryTrace {
  /**
   * Unique identifier
   */
  id: string;

  /**
   * Associated workspace ID
   */
  workspaceId: string;

  /**
   * When this interaction occurred
   */
  timestamp: number;

  /**
   * Type of memory trace interaction
   */
  type: string;

  /**
   * The actual interaction content
   */
  content: string;

  /**
   * Additional information about the interaction
   */
  metadata?: TraceMetadata | LegacyWorkspaceTraceMetadata;

  /**
   * Associated session ID (if created during a session)
   */
  sessionId?: string;
}
