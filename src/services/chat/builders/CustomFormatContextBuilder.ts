/**
 * CustomFormatContextBuilder - Builds conversation context for fine-tuned local LLMs
 *
 * Used by: LM Studio, Ollama, WebLLM
 *
 * Custom format uses:
 * - Text-based [TOOL_CALLS][...][/TOOL_CALLS] format
 * - Strict user/assistant alternation required
 * - Raw JSON tool results to match training data
 *
 * Follows Single Responsibility Principle - only handles custom text format.
 */

import { IContextBuilder } from './IContextBuilder';
import { ConversationData } from '../../../types/chat/ChatTypes';

export class CustomFormatContextBuilder implements IContextBuilder {
  readonly provider = 'custom';

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
   * Uses OpenAI-like format for context loading (simpler)
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
          // Format as [TOOL_CALLS] text
          const toolCallTexts = msg.toolCalls.map((tc: any) => {
            return JSON.stringify({ name: tc.name, arguments: tc.parameters || {} });
          });
          messages.push({
            role: 'assistant',
            content: `[TOOL_CALLS][${toolCallTexts.join(',')}][/TOOL_CALLS]`
          });

          // Add tool results as user message
          const toolResultObjects = msg.toolCalls.map((tc: any) => {
            return tc.success
              ? (tc.result || {})
              : { error: tc.error || 'Tool execution failed' };
          });
          messages.push({
            role: 'user',
            content: JSON.stringify(toolResultObjects.length === 1 ? toolResultObjects[0] : toolResultObjects, null, 2)
          });

          // If there's final content after tool execution, add it
          if (msg.content && msg.content.trim()) {
            messages.push({ role: 'assistant', content: msg.content });
          }
        } else {
          if (msg.content && msg.content.trim()) {
            messages.push({ role: 'assistant', content: msg.content });
          }
        }
      }
    });

    return messages;
  }

  /**
   * Build tool continuation for pingpong pattern
   * LM Studio requires STRICT alternation: user/assistant/user/assistant
   */
  buildToolContinuation(
    userPrompt: string,
    toolCalls: any[],
    toolResults: any[],
    previousMessages?: any[],
    _systemPrompt?: string
  ): any[] {
    const messages: any[] = [];

    // Separate system messages from conversation messages
    const systemMessages: any[] = [];
    const conversationMessages: any[] = [];

    if (previousMessages && previousMessages.length > 0) {
      for (const msg of previousMessages) {
        if (msg.role === 'system') {
          systemMessages.push(msg);
        } else {
          conversationMessages.push(msg);
        }
      }
    }

    // Add system messages first
    messages.push(...systemMessages);

    // Check if user prompt already exists in conversation history
    const hasUserPrompt = conversationMessages.some(
      msg => msg.role === 'user' && msg.content === userPrompt
    );

    // If user prompt isn't in history, add it first (after system)
    if (!hasUserPrompt && userPrompt) {
      messages.push({ role: 'user', content: userPrompt });
    }

    // Add existing conversation history
    for (const msg of conversationMessages) {
      // Skip if this is the user prompt we already added
      if (msg.role === 'user' && msg.content === userPrompt && !hasUserPrompt) {
        continue;
      }
      messages.push(msg);
    }

    // Check last message for duplicate detection
    const lastMsg = messages[messages.length - 1];

    // Build the current tool call text
    const toolCallTexts = toolCalls.map(toolCall => {
      const toolName = toolCall.function?.name || toolCall.name || 'unknown';
      const args = toolCall.function?.arguments || toolCall.arguments || '{}';
      const parsedArgs = typeof args === 'string' ? args : JSON.stringify(args);
      return JSON.stringify({ name: toolName, arguments: JSON.parse(parsedArgs) });
    });

    // Only add assistant tool call if we don't already end with one
    const assistantToolCallContent = `[TOOL_CALLS][${toolCallTexts.join(',')}][/TOOL_CALLS]`;
    const lastIsMatchingAssistant = lastMsg &&
      lastMsg.role === 'assistant' &&
      lastMsg.content?.includes('[TOOL_CALLS]');

    if (!lastIsMatchingAssistant) {
      messages.push({
        role: 'assistant',
        content: assistantToolCallContent
      });
    }

    // Format tool results - raw JSON to match training format
    const toolResultObjects = toolResults.map(result => {
      return result.success
        ? (result.result || {})
        : { error: result.error || 'Tool execution failed' };
    });

    // Add user message with tool results
    messages.push({
      role: 'user',
      content: JSON.stringify(toolResultObjects.length === 1 ? toolResultObjects[0] : toolResultObjects, null, 2)
    });

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

    // Build tool call text
    const toolCallTexts = toolCalls.map(toolCall => {
      const toolName = toolCall.function?.name || toolCall.name || 'unknown';
      const args = toolCall.function?.arguments || toolCall.arguments || '{}';
      const parsedArgs = typeof args === 'string' ? args : JSON.stringify(args);
      return JSON.stringify({ name: toolName, arguments: JSON.parse(parsedArgs) });
    });

    messages.push({
      role: 'assistant',
      content: `[TOOL_CALLS][${toolCallTexts.join(',')}][/TOOL_CALLS]`
    });

    // Format tool results - raw JSON to match training format
    const toolResultObjects = toolResults.map(result => {
      return result.success
        ? (result.result || {})
        : { error: result.error || 'Tool execution failed' };
    });

    messages.push({
      role: 'user',
      content: JSON.stringify(toolResultObjects.length === 1 ? toolResultObjects[0] : toolResultObjects, null, 2)
    });

    return messages;
  }
}
