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
  private toolEventCallback?: (messageId: string, event: 'detected' | 'started' | 'completed', data: any) => void;
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
  setToolEventCallback(callback: (messageId: string, event: 'detected' | 'started' | 'completed', data: any) => void): void {
    this.toolEventCallback = callback;
  }

  /**
   * Initialize the MCP SDK Client integration
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('[ChatService] Already initialized, skipping duplicate initialization');
      return;
    }

    try {
      // Get available tools from MCPConnector (queries all registered agents)
      this.availableTools = this.dependencies.mcpConnector.getAvailableTools();

      this.isInitialized = true;

      console.log(`[ChatService] ✅ Initialized with ${this.availableTools.length} tools via MCPConnector`);
      console.log('[ChatService] 📋 Tool manifest loaded:', {
        toolCount: this.availableTools.length,
        firstFiveTools: this.availableTools.slice(0, 5).map(t => ({
          name: t.name,
          description: t.description?.substring(0, 50) + '...'
        })),
        sampleToolStructure: this.availableTools[0]
      });

    } catch (error) {
      console.error('[ChatService] ❌ Failed to initialize tools from MCPConnector:', error);
      this.availableTools = [];
      console.warn('[ChatService] ⚠️ No tools available - chatbot will work without tools');
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
      console.error('[ChatService] Failed to add message:', error);
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
      console.error('[ChatService] Failed to send message:', error);
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

      console.log(`[ChatService] Using provider: ${provider} for conversation context`);

      // ALWAYS load conversation from storage to get complete history including tool calls
      const conversation = await this.dependencies.conversationService.getConversation(conversationId);
      console.log(`[ChatService] Loaded conversation from storage:`, {
        conversationId,
        found: !!conversation,
        messageCount: conversation?.messages?.length || 0
      });

      // Build conversation context for LLM with provider-specific formatting
      const messages = conversation ?
        this.buildLLMMessages(conversation, provider, options?.systemPrompt) : [];

      // Add system prompt if provided and not already added by buildLLMMessages
      if (options?.systemPrompt && !messages.some(m => m.role === 'system')) {
        messages.unshift({ role: 'system', content: options.systemPrompt });
      }

      messages.push({ role: 'user', content: userMessage });

      console.log(`[ChatService] Final message context has ${messages.length} messages for LLM`);

      // Convert MCP tools to OpenAI format before passing to LLM
      const openAITools = this.convertMCPToolsToOpenAIFormat(this.availableTools);

      // Prepare LLM options with converted tools
      const llmOptions: any = {
        provider: options?.provider || defaultModel.provider,
        model: options?.model || defaultModel.model,
        systemPrompt: options?.systemPrompt,
        tools: openAITools,
        toolChoice: openAITools.length > 0 ? 'auto' : undefined
      };

      console.log('[ChatService] Passing tools to LLM:', {
        toolCount: openAITools.length,
        toolNames: openAITools.slice(0, 5).map(t => t.function.name),
        toolChoice: llmOptions.toolChoice,
        sampleToolFormat: openAITools[0]
      });

      // Add tool event callback for live UI updates
      if (this.toolEventCallback) {
        llmOptions.onToolEvent = (event: 'started' | 'completed', data: any) => {
          this.toolEventCallback!(messageId, event, data);
        };
        console.log('[ChatService] Added tool event callback to llmOptions');
      }

      // Stream the response from LLM service with MCP tools
      let toolCalls: any[] | undefined = undefined;
      
      for await (const chunk of this.dependencies.llmService.generateResponseStream(messages, llmOptions)) {
        accumulatedContent += chunk.chunk;

        // Extract tool calls when available (typically on completion)
        if (chunk.toolCalls) {
          toolCalls = chunk.toolCalls;
          console.log('[ChatService] Tool calls received in stream:', {
            toolCallCount: toolCalls?.length || 0,
            toolNames: toolCalls?.map(tc => tc.name || tc.function?.name).filter(Boolean) || [],
            toolCallsStructure: toolCalls?.map(tc => ({
              id: tc.id,
              name: tc.name || tc.function?.name,
              hasParameters: !!(tc.parameters || tc.arguments)
            })) || []
          });

          // Fire 'detected' event for each tool call to create UI accordions immediately
          if (this.toolEventCallback && toolCalls) {
            console.log('[ChatService] FIRING detected event for tool calls:', {
              toolCount: toolCalls.length,
              toolNames: toolCalls.map(tc => tc.name || tc.function?.name),
              messageId,
              hasCallback: !!this.toolEventCallback
            });
            for (const tc of toolCalls) {
              const toolData = {
                id: tc.id,
                name: tc.name || tc.function?.name,
                parameters: tc.parameters || tc.arguments
              };
              console.log('[ChatService] Calling toolEventCallback with detected event:', toolData);
              this.toolEventCallback(messageId, 'detected', toolData);
            }
          } else if (!toolCalls) {
            console.warn('[ChatService] No tool calls to fire detected event for');
          }

          // Immediately yield tool calls for UI update
          yield {
            chunk: '',
            complete: false,
            messageId,
            toolCalls: toolCalls
          };
        }
        
        // Save to database BEFORE yielding final chunk to ensure persistence
        if (chunk.complete) {
          console.log('[ChatService] Saving chronological messages to repository:', {
            conversationId,
            hasToolCalls: !!(toolCalls && toolCalls.length > 0),
            toolCallCount: toolCalls?.length || 0,
            assistantContentLength: accumulatedContent.length,
            toolCallsPreview: toolCalls?.slice(0, 2).map(tc => ({
              id: tc.id,
              name: tc.name || tc.function?.name,
              hasResult: !!tc.result
            })) || []
          });
          
          // Save messages based on whether there were tool calls
          if (toolCalls && toolCalls.length > 0) {
            // Save tool message with tool call details
            await this.dependencies.conversationService.addMessage({
              conversationId,
              role: 'tool',
              content: `Executed ${toolCalls.length} tool${toolCalls.length > 1 ? 's' : ''}: ${toolCalls.map(tc => tc.name || tc.function?.name).join(', ')}`,
              toolCalls: toolCalls
            });

            // Save assistant response WITH tool calls attached so UI can show them
            await this.dependencies.conversationService.addMessage({
              conversationId,
              role: 'assistant',
              content: accumulatedContent,
              toolCalls: toolCalls // Keep tool calls attached for UI rendering
            });
          } else {
            // No tool calls, just save assistant message
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
      console.error('[ChatService] Error in generateResponseStreaming:', error);
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
        console.error(`[ChatService] Tool call failed for ${toolCall.name}:`, error);

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
    
    console.log(`[ChatService] Building LLM context for provider: ${currentProvider}`);
    console.log(`[ChatService] Conversation has ${conversation.messages.length} messages`);
    
    // Count tool calls for debugging
    const totalToolCalls = conversation.messages.reduce((count, msg) => 
      count + (msg.toolCalls?.length || 0), 0);
    console.log(`[ChatService] Total tool calls in conversation: ${totalToolCalls}`);
    
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
      console.error('[ChatService] Failed to update conversation:', error);
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
      console.error('[ChatService] Failed to delete conversation:', error);
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
      console.error('[ChatService] Search failed:', error);
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
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    // Cleanup if needed
    console.log('[ChatService] Disposed');
  }
}