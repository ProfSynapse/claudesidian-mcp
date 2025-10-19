/**
 * ChatService - Native chatbot with direct agent integration
 *
 * Internal chatbot that calls LLM and executes tool calls via MCPConnector.
 *
 * Flow: User message → LLM → Tool calls → MCPConnector → Agents → Results → LLM → Response
 */

import { ConversationData, ConversationMessage, ToolCall, CreateConversationParams } from '../../types/chat/ChatTypes';
import { getErrorMessage } from '../../utils/errorUtils';
import { ToolCallService } from './ToolCallService';
import { CostTrackingService } from './CostTrackingService';
import { ConversationQueryService } from './ConversationQueryService';
import { ConversationManager } from './ConversationManager';
import { StreamingResponseService } from './StreamingResponseService';

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
  private costTrackingService: CostTrackingService;
  private conversationQueryService: ConversationQueryService;
  private conversationManager: ConversationManager;
  private streamingResponseService: StreamingResponseService;
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

    // Initialize services
    this.toolCallService = new ToolCallService(dependencies.mcpConnector);
    this.costTrackingService = new CostTrackingService(dependencies.conversationService);
    this.conversationQueryService = new ConversationQueryService(dependencies.conversationService);
    this.streamingResponseService = new StreamingResponseService({
      llmService: dependencies.llmService,
      conversationService: dependencies.conversationService,
      toolCallService: this.toolCallService,
      costTrackingService: this.costTrackingService
    });
    this.conversationManager = new ConversationManager(
      {
        conversationService: dependencies.conversationService,
        streamingGenerator: this.generateResponseStreaming.bind(this)
      },
      dependencies.vaultName
    );
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
      const conversation = await this.conversationManager.createConversation({
        title,
        initialMessage,
        provider: options?.provider,
        model: options?.model,
        systemPrompt: options?.systemPrompt,
        workspaceId: options?.workspaceId
      });

      // If there's an initial message, get AI response
      if (initialMessage?.trim()) {
        // Generate streaming response
        let completeResponse = '';
        for await (const chunk of this.generateResponseStreaming(conversation.id, initialMessage, options)) {
          completeResponse += chunk.chunk;
        }
      }

      return {
        success: true,
        conversationId: conversation.id,
        sessionId: conversation.metadata?.chatSettings?.sessionId
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
      await this.conversationManager.addMessage({
        conversationId: params.conversationId,
        role: params.role,
        content: params.content,
        toolCalls: params.toolCalls
      });

      return {
        success: true
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
      // Use streaming method and collect complete response
      let completeResponse = '';
      let messageId: string | undefined;
      for await (const chunk of this.conversationManager.sendMessage(conversationId, message, options)) {
        completeResponse += chunk.chunk;
        messageId = chunk.messageId;
      }

      return {
        success: true,
        messageId
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
   * Delegates to StreamingResponseService for coordination
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
      messageId?: string;
      abortSignal?: AbortSignal;
    }
  ): AsyncGenerator<{ chunk: string; complete: boolean; messageId: string; toolCalls?: any[] }, void, unknown> {
    // Store current provider and session for backward compatibility
    if (options?.provider) {
      this.currentProvider = options.provider;
      this.streamingResponseService.setProvider(options.provider);
    }
    if (options?.sessionId) {
      this.currentSessionId = options.sessionId;
    }

    // Delegate to StreamingResponseService
    yield* this.streamingResponseService.generateResponse(conversationId, userMessage, options);
  }

  /**
   * Update conversation with new data
   */
  async updateConversation(conversation: ConversationData): Promise<{ success: boolean; error?: string }> {
    try {
      await this.conversationManager.updateConversation(conversation.id, {
        title: conversation.title,
        messages: conversation.messages
      });

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

  /** Get conversation by ID */
  async getConversation(id: string): Promise<ConversationData | null> {
    return this.conversationQueryService.getConversation(id);
  }

  /** List conversations */
  async listConversations(options?: { limit?: number; offset?: number }): Promise<ConversationData[]> {
    return this.conversationQueryService.listConversations(options);
  }

  /**
   * Delete conversation
   */
  async deleteConversation(id: string): Promise<boolean> {
    return await this.conversationManager.deleteConversation(id);
  }

  /** Search conversations */
  async searchConversations(query: string, limit = 10): Promise<any[]> {
    const results = await this.conversationQueryService.searchConversations(query, { limit });
    return results.map(conv => ({
      id: conv.id,
      title: conv.title,
      summary: conv.messages[0]?.content.substring(0, 100) + '...',
      relevanceScore: 0.8,
      lastUpdated: conv.updated
    }));
  }

  /** Get conversation repository for branch management */
  getConversationRepository(): any {
    return this.conversationQueryService.getConversationRepository();
  }

  /** Get conversation service (alias for getConversationRepository) */
  getConversationService(): any {
    return this.conversationQueryService.getConversationService();
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    // Cleanup if needed
  }
}