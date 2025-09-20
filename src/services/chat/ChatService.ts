/**
 * ChatService - Native chatbot with MCP client integration
 * 
 * Acts as an internal MCP client to our own MCP server, allowing the chatbot
 * to use all existing agents and tools through the MCP protocol.
 * 
 * Flow: User message → LLM → Tool calls → MCP client → Our agents → Results → LLM → Response
 */

import { ConversationRepository } from '../../database/services/chat/ConversationRepository';
import { ConversationData, ConversationMessage, ToolCall, CreateConversationParams } from '../../types/chat/ChatTypes';
import { documentToConversationData } from '../../types/chat/ChatTypes';
import { getErrorMessage } from '../../utils/errorUtils';
import { MCPChatIntegration, MCPChatOptions } from './MCPChatIntegration';
import { MCPConfigurationManager } from '../mcp/MCPConfigurationManager';
import { ConversationContextBuilder } from './ConversationContextBuilder';

export interface ChatServiceOptions {
  maxToolIterations?: number;
  toolTimeout?: number;
  enableToolChaining?: boolean;
  mcpServerPath?: string;
}

export interface ChatServiceDependencies {
  conversationRepo: ConversationRepository;
  llmService: any; // LLM service with tool calling support
  embeddingService: any; // For conversation summaries
  vaultName: string; // Name of the vault for conversation context
  mcpConnector?: any; // MCP connector for tool execution
  mcpServerUrl?: string; // HTTP URL of MCP server
}

export class ChatService {
  private availableTools: any[] = [];
  private toolCallHistory = new Map<string, ToolCall[]>();
  private mcpIntegration: MCPChatIntegration;
  private mcpConfig: MCPConfigurationManager;
  private toolEventCallback?: (messageId: string, event: 'started' | 'completed', data: any) => void;
  private currentProvider?: string; // Track current provider for context building
  
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
    
    // Initialize MCP integration
    this.mcpConfig = new MCPConfigurationManager();
    this.mcpIntegration = new MCPChatIntegration(this.mcpConfig);
  }

  /**
   * Set tool event callback for live UI updates
   */
  setToolEventCallback(callback: (messageId: string, event: 'started' | 'completed', data: any) => void): void {
    this.toolEventCallback = callback;
  }

  /**
   * Initialize the HTTP MCP integration
   */
  async initialize(): Promise<void> {
    try {
      
      // Initialize with MCP server URL if provided
      if (this.dependencies.mcpServerUrl) {
        this.mcpIntegration.initialize(this.dependencies.mcpServerUrl);
      }
      
      // Get real tools from MCP connector if available
      if (this.dependencies.mcpConnector && typeof this.dependencies.mcpConnector.getAvailableTools === 'function') {
        this.availableTools = this.dependencies.mcpConnector.getAvailableTools();
      } else {
        // Fallback: use static tool manifest for MVP
        console.warn('[ChatService] MCP connector not available, using static tool manifest');
        this.availableTools = this.getStaticToolManifest();
      }
      
      // Auto-configure MCP for supported providers
      if (this.dependencies.llmService) {
        this.mcpIntegration.autoConfigureProviders(this.dependencies.llmService);
      }
      
      // Log available tool count for debugging
      console.log(`[ChatService] Initialized with ${this.availableTools.length} tools available`);
      
    } catch (error) {
      console.error('[ChatService] Failed to initialize MCP integration:', error);
      // Continue without MCP connection - chatbot will work without tools
      this.availableTools = [];
    }
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
        created_at: Date.now(),
        last_updated: Date.now(),
        messages: []
      };

      const createParams: CreateConversationParams = {
        title: conversation.title,
        vaultName: this.dependencies.vaultName,
        initialMessage: initialMessage?.trim() ? {
          content: initialMessage,
          role: 'user'
        } : undefined
      };
      
      // Create the base conversation with initial message if provided
      await this.dependencies.conversationRepo.createConversation(createParams);

      // If there's an initial message, get AI response
      if (initialMessage?.trim()) {
        // Get AI response with potential tool calls
        // Use streaming method and collect complete response  
        let completeResponse = '';
        for await (const chunk of this.generateResponseStreaming(conversation.id, initialMessage, undefined, options)) {
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
      const result = await this.dependencies.conversationRepo.addMessage({
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
      const conversation = await this.dependencies.conversationRepo.getConversation(conversationId);
      if (!conversation) {
        return { success: false, error: 'Conversation not found' };
      }

      // Add user message to repository
      const userMessage = await this.dependencies.conversationRepo.addMessage({
        conversationId,
        role: 'user',
        content: message
      });

      // Generate AI response with tool execution
      // Use streaming method and collect complete response  
      let completeResponse = '';
      const conversationData = documentToConversationData(conversation);
      for await (const chunk of this.generateResponseStreaming(conversationId, message, conversationData, options)) {
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
   */
  async* generateResponseStreaming(
    conversationId: string,
    userMessage: string,
    conversation?: ConversationData,
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

      // Build conversation context for LLM with provider-specific formatting
      const messages = conversation ? 
        this.buildLLMMessages(conversation, provider, options?.systemPrompt) : [];
      
      // Add system prompt if provided and not already added by buildLLMMessages
      if (options?.systemPrompt && !messages.some(m => m.role === 'system')) {
        messages.unshift({ role: 'system', content: options.systemPrompt });
      }
      
      messages.push({ role: 'user', content: userMessage });
      
      console.log(`[ChatService] Final message context has ${messages.length} messages for LLM`);
      
      // Prepare MCP-enabled LLM options - use user selection or fallback to configured defaults
      const mcpOptions: MCPChatOptions = {
        providerId: options?.provider || defaultModel.provider,
        model: options?.model || defaultModel.model,  
        systemPrompt: options?.systemPrompt,
        enableMCP: this.availableTools.length > 0
      };
      
      const llmOptions = await this.mcpIntegration.prepareLLMOptions(
        {
          toolChoice: 'auto'
        },
        mcpOptions,
        this.availableTools
      );
      
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
          
          // Save separate tool and assistant messages
          if (toolCalls && toolCalls.length > 0) {
            // First: Save tool message with complete tool calls (including results)
            await this.dependencies.conversationRepo.addMessage({
              conversationId,
              role: 'tool',
              content: `Executed ${toolCalls.length} tool${toolCalls.length > 1 ? 's' : ''}: ${toolCalls.map(tc => tc.name || tc.function?.name).join(', ')}`,
              toolCalls: toolCalls
            });
          }
          
          // Second: Save assistant response message (clean text only)
          await this.dependencies.conversationRepo.addMessage({
            conversationId,
            role: 'assistant',
            content: accumulatedContent
            // No toolCalls here - they're in the separate tool message above
          });
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
   * Execute tool calls via MCP client
   */
  private async executeToolCallsViaMCP(toolCalls: any[]): Promise<ToolCall[]> {
    const results: ToolCall[] = [];

    for (const toolCall of toolCalls) {
      try {

        let result: any;

        // Use MCP connector for tool execution (fallback mode)
        if (this.dependencies.mcpConnector) {
          result = await this.dependencies.mcpConnector.callTool({
            agent: toolCall.name.split('.')[0] || toolCall.name.split('_')[0],
            mode: toolCall.name.split('.')[1] || toolCall.name.split('_')[1],
            params: toolCall.arguments || toolCall.parameters
          });
        } else {
          // Fallback: direct execution (for MVP)
          result = await this.executeToolDirectly(toolCall);
        }

        results.push({
          id: toolCall.id,
          name: toolCall.name,
          parameters: toolCall.arguments || toolCall.parameters,
          result: result,
          success: !result.error,
          error: result.error
        });

      } catch (error) {
        console.error(`[ChatService] Tool execution failed for ${toolCall.name}:`, error);
        results.push({
          id: toolCall.id,
          name: toolCall.name,
          parameters: toolCall.arguments || toolCall.parameters,
          success: false,
          error: getErrorMessage(error)
        });
      }
    }

    return results;
  }

  /**
   * Execute tool directly through MCP connector
   */
  private async executeToolDirectly(toolCall: any): Promise<any> {
    if (!this.dependencies.mcpConnector) {
      console.warn('[ChatService] No MCP connector available, using fallback');
      return {
        success: true,
        result: `Mock result for ${toolCall.name}`,
        message: 'This is a mock response - MCP connector not available'
      };
    }

    try {
      // Convert tool call to AgentModeParams format
      const agentModeParams = this.convertToolCallToAgentParams(toolCall);
      
      // Call the tool through the MCP connector
      const result = await this.dependencies.mcpConnector.callTool(agentModeParams);
      
      return {
        success: true,
        result: result,
        message: 'Executed via MCP connector'
      };
    } catch (error) {
      console.error(`[ChatService] Tool execution failed for ${toolCall.name}:`, error);
      return {
        success: false,
        error: getErrorMessage(error),
        result: null
      };
    }
  }

  /**
   * Convert LLM tool call format to AgentModeParams format
   */
  private convertToolCallToAgentParams(toolCall: any): any {
    // Parse the tool name to extract agent and mode
    // Tool names should be in format: "agentName.modeName"
    const [agent, mode] = toolCall.name.split('.');
    
    return {
      agent,
      mode,
      params: toolCall.arguments || toolCall.parameters || {}
    };
  }

  /**
   * Get static tool manifest for MVP
   * TODO: Replace with dynamic tool list from MCP client
   */
  private getStaticToolManifest(): any[] {
    return [
      {
        name: 'contentManager.read',
        description: 'Read content from a note',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the note' }
          },
          required: ['path']
        }
      },
      {
        name: 'contentManager.create',
        description: 'Create a new note',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path for new note' },
            content: { type: 'string', description: 'Content for the note' }
          },
          required: ['path', 'content']
        }
      },
      {
        name: 'contentManager.replace',
        description: 'Replace content in a note',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the note' },
            content: { type: 'string', description: 'New content' }
          },
          required: ['path', 'content']
        }
      },
      {
        name: 'vaultManager.list',
        description: 'List files in a directory',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Directory path' }
          },
          required: ['path']
        }
      },
      {
        name: 'vaultLibrarian.search',
        description: 'Search for notes',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            limit: { type: 'number', description: 'Max results' }
          },
          required: ['query']
        }
      }
    ];
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
      count + (msg.tool_calls?.length || 0), 0);
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
      const result = await this.dependencies.conversationRepo.updateConversation(
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
    const document = await this.dependencies.conversationRepo.getConversation(id);
    return document ? documentToConversationData(document) : null;
  }

  /**
   * List conversations
   */
  async listConversations(options?: { limit?: number; offset?: number }): Promise<ConversationData[]> {
    const searchResults = await this.dependencies.conversationRepo.listConversations(
      this.dependencies.vaultName,
      options?.limit || 50
    );

    // Convert ConversationDocument[] to ConversationData[]
    return searchResults.map(document => ({
      id: document.id,
      title: document.metadata.title,
      created_at: document.metadata.created_at,
      last_updated: document.metadata.last_updated,
      messages: [] // Messages not loaded in list view for performance
    }));
  }

  /**
   * Delete conversation
   */
  async deleteConversation(id: string): Promise<boolean> {
    try {
      await this.dependencies.conversationRepo.deleteConversation(id);
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
          lastUpdated: conv.last_updated
        }));
    } catch (error) {
      console.error('[ChatService] Search failed:', error);
      return [];
    }
  }

  /**
   * Get conversation repository for branch management
   */
  getConversationRepository(): ConversationRepository {
    return this.dependencies.conversationRepo;
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    // Clean up MCP integration resources
    try {
      this.mcpConfig.removeAllListeners();
    } catch (error) {
      console.error('[ChatService] Error disposing MCP integration:', error);
    }
  }
}