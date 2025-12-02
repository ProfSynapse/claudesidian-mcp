/**
 * GoogleContextBuilder - Builds conversation context for Google Gemini
 *
 * Google format uses:
 * - 'user' and 'model' roles (not 'assistant')
 * - 'parts' array with text, functionCall, or functionResponse objects
 * - thoughtSignature for thinking models (Gemini 3.0+)
 *
 * Follows Single Responsibility Principle - only handles Google format.
 */

import { IContextBuilder } from './IContextBuilder';
import { ConversationData } from '../../../types/chat/ChatTypes';
import { ReasoningPreserver } from '../../llm/adapters/shared/ReasoningPreserver';

export class GoogleContextBuilder implements IContextBuilder {
  readonly provider = 'google';

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

    // Note: Google uses systemInstruction separately, not in messages
    // But we include it here for compatibility with the interface
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
          messages.push({
            role: 'user',
            parts: [{ text: msg.content }]
          });
        }
      } else if (msg.role === 'assistant') {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          // Build model message with thought signatures preserved
          const modelMessage = ReasoningPreserver.buildGoogleModelMessageWithThinking(
            msg.toolCalls.map((tc: any) => ({
              ...tc,
              function: { name: tc.name, arguments: JSON.stringify(tc.parameters || {}) }
            }))
          );
          messages.push(modelMessage);

          // Function response parts
          const functionResponseParts = msg.toolCalls.map((tc: any) => ({
            functionResponse: {
              name: tc.name,
              response: tc.success
                ? (tc.result || {})
                : { error: tc.error || 'Tool execution failed' }
            }
          }));

          messages.push({ role: 'function', parts: functionResponseParts });

          // If there's final content after tool execution, add it
          if (msg.content && msg.content.trim()) {
            messages.push({
              role: 'model',
              parts: [{ text: msg.content }]
            });
          }
        } else {
          if (msg.content && msg.content.trim()) {
            messages.push({
              role: 'model',
              parts: [{ text: msg.content }]
            });
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

    // Add previous conversation history (convert to Google format if needed)
    if (previousMessages && previousMessages.length > 0) {
      for (const msg of previousMessages) {
        // Skip messages that are already in Google format
        if (msg.parts) {
          messages.push(msg);
          continue;
        }

        // Convert from simple message format
        if (msg.role === 'user' && msg.content) {
          messages.push({
            role: 'user',
            parts: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }]
          });
        } else if (msg.role === 'assistant' && msg.content) {
          messages.push({
            role: 'model',
            parts: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }]
          });
        }
      }
    }

    // Add the original user message
    if (userPrompt) {
      messages.push({
        role: 'user',
        parts: [{ text: userPrompt }]
      });
    }

    // Build model message with thought signatures preserved
    const modelMessage = ReasoningPreserver.buildGoogleModelMessageWithThinking(toolCalls);
    messages.push(modelMessage);

    // Add function response parts
    const functionResponseParts = toolResults.map(result => ({
      functionResponse: {
        name: result.name || result.function?.name,
        response: result.success
          ? (result.result || {})
          : { error: result.error || 'Tool execution failed' }
      }
    }));

    messages.push({
      role: 'user',  // Google uses 'user' role for function responses
      parts: functionResponseParts
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

    // Build model message with thought signatures preserved
    const modelMessage = ReasoningPreserver.buildGoogleModelMessageWithThinking(toolCalls);
    messages.push(modelMessage);

    // Add function response parts
    const functionResponseParts = toolResults.map(result => ({
      functionResponse: {
        name: result.name || result.function?.name,
        response: result.success
          ? (result.result || {})
          : { error: result.error || 'Tool execution failed' }
      }
    }));

    messages.push({
      role: 'user',
      parts: functionResponseParts
    });

    return messages;
  }
}
