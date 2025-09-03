/**
 * MCP Chat Integration - Bridges ChatService with HTTP MCP functionality
 * 
 * Provides a clean interface for ChatService to use MCP-enabled LLM providers
 * without changing the core ChatService architecture.
 */

import { MCPConfigurationManager } from '../mcp/MCPConfigurationManager';
import { logger } from '../../utils/logger';

export interface MCPChatOptions {
  /** Provider ID (openai, anthropic, etc.) */
  providerId: string;
  
  /** Model to use */
  model: string;
  
  /** System prompt */
  systemPrompt?: string;
  
  /** Enable MCP tool integration */
  enableMCP?: boolean;
}

export interface MCPChatResponse {
  /** Generated text content */
  content: string;
  
  /** Token usage information */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  
  /** Tool calls executed via MCP */
  toolCalls?: Array<{
    id: string;
    name: string;
    parameters: any;
    result: any;
    success: boolean;
    error?: string;
    server_label?: string;
  }>;
  
  /** MCP-specific metadata */
  mcpMetadata?: {
    serverUrl: string;
    serverLabel: string;
    hasToolExecution: boolean;
    toolCallCount: number;
  };
}

export class MCPChatIntegration {
  private mcpConfig: MCPConfigurationManager;
  private serverUrl: string | null = null;

  constructor(mcpConfig: MCPConfigurationManager) {
    this.mcpConfig = mcpConfig;
    
    // Listen for server URL updates
    this.mcpConfig.on('configUpdated', (config) => {
      this.serverUrl = config.server.url;
    });
  }

  /**
   * Initialize with MCP server URL
   */
  initialize(serverUrl: string): void {
    this.serverUrl = serverUrl;
    this.mcpConfig.initialize(serverUrl);
    
    logger.systemLog(`[MCP Chat Integration] Initialized with server: ${serverUrl}`);
  }

  /**
   * Check if MCP tools are available (provider-agnostic)
   */
  isMCPAvailable(providerId: string): boolean {
    // MCP is available if we have a server URL and tools
    // Provider doesn't matter - we use bridge system for all providers
    const available = this.serverUrl !== null;
    return available;
  }

  /**
   * Prepare LLM service options for MCP-enabled generation
   */
  async prepareLLMOptions(
    baseOptions: any,
    mcpOptions: MCPChatOptions,
    availableTools: any[]
  ): Promise<any> {
    // If MCP is not available or disabled, return base options
    const mcpAvailable = this.isMCPAvailable(mcpOptions.providerId);
    
    if (!mcpAvailable || !mcpOptions.enableMCP) {
      return baseOptions;
    }

    // Convert MCP tools to provider-specific format using bridge system
    let convertedTools: any[] = [];
    try {
      // Lazy import to avoid circular dependencies
      const { MCPFunctionBridge } = await import('../mcp-bridge/core/MCPFunctionBridge');
      const { OpenAIToolConverter } = await import('../mcp-bridge/providers/openai/OpenAIToolConverter');
      
      if (mcpOptions.providerId === 'openai' || mcpOptions.providerId === 'openrouter') {
        const converter = new OpenAIToolConverter();
        convertedTools = availableTools.map(mcpTool => {
          try {
            const providerTool = converter.convertMCPTool(mcpTool);
            return providerTool.tool; // Extract the OpenAI-formatted tool
          } catch (error) {
            return null;
          }
        }).filter(tool => tool !== null);
        
      } else {
        convertedTools = []; // No tools for unsupported providers
      }
    } catch (error) {
      convertedTools = []; // Fallback to no tools
    }

    // Enhance options with MCP configuration
    const enhancedOptions = {
      ...baseOptions,
      provider: mcpOptions.providerId,
      model: mcpOptions.model,
      systemPrompt: mcpOptions.systemPrompt,
      tools: convertedTools, // Use converted tools in provider-specific format
      mcpEnabled: true,
      mcpServerUrl: this.serverUrl
    };

    logger.systemLog(`[MCP Chat Integration] Enhanced LLM options for ${mcpOptions.providerId} with MCP`);
    return enhancedOptions;
  }

  /**
   * Process LLM response and extract MCP-specific information
   */
  processLLMResponse(response: any, originalTools: any[]): MCPChatResponse {
    const chatResponse: MCPChatResponse = {
      content: response.text || response.content || '',
      usage: response.usage,
      toolCalls: response.toolCalls,
      mcpMetadata: response.metadata?.mcpEnabled ? {
        serverUrl: response.metadata.serverUrl || this.serverUrl || 'unknown',
        serverLabel: response.metadata.serverLabel || 'claudesidian',
        hasToolExecution: response.metadata.hasToolExecution || false,
        toolCallCount: response.metadata.toolCallCount || 0
      } : undefined
    };

    // Log MCP tool execution if it occurred
    if (chatResponse.mcpMetadata?.hasToolExecution) {
      logger.systemLog(
        `[MCP Chat Integration] Executed ${chatResponse.mcpMetadata.toolCallCount} tools via MCP server`
      );
    }

    return chatResponse;
  }

  /**
   * Get MCP-aware tool manifest for ChatService
   */
  getMCPToolManifest(providerId: string, availableTools: any[]): any[] {
    if (!this.isMCPAvailable(providerId)) {
      return availableTools;
    }

    // Return tools with MCP-specific metadata
    return availableTools.map(tool => ({
      ...tool,
      mcpEnabled: true,
      serverUrl: this.serverUrl,
      serverLabel: this.mcpConfig.getConfiguration().server.label
    }));
  }

  /**
   * Configure MCP for a specific provider
   */
  configureProvider(
    providerId: string, 
    options: {
      enabled?: boolean;
      supported?: boolean;
      config?: Record<string, any>;
    }
  ): void {
    if (options.supported !== undefined) {
      this.mcpConfig.setProviderSupported(providerId, options.supported);
    }
    
    if (options.enabled !== undefined) {
      this.mcpConfig.setProviderEnabled(providerId, options.enabled);
    }

    logger.systemLog(`[MCP Chat Integration] Configured ${providerId}: ${JSON.stringify(options)}`);
  }

  /**
   * Get configuration summary for debugging
   */
  getConfigSummary(): any {
    return {
      serverUrl: this.serverUrl,
      mcpConfig: this.mcpConfig.getConfigSummary(),
      initialized: !!this.serverUrl
    };
  }

  /**
   * Enable MCP for supported providers automatically
   */
  autoConfigureProviders(llmService: any): void {
    // Simplified: since we use bridge system, all function-calling providers support MCP
    
    // No need to configure individual adapters - bridge handles all providers
    logger.systemLog('[MCP Integration] Bridge system ready for all function-calling providers');
  }

  /**
   * Update server URL and reconfigure providers
   */
  updateServerUrl(serverUrl: string): void {
    this.serverUrl = serverUrl;
    this.mcpConfig.updateServerConfig({ url: serverUrl });
    
    // TODO: Update all configured adapters with new server URL
    
    logger.systemLog(`[MCP Chat Integration] Updated server URL: ${serverUrl}`);
  }
}