/**
 * ChatService - Native chatbot with MCP client integration
 * 
 * Acts as an internal MCP client to our own MCP server, allowing the chatbot
 * to use all existing agents and tools through the MCP protocol.
 * 
 * Flow: User message → LLM → Tool calls → MCP client → Our agents → Results → LLM → Response
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ConversationRepository } from '../../database/services/chat/ConversationRepository';
import { ConversationData, ConversationMessage, ToolCall, CreateConversationParams } from '../../types/chat/ChatTypes';
import { getErrorMessage } from '../../utils/errorUtils';

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
}

export class ChatService {
  private mcpClient: Client | null = null;
  private availableTools: any[] = [];
  private toolCallHistory = new Map<string, ToolCall[]>();
  
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
   * Initialize the MCP client connection to our own server
   */
  async initialize(): Promise<void> {
    try {
      console.log('[ChatService] Initializing MCP client connection');
      
      // Get real tools from MCP connector if available
      if (this.dependencies.mcpConnector && typeof this.dependencies.mcpConnector.getAvailableTools === 'function') {
        this.availableTools = this.dependencies.mcpConnector.getAvailableTools();
        console.log(`[ChatService] Loaded ${this.availableTools.length} tools from MCP connector`);
      } else {
        // Fallback: use static tool manifest for MVP
        console.warn('[ChatService] MCP connector not available, using static tool manifest');
        this.availableTools = this.getStaticToolManifest();
        console.log(`[ChatService] Loaded ${this.availableTools.length} static tools`);
      }
      
      // Log available tools for debugging
      this.availableTools.forEach(tool => {
        console.log(`[ChatService] Available tool: ${tool.name} - ${tool.description}`);
      });
      
    } catch (error) {
      console.error('[ChatService] Failed to initialize MCP client:', error);
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
        const aiResponse = await this.generateResponseWithTools(conversation.id, initialMessage, undefined, options);
        if (aiResponse) {
          // Add AI response
          await this.dependencies.conversationRepo.addMessage({
            conversationId: conversation.id,
            role: 'assistant',
            content: aiResponse.content,
            toolCalls: aiResponse.tool_calls
          });
        }
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
      const aiResponse = await this.generateResponseWithTools(conversationId, message, conversation, options);
      if (aiResponse) {
        // Add AI response to repository
        await this.dependencies.conversationRepo.addMessage({
          conversationId,
          role: 'assistant',
          content: aiResponse.content,
          toolCalls: aiResponse.tool_calls
        });
      }

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
  ): AsyncGenerator<{ chunk: string; complete: boolean; messageId: string }, void, unknown> {
    try {
      const messageId = options?.messageId || `msg_${Date.now()}_ai`;
      let accumulatedContent = '';

      // Build conversation context for LLM
      const messages = conversation ? this.buildLLMMessages(conversation) : [];
      
      // Add system prompt if provided
      if (options?.systemPrompt) {
        messages.unshift({ role: 'system', content: options.systemPrompt });
      }
      
      messages.push({ role: 'user', content: userMessage });

      console.log(`[ChatService] Starting streaming response for conversation: ${conversationId}`);

      // Stream the response from LLM service
      for await (const chunk of this.dependencies.llmService.generateResponseStream(messages, options)) {
        accumulatedContent += chunk.chunk;
        
        console.log(`[ChatService] Streaming chunk:`, chunk.chunk.substring(0, 50) + '...');
        
        yield {
          chunk: chunk.chunk,
          complete: chunk.complete,
          messageId
        };

        if (chunk.complete) {
          console.log(`[ChatService] Streaming complete, saving message to repository`);
          
          // Save the complete message to the repository
          await this.dependencies.conversationRepo.addMessage({
            conversationId,
            role: 'assistant',
            content: accumulatedContent
          });
          
          break;
        }
      }

    } catch (error) {
      console.error('[ChatService] Error in generateResponseStreaming:', error);
      throw error;
    }
  }

  /**
   * Generate AI response with iterative tool execution via MCP
   * This is where the MCP magic happens - LLM can chain tool calls
   */
  private async generateResponseWithTools(
    conversationId: string, 
    userMessage: string,
    conversation?: ConversationData,
    options?: {
      provider?: string;
      model?: string;
      systemPrompt?: string;
    }
  ): Promise<ConversationMessage | null> {
    try {
      const messageId = `msg_${Date.now()}_ai`;
      const toolCalls: ToolCall[] = [];
      let finalResponse = '';
      
      // Build conversation context for LLM
      const messages = conversation ? this.buildLLMMessages(conversation) : [];
      
      // Add system prompt if provided
      if (options?.systemPrompt) {
        messages.unshift({ role: 'system', content: options.systemPrompt });
      }
      
      messages.push({ role: 'user', content: userMessage });

      // Start iterative tool execution loop
      let iteration = 0;
      let currentMessages = [...messages];
      
      while (iteration < this.options.maxToolIterations!) {
        console.log(`[ChatService] Tool iteration ${iteration + 1}`);
        
        // Call LLM with current context and available tools
        const llmResponse = await this.dependencies.llmService.generateResponse(
          currentMessages,
          {
            tools: this.availableTools,
            toolChoice: 'auto',
            provider: options?.provider,
            model: options?.model
          }
        );

        // Update final response
        finalResponse = llmResponse.content || '';
        
        // Check if LLM wants to use tools
        if (!llmResponse.toolCalls || llmResponse.toolCalls.length === 0) {
          console.log('[ChatService] No more tool calls, finishing');
          break;
        }

        // Execute tool calls via MCP
        console.log(`[ChatService] Executing ${llmResponse.toolCalls.length} tool calls via MCP`);
        const toolResults = await this.executeToolCallsViaMCP(llmResponse.toolCalls);
        
        // Add tool calls to our tracking
        toolCalls.push(...toolResults);

        // Add assistant message with tool calls to context
        currentMessages.push({
          role: 'assistant',
          content: finalResponse,
          toolCalls: llmResponse.toolCalls
        });

        // Add tool results to context for next iteration
        for (const toolResult of toolResults) {
          currentMessages.push({
            role: 'tool',
            content: JSON.stringify(toolResult.result),
            toolCallId: toolResult.id
          });
        }

        iteration++;
      }

      // Store tool call history
      if (toolCalls.length > 0) {
        this.toolCallHistory.set(conversationId, toolCalls);
      }

      return {
        id: messageId,
        role: 'assistant',
        content: finalResponse,
        timestamp: Date.now(),
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined
      };

    } catch (error) {
      console.error('[ChatService] Error generating response with tools:', error);
      return {
        id: `msg_${Date.now()}_error`,
        role: 'assistant',
        content: `Error: ${getErrorMessage(error)}`,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Execute tool calls via MCP client
   */
  private async executeToolCallsViaMCP(toolCalls: any[]): Promise<ToolCall[]> {
    const results: ToolCall[] = [];

    for (const toolCall of toolCalls) {
      try {
        console.log(`[ChatService] Executing tool via MCP: ${toolCall.name}`);

        let result: any;

        // If we have an MCP client, use it; otherwise simulate/fallback
        if (this.mcpClient) {
          result = await this.mcpClient.callTool({
            name: toolCall.name,
            arguments: toolCall.arguments || toolCall.parameters
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
   * Build message history for LLM context
   */
  private buildLLMMessages(conversation: ConversationData): any[] {
    return conversation.messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      toolCalls: msg.tool_calls
    }));
  }

  /**
   * Get conversation by ID
   */
  async getConversation(id: string): Promise<ConversationData | null> {
    return await this.dependencies.conversationRepo.getConversation(id);
  }

  /**
   * List conversations
   */
  async listConversations(options?: { limit?: number; offset?: number }): Promise<ConversationData[]> {
    const searchResults = await this.dependencies.conversationRepo.listConversations(
      this.dependencies.vaultName, 
      options?.limit || 50
    );
    
    // Convert ConversationSearchResult[] to ConversationData[]
    return searchResults.map(result => ({
      id: result.id,
      title: result.title,
      created_at: result.metadata.created_at,
      last_updated: result.metadata.last_updated,
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
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    if (this.mcpClient) {
      try {
        await this.mcpClient.close();
        this.mcpClient = null;
      } catch (error) {
        console.error('[ChatService] Error disposing MCP client:', error);
      }
    }
  }
}