/**
 * OpenAI MCP Handler - Uses responses API with MCP support
 * Handles communication with local MCP server via HTTP
 */

import OpenAI from 'openai';
import { GenerateOptions, LLMResponse, TokenUsage } from '../types';
import { LLMProviderError } from '../types';
import { logger } from '../../../../utils/logger';

export interface MCPToolConfig {
  type: 'mcp';
  server_label: string;
  server_description?: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  require_approval: 'always' | 'never' | { never: { tool_names: string[] } };
  allowed_tools?: string[];
}

export interface MCPResponse {
  output_text?: string;
  output?: Array<{
    id: string;
    type: string;
    content?: any;
    tools?: any[];
    server_label?: string;
    name?: string;
    arguments?: string;
    result?: any;
    error?: any;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAIMCPHandler {
  private serverUrl: string;
  private serverLabel: string;
  
  constructor(
    private client: OpenAI,
    serverUrl: string,
    serverLabel: string = 'claudesidian'
  ) {
    this.serverUrl = serverUrl;
    this.serverLabel = serverLabel;
  }

  /**
   * Generate response using OpenAI responses API with MCP integration
   */
  async generateWithMCP(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    try {
      const model = options?.model || 'gpt-5';
      
      // Build MCP tool configuration following OpenRouter documentation format
      console.log('[OpenAI MCP] Building tool config with connector script');
      const mcpTool: MCPToolConfig = {
        type: 'mcp',
        server_label: 'claudesidian',
        server_description: 'Claudesidian MCP server providing vault operations and AI agents',
        command: 'node',
        args: ['connector.js'], // Relative path - OpenRouter will resolve from plugin directory
        env: {
          NODE_ENV: 'production'
        },
        require_approval: 'never', // Trust our own server
        // Don't specify allowed_tools to get all available tools
      };

      // Build request for responses API  
      const requestParams: any = {
        model,
        input: this.buildInput(prompt, options?.systemPrompt),
        tools: [mcpTool]
      };
      
      // Add system prompt as instructions if provided
      if (options?.systemPrompt) {
        requestParams.instructions = options.systemPrompt;
      }

      // Add optional parameters
      if (options?.temperature !== undefined) requestParams.temperature = options.temperature;
      if (options?.maxTokens !== undefined) requestParams.max_tokens = options.maxTokens;
      if (options?.topP !== undefined) requestParams.top_p = options.topP;
      if (options?.frequencyPenalty !== undefined) requestParams.frequency_penalty = options.frequencyPenalty;
      if (options?.presencePenalty !== undefined) requestParams.presence_penalty = options.presencePenalty;

      logger.systemLog(`[OpenAI MCP] Calling responses API with MCP server: ${this.serverUrl}`);
      
      // Call OpenAI responses API with MCP
      const response = await this.client.responses.create(requestParams) as MCPResponse;
      
      return this.processResponse(response, model);
    } catch (error) {
      logger.systemError(error as Error, 'OpenAI MCP Generation');
      
      // Check if this is a server connectivity issue
      if ((error as any).message?.includes('ECONNREFUSED') || 
          (error as any).code === 'ECONNREFUSED') {
        throw new LLMProviderError(
          'MCP server not reachable. Please ensure the Claudesidian MCP server is running.',
          'openai',
          'MCP_SERVER_UNREACHABLE',
          error as Error
        );
      }
      
      throw new LLMProviderError(
        `OpenAI MCP generation failed: ${(error as Error).message}`,
        'openai',
        'MCP_GENERATION_ERROR',
        error as Error
      );
    }
  }

  /**
   * Process the MCP response and extract results
   */
  private processResponse(response: MCPResponse, model: string): LLMResponse {
    let finalText = response.output_text || '';
    let toolCalls: any[] = [];
    let hasToolExecution = false;

    // Process output array for tool calls and results
    if (response.output && Array.isArray(response.output)) {
      const mcpListTools = response.output.find(item => item.type === 'mcp_list_tools');
      const mcpCalls = response.output.filter(item => item.type === 'mcp_call');
      
      if (mcpListTools) {
        logger.systemLog(`[OpenAI MCP] Tools available from ${mcpListTools.server_label}: ${mcpListTools.tools?.length || 0} tools`);
      }

      // Process tool calls
      mcpCalls.forEach(call => {
        hasToolExecution = true;
        
        const toolCall = {
          id: call.id,
          name: call.name,
          parameters: call.arguments ? JSON.parse(call.arguments) : {},
          result: call.result,
          success: !call.error,
          error: call.error,
          server_label: call.server_label
        };

        toolCalls.push(toolCall);
        
        // Add tool execution info to response text if not already present
        if (!finalText.includes(call.name || '')) {
          finalText += `\n\n[Tool executed: ${call.name || 'unknown'}]`;
          if (call.result) {
            finalText += `\nResult: ${typeof call.result === 'string' ? call.result : JSON.stringify(call.result || '')}`;
          }
        }
      });
    }

    // Extract usage information
    const usage: TokenUsage = {
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0
    };

    const llmResponse: LLMResponse = {
      text: finalText,
      model,
      provider: 'openai',
      usage,
      metadata: {
        mcpEnabled: true,
        serverUrl: this.serverUrl,
        serverLabel: this.serverLabel,
        hasToolExecution,
        toolCallCount: toolCalls.length
      },
      finishReason: 'stop',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };

    return llmResponse;
  }

  /**
   * Build input format for responses API
   * Based on actual OpenAI SDK: input can be string or ResponseInput array
   */
  private buildInput(prompt: string, systemPrompt?: string): string {
    // For MCP testing, start with the simplest approach - just the user prompt
    // System prompts can be handled via the instructions parameter instead
    return prompt;
  }

  /**
   * Check if responses API is available
   */
  isResponsesAPIAvailable(): boolean {
    return typeof this.client.responses?.create === 'function';
  }

  /**
   * Update server configuration
   */
  updateServerConfig(serverUrl: string, serverLabel?: string): void {
    this.serverUrl = serverUrl;
    if (serverLabel) {
      this.serverLabel = serverLabel;
    }
  }

  /**
   * Get current server configuration
   */
  getServerConfig(): { serverUrl: string; serverLabel: string } {
    return {
      serverUrl: this.serverUrl,
      serverLabel: this.serverLabel
    };
  }
}