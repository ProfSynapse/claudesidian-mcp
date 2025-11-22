/**
 * MessageAlternativeService - Handles message retry with branch persistence
 * Storage-First Architecture: All state changes write to storage first, then reload
 *
 * Flow:
 * 1. Write to storage → 2. Reload from storage → 3. Fire events with fresh data
 *
 * This ensures storage is the single source of truth and object references change on state transitions.
 */

import { ChatService } from '../../../services/chat/ChatService';
import { ConversationData, ConversationMessage, MessageAlternativeBranch } from '../../../types/chat/ChatTypes';
import { BranchLifecycleEvents } from '../../../types/chat/BranchEvents';
import { BranchManager } from './BranchManager';
import { BranchStreamPersistence } from './BranchStreamPersistence';
import { MessageStreamHandler } from './MessageStreamHandler';
import { AbortHandler } from '../utils/AbortHandler';

// Event Bus
import { eventBus } from '../../../events/EventBus';
import { ChatEventNames } from '../../../events/ChatEvents';

export interface MessageAlternativeServiceEvents extends BranchLifecycleEvents {
  onStreamingUpdate: (messageId: string, content: string, isComplete: boolean, isIncremental?: boolean) => void;
  onConversationUpdated: (conversation: ConversationData) => void;
  onToolCallsDetected: (messageId: string, toolCalls: any[]) => void;
  onLoadingStateChanged: (isLoading: boolean) => void;
  onError: (message: string) => void;
}

/**
 * Service for creating alternative AI responses when retrying messages
 */
export class MessageAlternativeService {
  private currentAbortController: AbortController | null = null;
  private currentStreamingMessageId: string | null = null;

  constructor(
    private chatService: ChatService,
    private branchManager: BranchManager,
    private branchPersistence: BranchStreamPersistence,
    private streamHandler: MessageStreamHandler,
    private abortHandler: AbortHandler,
    private events: MessageAlternativeServiceEvents
  ) {}

  /**
   * Create an alternative response for an AI message using branch persistence
   * STORAGE-FIRST: Every state change writes to storage, reloads, then fires events
   */
  async createAlternativeResponse(
    conversation: ConversationData,
    aiMessageId: string,
    options?: {
      provider?: string;
      model?: string;
      systemPrompt?: string;
      workspaceId?: string;
      sessionId?: string;
    }
  ): Promise<void> {
    console.log('[MessageAlternativeService] createAlternativeResponse called', { aiMessageId, conversationId: conversation.id });

    let aiMessage = conversation.messages.find(msg => msg.id === aiMessageId);
    if (!aiMessage || aiMessage.role !== 'assistant') {
      console.error('[MessageAlternativeService] AI message not found or wrong role', { aiMessageId, found: !!aiMessage, role: aiMessage?.role });
      return;
    }

    // Find the user message that prompted this AI response
    const aiMessageIndex = conversation.messages.findIndex(msg => msg.id === aiMessageId);
    if (aiMessageIndex === 0) {
      console.error('[MessageAlternativeService] No previous user message');
      return; // No previous message
    }

    const userMessage = conversation.messages[aiMessageIndex - 1];
    if (!userMessage || userMessage.role !== 'user') {
      console.error('[MessageAlternativeService] User message not found or wrong role', { userMessage, role: userMessage?.role });
      return;
    }

    console.log('[MessageAlternativeService] Found user message, starting retry', { userMessageId: userMessage.id });

    // Store original for rollback on error
    const originalContent = aiMessage.content;
    const originalToolCalls = aiMessage.toolCalls;
    const originalState = aiMessage.state;

    const generatedBranchId = `branch_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    let branchId: string | null = null;
    let hasBranchPersistence = false;

    try {
      console.log('[MessageAlternativeService] Setting loading state');
      this.events.onLoadingStateChanged(true);

      console.log('[MessageAlternativeService] Creating branch draft', { generatedBranchId });
      // === STEP 1: Create branch draft in storage ===
      const branchDraft = await this.branchPersistence.createDraft({
        conversationId: conversation.id,
        parentMessageId: aiMessageId,
        branchId: generatedBranchId,
        provider: options?.provider,
        model: options?.model
      });

      console.log('[MessageAlternativeService] Branch draft result', { branchDraft, hasDraft: !!branchDraft });

      branchId = branchDraft?.id || generatedBranchId;
      hasBranchPersistence = !!branchDraft;

      if (!hasBranchPersistence) {
        // Fallback to legacy BranchManager if persistence not available
        console.warn('[MessageAlternativeService] Branch persistence not available, using legacy path');
        await this.createAlternativeResponseLegacy(conversation, aiMessageId, userMessage, originalContent, originalToolCalls, originalState, options);
        return;
      }

      console.log('[MessageAlternativeService] Branch draft created successfully', { branchId });

      // === STEP 2: Update draft status to streaming in storage ===
      await this.branchPersistence.updateDraft({
        conversationId: conversation.id,
        parentMessageId: aiMessageId,
        branchId,
        status: 'streaming'
      });

      // === STEP 3: Reload from storage to get fresh objects ===
      const reloaded1 = await this.chatService.getConversation(conversation.id);
      if (reloaded1) {
        Object.assign(conversation, reloaded1);
        aiMessage = conversation.messages.find(m => m.id === aiMessageId);
      }

      // Fire event with fresh data via event bus (callback removed - no active subscribers)
      const streamingBranch = aiMessage?.alternativeBranches?.find(b => b.id === branchId);
      if (streamingBranch) {
        eventBus.emit(ChatEventNames.BRANCH_STATUS_CHANGED, {
          messageId: aiMessageId,
          branchId,
          oldStatus: 'draft' as const,
          newStatus: 'streaming' as const,
          branch: streamingBranch
        });
      }
      this.events.onConversationUpdated(conversation);

      // === STEP 4: Setup abort and stream response ===
      this.currentAbortController = new AbortController();
      this.currentStreamingMessageId = branchId;

      let loggedFirstContentChunk = false;
      let loggedFirstToolChunk = false;

      const { streamedContent, toolCalls } = await this.streamHandler.streamResponse(
        conversation,
        userMessage.content,
        branchId, // Stream to the branch ID
        {
          ...options,
          excludeFromMessageId: aiMessageId,
          abortSignal: this.currentAbortController.signal,
          streamingTarget: 'branch',
          // Streaming callbacks - these update storage incrementally
          onChunk: async ({ chunk }) => {
            if (!chunk || !branchId) return;
            await this.branchPersistence.updateDraft({
              conversationId: conversation.id,
              parentMessageId: aiMessageId,
              branchId,
              appendContent: chunk,
              status: 'streaming'
            });
            if (!loggedFirstContentChunk) {
              loggedFirstContentChunk = true;
              console.log('[MessageAlternativeService] First content chunk streamed');
            }
          },
          onToolChunk: async (toolCallUpdates, isChunkComplete) => {
            if (!branchId) return;
            await this.branchPersistence.updateDraft({
              conversationId: conversation.id,
              parentMessageId: aiMessageId,
              branchId,
              toolCalls: toolCallUpdates,
              status: 'streaming'
            });
            if (!loggedFirstToolChunk || isChunkComplete) {
              loggedFirstToolChunk = true;
              console.log('[MessageAlternativeService] Tool chunk updated', {
                toolCount: toolCallUpdates?.length || 0,
                isComplete: isChunkComplete
              });
            }
            this.events.onStreamingUpdate(branchId, '', false, false);
          }
        }
      );

      // === STEP 5: Finalize branch in storage (STORAGE-FIRST) ===
      await this.branchPersistence.finalizeDraft({
        conversationId: conversation.id,
        parentMessageId: aiMessageId,
        branchId,
        status: 'complete',
        makeActive: true,
        toolCalls,
        messageState: 'complete' // Update message-level state atomically
      });

      console.log('[MessageAlternativeService] Branch finalized in storage', {
        branchId,
        hasToolCalls: !!toolCalls?.length,
        contentLength: streamedContent.length
      });

      // === STEP 6: Reload from storage to get FRESH objects ===
      const freshConversation = await this.chatService.getConversation(conversation.id);
      if (!freshConversation) {
        console.error('[MessageAlternativeService] Failed to reload conversation after finalize');
        return;
      }

      // === STEP 7: Fire events with FRESH data (not mutated references) ===
      const freshMessage = freshConversation.messages.find(msg => msg.id === aiMessageId);
      const finalizedBranch = freshMessage?.alternativeBranches?.find(b => b.id === branchId);

      // Emit via event bus (replaces old callback delegation chain)
      if (finalizedBranch && freshMessage) {
        eventBus.emit(ChatEventNames.BRANCH_FINALIZED, {
          messageId: aiMessageId,
          branchId,
          branch: finalizedBranch,
          message: freshMessage,
          finalStatus: 'complete' as const
        });
      }

      // Update caller's conversation reference after events
      Object.assign(conversation, freshConversation);
      this.events.onConversationUpdated(freshConversation);

    } catch (error) {
      // Handle abort scenario
      if (error instanceof Error && error.name === 'AbortError') {
        if (hasBranchPersistence && branchId) {
          await this.branchPersistence.finalizeDraft({
            conversationId: conversation.id,
            parentMessageId: aiMessageId,
            branchId,
            status: 'aborted',
            messageState: 'aborted'
          });

          // Reload and fire events with fresh objects
          const freshConversation = await this.chatService.getConversation(conversation.id);
          if (freshConversation) {
            Object.assign(conversation, freshConversation);
            this.events.onConversationUpdated(freshConversation);
          }
          console.warn('[MessageAlternativeService] Branch aborted', { branchId });
        }
      } else {
        // Error scenario - discard draft
        if (hasBranchPersistence && branchId) {
          await this.branchPersistence.discardDraft({
            conversationId: conversation.id,
            parentMessageId: aiMessageId,
            branchId
          });

          // Reload and fire events with fresh objects
          const freshConversation = await this.chatService.getConversation(conversation.id);
          if (freshConversation) {
            Object.assign(conversation, freshConversation);
            this.events.onConversationUpdated(freshConversation);
          }
          console.error('[MessageAlternativeService] Branch discarded due to error', { branchId, error });
        }
        this.events.onError('Failed to generate alternative response');
      }
    } finally {
      this.currentAbortController = null;
      this.currentStreamingMessageId = null;
      this.events.onLoadingStateChanged(false);
    }
  }

  /**
   * Legacy fallback for when branch persistence is not available
   * DEPRECATED: This path should never execute in modern usage
   */
  private async createAlternativeResponseLegacy(
    conversation: ConversationData,
    aiMessageId: string,
    userMessage: ConversationMessage,
    originalContent: string,
    originalToolCalls: any[] | undefined,
    originalState: string | undefined,
    options?: any
  ): Promise<void> {
    console.error('[MessageAlternativeService] CRITICAL: Legacy path invoked - this should not happen');
    console.error('[MessageAlternativeService] Branch persistence should always be available');
    this.events.onError('Branch persistence not available - cannot retry message');
  }

  /**
   * Cancel current alternative generation
   */
  cancel(): void {
    if (this.currentAbortController && this.currentStreamingMessageId) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
      this.currentStreamingMessageId = null;
    }
  }

  /**
   * Check if currently generating an alternative
   */
  isGenerating(): boolean {
    return this.currentAbortController !== null;
  }
}
