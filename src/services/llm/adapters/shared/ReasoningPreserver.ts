/**
 * ReasoningPreserver - Handles preservation of reasoning/thinking data for LLM tool continuations
 *
 * OpenRouter Gemini models and Google Gemini models require reasoning data (thought_signature,
 * reasoning_details) to be preserved and sent back when continuing conversations after tool calls.
 *
 * This utility centralizes the logic for:
 * - Detecting if a model requires reasoning preservation
 * - Extracting reasoning data from responses
 * - Attaching reasoning data to tool calls
 * - Building messages with preserved reasoning
 *
 * Follows Single Responsibility Principle - only handles reasoning preservation.
 */

export interface ReasoningDetails {
  /** OpenRouter format: array of reasoning detail objects */
  reasoning_details?: any[];
  /** Google Gemini format: thought signature string */
  thought_signature?: string;
}

export class ReasoningPreserver {
  /**
   * Check if a model requires reasoning preservation for tool continuations
   * Currently: Gemini models via OpenRouter, and direct Gemini models
   */
  static requiresReasoningPreservation(model: string, provider: string): boolean {
    const modelLower = model.toLowerCase();

    // OpenRouter Gemini models
    if (provider === 'openrouter') {
      return modelLower.includes('gemini') || modelLower.includes('google/');
    }

    // Direct Google provider
    if (provider === 'google') {
      return true; // All Google models may use thinking
    }

    return false;
  }

  /**
   * Extract reasoning data from a streaming chunk (OpenRouter format)
   * Returns the reasoning_details array if present
   *
   * In streaming, reasoning_details appears in choice.delta.reasoning_details
   * See: https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
   */
  static extractFromStreamChunk(parsed: any): any[] | undefined {
    // Check top-level first
    if (parsed.reasoning_details) {
      return parsed.reasoning_details;
    }

    // Check each choice
    for (const choice of parsed.choices || []) {
      // Streaming: check delta
      if (choice?.delta?.reasoning_details) {
        return choice.delta.reasoning_details;
      }
      // Non-streaming: check message
      if (choice?.message?.reasoning_details) {
        return choice.message.reasoning_details;
      }
      // Also check at choice level
      if (choice?.reasoning_details) {
        return choice.reasoning_details;
      }
    }
    return undefined;
  }

  /**
   * Extract reasoning data from a non-streaming response (OpenRouter format)
   */
  static extractFromResponse(choice: any): ReasoningDetails | undefined {
    const message = choice?.message;
    if (!message) return undefined;

    const result: ReasoningDetails = {};

    if (message.reasoning_details) {
      result.reasoning_details = message.reasoning_details;
    }

    if (message.thought_signature) {
      result.thought_signature = message.thought_signature;
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * Extract thought_signature from Google Gemini streaming part
   */
  static extractThoughtSignatureFromPart(part: any): string | undefined {
    return part.thoughtSignature || part.thought_signature;
  }

  /**
   * Attach reasoning details to tool calls for preservation through the execution flow
   * Returns new tool call objects with reasoning attached
   */
  static attachToToolCalls(
    toolCalls: any[],
    reasoning: ReasoningDetails | undefined
  ): any[] {
    if (!reasoning || !toolCalls?.length) {
      return toolCalls;
    }

    return toolCalls.map(tc => ({
      ...tc,
      ...(reasoning.reasoning_details && { reasoning_details: reasoning.reasoning_details }),
      ...(reasoning.thought_signature && { thought_signature: reasoning.thought_signature })
    }));
  }

  /**
   * Extract reasoning from tool calls (for building continuation messages)
   */
  static extractFromToolCalls(toolCalls: any[]): ReasoningDetails | undefined {
    if (!toolCalls?.length) return undefined;

    // Find the first tool call with reasoning data
    for (const tc of toolCalls) {
      if (tc.reasoning_details) {
        return { reasoning_details: tc.reasoning_details };
      }
      if (tc.thought_signature) {
        return { thought_signature: tc.thought_signature };
      }
    }

    return undefined;
  }

  /**
   * Build an assistant message with reasoning preserved (OpenRouter/OpenAI format)
   * Used for tool continuation requests
   *
   * CRITICAL: Must preserve reasoning_details and thought_signature at BOTH levels:
   * 1. On each individual tool_call (required by Gemini for function calls)
   * 2. On the message itself (for some providers)
   */
  static buildAssistantMessageWithReasoning(
    toolCalls: any[],
    content: string | null = null
  ): any {
    const reasoning = this.extractFromToolCalls(toolCalls);

    const message: any = {
      role: 'assistant',
      content,
      tool_calls: toolCalls.map(tc => {
        const toolCall: any = {
          id: tc.id,
          type: 'function',
          function: {
            name: tc.function?.name || tc.name,
            arguments: tc.function?.arguments || JSON.stringify(tc.parameters || {})
          }
        };

        // CRITICAL: Preserve reasoning data on each tool call (Gemini requires this)
        if (tc.reasoning_details) {
          toolCall.reasoning_details = tc.reasoning_details;
          console.log('[ReasoningPreserver:5] ✅ Preserved reasoning_details on tool_call in message');
        }
        if (tc.thought_signature) {
          toolCall.thought_signature = tc.thought_signature;
          console.log('[ReasoningPreserver:5] ✅ Preserved thought_signature on tool_call in message');
        }

        return toolCall;
      })
    };

    // Also preserve reasoning_details at message level for OpenRouter Gemini continuations
    if (reasoning?.reasoning_details) {
      message.reasoning_details = reasoning.reasoning_details;
    }

    return message;
  }

  /**
   * Build a Google Gemini model message with thought signature preserved
   * Used for tool continuation requests
   */
  static buildGoogleModelMessageWithThinking(toolCalls: any[]): any {
    const parts = toolCalls.map(tc => {
      const part: any = {
        functionCall: {
          name: tc.function?.name || tc.name,
          args: JSON.parse(tc.function?.arguments || '{}')
        }
      };

      // Preserve thought_signature if present
      if (tc.thought_signature) {
        part.thoughtSignature = tc.thought_signature;
      }

      return part;
    });

    return {
      role: 'model',
      parts
    };
  }

  /**
   * Get reasoning request parameters for a model
   * Returns the parameters to enable reasoning capture (if applicable)
   */
  static getReasoningRequestParams(model: string, provider: string, hasTools: boolean): any {
    if (!hasTools) return {};

    if (this.requiresReasoningPreservation(model, provider)) {
      if (provider === 'openrouter') {
        // OpenRouter unified reasoning parameter format
        // See: https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
        // Note: effort is for OpenAI models, max_tokens is for Anthropic/Google
        // Since we're targeting Gemini, use max_tokens
        return {
          reasoning: {
            max_tokens: 8192,
            exclude: false  // Include reasoning in response
          }
        };
      }
      if (provider === 'google') {
        // Google uses thinkingBudget in generationConfig
        return { thinkingBudget: 8192 };
      }
    }

    return {};
  }
}
