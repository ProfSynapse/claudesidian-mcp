/**
 * AnthropicContextBuilder - Builds conversation context for Anthropic Claude
 *
 * Anthropic format uses:
 * - tool_use blocks within assistant messages
 * - tool_result blocks within user messages
 * - Content arrays instead of simple strings for messages with tool calls
 *
 * Follows Single Responsibility Principle - only handles Anthropic format.
 */

import { IContextBuilder } from './IContextBuilder';
import { ConversationData } from '../../../types/chat/ChatTypes';

export class AnthropicContextBuilder implements IContextBuilder {
  readonly provider = 'anthropic';

  /**
   * Validate if a message should be included in LLM context
   */
  private isValidForContext(msg: any, isLastMessage: boolean): boolean {
    if (msg.state === 'invalid' || msg.state === 'streaming') return false;
    if (msg.role === 'user' && (!msg.content || !msg.content.trim())) return false;

    if (msg.role === 'assistant') {
      const hasContent = msg.content && msg.content.trim();
      const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0;

      if (!hasContent && !hasToolCalls && !isLastMessage) return false;

      if (hasToolCalls) {
        const allHaveResults = msg.toolCalls.every((tc: any) =>
          tc.result !== undefined || tc.error !== undefined
        );
        if (!allHaveResults) return false;
      }
    }

    return true;
  }

  /**
   * Build context from stored conversation
   */
  buildContext(conversation: ConversationData, systemPrompt?: string): any[] {
    const messages: any[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // Filter valid messages
    const validMessages = conversation.messages.filter((msg, index) => {
      const isLastMessage = index === conversation.messages.length - 1;
      return this.isValidForContext(msg, isLastMessage);
    });

    validMessages.forEach((msg) => {
      if (msg.role === 'user') {
        if (msg.content && msg.content.trim()) {
          messages.push({ role: 'user', content: msg.content });
        }
      } else if (msg.role === 'assistant') {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          // Assistant message contains both text AND tool_use blocks
          const content: any[] = [];

          if (msg.content && msg.content.trim()) {
            content.push({ type: 'text', text: msg.content });
          }

          // Add tool_use blocks
          msg.toolCalls.forEach((toolCall: any) => {
            content.push({
              type: 'tool_use',
              id: toolCall.id,
              name: toolCall.name,
              input: toolCall.parameters || {}
            });
          });

          messages.push({ role: 'assistant', content });

          // Add tool results as user message with tool_result blocks
          const toolResultContent: any[] = msg.toolCalls.map((toolCall: any) => ({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: toolCall.success
              ? JSON.stringify(toolCall.result || {})
              : `Error: ${toolCall.error || 'Tool execution failed'}`
          }));

          if (toolResultContent.length > 0) {
            messages.push({ role: 'user', content: toolResultContent });
          }
        } else {
          if (msg.content && msg.content.trim()) {
            messages.push({ role: 'assistant', content: msg.content });
          }
        }
      } else if (msg.role === 'tool') {
        // Handle stored tool messages - convert to tool_result blocks
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          const toolResultContent: any[] = msg.toolCalls.map((toolCall: any) => ({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: toolCall.success
              ? JSON.stringify(toolCall.result || {})
              : `Error: ${toolCall.error || 'Tool execution failed'}`
          }));

          if (toolResultContent.length > 0) {
            messages.push({ role: 'user', content: toolResultContent });
          }
        }
      }
    });

    return messages;
  }

  /**
   * Build tool continuation for pingpong pattern
   */
  buildToolContinuation(
    userPrompt: string,
    toolCalls: any[],
    toolResults: any[],
    previousMessages?: any[],
    _systemPrompt?: string
  ): any[] {
    const messages: any[] = [];

    if (previousMessages && previousMessages.length > 0) {
      messages.push(...previousMessages);
    }

    if (userPrompt) {
      messages.push({ role: 'user', content: userPrompt });
    }

    // Add assistant message with tool_use blocks
    const toolUseBlocks = toolCalls.map(tc => ({
      type: 'tool_use',
      id: tc.id,
      name: tc.function?.name || tc.name,
      input: JSON.parse(tc.function?.arguments || '{}')
    }));

    messages.push({ role: 'assistant', content: toolUseBlocks });

    // Add user message with tool_result blocks
    const toolResultBlocks = toolResults.map(result => ({
      type: 'tool_result',
      tool_use_id: result.id,
      content: result.success
        ? JSON.stringify(result.result || {})
        : `Error: ${result.error || 'Tool execution failed'}`
    }));

    messages.push({ role: 'user', content: toolResultBlocks });

    return messages;
  }

  /**
   * Append tool execution to existing history (no user message added)
   */
  appendToolExecution(
    toolCalls: any[],
    toolResults: any[],
    previousMessages: any[]
  ): any[] {
    const messages = [...previousMessages];

    // Add assistant message with tool_use blocks
    const toolUseBlocks = toolCalls.map(tc => ({
      type: 'tool_use',
      id: tc.id,
      name: tc.function?.name || tc.name,
      input: JSON.parse(tc.function?.arguments || '{}')
    }));

    messages.push({ role: 'assistant', content: toolUseBlocks });

    // Add user message with tool_result blocks
    const toolResultBlocks = toolResults.map(result => ({
      type: 'tool_result',
      tool_use_id: result.id,
      content: result.success
        ? JSON.stringify(result.result || {})
        : `Error: ${result.error || 'Tool execution failed'}`
    }));

    messages.push({ role: 'user', content: toolResultBlocks });

    return messages;
  }
}
