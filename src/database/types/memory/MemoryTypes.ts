/**
 * Memory Types
 * Extracted from workspace-types.ts for better organization
 * Embedding functionality removed for simplified JSON-based storage
 */

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
  metadata?: {
    tool?: string;
    params?: any;
    result?: any;
    relatedFiles?: string[];
  };

  /**
   * Associated session ID (if created during a session)
   */
  sessionId?: string;
}