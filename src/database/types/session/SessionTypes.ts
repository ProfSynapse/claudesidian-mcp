/**
 * Session Types
 * Simple session and state types focused on LLM restoration
 */

import { WorkspaceContext } from '../workspace/WorkspaceTypes';

/**
 * Session tracking for workspace activities
 * Simplified to only essential fields for clean auto-session creation
 */
export interface WorkspaceSession {
  /**
   * Unique session identifier
   */
  id: string;
  
  /**
   * Associated workspace ID
   */
  workspaceId: string;
  
  /**
   * Optional session name
   */
  name?: string;
  
  /**
   * Optional session description
   */
  description?: string;
}

/**
 * State snapshot data - everything needed to resume work
 */
export interface StateSnapshot {
  /**
   * Workspace context at save time
   */
  workspaceContext: WorkspaceContext;
  
  /**
   * What was happening when you decided to save this state?
   */
  conversationContext: string;
  
  /**
   * What task were you actively working on?
   */
  activeTask: string;
  
  /**
   * Which files were you working with?
   */
  activeFiles: string[];
  
  /**
   * What are the immediate next steps when you resume?
   */
  nextSteps: string[];
  
  /**
   * Why are you saving this state right now?
   */
  reasoning: string;
}

/**
 * Simple state interface - our agreed-upon clean schema
 */
export interface State {
  id: string;
  name: string;
  workspaceId: string;
  created: number;
  snapshot: StateSnapshot;
}

/**
 * Legacy WorkspaceStateSnapshot interface for backward compatibility
 * Extends the simple State with optional legacy fields
 */
export interface WorkspaceStateSnapshot extends State {
  // Legacy fields for backward compatibility
  sessionId?: string;
  timestamp?: number;
  description?: string;
  state?: {
    workspace: any;
    recentTraces: string[];
    contextFiles: string[];
    metadata: Record<string, any>;
  };
}