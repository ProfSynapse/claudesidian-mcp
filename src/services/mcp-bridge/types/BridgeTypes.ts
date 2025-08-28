/**
 * Location: /src/services/mcp-bridge/types/BridgeTypes.ts
 * 
 * This file defines all TypeScript interfaces and types for the MCP-to-Function-Calling bridge system.
 * It provides comprehensive type safety for converting MCP tools to provider-specific function calling formats.
 * 
 * Used by: All bridge components for type safety and interface contracts
 * Dependencies: JSON Schema types, LLM provider types
 */

// Using built-in JSON Schema types instead of external dependency
type JSONSchema = {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  items?: JSONSchema;
  additionalProperties?: boolean | JSONSchema;
  enum?: any[];
  [key: string]: any;
};

// ============================================================================
// Core Bridge Types
// ============================================================================

/**
 * Supported LLM providers that can use the bridge system
 */
export type SupportedProvider = 'openai' | 'openrouter' | 'anthropic' | 'google' | 'groq' | 'mistral';

/**
 * Diagnostic levels for bridge system logging
 */
export enum DiagnosticLevel {
  ERROR = 'error',     // Only errors and critical issues
  INFO = 'info',       // Tool executions and major events
  DEBUG = 'debug',     // Detailed request/response data
  TRACE = 'trace'      // Complete execution flow
}

/**
 * Execution status for tool calls
 */
export enum ExecutionStatus {
  PENDING = 'pending',
  EXECUTING = 'executing', 
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * Tool features supported by different providers
 */
export enum ToolFeature {
  FUNCTION_CALLING = 'function_calling',
  PARALLEL_CALLS = 'parallel_calls',
  STREAMING = 'streaming',
  VALIDATION = 'validation'
}

// ============================================================================
// MCP Tool Types (from server)
// ============================================================================

/**
 * MCP tool definition from the server
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

/**
 * Response from MCP server list_tools endpoint
 */
export interface MCPToolListResponse {
  tools: MCPTool[];
}

/**
 * MCP tool execution request format
 */
export interface MCPExecutionRequest {
  name: string;
  arguments: Record<string, any>;
}

/**
 * MCP tool execution response format
 */
export interface MCPExecutionResponse {
  success: boolean;
  result?: any;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  executionTime?: number;
}

// ============================================================================
// Provider Tool Types
// ============================================================================

/**
 * Generic provider tool wrapper
 */
export interface ProviderTool {
  provider: SupportedProvider;
  originalName: string;
  tool: any; // Provider-specific format
}

/**
 * OpenAI function calling tool format
 */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
}

/**
 * OpenAI tool call from LLM response
 */
export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/**
 * Anthropic tool definition format
 */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: JSONSchema;
}

/**
 * Anthropic tool call from LLM response
 */
export interface AnthropicToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

/**
 * Google/Gemini function declaration format
 */
export interface GoogleTool {
  name: string;
  description: string;
  parameters: JSONSchema;
}

/**
 * Google function call from LLM response
 */
export interface GoogleToolCall {
  name: string;
  args: Record<string, any>;
}

// ============================================================================
// Bridge Internal Types
// ============================================================================

/**
 * Normalized tool call request (internal format)
 */
export interface ToolCallRequest {
  id: string;
  name: string;
  parameters: Record<string, any>;
  provider: SupportedProvider;
  metadata?: {
    timestamp?: string;
    sessionId?: string;
    executionContext?: Record<string, any>;
  };
}

/**
 * Normalized tool call result (internal format)
 */
export interface ToolCallResult {
  id: string;
  name: string;
  success: boolean;
  result?: any;
  error?: string;
  executionTime: number;
  timestamp: string;
  metadata?: {
    provider?: SupportedProvider;
    mcpServer?: string;
    errorCode?: string;
    errorType?: string;
    retryCount?: number;
  };
}

/**
 * Execution context for tool calls
 */
export interface ExecutionContext {
  sessionId?: string;
  userId?: string;
  conversationId?: string;
  provider: SupportedProvider;
  model: string;
  timestamp: string;
}

/**
 * Validation result for tool calls and schemas
 */
export interface ValidationResult {
  isValid: boolean;
  errors?: string[];
  warnings?: string[];
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Bridge system configuration
 */
export interface BridgeConfiguration {
  mcpServer: {
    url: string;
    timeout: number;
    retries: number;
    healthCheckInterval: number;
  };
  providers: {
    [K in SupportedProvider]?: {
      enabled: boolean;
      features: ToolFeature[];
    };
  };
  diagnostics: {
    enabled: boolean;
    level: DiagnosticLevel;
    retentionDays: number;
    maxEvents: number;
  };
  cache: {
    enabled: boolean;
    toolSchemaTTL: number;
    resultTTL: number;
    maxSize: number;
  };
  ui: {
    showAccordion: boolean;
    expandByDefault: boolean;
    showTimings: boolean;
    showParameters: boolean;
  };
}

/**
 * Provider capabilities
 */
export interface ProviderCapabilities {
  supportsParallelCalls: boolean;
  supportsStreaming: boolean;
  maxToolsPerCall: number;
  features: ToolFeature[];
}

// ============================================================================
// Diagnostic and Monitoring Types
// ============================================================================

/**
 * Diagnostic event for bridge system logging
 */
export interface DiagnosticEvent {
  id: string;
  type: 'tool_discovery' | 'tool_execution' | 'schema_conversion' | 'error';
  timestamp: string;
  level: DiagnosticLevel;
  component: string;
  data: Record<string, any>;
  context?: ExecutionContext;
}

/**
 * Bridge system diagnostics
 */
export interface BridgeDiagnostics {
  isHealthy: boolean;
  mcpServerStatus: 'connected' | 'disconnected' | 'error';
  lastToolDiscovery: string;
  toolCount: number;
  enabledProviders: SupportedProvider[];
  recentEvents: DiagnosticEvent[];
}

/**
 * Execution statistics
 */
export interface ExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  currentQueueSize: number;
  lastExecutionTime: string;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  period: {
    start: string;
    end: string;
    duration: number;
  };
  toolExecutions: {
    total: number;
    successful: number;
    failed: number;
    averageTime: number;
    medianTime: number;
    p95Time: number;
  };
  byTool: Record<string, {
    calls: number;
    successRate: number;
    averageTime: number;
  }>;
  byProvider: Record<string, {
    calls: number;
    successRate: number;
    averageTime: number;
  }>;
  errors: {
    total: number;
    byType: Record<string, number>;
    byTool: Record<string, number>;
  };
}

// ============================================================================
// UI Integration Types
// ============================================================================

/**
 * Tool call status update for UI
 */
export interface ToolCallStatusUpdate {
  callId: string;
  status: ExecutionStatus;
  data?: {
    name?: string;
    parameters?: Record<string, any>;
    result?: any;
    error?: string;
    executionTime?: number;
  };
  timestamp: string;
}

/**
 * Tool accordion state for UI
 */
export interface AccordionState {
  isExpanded: boolean;
  toolCalls: Array<{
    id: string;
    name: string;
    status: ExecutionStatus;
    parameters: Record<string, any>;
    result?: any;
    error?: string;
    executionTime?: number;
    timestamp: string;
  }>;
  summary: {
    total: number;
    completed: number;
    failed: number;
    executing: number;
  };
}

// ============================================================================
// Cache Types
// ============================================================================

/**
 * Tool schema cache entry
 */
export interface ToolSchemaCacheEntry {
  tools: ProviderTool[];
  lastUpdated: string;
  ttl: number;
  version: string;
}

/**
 * Tool schema cache by provider
 */
export interface ToolSchemaCache {
  [provider: string]: ToolSchemaCacheEntry;
}

/**
 * Execution result cache entry
 */
export interface ExecutionResultCacheEntry {
  result: ToolCallResult;
  timestamp: string;
  ttl: number;
  accessCount: number;
}

/**
 * Execution result cache by key hash
 */
export interface ExecutionResultCache {
  [key: string]: ExecutionResultCacheEntry; // key = hash(toolName + parameters)
}

// ============================================================================
// Interface Definitions for Core Components
// ============================================================================

/**
 * Main bridge orchestrator interface
 */
export interface IMCPFunctionBridge {
  // Initialization
  initialize(): Promise<void>;
  isInitialized(): boolean;
  
  // Tool Management
  getAvailableTools(): Promise<MCPTool[]>;
  getToolsForProvider(provider: SupportedProvider): Promise<ProviderTool[]>;
  refreshTools(): Promise<void>;
  
  // Tool Execution
  executeToolCall(call: ToolCallRequest): Promise<ToolCallResult>;
  executeToolCalls(calls: ToolCallRequest[]): Promise<ToolCallResult[]>;
  
  // Health and Diagnostics
  isHealthy(): boolean;
  getDiagnostics(): BridgeDiagnostics;
  getExecutionStats(): ExecutionStats;
  
  // Configuration
  updateConfiguration(config: Partial<BridgeConfiguration>): void;
  getConfiguration(): BridgeConfiguration;
}

/**
 * Tool schema converter interface
 */
export interface IToolSchemaConverter {
  // Provider registration
  registerProviderConverter(provider: SupportedProvider, converter: IProviderConverter): void;
  
  // Schema conversion
  convertToolsForProvider(mcpTools: MCPTool[], provider: SupportedProvider): Promise<ProviderTool[]>;
  convertSingleTool(mcpTool: MCPTool, provider: SupportedProvider): Promise<ProviderTool>;
  
  // Validation
  validateMCPTool(tool: MCPTool): ValidationResult;
  validateProviderTool(tool: ProviderTool): ValidationResult;
  
  // Supported providers
  getSupportedProviders(): SupportedProvider[];
  isProviderSupported(provider: SupportedProvider): boolean;
}

/**
 * Provider converter interface
 */
export interface IProviderConverter {
  provider: SupportedProvider;
  
  // Core conversion
  convertMCPTool(mcpTool: MCPTool): ProviderTool;
  validateConversion(mcpTool: MCPTool, providerTool: ProviderTool): ValidationResult;
  
  // Tool call handling
  parseToolCall(providerToolCall: any): ToolCallRequest;
  formatToolResult(result: ToolCallResult): any;
  
  // Provider capabilities
  getCapabilities(): ProviderCapabilities;
  supportsFeature(feature: ToolFeature): boolean;
}

/**
 * MCP tool executor interface
 */
export interface IMCPToolExecutor {
  // Single execution
  executeTool(call: ToolCallRequest, context?: ExecutionContext): Promise<ToolCallResult>;
  
  // Batch execution
  executeToolsBatch(calls: ToolCallRequest[], context?: ExecutionContext): Promise<ToolCallResult[]>;
  executeToolsParallel(calls: ToolCallRequest[], context?: ExecutionContext): Promise<ToolCallResult[]>;
  
  // Execution control
  cancelExecution(callId: string): Promise<boolean>;
  getExecutionStatus(callId: string): ExecutionStatus;
  
  // Health and monitoring
  testConnection(): Promise<boolean>;
  getExecutionMetrics(): ExecutionStats;
}

/**
 * Tool call diagnostics interface
 */
export interface IToolCallDiagnostics {
  // Event logging
  logEvent(event: DiagnosticEvent): void;
  logToolStart(call: ToolCallRequest): void;
  logToolComplete(call: ToolCallRequest, result: ToolCallResult): void;
  logError(error: Error, context?: ExecutionContext): void;
  
  // Diagnostics retrieval
  getDiagnostics(level?: DiagnosticLevel): DiagnosticEvent[];
  getMetrics(timeRange?: { start: string; end: string }): PerformanceMetrics;
  
  // Configuration
  setLevel(level: DiagnosticLevel): void;
  clearDiagnostics(): void;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Bridge system error types
 */
export enum BridgeErrorType {
  MCP_SERVER_UNREACHABLE = 'MCP_SERVER_UNREACHABLE',
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  SCHEMA_CONVERSION_ERROR = 'SCHEMA_CONVERSION_ERROR',
  TOOL_EXECUTION_ERROR = 'TOOL_EXECUTION_ERROR',
  PARAMETER_VALIDATION_ERROR = 'PARAMETER_VALIDATION_ERROR',
  PROVIDER_NOT_SUPPORTED = 'PROVIDER_NOT_SUPPORTED',
  BRIDGE_NOT_INITIALIZED = 'BRIDGE_NOT_INITIALIZED'
}

/**
 * Bridge system error class
 */
export class BridgeError extends Error {
  constructor(
    public type: BridgeErrorType,
    message: string,
    public provider?: SupportedProvider,
    public toolName?: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}