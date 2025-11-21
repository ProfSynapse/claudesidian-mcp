import { ChatService } from '../../../services/chat/ChatService';
import { MessageAlternativeBranch, MessageAlternativeStatus } from '../../../types/chat/ChatTypes';

export interface BranchDraftContext {
  conversationId: string;
  parentMessageId: string;
  branchId?: string;
  provider?: string;
  model?: string;
  metadata?: Record<string, any>;
}

export interface BranchDraftUpdate {
  appendContent?: string;
  content?: string;
  status?: MessageAlternativeStatus;
  toolCalls?: any[];
  metadata?: Record<string, any>;
}

/**
 * BranchStreamPersistence - Thin wrapper between UI services and ChatService branch APIs.
 * This isolates branch draft lifecycle management from the streaming orchestration layer.
 */
export class BranchStreamPersistence {
  constructor(private chatService: ChatService) {}

  async createDraft(context: BranchDraftContext): Promise<MessageAlternativeBranch | null> {
    return this.chatService.createBranchDraft(context);
  }

  async updateDraft(
    params: BranchDraftContext & BranchDraftUpdate & { branchId: string }
  ): Promise<MessageAlternativeBranch | null> {
    return this.chatService.updateBranchDraft({
      conversationId: params.conversationId,
      parentMessageId: params.parentMessageId,
      branchId: params.branchId,
      appendContent: params.appendContent,
      content: params.content,
      status: params.status,
      toolCalls: params.toolCalls,
      metadata: params.metadata
    });
  }

  async finalizeDraft(params: {
    conversationId: string;
    parentMessageId: string;
    branchId: string;
    status?: MessageAlternativeStatus;
    makeActive?: boolean;
    toolCalls?: any[];
    messageState?: 'draft' | 'streaming' | 'complete' | 'aborted';
  }): Promise<MessageAlternativeBranch | null> {
    return this.chatService.finalizeBranchDraft(params);
  }

  async discardDraft(params: {
    conversationId: string;
    parentMessageId: string;
    branchId: string;
  }): Promise<boolean> {
    return this.chatService.discardBranchDraft(params);
  }
}
