/**
 * Branch Lifecycle Events
 * Location: /src/types/chat/BranchEvents.ts
 *
 * Defines specific events for branch state transitions
 * Part of the event-driven architecture refactor
 */

import { MessageAlternativeBranch, MessageAlternativeStatus, ConversationMessage } from './ChatTypes';

/**
 * Event emitted when a new branch is created (draft status)
 */
export interface BranchCreatedEvent {
  messageId: string;
  branchId: string;
  branch: Readonly<MessageAlternativeBranch>;
  timestamp: number;
}

/**
 * Event emitted when a branch status changes
 * Contains both old and new status for transition detection
 */
export interface BranchStatusChangedEvent {
  messageId: string;
  branchId: string;
  oldStatus: MessageAlternativeStatus;
  newStatus: MessageAlternativeStatus;
  branch: Readonly<MessageAlternativeBranch>;
  timestamp: number;
}

/**
 * Event emitted when a branch is finalized (complete or aborted status)
 */
export interface BranchFinalizedEvent {
  messageId: string;
  branchId: string;
  branch: Readonly<MessageAlternativeBranch>;
  message: Readonly<ConversationMessage>;  // Fresh message object for immediate state access
  finalStatus: 'complete' | 'aborted';
  timestamp: number;
}

/**
 * Event emitted when a branch is discarded/deleted
 */
export interface BranchDiscardedEvent {
  messageId: string;
  branchId: string;
  timestamp: number;
}

/**
 * Branch lifecycle event handlers
 * These replace generic onConversationUpdated for branch-specific changes
 */
export interface BranchLifecycleEvents {
  /**
   * Called when a new branch draft is created
   */
  onBranchCreated?: (event: BranchCreatedEvent) => void;

  /**
   * Called when a branch status changes (draft → streaming → complete/aborted)
   */
  onBranchStatusChanged?: (event: BranchStatusChangedEvent) => void;

  /**
   * Called when a branch is finalized (reaches complete or aborted state)
   * This is the key event for triggering UI updates like showing navigator/copy button
   */
  onBranchFinalized?: (event: BranchFinalizedEvent) => void;

  /**
   * Called when a branch is discarded/deleted
   */
  onBranchDiscarded?: (event: BranchDiscardedEvent) => void;
}
