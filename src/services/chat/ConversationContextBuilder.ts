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
    console.log(`[ConversationContextBuilder] Building OpenAI format context for ${conversation.messages.length} messages`);
    
    conversation.messages.forEach((msg, index) => {
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content });
        console.log(`[ConversationContextBuilder] Added user message ${index + 1}`);
      } 
      else if (msg.role === 'assistant') {
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          console.log(`[ConversationContextBuilder] Processing assistant message ${index + 1} with ${msg.tool_calls.length} tool calls`);
          
          // 1. Assistant message with original tool calls format
          const assistantMessage: any = {
            role: 'assistant',
            content: msg.content || null // OpenAI allows null content when tool calls are present
          };
          
          // Convert our stored tool calls to OpenAI format
          assistantMessage.tool_calls = msg.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.parameters || {})
            }
          }));
          
          messages.push(assistantMessage);
          console.log(`[ConversationContextBuilder] Added assistant message with tool calls: ${msg.tool_calls.map(tc => tc.name).join(', ')}`);
          
          // 2. Tool result messages for each tool call
          msg.tool_calls.forEach(toolCall => {
            const toolMessage = {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: toolCall.success 
                ? JSON.stringify(toolCall.result || {})
                : `Error: ${toolCall.error || 'Tool execution failed'}`
            };
            
            messages.push(toolMessage);
            console.log(`[ConversationContextBuilder] Added tool result for ${toolCall.name}: ${toolCall.success ? 'success' : 'error'}`);
          });
          
          // 3. If there's final content after tool execution, add another assistant message
          if (msg.content && msg.content.trim()) {
            messages.push({ 
              role: 'assistant', 
              content: msg.content 
            });
            console.log(`[ConversationContextBuilder] Added final assistant response with content length: ${msg.content.length}`);
          }
        } else {
          // Regular assistant message without tools
          messages.push({ role: 'assistant', content: msg.content });
          console.log(`[ConversationContextBuilder] Added regular assistant message ${index + 1}`);
        }
      }
    });
    
    console.log(`[ConversationContextBuilder] Built OpenAI context with ${messages.length} messages total`);
    return messages;
  }
  
  /**
   * Anthropic format: tool_use blocks within messages
   * TODO: Implement Anthropic-specific format when needed
   */
  private static buildAnthropicContext(conversation: ConversationData, messages: any[]): any[] {
    console.log(`[ConversationContextBuilder] Anthropic format not yet implemented, using OpenAI format as fallback`);
    return this.buildOpenAIContext(conversation, messages);
  }
  
  /**
   * Google format: function_call/function_response
   * TODO: Implement Google-specific format when needed  
   */
  private static buildGoogleContext(conversation: ConversationData, messages: any[]): any[] {
    console.log(`[ConversationContextBuilder] Google format not yet implemented, using OpenAI format as fallback`);
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