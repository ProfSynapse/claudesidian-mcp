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
  private availableTools: any[] = [];
  private toolCallHistory = new Map<string, ToolCall[]>();
  private toolEventCallback?: (messageId: string, event: 'detected' | 'updated' | 'started' | 'completed', data: any) => void;
  private currentProvider?: string; // Track current provider for context building
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
  }

  /**
   * Set tool event callback for live UI updates
   */
  setToolEventCallback(callback: (messageId: string, event: 'detected' | 'updated' | 'started' | 'completed', data: any) => void): void {
    this.toolEventCallback = callback;
  }

  /**
   * Initialize the MCP SDK Client integration
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Get available tools from MCPConnector (queries all registered agents)
      this.availableTools = this.dependencies.mcpConnector.getAvailableTools();

      this.isInitialized = true;

    } catch (error) {
      console.error('Failed to initialize tools from MCPConnector:', error);
      this.availableTools = [];
    }
  }

  /**
   * Convert MCP tools (with inputSchema) to OpenAI format (with parameters)
   */
  private convertMCPToolsToOpenAIFormat(mcpTools: any[]): any[] {
    return mcpTools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema // MCP's inputSchema maps to OpenAI's parameters
      }
    }));
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
    }
  ): Promise<{
    success: boolean;
    conversationId?: string;
    error?: string;
  }> {
    try {
      const conversation: ConversationData = {
        id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title,
        created: Date.now(),
        updated: Date.now(),
        messages: []
      };

      // Create the base conversation in storage
      await this.dependencies.conversationService.createConversation({
        id: conversation.id,
        title: conversation.title,
        messages: []
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
        conversationId: conversation.id
      };
    } catch (error) {
      console.error('Failed to create conversation:', error);
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
      messageId?: string; // Allow passing existing messageId for UI consistency
      abortSignal?: AbortSignal; // Allow aborting the stream
    }
  ): AsyncGenerator<{ chunk: string; complete: boolean; messageId: string; toolCalls?: any[] }, void, unknown> {
    try {
      const messageId = options?.messageId || `msg_${Date.now()}_ai`;
      let accumulatedContent = '';

      // Get defaults from LLMService if user didn't select provider/model
      const defaultModel = this.dependencies.llmService.getDefaultModel();

      // Get provider for context building
      const provider = options?.provider || defaultModel.provider;
      this.currentProvider = provider; // Store for context building

      // ALWAYS load conversation from storage to get complete history including tool calls
      const conversation = await this.dependencies.conversationService.getConversation(conversationId);

      // LOG: Show what conversation was loaded from storage
      console.log('[ChatService] Loaded conversation from storage:', {
        id: conversationId,
        messageCount: conversation?.messages?.length || 0,
        messages: conversation?.messages?.map((m: any) => ({
          role: m.role,
          hasToolCalls: !!m.toolCalls,
          toolCallCount: m.toolCalls?.length || 0,
          contentPreview: m.content?.substring(0, 50)
        })) || []
      });

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

      // Convert MCP tools to OpenAI format before passing to LLM
      const openAITools = this.convertMCPToolsToOpenAIFormat(this.availableTools);

      // Prepare LLM options with converted tools
      const llmOptions: any = {
        provider: options?.provider || defaultModel.provider,
        model: options?.model || defaultModel.model,
        systemPrompt: options?.systemPrompt,
        tools: openAITools,
        toolChoice: openAITools.length > 0 ? 'auto' : undefined,
        abortSignal: options?.abortSignal
      };

      // Removed verbose LLM request logging - enable if debugging needed

      // Add tool event callback for live UI updates
      if (this.toolEventCallback) {
        llmOptions.onToolEvent = (event: 'started' | 'completed', data: any) => {
          this.toolEventCallback!(messageId, event, data);
        };
      }

      // Stream the response from LLM service with MCP tools
      let toolCalls: any[] | undefined = undefined;
      let toolCallsSaved = false; // Track if we've saved the tool call message
      const detectedToolIds = new Set<string>(); // Track which tools we've already fired 'detected' for

      for await (const chunk of this.dependencies.llmService.generateResponseStream(messages, llmOptions)) {
        // Check if aborted FIRST before processing chunk
        if (options?.abortSignal?.aborted) {
          throw new DOMException('Generation aborted by user', 'AbortError');
        }

        accumulatedContent += chunk.chunk;

        // Extract tool calls when available and handle progressive display
        if (chunk.toolCalls) {
          toolCalls = chunk.toolCalls;

          // Save assistant message with tool calls immediately when detected (before pingpong)
          // This happens ONCE when tool calls are first complete
          if (chunk.toolCallsReady && !toolCallsSaved) {
            console.log('[ChatService] Saving assistant message with tool calls (before execution)');
            await this.dependencies.conversationService.addMessage({
              conversationId,
              role: 'assistant',
              content: null, // OpenAI format: content is null when making tool calls
              toolCalls: toolCalls
            });
            toolCallsSaved = true;
          }

          // Fire 'detected' event for NEW tool calls (only once per tool)
          // This creates the accordion immediately for progressive display
          if (this.toolEventCallback && toolCalls) {
            for (const tc of toolCalls) {
              const toolId = tc.id || `${tc.function?.name}_${Date.now()}`;

              // Only fire 'detected' once per tool
              if (!detectedToolIds.has(toolId)) {
                detectedToolIds.add(toolId);

                const toolData = {
                  id: toolId,
                  name: tc.name || tc.function?.name,
                  parameters: tc.function?.arguments || tc.parameters, // May be incomplete
                  isComplete: chunk.toolCallsReady || false // Flag if parameters are complete
                };
                this.toolEventCallback(messageId, 'detected', toolData);
              } else if (chunk.toolCallsReady) {
                // Tool already detected, but now parameters are complete - fire 'updated' event
                const toolData = {
                  id: toolId,
                  name: tc.name || tc.function?.name,
                  parameters: tc.function?.arguments || tc.parameters,
                  isComplete: true
                };
                this.toolEventCallback(messageId, 'updated', toolData);
              }
            }
          }
        }

        // Save to database BEFORE yielding final chunk to ensure persistence
        if (chunk.complete) {
          // Save final response (pingpong result or direct response)
          if (toolCalls && toolCalls.length > 0) {
            // Had tool calls - save pingpong response as separate assistant message
            console.log('[ChatService] Saving pingpong response (after tool execution):', {
              contentLength: accumulatedContent.length,
              contentPreview: accumulatedContent.substring(0, 100)
            });
            await this.dependencies.conversationService.addMessage({
              conversationId,
              role: 'assistant',
              content: accumulatedContent // Pingpong response text
              // No toolCalls - this is the response AFTER seeing tool results
            });
          } else {
            // No tool calls - save regular assistant response
            console.log('[ChatService] Saving regular assistant response (no tools)');
            await this.dependencies.conversationService.addMessage({
              conversationId,
              role: 'assistant',
              content: accumulatedContent
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
   * Execute tool calls via MCPConnector
   */
  private async executeToolCallsViaConnector(toolCalls: any[]): Promise<ToolCall[]> {
    const results: ToolCall[] = [];

    for (const toolCall of toolCalls) {
      try {
        // Parse tool name: "contentManager_readContent" → agent + mode
        const [agent, mode] = toolCall.name.split('_');

        if (!agent || !mode) {
          throw new Error(`Invalid tool name format: ${toolCall.name}. Expected format: agent_mode`);
        }

        // Call connector directly (internal call to agent/mode)
        const result = await this.dependencies.mcpConnector.callTool({
          agent,
          mode,
          params: toolCall.arguments || toolCall.parameters || {}
        });

        results.push({
          id: toolCall.id,
          type: 'function',
          name: toolCall.name,
          function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.arguments || toolCall.parameters || {})
          },
          parameters: toolCall.arguments || toolCall.parameters,
          result: result,
          success: true
        });

      } catch (error) {
        console.error(`Tool call failed for ${toolCall.name}:`, error);

        results.push({
          id: toolCall.id,
          type: 'function',
          name: toolCall.name,
          function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.arguments || toolCall.parameters || {})
          },
          parameters: toolCall.arguments || toolCall.parameters,
          success: false,
          error: getErrorMessage(error)
        });
      }
    }

    return results;
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
      const result = await this.dependencies.conversationService.updateConversation(
        conversation.id,
        { 
          title: conversation.title,
          messages: conversation.messages
        }
      );

      return {
        success: result.success,
        error: result.error
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
      messages: conversation.messages || []
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
      this.toolCallHistory.delete(id);
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