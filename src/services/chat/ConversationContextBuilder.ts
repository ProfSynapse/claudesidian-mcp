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
   * Validate if a message should be included in LLM context
   * Filters out invalid, streaming, and incomplete messages
   */
  private static isValidForContext(msg: any, isLastMessage: boolean): boolean {
    // Rule 1: Exclude invalid messages
    if (msg.state === 'invalid') return false;

    // Rule 2: Exclude streaming messages (shouldn't be in storage, but safety check)
    if (msg.state === 'streaming') return false;

    // Rule 3: User messages must have content
    if (msg.role === 'user' && (!msg.content || !msg.content.trim())) return false;

    // Rule 4: Assistant messages must have content OR be final message (Anthropic allows empty final)
    if (msg.role === 'assistant') {
      const hasContent = msg.content && msg.content.trim();
      const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0;

      // If no content and no tool calls, only allow if it's the last message
      if (!hasContent && !hasToolCalls && !isLastMessage) return false;

      // Rule 5: Messages with tool calls must have results (not incomplete)
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

    // Filter valid messages before building context
    const validMessages = conversation.messages.filter((msg, index) => {
      const isLastMessage = index === conversation.messages.length - 1;
      return this.isValidForContext(msg, isLastMessage);
    });

    // Build filtered conversation with valid messages only
    const filteredConversation = {
      ...conversation,
      messages: validMessages
    };

    // Build conversation based on provider format
    switch (provider.toLowerCase()) {
      case 'anthropic':
        return this.buildAnthropicContext(filteredConversation, messages);
      case 'google':
        return this.buildGoogleContext(filteredConversation, messages);
      default:
        // OpenAI format (used by: openai, openrouter, groq, mistral, requesty, perplexity)
        return this.buildOpenAIContext(filteredConversation, messages);
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
        // Skip empty user messages (shouldn't happen, but safety check)
        if (msg.content && msg.content.trim()) {
          const userMsg = { role: 'user', content: msg.content };
          messages.push(userMsg);
        }
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
        // Skip empty user messages (shouldn't happen, but safety check)
        if (msg.content && msg.content.trim()) {
          messages.push({ role: 'user', content: msg.content });
        }
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
   * Google/Gemini format: functionCall and functionResponse parts in conversation
   *
   * Pattern:
   * 1. User message with text parts
   * 2. Model message with functionCall parts
   * 3. Function message with functionResponse parts
   * 4. Model message with final response
   */
  private static buildGoogleContext(conversation: ConversationData, messages: any[]): any[] {
    conversation.messages.forEach((msg, index) => {
      if (msg.role === 'user') {
        if (msg.content && msg.content.trim()) {
          messages.push({
            role: 'user',
            parts: [{ text: msg.content }]
          });
        }
      }
      else if (msg.role === 'assistant') {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          // Model message with functionCall parts
          // Gemini 3.0+ requires preserving thought_signature from original response
          const functionCallParts = msg.toolCalls.map((tc: any) => {
            const part: any = {
              functionCall: {
                name: tc.name,
                args: tc.parameters || {}
              }
            };

            // Preserve thought_signature if it was in the original tool call
            if (tc.thought_signature) {
              part.thought_signature = tc.thought_signature;
            }

            return part;
          });

          messages.push({
            role: 'model',
            parts: functionCallParts
          });

          // Function response parts (sent as separate message with role 'function')
          const functionResponseParts = msg.toolCalls.map((tc: any) => ({
            functionResponse: {
              name: tc.name,
              response: tc.success
                ? (tc.result || {})
                : { error: tc.error || 'Tool execution failed' }
            }
          }));

          messages.push({
            role: 'function',
            parts: functionResponseParts
          });

          // If there's final content after tool execution, add it
          if (msg.content && msg.content.trim()) {
            messages.push({
              role: 'model',
              parts: [{ text: msg.content }]
            });
          }
        } else {
          // Regular assistant message without tools
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
   * Build tool continuation context for streaming pingpong pattern
   *
   * After tools are executed during streaming, this builds the continuation
   * context to send back to the LLM for the next response.
   *
   * @param provider - LLM provider (determines format)
   * @param userPrompt - Original user prompt
   * @param toolCalls - Tool calls that were detected and executed
   * @param toolResults - Results from tool execution
   * @param previousMessages - Previous conversation messages (optional)
   * @param systemPrompt - System prompt for OpenAI-style providers (optional)
   * @returns Continuation context (Anthropic: message array, OpenAI-style: system prompt string)
   */
  static buildToolContinuation(
    provider: string,
    userPrompt: string,
    toolCalls: any[],
    toolResults: any[],
    previousMessages?: any[],
    systemPrompt?: string
  ): any[] | string {
    // Check if provider uses custom tool call format (LM Studio, Ollama, WebLLM)
    // These are all fine-tuned local models that use [TOOL_CALLS] text format
    if (provider === 'lmstudio' || provider === 'ollama' || provider === 'webllm') {
      return this.buildCustomFormatToolContinuation(
        userPrompt,
        toolCalls,
        toolResults,
        previousMessages,
        systemPrompt
      );
    }

    switch (provider.toLowerCase()) {
      case 'anthropic':
        return this.buildAnthropicToolContinuation(
          userPrompt,
          toolCalls,
          toolResults,
          previousMessages
        );
      case 'google':
        return this.buildGoogleToolContinuation(
          userPrompt,
          toolCalls,
          toolResults,
          previousMessages
        );
      case 'openai':
        // OpenAI uses Responses API - should use buildResponsesAPIToolInput directly
        // This case should not be hit from StreamingOrchestrator (which handles OpenAI separately)
        throw new Error('OpenAI tool continuation should use buildResponsesAPIToolInput directly via StreamingOrchestrator');
      default:
        // Other OpenAI-compatible providers (openrouter, groq, mistral, requesty, perplexity)
        // These still use Chat Completions API message arrays
        return this.buildOpenAIToolContinuation(
          userPrompt,
          systemPrompt,
          toolCalls,
          toolResults,
          previousMessages
        );
    }
  }

  /**
   * Build Responses API tool input for OpenAI continuations
   * Converts tool results to ResponseInputItem.FunctionCallOutput format
   *
   * @param toolCalls - Tool calls that were executed
   * @param toolResults - Results from tool execution
   * @returns Array of FunctionCallOutput items for Responses API input
   */
  static buildResponsesAPIToolInput(
    toolCalls: any[],
    toolResults: any[]
  ): any[] {
    return toolResults.map((result, index) => {
      const toolCall = toolCalls[index];

      return {
        type: 'function_call_output',
        call_id: toolCall.id, // Links to the original function call ID
        output: result.success
          ? JSON.stringify(result.result || {})
          : JSON.stringify({ error: result.error || 'Tool execution failed' })
      };
    });
  }

  /**
   * Append tool execution to existing conversation history
   *
   * This method appends ONLY the tool call and results to previousMessages.
   * Unlike buildToolContinuation, it does NOT add the user message.
   *
   * Use this for accumulating conversation history during recursive tool calls.
   *
   * @param provider - Provider type (anthropic, google, openai-compatible)
   * @param toolCalls - Tool calls that were executed
   * @param toolResults - Results from tool execution
   * @param previousMessages - Existing conversation history (already contains user message)
   * @returns Updated message array with tool execution appended
   */
  static appendToolExecution(
    provider: string,
    toolCalls: any[],
    toolResults: any[],
    previousMessages: any[]
  ): any[] {
    switch (provider.toLowerCase()) {
      case 'anthropic':
        return this.appendAnthropicToolExecution(toolCalls, toolResults, previousMessages);
      case 'google':
        return this.appendGoogleToolExecution(toolCalls, toolResults, previousMessages);
      case 'lmstudio':
      case 'ollama':
      case 'webllm':
        // Custom text-based format for fine-tuned models using [TOOL_CALLS]
        return this.appendCustomFormatToolExecution(toolCalls, toolResults, previousMessages);
      default:
        // OpenAI-compatible providers (openrouter, groq, mistral, perplexity)
        return this.appendOpenAIToolExecution(toolCalls, toolResults, previousMessages);
    }
  }

  /**
   * Append Anthropic tool execution (NO user message added)
   * @private
   */
  private static appendAnthropicToolExecution(
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

    messages.push({
      role: 'assistant',
      content: toolUseBlocks
    });

    // Add user message with tool_result blocks
    const toolResultBlocks = toolResults.map(result => ({
      type: 'tool_result',
      tool_use_id: result.id,
      content: result.success
        ? JSON.stringify(result.result || {})
        : `Error: ${result.error || 'Tool execution failed'}`
    }));

    messages.push({
      role: 'user',
      content: toolResultBlocks
    });

    return messages;
  }

  /**
   * Append OpenAI-compatible tool execution (NO user message added)
   * @private
   */
  private static appendOpenAIToolExecution(
    toolCalls: any[],
    toolResults: any[],
    previousMessages: any[]
  ): any[] {
    const messages = [...previousMessages];

    // Add assistant message with tool calls
    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.function?.name || tc.name,
          arguments: tc.function?.arguments || JSON.stringify({})
        }
      }))
    });

    // Add tool result messages
    toolResults.forEach((result, index) => {
      const toolCall = toolCalls[index];
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result.success
          ? JSON.stringify(result.result || {})
          : JSON.stringify({ error: result.error || 'Tool execution failed' })
      });
    });

    return messages;
  }

  /**
   * Append custom format tool execution for LM Studio/Ollama (NO user message added)
   * Uses text-based [TOOL_CALLS] format for fine-tuned models
   * @private
   */
  private static appendCustomFormatToolExecution(
    toolCalls: any[],
    toolResults: any[],
    previousMessages: any[]
  ): any[] {
    const messages = [...previousMessages];

    // Add assistant message with the original tool call request
    // This represents what the model said (the [TOOL_CALLS] format)
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

    // Format tool results - just the raw result object to match training data
    const toolResultObjects = toolResults.map((result) => {
      return result.success
        ? (result.result || {})
        : { error: result.error || 'Tool execution failed' };
    });

    // Add user message with tool results (raw JSON to match training format)
    messages.push({
      role: 'user',
      content: JSON.stringify(toolResultObjects.length === 1 ? toolResultObjects[0] : toolResultObjects, null, 2)
    });

    return messages;
  }

  /**
   * Append Google tool execution (NO user message added)
   * @private
   */
  private static appendGoogleToolExecution(
    toolCalls: any[],
    toolResults: any[],
    previousMessages: any[]
  ): any[] {
    const messages = [...previousMessages];

    // Add model message with functionCall parts
    // Gemini 3.0+ requires preserving thought_signature from original response
    const functionCallParts = toolCalls.map(tc => {
      const part: any = {
        functionCall: {
          name: tc.function?.name || tc.name,
          args: JSON.parse(tc.function?.arguments || '{}')
        }
      };

      // Add thought signature at the same level as functionCall
      if (tc.thought_signature) {
        part.thoughtSignature = tc.thought_signature;
      }

      return part;
    });

    messages.push({
      role: 'model',
      parts: functionCallParts
    });

    // Add function response parts
    const functionResponseParts = toolResults.map(result => ({
      functionResponse: {
        name: result.name || (result.function?.name),
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

  /**
   * Build custom format tool continuation for text-based tool calls
   * Used by LM Studio and Ollama fine-tuned models
   * Returns message array with formatted tool results in text
   *
   * LM Studio requires STRICT alternation: user/assistant/user/assistant
   * This method ensures proper ordering by:
   * 1. Keeping system messages first
   * 2. Ensuring user prompt comes after system, before any assistant
   * 3. Building tool cycles (assistant→user) in proper order
   *
   * @private
   */
  private static buildCustomFormatToolContinuation(
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
    if (!hasUserPrompt) {
      messages.push({ role: 'user', content: userPrompt });
    }

    // Add existing conversation history
    // But filter out any incomplete tool cycles (assistant without following user result)
    for (let i = 0; i < conversationMessages.length; i++) {
      const msg = conversationMessages[i];

      // If this is a user message matching the prompt, it's already added above
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

    // Only add assistant tool call if we don't already end with one matching these tool calls
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

    // Format tool results - just the raw result object to match training data
    const toolResultObjects = toolResults.map((result) => {
      return result.success
        ? (result.result || {})
        : { error: result.error || 'Tool execution failed' };
    });

    // Add user message with tool results (raw JSON to match training format)
    messages.push({
      role: 'user',
      content: JSON.stringify(toolResultObjects.length === 1 ? toolResultObjects[0] : toolResultObjects, null, 2)
    });

    return messages;
  }

  /**
   * Build Anthropic-specific tool continuation
   * Returns message array with tool_use and tool_result blocks
   *
   * @private
   */
  private static buildAnthropicToolContinuation(
    userPrompt: string,
    toolCalls: any[],
    toolResults: any[],
    previousMessages?: any[]
  ): any[] {
    const messages: any[] = [];

    // Add previous conversation history if provided
    if (previousMessages && previousMessages.length > 0) {
      messages.push(...previousMessages);
    }

    // Add the original user message
    if (userPrompt) {
      messages.push({
        role: 'user',
        content: userPrompt
      });
    }

    // Add assistant message with tool_use blocks
    const toolUseBlocks = toolCalls.map(tc => ({
      type: 'tool_use',
      id: tc.id,
      name: tc.function?.name || tc.name,
      input: JSON.parse(tc.function?.arguments || '{}')
    }));

    messages.push({
      role: 'assistant',
      content: toolUseBlocks
    });

    // Add user message with tool_result blocks
    const toolResultBlocks = toolResults.map(result => ({
      type: 'tool_result',
      tool_use_id: result.id,
      content: result.success
        ? JSON.stringify(result.result || {})
        : `Error: ${result.error || 'Tool execution failed'}`
    }));

    messages.push({
      role: 'user',
      content: toolResultBlocks
    });

    return messages;
  }

  /**
   * Build Google/Gemini-specific tool continuation
   * Returns message array with functionCall and functionResponse parts
   *
   * Google format requires:
   * 1. User message with text parts
   * 2. Model message with functionCall parts
   * 3. Function message with functionResponse parts
   *
   * @private
   */
  private static buildGoogleToolContinuation(
    userPrompt: string,
    toolCalls: any[],
    toolResults: any[],
    previousMessages?: any[]
  ): any[] {
    const messages: any[] = [];

    // Add previous conversation history if provided (convert to Google format)
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

    // Add model message with functionCall parts
    // Gemini 3.0+ requires preserving thought_signature from original response
    const functionCallParts = toolCalls.map(tc => {
      const part: any = {
        functionCall: {
          name: tc.function?.name || tc.name,
          args: JSON.parse(tc.function?.arguments || '{}')
        }
      };

      // Add thought signature at the same level as functionCall
      if (tc.thought_signature) {
        part.thoughtSignature = tc.thought_signature;
      }

      return part;
    });

    messages.push({
      role: 'model',
      parts: functionCallParts
    });

    // Add function response parts
    // Google uses 'user' role for function responses (not 'function')
    const functionResponseParts = toolResults.map(result => ({
      functionResponse: {
        name: result.name || (result.function?.name),
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
   * Build OpenAI-style tool continuation
   * Returns message array with proper OpenAI format including tool calls and results
   *
   * @private
   */
  private static buildOpenAIToolContinuation(
    userPrompt: string,
    systemPrompt: string | undefined,
    toolCalls: any[],
    toolResults: any[],
    previousMessages?: any[]
  ): any[] {
    const messages: any[] = [];

    // Add previous conversation history if provided
    if (previousMessages && previousMessages.length > 0) {
      messages.push(...previousMessages);
    }

    // Add the original user message
    // This is called by buildContinuationOptions for the FIRST continuation only
    // For subsequent continuations, use appendToolExecution instead
    if (userPrompt) {
      messages.push({
        role: 'user',
        content: userPrompt
      });
    }

    // Add assistant message with tool calls
    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.function?.name || tc.name,
          arguments: tc.function?.arguments || JSON.stringify({})
        }
      }))
    });

    // Add tool result messages
    // Use 'tool' role with tool_call_id for proper OpenAI Chat Completions API format
    toolResults.forEach((result, index) => {
      const toolCall = toolCalls[index];
      const toolName = toolCall.function?.name || toolCall.name;
      const resultContent = result.success
        ? JSON.stringify(result.result || {})
        : JSON.stringify({ error: result.error || 'Tool execution failed' });

      // Format with proper 'tool' role and tool_call_id for OpenAI-compatible APIs
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: resultContent
      });
    });

    return messages;
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
      case 'lmstudio':
      case 'ollama':
      case 'webllm':
        return 'custom-format';
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
}``
