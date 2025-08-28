/**
 * Location: /src/services/mcp-bridge/core/MCPToolExecutor.ts
 * 
 * This file implements the MCP tool executor that handles communication with the local MCP server
 * via HTTP requests. It provides tool execution, error handling, retry logic, and performance tracking.
 * 
 * Used by: MCPFunctionBridge for executing tool calls via the MCP server
 * Dependencies: BridgeTypes, HTTP client (fetch)
 */

import {
  IMCPToolExecutor,
  ToolCallRequest,
  ToolCallResult,
  ExecutionContext,
  ExecutionStatus,
  ExecutionStats,
  MCPExecutionRequest,
  MCPExecutionResponse,
  BridgeError,
  BridgeErrorType,
  DiagnosticLevel
} from '../types/BridgeTypes';

/**
 * Configuration for MCP tool executor
 */
interface MCPToolExecutorConfig {
  serverUrl: string;
  timeout: number;
  retries: number;
  retryDelayMs: number;
  enableLogging: boolean;
  logLevel: DiagnosticLevel;
}

/**
 * Execution tracking entry
 */
interface ExecutionEntry {
  id: string;
  status: ExecutionStatus;
  startTime: number;
  endTime?: number;
  retryCount: number;
}

/**
 * MCP Tool Executor Implementation
 * 
 * Handles communication with the MCP server at localhost:3000 to execute tools.
 * Provides retry logic, timeout handling, and comprehensive error recovery.
 */
export class MCPToolExecutor implements IMCPToolExecutor {
  private config: MCPToolExecutorConfig;
  private executionMap = new Map<string, ExecutionEntry>();
  private stats: ExecutionStats = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageExecutionTime: 0,
    currentQueueSize: 0,
    lastExecutionTime: new Date().toISOString()
  };
  
  constructor(config: Partial<MCPToolExecutorConfig> = {}) {
    this.config = {
      serverUrl: 'http://localhost:3000',
      timeout: 30000, // 30 seconds
      retries: 2,
      retryDelayMs: 1000,
      enableLogging: true,
      logLevel: DiagnosticLevel.INFO,
      ...config
    };
    
    if (this.config.enableLogging) {
      console.log('[MCPToolExecutor] Initialized with config:', {
        serverUrl: this.config.serverUrl,
        timeout: this.config.timeout,
        retries: this.config.retries
      });
    }
  }

  /**
   * Execute a single tool call
   */
  async executeTool(call: ToolCallRequest, context?: ExecutionContext): Promise<ToolCallResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    
    // Track execution
    this.executionMap.set(call.id, {
      id: call.id,
      status: ExecutionStatus.EXECUTING,
      startTime,
      retryCount: 0
    });
    
    this.stats.currentQueueSize++;
    this.updateStats();
    
    if (this.config.enableLogging && this.config.logLevel !== DiagnosticLevel.ERROR) {
      console.log(`[MCPToolExecutor] Executing tool: ${call.name}`, {
        id: call.id,
        parameters: call.parameters,
        provider: call.provider
      });
    }

    try {
      const result = await this.executeWithRetry(call, context);
      
      // Update tracking
      const execution = this.executionMap.get(call.id);
      if (execution) {
        execution.status = ExecutionStatus.COMPLETED;
        execution.endTime = Date.now();
      }
      
      this.stats.successfulExecutions++;
      this.stats.currentQueueSize--;
      this.updateStats();
      
      if (this.config.enableLogging && this.config.logLevel !== DiagnosticLevel.ERROR) {
        console.log(`[MCPToolExecutor] Tool executed successfully: ${call.name}`, {
          id: call.id,
          executionTime: result.executionTime
        });
      }
      
      return result;
      
    } catch (error) {
      // Update tracking
      const execution = this.executionMap.get(call.id);
      if (execution) {
        execution.status = ExecutionStatus.FAILED;
        execution.endTime = Date.now();
      }
      
      this.stats.failedExecutions++;
      this.stats.currentQueueSize--;
      this.updateStats();
      
      const executionTime = Date.now() - startTime;
      
      console.error(`[MCPToolExecutor] Tool execution failed: ${call.name}`, error);
      
      // Return error result instead of throwing
      return {
        id: call.id,
        name: call.name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime,
        timestamp,
        metadata: {
          provider: call.provider,
          mcpServer: this.config.serverUrl,
          errorType: error instanceof BridgeError ? error.type : BridgeErrorType.TOOL_EXECUTION_ERROR,
          retryCount: execution?.retryCount || 0
        }
      };
    }
  }

  /**
   * Execute multiple tools in sequence (batch)
   */
  async executeToolsBatch(calls: ToolCallRequest[], context?: ExecutionContext): Promise<ToolCallResult[]> {
    if (this.config.enableLogging && this.config.logLevel !== DiagnosticLevel.ERROR) {
      console.log(`[MCPToolExecutor] Executing ${calls.length} tools in batch`);
    }
    
    const results: ToolCallResult[] = [];
    
    for (const call of calls) {
      const result = await this.executeTool(call, context);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Execute multiple tools in parallel
   */
  async executeToolsParallel(calls: ToolCallRequest[], context?: ExecutionContext): Promise<ToolCallResult[]> {
    if (this.config.enableLogging && this.config.logLevel !== DiagnosticLevel.ERROR) {
      console.log(`[MCPToolExecutor] Executing ${calls.length} tools in parallel`);
    }
    
    const promises = calls.map(call => this.executeTool(call, context));
    return Promise.all(promises);
  }

  /**
   * Cancel a tool execution
   */
  async cancelExecution(callId: string): Promise<boolean> {
    const execution = this.executionMap.get(callId);
    if (!execution) {
      return false;
    }
    
    execution.status = ExecutionStatus.CANCELLED;
    execution.endTime = Date.now();
    
    if (this.config.enableLogging) {
      console.log(`[MCPToolExecutor] Cancelled execution: ${callId}`);
    }
    
    return true;
  }

  /**
   * Get execution status for a tool call
   */
  getExecutionStatus(callId: string): ExecutionStatus {
    const execution = this.executionMap.get(callId);
    return execution?.status || ExecutionStatus.PENDING;
  }

  /**
   * Test connection to MCP server
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.serverUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000) // 5 second timeout for health check
      });
      
      const isHealthy = response.ok;
      
      if (this.config.enableLogging) {
        console.log(`[MCPToolExecutor] Health check: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`, {
          status: response.status,
          url: this.config.serverUrl
        });
      }
      
      return isHealthy;
      
    } catch (error) {
      if (this.config.enableLogging) {
        console.error(`[MCPToolExecutor] Health check failed:`, error);
      }
      return false;
    }
  }

  /**
   * Get execution metrics
   */
  getExecutionMetrics(): ExecutionStats {
    return { ...this.stats };
  }

  /**
   * Execute tool with retry logic
   */
  private async executeWithRetry(call: ToolCallRequest, context?: ExecutionContext): Promise<ToolCallResult> {
    const startTime = Date.now();
    let lastError: Error | null = null;
    
    const execution = this.executionMap.get(call.id);
    
    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        if (execution) {
          execution.retryCount = attempt;
        }
        
        const result = await this.executeToolCall(call, context);
        
        return {
          id: call.id,
          name: call.name,
          success: true,
          result: result.result,
          executionTime: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          metadata: {
            provider: call.provider,
            mcpServer: this.config.serverUrl,
            retryCount: attempt
          }
        };
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < this.config.retries) {
          if (this.config.enableLogging && this.config.logLevel === DiagnosticLevel.DEBUG) {
            console.warn(`[MCPToolExecutor] Retry ${attempt + 1}/${this.config.retries} for ${call.name}:`, error);
          }
          
          // Wait before retry
          await this.delay(this.config.retryDelayMs * Math.pow(2, attempt)); // Exponential backoff
        }
      }
    }
    
    // All retries failed
    throw lastError || new BridgeError(
      BridgeErrorType.TOOL_EXECUTION_ERROR,
      `Tool execution failed after ${this.config.retries + 1} attempts`,
      call.provider,
      call.name
    );
  }

  /**
   * Execute a single tool call against MCP server
   */
  private async executeToolCall(call: ToolCallRequest, context?: ExecutionContext): Promise<MCPExecutionResponse> {
    const requestBody: MCPExecutionRequest = {
      name: call.name,
      arguments: call.parameters
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      if (this.config.enableLogging && this.config.logLevel === DiagnosticLevel.TRACE) {
        console.log(`[MCPToolExecutor] Sending request to ${this.config.serverUrl}/execute_tool`, requestBody);
      }

      const response = await fetch(`${this.config.serverUrl}/execute_tool`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new BridgeError(
            BridgeErrorType.TOOL_NOT_FOUND,
            `Tool not found: ${call.name}`,
            call.provider,
            call.name
          );
        } else if (response.status >= 500) {
          throw new BridgeError(
            BridgeErrorType.MCP_SERVER_UNREACHABLE,
            `MCP server error: ${response.status} ${response.statusText}`,
            call.provider,
            call.name
          );
        } else {
          throw new BridgeError(
            BridgeErrorType.TOOL_EXECUTION_ERROR,
            `HTTP ${response.status}: ${response.statusText}`,
            call.provider,
            call.name
          );
        }
      }

      const data: MCPExecutionResponse = await response.json();
      
      if (this.config.enableLogging && this.config.logLevel === DiagnosticLevel.TRACE) {
        console.log(`[MCPToolExecutor] Received response from MCP server:`, data);
      }

      if (!data.success && data.error) {
        throw new BridgeError(
          BridgeErrorType.TOOL_EXECUTION_ERROR,
          `Tool execution error: ${data.error.message}`,
          call.provider,
          call.name,
          new Error(data.error.message)
        );
      }

      return data;

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BridgeError(
          BridgeErrorType.TOOL_EXECUTION_ERROR,
          `Tool execution timeout after ${this.config.timeout}ms`,
          call.provider,
          call.name
        );
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new BridgeError(
          BridgeErrorType.MCP_SERVER_UNREACHABLE,
          `Cannot connect to MCP server at ${this.config.serverUrl}`,
          call.provider,
          call.name,
          error
        );
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Update execution statistics
   */
  private updateStats(): void {
    this.stats.totalExecutions = this.stats.successfulExecutions + this.stats.failedExecutions;
    this.stats.lastExecutionTime = new Date().toISOString();
    
    // Calculate average execution time
    let totalTime = 0;
    let completedCount = 0;
    
    for (const execution of this.executionMap.values()) {
      if (execution.endTime) {
        totalTime += execution.endTime - execution.startTime;
        completedCount++;
      }
    }
    
    if (completedCount > 0) {
      this.stats.averageExecutionTime = totalTime / completedCount;
    }
  }

  /**
   * Delay helper for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up completed executions to prevent memory leaks
   */
  public cleanup(): void {
    const cutoffTime = Date.now() - (1000 * 60 * 60); // 1 hour
    
    for (const [id, execution] of this.executionMap.entries()) {
      if (execution.endTime && execution.endTime < cutoffTime) {
        this.executionMap.delete(id);
      }
    }
    
    if (this.config.enableLogging && this.config.logLevel === DiagnosticLevel.DEBUG) {
      console.log(`[MCPToolExecutor] Cleaned up old executions, remaining: ${this.executionMap.size}`);
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<MCPToolExecutorConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (this.config.enableLogging) {
      console.log('[MCPToolExecutor] Configuration updated:', config);
    }
  }

  /**
   * Get current configuration
   */
  public getConfig(): MCPToolExecutorConfig {
    return { ...this.config };
  }
}