/**
 * ConversationContextBuilder - Builds LLM-ready conversation context from stored conversation data
 * 
 * Handles provider-specific conversation formatting to ensure proper tool call context
 * and conversation continuity across different LLM providers.
 * 
 * Follows Single Responsibility Principle - only handles conversation context formatting.
 */

import { ConversationData } from '../../types/chat/ChatTypes';

export class ConversationContextBuilder {
  
  /**
   * Build LLM-ready conversation context from stored conversation data
   * 
   * @param conversation - The stored conversation data with tool calls
   * @param provider - LLM provider (determines format)
   * @param systemPrompt - Optional system prompt to prepend
   * @returns Properly formatted conversation messages for the LLM provider
   */
  static buildContextForProvider(
    conversation: ConversationData, 
    provider: string,
    systemPrompt?: string
  ): any[] {
    const messages: any[] = [];
    
    // Add system prompt if provided
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    
    // Build conversation based on provider format
    switch (provider.toLowerCase()) {
      case 'anthropic':
        return this.buildAnthropicContext(conversation, messages);
      case 'google':
        return this.buildGoogleContext(conversation, messages);
      default:
        // OpenAI format (used by: openai, openrouter, groq, mistral, requesty, perplexity)
        return this.buildOpenAIContext(conversation, messages);
    }
  }
  
  /**
   * OpenAI format: separate assistant + tool result messages
   * This format is used by most providers (OpenAI, OpenRouter, Groq, Mistral, Requesty, Perplexity)
   * 
   * Pattern:
   * 1. Assistant message with tool_calls array
   * 2. Tool result messages with role: "tool"
   * 3. Final assistant message with response content
   */
  private static buildOpenAIContext(conversation: ConversationData, messages: any[]): any[] {
    conversation.messages.forEach((msg, index) => {
      if (msg.role === 'user') {
        const userMsg = { role: 'user', content: msg.content };
        messages.push(userMsg);
      }
      else if (msg.role === 'assistant') {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          // Flatten tool calls into text for system prompt
          const toolNames = msg.toolCalls.map((tc: any) => tc.name).join(', ');
          messages.push({ role: 'assistant', content: `[Calling tools: ${toolNames}]` });

          // Add tool results as text
          msg.toolCalls.forEach((toolCall: any, tcIndex: number) => {
            const resultContent = toolCall.success
              ? JSON.stringify(toolCall.result || {})
              : `Error: ${toolCall.error || 'Tool execution failed'}`;

            messages.push({
              role: 'assistant',
              content: `Tool Result (${toolCall.name}): ${resultContent}`
            });
          });

          // If there's final content after tool execution, add it
          if (msg.content && msg.content.trim()) {
            messages.push({
              role: 'assistant',
              content: msg.content
            });
          }
        } else {
          // Regular assistant message without tools
          // Filter out empty assistant messages (they're placeholders for streaming)
          if (msg.content && msg.content.trim()) {
            messages.push({ role: 'assistant', content: msg.content });
          }
        }
      }
      // Note: 'tool' role messages are not used - tool results are stored in assistant messages with toolCalls
    });

    return messages;
  }
  
  /**
   * Anthropic format: tool_use blocks within messages
   * Anthropic uses tool_result blocks in user messages, not separate tool role messages
   */
  private static buildAnthropicContext(conversation: ConversationData, messages: any[]): any[] {
    conversation.messages.forEach((msg, index) => {
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content });
      }
      else if (msg.role === 'assistant') {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          // For Anthropic, assistant message contains both text AND tool_use blocks
          const content: any[] = [];

          // Add text content if present
          if (msg.content && msg.content.trim()) {
            content.push({
              type: 'text',
              text: msg.content
            });
          }

          // Add tool_use blocks
          msg.toolCalls.forEach(toolCall => {
            content.push({
              type: 'tool_use',
              id: toolCall.id,
              name: toolCall.name,
              input: toolCall.parameters || {}
            });
          });

          messages.push({
            role: 'assistant',
            content: content
          });

          // Add tool results as user message with tool_result blocks
          const toolResultContent: any[] = [];
          msg.toolCalls.forEach(toolCall => {
            toolResultContent.push({
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: toolCall.success
                ? JSON.stringify(toolCall.result || {})
                : `Error: ${toolCall.error || 'Tool execution failed'}`
            });
          });

          if (toolResultContent.length > 0) {
            messages.push({
              role: 'user',
              content: toolResultContent
            });
          }
        } else {
          // Regular assistant message without tools
          // Filter out empty assistant messages for Anthropic (they're placeholders for streaming)
          // Anthropic allows empty final assistant message, but not empty middle messages
          if (msg.content && msg.content.trim()) {
            messages.push({ role: 'assistant', content: msg.content });
          }
        }
      }
      else if (msg.role === 'tool') {
        // Handle stored tool messages - convert to tool_result blocks in user messages
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          const toolResultContent: any[] = [];
          msg.toolCalls.forEach(toolCall => {
            toolResultContent.push({
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: toolCall.success
                ? JSON.stringify(toolCall.result || {})
                : `Error: ${toolCall.error || 'Tool execution failed'}`
            });
          });

          if (toolResultContent.length > 0) {
            messages.push({
              role: 'user',
              content: toolResultContent
            });
          }
        }
      }
    });

    return messages;
  }
  
  /**
   * Google format: function_call/function_response
   * TODO: Implement Google-specific format when needed  
   */
  private static buildGoogleContext(conversation: ConversationData, messages: any[]): any[] {
    return this.buildOpenAIContext(conversation, messages);
  }
  
  /**
   * Get provider categories for debugging
   */
  static getProviderCategory(provider: string): string {
    switch (provider.toLowerCase()) {
      case 'anthropic':
        return 'anthropic';
      case 'google':
        return 'google';
      case 'openai':
      case 'openrouter': 
      case 'groq':
      case 'mistral':
      case 'requesty':
      case 'perplexity':
        return 'openai-compatible';
      default:
        return 'openai-compatible';
    }
  }
}