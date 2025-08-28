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
      console.warn(`[MCPToolExecution] MCP not available for ${provider}`);
      return [];
    }

    // mcpConnector approach: tools are resolved dynamically during execution
    console.log(`[MCPToolExecution] Using mcpConnector for ${provider} - tools resolved dynamically`);
    return [];
  }

  /**
   * Execute tool calls using mcpConnector
   * Standardized execution logic across all adapters
   */
  static async executeToolCalls(
    adapter: MCPCapableAdapter,
    toolCalls: MCPToolCall[],
    provider: SupportedProvider
  ): Promise<MCPToolResult[]> {
    if (!this.supportsMCP(adapter)) {
      throw new Error(`MCP not available for ${provider}`);
    }

    console.log(`[MCPToolExecution] Executing ${toolCalls.length} tool calls for ${provider}`);

    try {
      return await this.executeViaConnector(adapter.mcpConnector, toolCalls);
    } catch (error) {
      console.error(`[MCPToolExecution] Tool execution failed for ${provider}:`, error);
      throw error;
    }
  }


  /**
   * Execute tools via MCP connector (legacy support)
   */
  private static async executeViaConnector(
    mcpConnector: any,
    toolCalls: MCPToolCall[]
  ): Promise<MCPToolResult[]> {
    const results: MCPToolResult[] = [];

    for (const toolCall of toolCalls) {
      try {
        const parameters = JSON.parse(toolCall.function.arguments || '{}');
        const originalToolName = toolCall.function.name.replace('_', '.');
        const [agent, mode] = originalToolName.split('.');
        const agentModeParams = { agent, mode, params: parameters };

        const result = await mcpConnector.callTool(agentModeParams);
        
        results.push({
          id: toolCall.id,
          success: result.success, // Fixed: Use result.success not !result.error
          result: result.success ? result : undefined,
          error: result.success ? undefined : (result.error || 'Tool execution failed')
        });

      } catch (error) {
        console.error('[MCPToolExecution] Tool call failed:', error);
        results.push({
          id: toolCall.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  /**
   * Build tool messages for continuation (OpenAI/OpenRouter format)
   */
  static buildToolMessages(toolResults: MCPToolResult[]): Array<{
    role: 'tool';
    tool_call_id: string;
    content: string;
  }> {
    return toolResults.map(result => ({
      role: 'tool' as const,
      tool_call_id: result.id,
      content: result.success 
        ? JSON.stringify(result.result)
        : `Error: ${result.error}`
    }));
  }

  /**
   * Build tool metadata for response
   */
  static buildToolMetadata(toolResults: MCPToolResult[]) {
    return {
      mcpEnabled: true,
      toolCallCount: toolResults.length,
      toolCalls: toolResults.length > 0 ? toolResults.map(result => ({
        id: result.id,
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



}