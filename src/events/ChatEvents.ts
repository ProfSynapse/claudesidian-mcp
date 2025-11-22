/**
 * ChatEvents - Type-safe event definitions for chat components
 * Location: /src/events/ChatEvents.ts
 *
 * Purpose: Define all event payloads and event names for the EventBus system.
 * Provides type safety and prevents event name typos.
 *
 * Architecture Note:
 * Events are grouped by domain:
 * - branch.* - Branch lifecycle events
 * - streaming.* - Streaming response events
 * - tool.* - Tool execution events
 * - message.* - Message lifecycle events
 * - conversation.* - Conversation-level events
 */

import { ConversationMessage, MessageAlternativeBranch } from '../types/chat/ChatTypes';

// ============================================================================
// Branch Events
// ============================================================================

/**
 * Emitted when a branch completes (status transitions to 'complete' or 'aborted')
 * Replaces callback: onBranchFinalized
 */
export interface BranchFinalizedEvent {
  messageId: string;
  branchId: string;
  branch: MessageAlternativeBranch;
  message: ConversationMessage; // Fresh message from storage
  finalStatus: 'complete' | 'aborted';
}

/**
 * Emitted when a branch status changes (pending → streaming → complete/aborted)
 * Replaces callback: onBranchStatusChanged
 */
export interface BranchStatusChangedEvent {
  messageId: string;
  branchId: string;
  oldStatus: 'pending' | 'streaming' | 'complete' | 'aborted';
  newStatus: 'pending' | 'streaming' | 'complete' | 'aborted';
  branch: MessageAlternativeBranch;
}

/**
 * Emitted when a new branch is created (e.g., during retry)
 * Replaces callback: onBranchCreated
 */
export interface BranchCreatedEvent {
  messageId: string;
  branchId: string;
  branch: MessageAlternativeBranch;
  message: ConversationMessage;
}

/**
 * Emitted when active branch changes (user navigates alternatives)
 * Replaces callback: onActiveBranchChanged
 */
export interface ActiveBranchChangedEvent {
  messageId: string;
  oldBranchId: string | null;
  newBranchId: string;
  message: ConversationMessage;
}

// ============================================================================
// Streaming Events
// ============================================================================

/**
 * Emitted when streaming content updates (delta received)
 * Replaces callback: onStreamUpdate
 */
export interface StreamingUpdateEvent {
  messageId: string;
  branchId: string;
  delta: string;
  fullContent: string;
  branch: MessageAlternativeBranch;
}

/**
 * Emitted when streaming starts for a branch
 * Replaces callback: onStreamStart
 */
export interface StreamingStartedEvent {
  messageId: string;
  branchId: string;
  branch: MessageAlternativeBranch;
}

/**
 * Emitted when streaming completes normally
 * Replaces callback: onStreamComplete
 */
export interface StreamingCompletedEvent {
  messageId: string;
  branchId: string;
  finalContent: string;
  branch: MessageAlternativeBranch;
}

/**
 * Emitted when streaming is aborted (user cancellation or error)
 * Replaces callback: onStreamAborted
 */
export interface StreamingAbortedEvent {
  messageId: string;
  branchId: string;
  reason: string;
  branch: MessageAlternativeBranch;
}

// ============================================================================
// Tool Events
// ============================================================================

/**
 * Emitted when a tool call is detected during streaming
 * Replaces callback: onToolDetected
 */
export interface ToolDetectedEvent {
  messageId: string;
  branchId: string;
  toolId: string;
  toolName: string;
  parameters: Record<string, any>;
  isComplete: boolean;
}

/**
 * Emitted when tool parameters are updated during streaming
 * Replaces callback: onToolUpdated
 */
export interface ToolUpdatedEvent {
  messageId: string;
  branchId: string;
  toolId: string;
  parameters: Record<string, any>;
  isComplete: boolean;
}

/**
 * Emitted when a tool starts executing
 * Replaces callback: onToolStarted
 */
export interface ToolStartedEvent {
  messageId: string;
  branchId: string;
  toolId: string;
  toolName: string;
  parameters: Record<string, any>;
}

/**
 * Emitted when a tool completes execution
 * Replaces callback: onToolCompleted
 */
export interface ToolCompletedEvent {
  messageId: string;
  branchId: string;
  toolId: string;
  result: any;
  success: boolean;
  error?: string;
}

/**
 * Emitted when all tools in a batch complete
 * Replaces callback: onToolBatchCompleted
 */
export interface ToolBatchCompletedEvent {
  messageId: string;
  branchId: string;
  toolCount: number;
  successCount: number;
  failureCount: number;
}

// ============================================================================
// Message Events
// ============================================================================

/**
 * Emitted when a new message is added to the conversation
 * Replaces callback: onMessageAdded
 */
export interface MessageAddedEvent {
  conversationId: string;
  message: ConversationMessage;
  index: number;
}

/**
 * Emitted when a message is updated (content, metadata, etc.)
 * Replaces callback: onMessageUpdated
 */
export interface MessageUpdatedEvent {
  conversationId: string;
  messageId: string;
  message: ConversationMessage;
  changes: string[]; // Array of changed fields
}

/**
 * Emitted when a message is deleted
 * Replaces callback: onMessageDeleted
 */
export interface MessageDeletedEvent {
  conversationId: string;
  messageId: string;
  index: number;
}

/**
 * Emitted when user edits a message
 * Replaces callback: onMessageEdited
 */
export interface MessageEditedEvent {
  messageId: string;
  oldContent: string;
  newContent: string;
  message: ConversationMessage;
}

// ============================================================================
// Conversation Events
// ============================================================================

/**
 * Emitted when conversation is loaded/switched
 * Replaces callback: onConversationLoaded
 */
export interface ConversationLoadedEvent {
  conversationId: string;
  messageCount: number;
}

/**
 * Emitted when conversation is saved to storage
 * Replaces callback: onConversationSaved
 */
export interface ConversationSavedEvent {
  conversationId: string;
  timestamp: number;
}

/**
 * Emitted when conversation is cleared
 * Replaces callback: onConversationCleared
 */
export interface ConversationClearedEvent {
  conversationId: string;
}

/**
 * Emitted when conversation encounters an error
 * Replaces callback: onConversationError
 */
export interface ConversationErrorEvent {
  conversationId: string;
  error: Error;
  context: string;
}

// ============================================================================
// UI Events
// ============================================================================

/**
 * Emitted when user copies a message
 * Replaces callback: onMessageCopied
 */
export interface MessageCopiedEvent {
  messageId: string;
}

/**
 * Emitted when user initiates a retry
 * Replaces callback: onRetryRequested
 */
export interface RetryRequestedEvent {
  messageId: string;
  userMessageId: string; // Parent user message that triggered this response
}

// ============================================================================
// Event Name Constants
// ============================================================================

/**
 * Type-safe event name constants
 * Use these instead of string literals to prevent typos
 */
export const ChatEventNames = {
  // Branch events
  BRANCH_FINALIZED: 'branch.finalized',
  BRANCH_STATUS_CHANGED: 'branch.statusChanged',
  BRANCH_CREATED: 'branch.created',
  ACTIVE_BRANCH_CHANGED: 'branch.activeChanged',

  // Streaming events
  STREAMING_UPDATE: 'streaming.update',
  STREAMING_STARTED: 'streaming.started',
  STREAMING_COMPLETED: 'streaming.completed',
  STREAMING_ABORTED: 'streaming.aborted',

  // Tool events
  TOOL_DETECTED: 'tool.detected',
  TOOL_UPDATED: 'tool.updated',
  TOOL_STARTED: 'tool.started',
  TOOL_COMPLETED: 'tool.completed',
  TOOL_BATCH_COMPLETED: 'tool.batchCompleted',

  // Message events
  MESSAGE_ADDED: 'message.added',
  MESSAGE_UPDATED: 'message.updated',
  MESSAGE_DELETED: 'message.deleted',
  MESSAGE_EDITED: 'message.edited',

  // Conversation events
  CONVERSATION_LOADED: 'conversation.loaded',
  CONVERSATION_SAVED: 'conversation.saved',
  CONVERSATION_CLEARED: 'conversation.cleared',
  CONVERSATION_ERROR: 'conversation.error',

  // UI events
  MESSAGE_COPIED: 'message.copied',
  RETRY_REQUESTED: 'retry.requested',
} as const;

// ============================================================================
// Type Mapping for Type-Safe Event Bus Usage
// ============================================================================

/**
 * Maps event names to their payload types
 * Enables type-safe eventBus.emit() and eventBus.on() calls
 *
 * Usage:
 * ```typescript
 * eventBus.on<ChatEventMap['branch.finalized']>(
 *   ChatEventNames.BRANCH_FINALIZED,
 *   (event) => {
 *     // event is correctly typed as BranchFinalizedEvent
 *     console.log(event.branchId);
 *   }
 * );
 * ```
 */
export interface ChatEventMap {
  // Branch events
  'branch.finalized': BranchFinalizedEvent;
  'branch.statusChanged': BranchStatusChangedEvent;
  'branch.created': BranchCreatedEvent;
  'branch.activeChanged': ActiveBranchChangedEvent;

  // Streaming events
  'streaming.update': StreamingUpdateEvent;
  'streaming.started': StreamingStartedEvent;
  'streaming.completed': StreamingCompletedEvent;
  'streaming.aborted': StreamingAbortedEvent;

  // Tool events
  'tool.detected': ToolDetectedEvent;
  'tool.updated': ToolUpdatedEvent;
  'tool.started': ToolStartedEvent;
  'tool.completed': ToolCompletedEvent;
  'tool.batchCompleted': ToolBatchCompletedEvent;

  // Message events
  'message.added': MessageAddedEvent;
  'message.updated': MessageUpdatedEvent;
  'message.deleted': MessageDeletedEvent;
  'message.edited': MessageEditedEvent;

  // Conversation events
  'conversation.loaded': ConversationLoadedEvent;
  'conversation.saved': ConversationSavedEvent;
  'conversation.cleared': ConversationClearedEvent;
  'conversation.error': ConversationErrorEvent;

  // UI events
  'message.copied': MessageCopiedEvent;
  'retry.requested': RetryRequestedEvent;
}
