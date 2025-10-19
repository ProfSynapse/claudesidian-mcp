/**
 * ConversationManager - Handles conversation creation and modification
 *
 * Responsibilities:
 * - Create new conversations with optional initial message
 * - Send messages and coordinate AI responses
 * - Add messages to conversations
 * - Update conversation data
 * - Delete conversations
 *
 * Follows Single Responsibility Principle - only handles conversation write operations.
 */

import { ConversationData, CreateConversationParams } from '../../types/chat/ChatTypes';
import { generateSessionId } from '../../utils/sessionUtils';

export interface ConversationManagerDependencies {
  conversationService: any;
  streamingGenerator: (
    conversationId: string,
    userMessage: string,
    options?: any
  ) => AsyncGenerator<any, void, unknown>;
}

export class ConversationManager {
  constructor(
    private dependencies: ConversationManagerDependencies,
    private vaultName: string
  ) {}

  /**
   * Create a new conversation
   */
  async createConversation(params: CreateConversationParams): Promise<ConversationData> {
    const conversation = await this.dependencies.conversationService.createConversation({
      title: params.title,
      vaultName: this.vaultName,
      provider: params.provider,
      model: params.model,
      systemPrompt: params.systemPrompt,
      workspaceId: params.workspaceId,
      sessionId: params.sessionId || generateSessionId()
    });

    // Add initial message if provided
    if (params.initialMessage) {
      await this.dependencies.conversationService.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: params.initialMessage
      });
    }

    return conversation;
  }

  /**
   * Send a message and get AI response
   */
  async* sendMessage(
    conversationId: string,
    message: string,
    options?: {
      provider?: string;
      model?: string;
      systemPrompt?: string;
      workspaceId?: string;
      sessionId?: string;
      messageId?: string;
      abortSignal?: AbortSignal;
    }
  ): AsyncGenerator<{ chunk: string; complete: boolean; messageId: string; toolCalls?: any[] }, void, unknown> {
    // Save user message first
    await this.dependencies.conversationService.addMessage({
      conversationId,
      role: 'user',
      content: message
    });

    // Generate streaming response
    yield* this.dependencies.streamingGenerator(conversationId, message, options);
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(params: {
    conversationId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    id?: string;
    toolCalls?: any[];
  }): Promise<void> {
    await this.dependencies.conversationService.addMessage(params);
  }

  /**
   * Update conversation metadata
   */
  async updateConversation(conversationId: string, updates: Partial<ConversationData>): Promise<void> {
    await this.dependencies.conversationService.updateConversation(conversationId, updates);
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(id: string): Promise<boolean> {
    try {
      await this.dependencies.conversationService.deleteConversation(id);
      return true;
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      return false;
    }
  }

  /**
   * Update conversation title
   */
  async updateTitle(conversationId: string, title: string): Promise<void> {
    await this.updateConversation(conversationId, { title });
  }

  /**
   * Set conversation workspace
   */
  async setWorkspace(conversationId: string, workspaceId: string): Promise<void> {
    await this.updateConversation(conversationId, {
      metadata: { workspaceId }
    });
  }
}
