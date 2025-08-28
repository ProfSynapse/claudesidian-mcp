/**
 * Location: /src/services/mcp-bridge/core/MCPFunctionBridge.ts
 * 
 * This file implements the main MCP Function Bridge orchestrator that provides a unified
 * interface for converting MCP tools to function calling formats and executing tool calls.
 * It coordinates between tool discovery, schema conversion, and tool execution components.
 * 
 * Used by: LLM adapters (OpenAI, OpenRouter, etc.) for MCP tool integration
 * Dependencies: ToolSchemaConverter, MCPToolExecutor, BridgeTypes
 */

import {
  IMCPFunctionBridge,
  MCPTool,
  ProviderTool,
  ToolCallRequest,
  ToolCallResult,
  BridgeConfiguration,
  BridgeDiagnostics,
  ExecutionStats,
  ToolFeature,
  SupportedProvider,
  MCPToolListResponse,
  BridgeError,
  BridgeErrorType,
  DiagnosticLevel
} from '../types/BridgeTypes';
import { ToolSchemaConverter } from './ToolSchemaConverter';
import { MCPToolExecutor } from './MCPToolExecutor';

/**
 * Bridge state for tracking initialization and health
 */
interface BridgeState {
  isInitialized: boolean;
  lastToolDiscovery: string | null;
  mcpServerStatus: 'connected' | 'disconnected' | 'error';
  availableTools: MCPTool[];
  enabledProviders: SupportedProvider[];
  initializationError: Error | null;
}

/**
 * Default bridge configuration
 */
const DEFAULT_CONFIG: BridgeConfiguration = {
  mcpServer: {
    url: 'http://localhost:3000',
    timeout: 30000,
    retries: 2,
    healthCheckInterval: 60000 // 1 minute
  },
  providers: {
    openai: {
      enabled: true,
      features: [ToolFeature.FUNCTION_CALLING, ToolFeature.PARALLEL_CALLS, ToolFeature.STREAMING, ToolFeature.VALIDATION]
    },
    openrouter: {
      enabled: true,
      features: [ToolFeature.FUNCTION_CALLING, ToolFeature.PARALLEL_CALLS, ToolFeature.STREAMING, ToolFeature.VALIDATION]
    },
    anthropic: {
      enabled: false, // TODO: Enable when converter is implemented
      features: [ToolFeature.FUNCTION_CALLING]
    },
    google: {
      enabled: false, // TODO: Enable when converter is implemented
      features: [ToolFeature.FUNCTION_CALLING]
    },
    groq: {
      enabled: false, // TODO: Enable when converter is implemented
      features: [ToolFeature.FUNCTION_CALLING, ToolFeature.PARALLEL_CALLS]
    },
    mistral: {
      enabled: false, // TODO: Enable when converter is implemented
      features: [ToolFeature.FUNCTION_CALLING]
    }
  },
  diagnostics: {
    enabled: true,
    level: DiagnosticLevel.INFO,
    retentionDays: 7,
    maxEvents: 1000
  },
  cache: {
    enabled: true,
    toolSchemaTTL: 300000, // 5 minutes
    resultTTL: 60000, // 1 minute
    maxSize: 100
  },
  ui: {
    showAccordion: true,
    expandByDefault: false,
    showTimings: true,
    showParameters: true
  }
};

/**
 * MCP Function Bridge Implementation
 * 
 * Main orchestrator that coordinates tool discovery, schema conversion,
 * and tool execution across all supported LLM providers.
 */
export class MCPFunctionBridge implements IMCPFunctionBridge {
  private config: BridgeConfiguration;
  private schemaConverter: ToolSchemaConverter;
  private toolExecutor: MCPToolExecutor;
  private state: BridgeState;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  
  constructor(config: Partial<BridgeConfiguration> = {}) {
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);
    
    // Initialize state
    this.state = {
      isInitialized: false,
      lastToolDiscovery: null,
      mcpServerStatus: 'disconnected',
      availableTools: [],
      enabledProviders: this.getEnabledProviders(),
      initializationError: null
    };
    
    // Initialize components
    this.schemaConverter = new ToolSchemaConverter({
      enableLogging: this.config.diagnostics.enabled,
      logLevel: this.config.diagnostics.level,
      validateConversions: true,
      cacheConversions: this.config.cache.enabled,
      maxCacheSize: this.config.cache.maxSize
    });
    
    this.toolExecutor = new MCPToolExecutor({
      serverUrl: this.config.mcpServer.url,
      timeout: this.config.mcpServer.timeout,
      retries: this.config.mcpServer.retries,
      enableLogging: this.config.diagnostics.enabled,
      logLevel: this.config.diagnostics.level
    });
    
    if (this.config.diagnostics.enabled) {
      console.log('[MCPFunctionBridge] Initialized with config:', {
        mcpServerUrl: this.config.mcpServer.url,
        enabledProviders: this.state.enabledProviders,
        diagnosticsLevel: this.config.diagnostics.level
      });
    }
  }

  /**
   * Initialize the bridge system
   */
  async initialize(): Promise<void> {
    try {
      if (this.config.diagnostics.enabled) {
        console.log('[MCPFunctionBridge] Initializing bridge system...');
      }
      
      // Test MCP server connection
      const isServerHealthy = await this.toolExecutor.testConnection();
      if (!isServerHealthy) {
        throw new BridgeError(
          BridgeErrorType.MCP_SERVER_UNREACHABLE,
          `MCP server at ${this.config.mcpServer.url} is not reachable`
        );
      }
      
      this.state.mcpServerStatus = 'connected';
      
      // Discover available tools
      await this.refreshTools();
      
      // Start health check interval
      this.startHealthCheck();
      
      this.state.isInitialized = true;
      this.state.initializationError = null;
      
      if (this.config.diagnostics.enabled) {
        console.log('[MCPFunctionBridge] Bridge system initialized successfully:', {
          toolCount: this.state.availableTools.length,
          enabledProviders: this.state.enabledProviders,
          serverStatus: this.state.mcpServerStatus
        });
      }
      
    } catch (error) {
      this.state.isInitialized = false;
      this.state.initializationError = error as Error;
      this.state.mcpServerStatus = 'error';
      
      console.error('[MCPFunctionBridge] Failed to initialize bridge system:', error);
      throw error;
    }
  }

  /**
   * Check if bridge is initialized
   */
  isInitialized(): boolean {
    return this.state.isInitialized;
  }

  /**
   * Get available MCP tools
   */
  async getAvailableTools(): Promise<MCPTool[]> {
    if (!this.state.isInitialized) {
      throw new BridgeError(
        BridgeErrorType.BRIDGE_NOT_INITIALIZED,
        'Bridge must be initialized before getting tools'
      );
    }
    
    return [...this.state.availableTools]; // Return copy to prevent mutation
  }

  /**
   * Get tools converted for specific provider
   */
  async getToolsForProvider(provider: SupportedProvider): Promise<ProviderTool[]> {
    if (!this.state.isInitialized) {
      throw new BridgeError(
        BridgeErrorType.BRIDGE_NOT_INITIALIZED,
        'Bridge must be initialized before getting provider tools'
      );
    }
    
    if (!this.isProviderEnabled(provider)) {
      if (this.config.diagnostics.enabled) {
        console.warn(`[MCPFunctionBridge] Provider ${provider} is not enabled`);
      }
      return [];
    }
    
    if (!this.schemaConverter.isProviderSupported(provider)) {
      throw new BridgeError(
        BridgeErrorType.PROVIDER_NOT_SUPPORTED,
        `Provider ${provider} is not supported`,
        provider
      );
    }
    
    try {
      const convertedTools = await this.schemaConverter.convertToolsForProvider(
        this.state.availableTools,
        provider
      );
      
      if (this.config.diagnostics.enabled && this.config.diagnostics.level !== DiagnosticLevel.ERROR) {
        console.log(`[MCPFunctionBridge] Converted ${convertedTools.length} tools for ${provider}`);
      }
      
      return convertedTools;
      
    } catch (error) {
      console.error(`[MCPFunctionBridge] Failed to convert tools for ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Refresh available tools from MCP server
   */
  async refreshTools(): Promise<void> {
    try {
      if (this.config.diagnostics.enabled && this.config.diagnostics.level !== DiagnosticLevel.ERROR) {
        console.log('[MCPFunctionBridge] Refreshing tools from MCP server...');
      }
      
      const response = await fetch(`${this.config.mcpServer.url}/list_tools`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(this.config.mcpServer.timeout)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data: MCPToolListResponse = await response.json();
      
      if (!data.tools || !Array.isArray(data.tools)) {
        throw new Error('Invalid response format: missing tools array');
      }
      
      this.state.availableTools = data.tools;
      this.state.lastToolDiscovery = new Date().toISOString();
      this.state.mcpServerStatus = 'connected';
      
      // Clear schema converter cache since tools may have changed
      this.schemaConverter.clearCache();
      
      if (this.config.diagnostics.enabled) {
        console.log(`[MCPFunctionBridge] Successfully refreshed ${data.tools.length} tools from MCP server`);
      }
      
    } catch (error) {
      this.state.mcpServerStatus = 'error';
      console.error('[MCPFunctionBridge] Failed to refresh tools:', error);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BridgeError(
          BridgeErrorType.MCP_SERVER_UNREACHABLE,
          `Tool discovery timeout after ${this.config.mcpServer.timeout}ms`
        );
      } else if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new BridgeError(
          BridgeErrorType.MCP_SERVER_UNREACHABLE,
          `Cannot connect to MCP server at ${this.config.mcpServer.url}`
        );
      }
      
      throw error;
    }
  }

  /**
   * Execute a single tool call
   */
  async executeToolCall(call: ToolCallRequest): Promise<ToolCallResult> {
    if (!this.state.isInitialized) {
      throw new BridgeError(
        BridgeErrorType.BRIDGE_NOT_INITIALIZED,
        'Bridge must be initialized before executing tools'
      );
    }
    
    if (this.config.diagnostics.enabled && this.config.diagnostics.level !== DiagnosticLevel.ERROR) {
      console.log(`[MCPFunctionBridge] Executing tool call: ${call.name}`, {
        id: call.id,
        provider: call.provider
      });
    }
    
    try {
      const result = await this.toolExecutor.executeTool(call);
      
      if (this.config.diagnostics.enabled && this.config.diagnostics.level !== DiagnosticLevel.ERROR) {
        console.log(`[MCPFunctionBridge] Tool execution completed: ${call.name}`, {
          success: result.success,
          executionTime: result.executionTime
        });
      }
      
      return result;
      
    } catch (error) {
      console.error(`[MCPFunctionBridge] Tool execution failed for ${call.name}:`, error);
      throw error;
    }
  }

  /**
   * Execute multiple tool calls
   */
  async executeToolCalls(calls: ToolCallRequest[]): Promise<ToolCallResult[]> {
    if (!this.state.isInitialized) {
      throw new BridgeError(
        BridgeErrorType.BRIDGE_NOT_INITIALIZED,
        'Bridge must be initialized before executing tools'
      );
    }
    
    if (this.config.diagnostics.enabled && this.config.diagnostics.level !== DiagnosticLevel.ERROR) {
      console.log(`[MCPFunctionBridge] Executing ${calls.length} tool calls`);
    }
    
    try {
      // Execute in parallel for better performance
      const results = await this.toolExecutor.executeToolsParallel(calls);
      
      if (this.config.diagnostics.enabled && this.config.diagnostics.level !== DiagnosticLevel.ERROR) {
        const successful = results.filter(r => r.success).length;
        console.log(`[MCPFunctionBridge] Batch execution completed:`, {
          total: results.length,
          successful,
          failed: results.length - successful
        });
      }
      
      return results;
      
    } catch (error) {
      console.error('[MCPFunctionBridge] Batch tool execution failed:', error);
      throw error;
    }
  }

  /**
   * Check if bridge is healthy
   */
  isHealthy(): boolean {
    return this.state.isInitialized && 
           this.state.mcpServerStatus === 'connected' &&
           this.state.availableTools.length > 0;
  }

  /**
   * Get bridge diagnostics
   */
  getDiagnostics(): BridgeDiagnostics {
    return {
      isHealthy: this.isHealthy(),
      mcpServerStatus: this.state.mcpServerStatus,
      lastToolDiscovery: this.state.lastToolDiscovery || 'never',
      toolCount: this.state.availableTools.length,
      enabledProviders: this.state.enabledProviders,
      recentEvents: [] // TODO: Implement event tracking
    };
  }

  /**
   * Get execution statistics
   */
  getExecutionStats(): ExecutionStats {
    return this.toolExecutor.getExecutionMetrics();
  }

  /**
   * Update bridge configuration
   */
  updateConfiguration(config: Partial<BridgeConfiguration>): void {
    this.config = this.mergeConfig(this.config, config);
    this.state.enabledProviders = this.getEnabledProviders();
    
    // Update component configurations
    this.toolExecutor.updateConfig({
      serverUrl: this.config.mcpServer.url,
      timeout: this.config.mcpServer.timeout,
      retries: this.config.mcpServer.retries,
      enableLogging: this.config.diagnostics.enabled,
      logLevel: this.config.diagnostics.level
    });
    
    this.schemaConverter.updateConfig({
      enableLogging: this.config.diagnostics.enabled,
      logLevel: this.config.diagnostics.level,
      cacheConversions: this.config.cache.enabled,
      maxCacheSize: this.config.cache.maxSize
    });
    
    // Restart health check with new interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.startHealthCheck();
    }
    
    if (this.config.diagnostics.enabled) {
      console.log('[MCPFunctionBridge] Configuration updated:', config);
    }
  }

  /**
   * Get current configuration
   */
  getConfiguration(): BridgeConfiguration {
    return JSON.parse(JSON.stringify(this.config)); // Deep copy
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const isHealthy = await this.toolExecutor.testConnection();
        this.state.mcpServerStatus = isHealthy ? 'connected' : 'disconnected';
        
        if (this.config.diagnostics.enabled && this.config.diagnostics.level === DiagnosticLevel.DEBUG) {
          console.log(`[MCPFunctionBridge] Health check: ${this.state.mcpServerStatus}`);
        }
      } catch (error) {
        this.state.mcpServerStatus = 'error';
        if (this.config.diagnostics.enabled) {
          console.error('[MCPFunctionBridge] Health check failed:', error);
        }
      }
    }, this.config.mcpServer.healthCheckInterval);
  }

  /**
   * Get enabled providers from configuration
   */
  private getEnabledProviders(): SupportedProvider[] {
    return Object.entries(this.config.providers)
      .filter(([_, config]) => config?.enabled)
      .map(([provider, _]) => provider as SupportedProvider);
  }

  /**
   * Check if provider is enabled
   */
  private isProviderEnabled(provider: SupportedProvider): boolean {
    return this.state.enabledProviders.includes(provider);
  }

  /**
   * Merge configuration objects recursively
   */
  private mergeConfig(base: BridgeConfiguration, override: Partial<BridgeConfiguration>): BridgeConfiguration {
    const result = { ...base };
    
    for (const [key, value] of Object.entries(override)) {
      if (value !== undefined) {
        if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
          result[key as keyof BridgeConfiguration] = {
            ...result[key as keyof BridgeConfiguration] as any,
            ...value
          };
        } else {
          (result as any)[key] = value;
        }
      }
    }
    
    return result;
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    this.toolExecutor.cleanup();
    this.schemaConverter.clearCache();
    
    this.state.isInitialized = false;
    
    if (this.config.diagnostics.enabled) {
      console.log('[MCPFunctionBridge] Bridge system disposed');
    }
  }
}