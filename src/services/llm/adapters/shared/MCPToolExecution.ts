/**
 * Shared MCP Tool Execution Utility
 * Implements DRY principle for MCP tool calling across all LLM adapters
 * Follows SOLID principles with single responsibility and provider abstraction
 */

import { SupportedProvider } from '../../../mcp-bridge/types/BridgeTypes';

export interface MCPToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface MCPToolResult {
  id: string;
  name?: string; // Tool name for UI display
  success: boolean;
  result?: any;
  error?: string;
  executionTime?: number;
}

export interface MCPCapableAdapter {
  mcpConnector?: any;
}

/**
 * Static utility class for MCP tool execution across all adapters
 * Eliminates code duplication and provides consistent tool calling interface
 */
export class MCPToolExecution {
  
  /**
   * Check if adapter supports MCP integration using mcpConnector
   */
  static supportsMCP(adapter: MCPCapableAdapter): boolean {
    return !!adapter.mcpConnector;
  }

  /**
   * Get available tools for a provider using mcpConnector
   * Note: mcpConnector approach doesn't pre-fetch tools, returns empty array
   */
  static async getToolsForProvider(
    adapter: MCPCapableAdapter, 
    provider: SupportedProvider
  ): Promise<any[]> {
    if (!this.supportsMCP(adapter)) {
      return [];
    }

    // mcpConnector approach: tools are resolved dynamically during execution
    return [];
  }

  /**
   * Execute tool calls using mcpConnector
   * Standardized execution logic across all adapters
   */
  static async executeToolCalls(
    adapter: MCPCapableAdapter,
    toolCalls: MCPToolCall[],
    provider: SupportedProvider,
    onToolEvent?: (event: 'started' | 'completed', data: any) => void,
    context?: { sessionId?: string; workspaceId?: string } // ✅ Added session context
  ): Promise<MCPToolResult[]> {
    if (!this.supportsMCP(adapter)) {
      throw new Error(`MCP not available for ${provider}`);
    }

    try {
      const result = await this.executeViaConnector(adapter.mcpConnector, toolCalls, onToolEvent, context);
      return result;
    } catch (error) {
      throw error;
    }
  }


  /**
   * Execute tools via MCP connector (legacy support)
   */
  private static async executeViaConnector(
    mcpConnector: any,
    toolCalls: MCPToolCall[],
    onToolEvent?: (event: 'started' | 'completed', data: any) => void,
    context?: { sessionId?: string; workspaceId?: string } // ✅ Added session context
  ): Promise<MCPToolResult[]> {
    const results: MCPToolResult[] = [];

    for (const toolCall of toolCalls) {
      try {
        // Parse and validate tool arguments with error handling
        let parameters: any = {};
        const argumentsStr = toolCall.function.arguments || '{}';

        try {
          parameters = JSON.parse(argumentsStr);
        } catch (parseError) {

          // Detect if this is incomplete JSON (streaming not finished)
          const openBraces = (argumentsStr.match(/\{/g)?.length || 0);
          const closeBraces = (argumentsStr.match(/\}/g)?.length || 0);
          const openBrackets = (argumentsStr.match(/\[/g)?.length || 0);
          const closeBrackets = (argumentsStr.match(/\]/g)?.length || 0);
          const hasUnterminatedString = argumentsStr.split('"').length % 2 === 0; // Odd number of quotes = unterminated
          const endsProperlyForObject = argumentsStr.trim().endsWith('}');
          const endsProperlyForArray = argumentsStr.trim().endsWith(']');

          const isIncomplete = !endsProperlyForObject ||
                               openBraces !== closeBraces ||
                               openBrackets !== closeBrackets ||
                               hasUnterminatedString;

          if (isIncomplete) {
            throw new Error(
              `Tool arguments appear incomplete (streaming not finished). ` +
              `This is a BUG - tool execution should only occur after stream completion. ` +
              `Diagnostics: {${openBraces} }${closeBraces}, [${openBrackets} ]${closeBrackets}, ` +
              `Length: ${argumentsStr.length}, Ends properly: ${endsProperlyForObject}`
            );
          }

          // Not incomplete JSON, just malformed - re-throw original error
          throw new Error(`Invalid tool arguments: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`);
        }

        // Notify tool started with parsed parameters
        onToolEvent?.('started', {
          id: toolCall.id,
          name: toolCall.function.name,
          parameters: parameters
        });

        const originalToolName = toolCall.function.name.replace('_', '.');
        const [agent, mode] = originalToolName.split('.');

        // ✅ CRITICAL: Inject session ID and workspace ID into tool params
        const paramsWithContext = {
          ...parameters,
          context: {
            ...parameters.context,
            sessionId: context?.sessionId, // Inject session ID from ChatService
            workspaceId: context?.workspaceId // Inject workspace ID from ChatService
          }
        };

        const agentModeParams = { agent, mode, params: paramsWithContext };

        const result = await mcpConnector.callTool(agentModeParams);

        results.push({
          id: toolCall.id,
          name: toolCall.function.name, // Preserve the tool name
          success: result.success, // Fixed: Use result.success not !result.error
          result: result.success ? result : undefined,
          error: result.success ? undefined : (result.error || 'Tool execution failed')
        });

        // Notify tool completed
        onToolEvent?.('completed', {
          toolId: toolCall.id,
          result: result.success ? result : undefined,
          success: result.success,
          error: result.success ? undefined : (result.error || 'Tool execution failed')
        });

      } catch (error) {
        results.push({
          id: toolCall.id,
          name: toolCall.function.name, // Preserve the tool name even on error
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        // Notify tool completed (with error)
        onToolEvent?.('completed', {
          toolId: toolCall.id,
          result: undefined,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  /**
   * Build tool messages for continuation
   * Formats differently for Anthropic, Google, vs other providers
   */
  static buildToolMessages(
    toolResults: MCPToolResult[],
    provider: SupportedProvider
  ): Array<any> {
    // NOTE: result.result is already minimized in executeToolCalls() - no need to minimize again
    if (provider === 'anthropic') {
      // Anthropic format: role='user', content array with tool_result objects
      return toolResults.map(result => ({
        role: 'user' as const,
        content: [
          {
            type: 'tool_result',
            tool_use_id: result.id,
            content: result.success
              ? JSON.stringify(result.result)
              : `Error: ${result.error}`
          }
        ]
      }));
    } else if (provider === 'google') {
      // Google Gemini format: role='function', parts array with functionResponse objects
      return toolResults.map(result => ({
        role: 'function' as const,
        parts: [
          {
            functionResponse: {
              name: result.name,
              response: result.success
                ? result.result
                : { error: result.error }
            }
          }
        ]
      }));
    } else {
      // OpenAI format (used by OpenAI, OpenRouter, Groq, Mistral, etc.)
      return toolResults.map(result => ({
        role: 'tool' as const,
        tool_call_id: result.id,
        content: result.success
          ? JSON.stringify(result.result)
          : `Error: ${result.error}`
      }));
    }
  }

  /**
   * Build tool metadata for response
   * NOTE: result.result is already minimized in executeToolCalls()
   */
  static buildToolMetadata(toolResults: MCPToolResult[]) {
    return {
      mcpEnabled: true,
      toolCallCount: toolResults.length,
      toolCalls: toolResults.length > 0 ? toolResults.map(result => ({
        id: result.id,
        name: result.name, // Include the tool name for UI display
        result: result.result, // Already minimized in executeToolCalls()
        success: result.success,
        error: result.error,
        executionTime: result.executionTime
      })) : undefined
    };
  }

  /**
   * Check if generation should use tools (with safety checks)
   * Only uses mcpConnector approach
   */
  static shouldUseMCPTools(
    adapter: MCPCapableAdapter,
    options?: { enableTools?: boolean }
  ): boolean {
    const enableTools = options?.enableTools !== false; // Default to true
    if (!enableTools) return false;
    
    return this.supportsMCP(adapter);
  }

  /**
   * Centralized tool-enabled generation wrapper
   * Eliminates code duplication across all adapters by handling common tool execution logic
   */
  static async executeWithToolSupport<T>(
    adapter: MCPCapableAdapter,
    provider: SupportedProvider,
    options: {
      model: string;
      tools: any[];
      prompt: string;
      systemPrompt?: string;
      onToolEvent?: (event: 'started' | 'completed', data: any) => void;
      sessionId?: string; // ✅ Added session context
      workspaceId?: string; // ✅ Added workspace context
    },
    callbacks: {
      buildMessages: (prompt: string, systemPrompt?: string) => any[];
      makeApiCall: (requestBody: any, isInitial: boolean) => Promise<T>;
      extractResponse: (apiResponse: T) => Promise<{
        content: string;
        usage?: any;
        finishReason?: string;
        toolCalls?: any[];
        choice?: any;
      }>;
      buildLLMResponse: (
        content: string,
        model: string,
        usage?: any,
        metadata?: any,
        finishReason?: any,
        toolCalls?: any[]
      ) => Promise<any>;
      buildRequestBody: (messages: any[], isInitial: boolean) => any;
    }
  ): Promise<any> {
    // Extract tool event callback from options for DRY approach across all adapters
    const onToolEvent = options.onToolEvent;

    const TOOL_ITERATION_THRESHOLD = 15;
    let totalToolIterations = 0;
    let allToolResults: MCPToolResult[] = [];

    // Build initial messages
    const messages = callbacks.buildMessages(options.prompt, options.systemPrompt);
    let conversationMessages = [...messages];

    // Initial API call
    const initialRequestBody = callbacks.buildRequestBody(conversationMessages, true);
    let apiResponse = await callbacks.makeApiCall(initialRequestBody, true);
    let responseData = await callbacks.extractResponse(apiResponse);

    let finalText = responseData.content || '';
    const usage = responseData.usage;
    let finishReason = responseData.finishReason || 'stop';

    // Tool execution loop
    while (responseData.choice?.message?.toolCalls && responseData.choice.message.toolCalls.length > 0) {
      totalToolIterations++;
      
      console.log(`[${provider} Tool Safety] Tool iteration ${totalToolIterations}/${TOOL_ITERATION_THRESHOLD}`);
      
      // Check threshold
      if (totalToolIterations >= TOOL_ITERATION_THRESHOLD) {
        console.log(`[${provider} Tool Safety] Hit ${TOOL_ITERATION_THRESHOLD} tool iteration threshold - activating dead switch`);
        
        const deadSwitchMessage = {
          role: 'system' as const,
          content: `TOOL_LIMIT_REACHED: You have used ${TOOL_ITERATION_THRESHOLD} tool iterations. You must now ask the user if they want to continue with more tool calls. Explain what you've accomplished so far and what you still need to do. Wait for user confirmation before proceeding further.`
        };
        
        const deadSwitchMessages = [
          ...conversationMessages,
          responseData.choice.message,
          deadSwitchMessage
        ];
        
        const deadSwitchRequestBody = callbacks.buildRequestBody(deadSwitchMessages, false);
        const deadSwitchResponse = await callbacks.makeApiCall(deadSwitchRequestBody, false);
        const deadSwitchData = await callbacks.extractResponse(deadSwitchResponse);
        
        finalText = deadSwitchData.content || 'Unable to complete due to tool iteration limit.';
        finishReason = deadSwitchData.finishReason || 'stop';
        break;
      }

      try {
        // Convert tool calls to MCP format
        const mcpToolCalls: MCPToolCall[] = responseData.choice.message.toolCalls.map((tc: any) => ({
          id: tc.id,
          function: {
            name: tc.function?.name || tc.name,
            arguments: tc.function?.arguments || JSON.stringify(tc.parameters || {})
          }
        }));

        // Execute tool calls with session context
        const toolResults = await MCPToolExecution.executeToolCalls(
          adapter,
          mcpToolCalls,
          provider,
          onToolEvent,
          { sessionId: options.sessionId, workspaceId: options.workspaceId } // ✅ Pass session context
        );
        allToolResults.push(...toolResults);

        // Build tool messages for continuation
        const toolMessages = MCPToolExecution.buildToolMessages(toolResults, provider);

        // Update conversation
        conversationMessages = [
          ...conversationMessages,
          responseData.choice.message,
          ...toolMessages
        ];

        console.log(`[${provider} Adapter] Continuing conversation with ${toolResults.length} tool results`);

        // Make continuation request
        const continuationRequestBody = callbacks.buildRequestBody(conversationMessages, false);
        apiResponse = await callbacks.makeApiCall(continuationRequestBody, false);
        responseData = await callbacks.extractResponse(apiResponse);
        
        if (responseData.content) {
          finalText = responseData.content;
          finishReason = responseData.finishReason || 'stop';
        }

      } catch (error) {
        console.error(`[${provider} Adapter] Tool execution failed:`, error);
        const toolNames = (responseData.choice.message.toolCalls || []).map((tc: any) => tc.function?.name || tc.name).join(', ');
        finalText = `I tried to use tools (${toolNames}) but encountered an error: ${error instanceof Error ? error.message : String(error)}`;
        break;
      }
    }
    
    console.log(`[${provider} Tool Safety] Tool execution completed after ${totalToolIterations} iterations`);
    console.log(`[${provider} Adapter] Final response includes ${allToolResults.length} tool results`);

    return callbacks.buildLLMResponse(
      finalText,
      options.model,
      usage,
      MCPToolExecution.buildToolMetadata(allToolResults),
      finishReason as any,
      allToolResults
    );
  }

}