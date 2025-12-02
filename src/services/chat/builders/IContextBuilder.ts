/**
 * IContextBuilder - Interface for provider-specific conversation context builders
 *
 * Each provider (OpenAI, Anthropic, Google, etc.) has different message formats
 * for conversations and tool calls. This interface defines the contract that
 * all provider-specific builders must implement.
 *
 * Follows Interface Segregation Principle - focused contract for context building.
 */

import { ConversationData } from '../../../types/chat/ChatTypes';

export interface IContextBuilder {
  /**
   * Provider identifier for this builder
   */
  readonly provider: string;

  /**
   * Build LLM-ready conversation context from stored conversation data
   * Used when loading an existing conversation to continue it
   *
   * @param conversation - The stored conversation data with messages and tool calls
   * @param systemPrompt - Optional system prompt to prepend
   * @returns Properly formatted message array for the provider
   */
  buildContext(conversation: ConversationData, systemPrompt?: string): any[];

  /**
   * Build tool continuation context for streaming pingpong pattern
   * After tools are executed during streaming, this builds the continuation
   * context to send back to the LLM for the next response.
   *
   * @param userPrompt - Original user prompt
   * @param toolCalls - Tool calls that were detected and executed
   * @param toolResults - Results from tool execution
   * @param previousMessages - Previous conversation messages (optional)
   * @param systemPrompt - System prompt (optional, used by some providers)
   * @returns Continuation context as message array
   */
  buildToolContinuation(
    userPrompt: string,
    toolCalls: any[],
    toolResults: any[],
    previousMessages?: any[],
    systemPrompt?: string
  ): any[];

  /**
   * Append tool execution to existing conversation history
   * Used for accumulating conversation history during recursive tool calls.
   * Does NOT add the user message - only appends tool call and results.
   *
   * @param toolCalls - Tool calls that were executed
   * @param toolResults - Results from tool execution
   * @param previousMessages - Existing conversation history
   * @returns Updated message array with tool execution appended
   */
  appendToolExecution(
    toolCalls: any[],
    toolResults: any[],
    previousMessages: any[]
  ): any[];
}

/**
 * Helper type for message validation
 */
export interface MessageValidationContext {
  msg: any;
  isLastMessage: boolean;
}
