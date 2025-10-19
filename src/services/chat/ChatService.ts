/**
 * ChatService - Native chatbot with direct agent integration
 *
 * Internal chatbot that calls LLM and executes tool calls via MCPConnector.
 *
 * Flow: User message → LLM → Tool calls → MCPConnector → Agents → Results → LLM → Response
 */

import { ConversationData, ConversationMessage, ToolCall, CreateConversationParams } from '../../types/chat/ChatTypes';
import { documentToConversationData } from '../../types/chat/ChatTypes';
import { getErrorMessage } from '../../utils/errorUtils';
import { ConversationContextBuilder } from './ConversationContextBuilder';
import { CostCalculator } from '../llm/adapters/CostCalculator';
import { generateSessionId } from '../../utils/sessionUtils';
import { ToolCallService } from './ToolCallService';

export interface ChatServiceOptions {
  maxToolIterations?: number;
  toolTimeout?: number;
  enableToolChaining?: boolean;
}

export interface ChatServiceDependencies {
  conversationService: any;
  llmService: any;
  vaultName: string;
  mcpConnector: any; // Required - MCPConnector for tool execution
}

export class ChatService {
  private toolCallService: ToolCallService;
  private currentProvider?: string; // Track current provider for context building
  private currentSessionId?: string; // Track current session ID for tool execution
  private isInitialized: boolean = false;

  constructor(
    private dependencies: ChatServiceDependencies,
    private options: ChatServiceOptions = {}
  ) {
    this.options = {
      maxToolIterations: 10,
      toolTimeout: 30000,
      enableToolChaining: true,
      ...options
    };

    // Initialize ToolCallService
    this.toolCallService = new ToolCallService(dependencies.mcpConnector);
  }

  /** Set tool event callback for live UI updates */
  setToolEventCallback(callback: (messageId: string, event: 'detected' | 'updated' | 'started' | 'completed', data: any) => void): void {
    this.toolCallService.setEventCallback(callback);
  }

  /** Initialize the MCP SDK Client integration */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    await this.toolCallService.initialize();
    this.isInitialized = true;
  }

  /**
   * Create a new conversation
   */
  async createConversation(
    title: string,
    initialMessage?: string,
    options?: {
      provider?: string;
      model?: string;
      systemPrompt?: string;
      workspaceId?: string;
    }
  ): Promise<{
    success: boolean;
    conversationId?: string;
    sessionId?: string;
    error?: string;
  }> {
    try {
      // Generate session ID using standard method
      const sessionId = generateSessionId();

      const conversation: ConversationData = {
        id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title,
        created: Date.now(),
        updated: Date.now(),
        messages: [],
        metadata: {
          chatSettings: {
            workspaceId: options?.workspaceId,
            sessionId: sessionId
          }
        }
      };

      // Create the base conversation in storage
      await this.dependencies.conversationService.createConversation({
        id: conversation.id,
        title: conversation.title,
        messages: [],
        metadata: conversation.metadata
      });

      // If there's an initial message, get AI response
      if (initialMessage?.trim()) {
        // Get AI response with potential tool calls
        // Use streaming method and collect complete response
        let completeResponse = '';
        for await (const chunk of this.generateResponseStreaming(conversation.id, initialMessage, options)) {
          completeResponse += chunk.chunk;
        }
        // Note: AI response is automatically saved by the streaming method
      }

      return {
        success: true,
        conversationId: conversation.id,
        sessionId: sessionId
      };
    } catch (error) {
      console.error('[ChatService] Failed to create conversation:', error);
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(params: {
    conversationId: string;
    role: 'user' | 'assistant';
    content: string;
    toolCalls?: any[];
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const result = await this.dependencies.conversationService.addMessage({
        conversationId: params.conversationId,
        role: params.role,
        content: params.content,
        toolCalls: params.toolCalls
      });

      return {
        success: result.success,
        messageId: result.messageId,
        error: result.error
      };
    } catch (error) {
      console.error('Failed to add message:', error);
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  }

  /**
   * Send a message and get AI response with iterative tool execution
   */
  async sendMessage(
    conversationId: string,
    message: string,
    options?: {
      provider?: string;
      model?: string;
      systemPrompt?: string;
      workspaceId?: string;
      sessionId?: string;
    }
  ): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    try {
      // Get existing conversation
      const conversation = await this.dependencies.conversationService.getConversation(conversationId);
      if (!conversation) {
        return { success: false, error: 'Conversation not found' };
      }

      // Add user message to repository
      const userMessage = await this.dependencies.conversationService.addMessage({
        conversationId,
        role: 'user',
        content: message
      });

      // Generate AI response with tool execution
      // Use streaming method and collect complete response
      let completeResponse = '';
      for await (const chunk of this.generateResponseStreaming(conversationId, message, options)) {
        completeResponse += chunk.chunk;
      }
      // Note: AI response is automatically saved by the streaming method

      return {
        success: true,
        messageId: userMessage.success ? userMessage.messageId : undefined
      };
    } catch (error) {
      console.error('Failed to send message:', error);
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  }

  /**
   * Generate AI response with streaming support
   * Yields chunks of the response as they're generated
   *
   * Always loads conversation from storage to ensure fresh data with tool calls
   */
  async* generateResponseStreaming(
    conversationId: string,
    userMessage: string,
    options?: {
      provider?: string;
      model?: string;
      systemPrompt?: string;
      workspaceId?: string;
      sessionId?: string;
      messageId?: string; // Allow passing existing messageId for UI consistency
      abortSignal?: AbortSignal; // Allow aborting the stream
    }
  ): AsyncGenerator<{ chunk: string; complete: boolean; messageId: string; toolCalls?: any[] }, void, unknown> {
    try {
      const messageId = options?.messageId || `msg_${Date.now()}_ai`;
      let accumulatedContent = '';

      // Get defaults from LLMService if user didn't select provider/model
      const defaultModel = this.dependencies.llmService.getDefaultModel();

      // Create placeholder message immediately so async usage callback can update it
      // This is saved early to ensure the message exists when async cost calculation completes
      await this.dependencies.conversationService.addMessage({
        conversationId,
        role: 'assistant',
        content: '', // Will be updated as streaming progresses
        id: messageId
      });

      // Get provider for context building
      const provider = options?.provider || defaultModel.provider;
      this.currentProvider = provider; // Store for context building
      this.currentSessionId = options?.sessionId; // Store for tool execution

      // ALWAYS load conversation from storage to get complete history including tool calls
      const conversation = await this.dependencies.conversationService.getConversation(conversationId);

      // Build conversation context for LLM with provider-specific formatting
      // NOTE: buildLLMMessages includes ALL messages from storage, including the user message
      // that was just saved by sendMessage(), so we DON'T add it again here
      const messages = conversation ?
        this.buildLLMMessages(conversation, provider, options?.systemPrompt) : [];

      // Add system prompt if provided and not already added by buildLLMMessages
      if (options?.systemPrompt && !messages.some(m => m.role === 'system')) {
        messages.unshift({ role: 'system', content: options.systemPrompt });
      }

      // Only add user message if it's NOT already in the conversation
      // (happens on first message when conversation is empty)
      if (!conversation || !conversation.messages.some((m: any) => m.content === userMessage && m.role === 'user')) {
        messages.push({ role: 'user', content: userMessage });
      }

      // Get tools from ToolCallService in OpenAI format
      const openAITools = this.toolCallService.getAvailableTools();

      // Prepare LLM options with converted tools
      const llmOptions: any = {
        provider: options?.provider || defaultModel.provider,
        model: options?.model || defaultModel.model,
        systemPrompt: options?.systemPrompt,
        tools: openAITools,
        toolChoice: openAITools.length > 0 ? 'auto' : undefined,
        abortSignal: options?.abortSignal,
        sessionId: options?.sessionId, // ✅ Pass session ID to LLMService for tool execution
        workspaceId: options?.workspaceId // ✅ Pass workspace ID to LLMService for tool execution
      };

      // Add tool event callback for live UI updates (delegates to ToolCallService)
      llmOptions.onToolEvent = (event: 'started' | 'completed', data: any) => {
        this.toolCallService.fireToolEvent(messageId, event, data);
      };

      // Add usage callback for async cost calculation (e.g., OpenRouter streaming)
      llmOptions.onUsageAvailable = async (usage: any, cost: any) => {
        console.log('[ChatService] Async usage available:', { usage, cost, messageId });

        try {
          // Load conversation, find message, update it, save back
          const conversation = await this.dependencies.conversationService.getConversation(conversationId);
          if (!conversation) {
            console.error('[ChatService] Conversation not found for async usage update');
            return;
          }

          // Find the message by ID
          const message = conversation.messages.find((m: any) => m.id === messageId);
          if (!message) {
            console.error('[ChatService] Message not found for async usage update:', messageId);
            return;
          }

          // Check if message already has cost (to prevent double-counting)
          const hadCost = !!message.cost;

          // Update message with usage and cost
          message.usage = usage;
          message.cost = cost;

          // Update conversation-level cost summary (only if message didn't already have cost)
          if (cost && !hadCost) {
            conversation.metadata = conversation.metadata || {};
            conversation.metadata.totalCost = (conversation.metadata.totalCost || 0) + (cost.totalCost || 0);
            console.log('[ChatService] Added cost to metadata.totalCost:', cost.totalCost);
          } else if (hadCost) {
            console.log('[ChatService] Message already had cost, skipping metadata update to prevent double-counting');
          }

          // Save updated conversation
          await this.dependencies.conversationService.updateConversation(conversationId, {
            messages: conversation.messages,
            metadata: conversation.metadata
          });

          console.log('[ChatService] ✓ Message updated with async usage/cost');
        } catch (error) {
          console.error('[ChatService] Failed to update message with async usage:', error);
        }
      };

      // Stream the response from LLM service with MCP tools
      let toolCalls: any[] | undefined = undefined;
      let toolCallsSaved = false; // Track if we've saved the tool call message
      this.toolCallService.resetDetectedTools(); // Reset tool detection state for new message

      // Track usage and cost for conversation tracking
      let finalUsage: any = undefined;
      let finalCost: any = undefined;

      // Log what we're sending to the LLM
      console.log('[ChatService] ========== GENERATING LLM RESPONSE ==========');
      console.log('[ChatService] User message:', userMessage);
      console.log('[ChatService] Messages being sent to LLM:', JSON.stringify(messages, null, 2));
      console.log('[ChatService] LLM options:', {
        provider: llmOptions.provider,
        model: llmOptions.model,
        systemPrompt: llmOptions.systemPrompt ? llmOptions.systemPrompt.substring(0, 200) + '...' : 'none',
        toolCount: llmOptions.tools?.length || 0,
        sessionId: llmOptions.sessionId,
        workspaceId: llmOptions.workspaceId
      });
      console.log('[ChatService] ===================================================');

      for await (const chunk of this.dependencies.llmService.generateResponseStream(messages, llmOptions)) {
        // Check if aborted FIRST before processing chunk
        if (options?.abortSignal?.aborted) {
          throw new DOMException('Generation aborted by user', 'AbortError');
        }

        accumulatedContent += chunk.chunk;

        // Extract usage for cost calculation
        if (chunk.usage) {
          console.log('[ChatService] Received usage from chunk:', chunk.usage);
          finalUsage = chunk.usage;
        }

        // Extract tool calls when available and handle progressive display
        if (chunk.toolCalls) {
          toolCalls = chunk.toolCalls;

          // Save assistant message with tool calls immediately when detected (before pingpong)
          // This happens ONCE when tool calls are first complete
          if (chunk.toolCallsReady && !toolCallsSaved) {
            await this.dependencies.conversationService.addMessage({
              conversationId,
              role: 'assistant',
              content: null, // OpenAI format: content is null when making tool calls
              toolCalls: toolCalls
            });
            toolCallsSaved = true;
          }

          // Handle progressive tool call detection (fires 'detected' and 'updated' events)
          if (toolCalls) {
            this.toolCallService.handleToolCallDetection(
              messageId,
              toolCalls,
              chunk.toolCallsReady || false,
              conversationId
            );
          }
        }

        // Save to database BEFORE yielding final chunk to ensure persistence
        if (chunk.complete) {
          // Calculate cost from final usage
          console.log('[ChatService] Final usage before cost calc:', finalUsage);
          if (finalUsage) {
            const costBreakdown = CostCalculator.calculateCost(
              provider,
              llmOptions.model,
              {
                inputTokens: finalUsage.promptTokens,
                outputTokens: finalUsage.completionTokens,
                totalTokens: finalUsage.totalTokens,
                source: 'provider_api'
              }
            );
            console.log('[ChatService] Cost breakdown calculated:', costBreakdown);

            if (costBreakdown) {
              finalCost = {
                totalCost: costBreakdown.totalCost,
                currency: costBreakdown.currency
              };
            }
          }

          // Update the placeholder message with final content
          // Load conversation, find message, update it
          const conv = await this.dependencies.conversationService.getConversation(conversationId);
          if (conv) {
            const msg = conv.messages.find((m: any) => m.id === messageId);
            if (msg) {
              // Update existing placeholder message
              msg.content = accumulatedContent;

              // Only update cost/usage if we have values (don't overwrite with undefined)
              // This prevents overwriting async updates from OpenRouter's generation API
              if (finalCost) {
                msg.cost = finalCost;
              }
              if (finalUsage) {
                msg.usage = finalUsage;
              }

              msg.provider = provider;
              msg.model = llmOptions.model;

              // Update conversation-level cost summary
              if (finalCost) {
                conv.metadata = conv.metadata || {};
                conv.metadata.totalCost = (conv.metadata.totalCost || 0) + (finalCost.totalCost || 0);
              }

              // Save updated conversation
              await this.dependencies.conversationService.updateConversation(conversationId, {
                messages: conv.messages,
                metadata: conv.metadata
              });
            }
          }

          // Handle tool calls - if present, add separate message for pingpong response
          if (toolCalls && toolCalls.length > 0) {
            // Had tool calls - the placeholder is the tool call message, add pingpong response separately
            await this.dependencies.conversationService.addMessage({
              conversationId,
              role: 'assistant',
              content: accumulatedContent, // Pingpong response text
              cost: finalCost,
              usage: finalUsage,
              provider: provider,
              model: llmOptions.model
              // No toolCalls - this is the response AFTER seeing tool results
            });
          }
        }

        yield {
          chunk: chunk.chunk,
          complete: chunk.complete,
          messageId,
          toolCalls: toolCalls
        };

        if (chunk.complete) {
          break;
        }
      }

    } catch (error) {
      console.error('Error in generateResponseStreaming:', error);
      throw error;
    }
  }


  /**
   * Build message history for LLM context using provider-specific formatting
   * 
   * This method now uses ConversationContextBuilder to properly reconstruct
   * conversation history with tool calls in the correct format for each provider.
   */
  private buildLLMMessages(conversation: ConversationData, provider?: string, systemPrompt?: string): any[] {
    const currentProvider = provider || this.getCurrentProvider();

    return ConversationContextBuilder.buildContextForProvider(
      conversation,
      currentProvider,
      systemPrompt
    );
  }

  /**
   * Get current provider for context building
   */
  private getCurrentProvider(): string {
    return this.currentProvider || this.dependencies.llmService.getDefaultModel().provider;
  }

  /**
   * Update conversation with new data
   */
  async updateConversation(conversation: ConversationData): Promise<{ success: boolean; error?: string }> {
    try {
      await this.dependencies.conversationService.updateConversation(
        conversation.id,
        {
          title: conversation.title,
          messages: conversation.messages
        }
      );

      return {
        success: true
      };
    } catch (error) {
      console.error('Failed to update conversation:', error);
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  }

  /**
   * Get conversation by ID
   */
  async getConversation(id: string): Promise<ConversationData | null> {
    const conversation = await this.dependencies.conversationService.getConversation(id);
    if (!conversation) return null;

    // ConversationService returns conversation objects directly
    return {
      id: conversation.id,
      title: conversation.title || 'Untitled Conversation',
      created: conversation.created || Date.now(),
      updated: conversation.updated || Date.now(),
      messages: conversation.messages || [],
      metadata: conversation.metadata // CRITICAL: Include metadata for cost tracking
    };
  }

  /**
   * List conversations
   */
  async listConversations(options?: { limit?: number; offset?: number }): Promise<ConversationData[]> {
    const searchResults = await this.dependencies.conversationService.listConversations(
      this.dependencies.vaultName,
      options?.limit || 50
    );

    // Convert conversation documents to ConversationData format
    return searchResults.map((document: any) => ({
      id: document.id,
      title: document.title || 'Untitled Conversation',
      created: document.created || Date.now(),
      updated: document.updated || Date.now(),
      messages: [] // Messages not loaded in list view for performance
    }));
  }

  /**
   * Delete conversation
   */
  async deleteConversation(id: string): Promise<boolean> {
    try {
      await this.dependencies.conversationService.deleteConversation(id);
      // Note: Tool call history is stored per-message, not per-conversation
      return true;
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      return false;
    }
  }

  /**
   * Search conversations
   */
  async searchConversations(query: string, limit = 10): Promise<any[]> {
    // This would use the conversation search service when available
    try {
      const conversations = await this.listConversations({ limit: 50 });
      return conversations
        .filter(conv => 
          conv.title.toLowerCase().includes(query.toLowerCase()) ||
          conv.messages.some(msg => msg.content.toLowerCase().includes(query.toLowerCase()))
        )
        .slice(0, limit)
        .map(conv => ({
          id: conv.id,
          title: conv.title,
          summary: conv.messages[0]?.content.substring(0, 100) + '...',
          relevanceScore: 0.8, // Mock score
          lastUpdated: conv.updated
        }));
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  }

  /**
   * Get conversation repository for branch management
   */
  getConversationRepository(): any {
    return this.dependencies.conversationService;
  }

  /**
   * Get conversation service (alias for getConversationRepository)
   */
  getConversationService(): any {
    return this.dependencies.conversationService;
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    // Cleanup if needed
  }
}