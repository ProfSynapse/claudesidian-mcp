// Location: src/services/trace/ToolCallTraceService.ts
// Captures tool call executions and saves them as memory traces
// Used by: MCPConnectionManager via onToolResponse callback
// Dependencies: MemoryService, SessionContextManager, WorkspaceService

import { Plugin } from 'obsidian';
import { MemoryService } from '../../agents/memoryManager/services/MemoryService';
import { SessionContextManager } from '../SessionContextManager';
import { WorkspaceService } from '../WorkspaceService';

export interface ToolCallCaptureData {
  toolName: string;
  params: any;
  response: any;
  success: boolean;
  executionTime: number;
}

/**
 * ToolCallTraceService
 *
 * Captures tool call executions and persists them as memory traces within
 * the appropriate workspace/session context. Provides searchable history
 * of all tool interactions.
 *
 * Features:
 * - Extracts agent/mode from tool names
 * - Retrieves workspace/session context automatically
 * - Transforms tool call data into WorkspaceMemoryTrace format
 * - Extracts affected files from responses
 * - Non-blocking error handling (traces are nice-to-have)
 */
export class ToolCallTraceService {
  constructor(
    private memoryService: MemoryService,
    private sessionContextManager: SessionContextManager,
    private workspaceService: WorkspaceService,
    private plugin: Plugin
  ) {}

  /**
   * Capture a tool call execution and save as memory trace
   * This is the main entry point called by MCPConnectionManager
   */
  async captureToolCall(
    toolName: string,
    params: any,
    response: any,
    success: boolean,
    executionTime: number
  ): Promise<void> {
    try {
      // 1. Extract agent and mode from tool name
      const { agent, mode } = this.parseToolName(toolName);

      // 2. Get session ID from params
      const sessionId = this.extractSessionId(params);
      if (!sessionId) {
        console.warn('[ToolCallTraceService] No session ID available, skipping trace');
        return;
      }

      // 3. Get workspace context from SessionContextManager
      const workspaceContext = this.sessionContextManager.getWorkspaceContext(sessionId);
      const workspaceId = workspaceContext?.workspaceId ||
                         params?.workspaceContext?.workspaceId ||
                         params?.context?.workspaceId ||
                         'default';

      if (!workspaceId) {
        console.warn('[ToolCallTraceService] No workspace context available, skipping trace');
        return;
      }

      // 4. Build trace content (human-readable description)
      const traceContent = this.buildTraceContent(agent, mode, params, response, success);

      // 5. Build trace metadata (structured data)
      const traceMetadata = this.buildTraceMetadata(
        toolName,
        agent,
        mode,
        params,
        response,
        success,
        executionTime
      );

      // 6. Record the trace via MemoryService
      await this.memoryService.recordActivityTrace({
        workspaceId: workspaceId,
        sessionId: sessionId,
        type: 'tool_call',
        content: traceContent,
        timestamp: Date.now(),
        metadata: traceMetadata
      });

      console.log(`[ToolCallTraceService] Captured tool call: ${toolName} (${success ? 'success' : 'failed'})`);

    } catch (error) {
      // Don't throw - tracing is a secondary operation that shouldn't break the main flow
      console.error('[ToolCallTraceService] Failed to capture tool call:', error);
    }
  }

  /**
   * Parse tool name into agent and mode components
   * Format: "agentName_modeName" -> { agent: "agentName", mode: "modeName" }
   */
  private parseToolName(toolName: string): { agent: string; mode: string } {
    const lastUnderscore = toolName.lastIndexOf('_');
    if (lastUnderscore === -1) {
      return { agent: toolName, mode: 'unknown' };
    }

    return {
      agent: toolName.substring(0, lastUnderscore),
      mode: toolName.substring(lastUnderscore + 1)
    };
  }

  /**
   * Extract session ID from various possible locations in params
   */
  private extractSessionId(params: any): string | null {
    // Try different locations where sessionId might be
    if (params?.sessionId) return params.sessionId;
    if (params?.context?.sessionId) return params.context.sessionId;
    if (params?.params?.sessionId) return params.params.sessionId;

    return null;
  }

  /**
   * Build human-readable trace content
   */
  private buildTraceContent(
    agent: string,
    mode: string,
    params: any,
    response: any,
    success: boolean
  ): string {
    const status = success ? 'Successfully executed' : 'Failed to execute';
    let description = `${status} ${agent}.${mode}`;

    // Add context-specific details
    if (params?.filePath) {
      description += ` on file: ${params.filePath}`;
    } else if (params?.params?.filePath) {
      description += ` on file: ${params.params.filePath}`;
    } else if (params?.query) {
      description += ` with query: "${params.query}"`;
    } else if (params?.params?.query) {
      description += ` with query: "${params.params.query}"`;
    }

    return description;
  }

  /**
   * Build structured metadata for the trace
   * Includes request, response, execution details, and affected resources
   */
  private buildTraceMetadata(
    toolName: string,
    agent: string,
    mode: string,
    params: any,
    response: any,
    success: boolean,
    executionTime: number
  ): any {
    // Extract related files from response and params
    const relatedFiles = this.extractRelatedFiles(response, params);

    // Build comprehensive metadata structure
    return {
      // Legacy compatibility fields (for existing code)
      tool: toolName,
      params: params,
      result: response,
      relatedFiles: relatedFiles,

      // Enhanced request data
      request: {
        originalParams: params,
        normalizedParams: params,
        workspaceContext: params?.workspaceContext || params?.context,
        source: 'mcp-client' as const
      },

      // Enhanced response data
      response: {
        result: success ? response : null,
        success: success,
        error: success ? undefined : {
          type: response?.error?.type || 'ExecutionError',
          message: response?.error?.message || response?.error || 'Unknown error',
          code: response?.error?.code,
          stack: response?.error?.stack
        },
        resultType: this.inferResultType(response),
        resultSummary: this.generateResultSummary(response),
        affectedResources: relatedFiles
      },

      // Execution details
      execution: {
        agent: agent,
        mode: mode,
        executionTime: executionTime,
        timestamp: Date.now(),
        toolName: toolName
      }
    };
  }

  /**
   * Extract file paths from response and params
   * Looks in multiple locations to capture all affected files
   */
  private extractRelatedFiles(response: any, params: any): string[] {
    const files: string[] = [];

    // From params
    if (params?.filePath) files.push(params.filePath);
    if (params?.params?.filePath) files.push(params.params.filePath);
    if (params?.paths && Array.isArray(params.paths)) {
      files.push(...params.paths);
    }
    if (params?.params?.paths && Array.isArray(params.params.paths)) {
      files.push(...params.params.paths);
    }

    // From batch operations
    if (params?.operations && Array.isArray(params.operations)) {
      for (const op of params.operations) {
        if (op.params?.filePath) files.push(op.params.filePath);
        if (op.path) files.push(op.path);
      }
    }

    // From response
    if (response?.filePath) files.push(response.filePath);
    if (response?.files && Array.isArray(response.files)) {
      files.push(...response.files);
    }
    if (response?.affectedFiles && Array.isArray(response.affectedFiles)) {
      files.push(...response.affectedFiles);
    }
    if (response?.createdFiles && Array.isArray(response.createdFiles)) {
      files.push(...response.createdFiles);
    }
    if (response?.modifiedFiles && Array.isArray(response.modifiedFiles)) {
      files.push(...response.modifiedFiles);
    }

    // Deduplicate and filter empty strings
    return [...new Set(files.filter(f => f && f.trim()))];
  }

  /**
   * Infer the result type from the response object
   */
  private inferResultType(response: any): string {
    if (response === null || response === undefined) return 'null';
    if (Array.isArray(response)) return 'array';
    if (typeof response === 'object') return 'object';
    return typeof response;
  }

  /**
   * Generate a brief summary of the response
   */
  private generateResultSummary(response: any): string {
    if (!response) return 'no result';

    if (typeof response === 'string') {
      return response.length > 100 ? `${response.substring(0, 100)}...` : response;
    }

    if (typeof response === 'object') {
      if (Array.isArray(response)) {
        return `array with ${response.length} items`;
      }

      const keys = Object.keys(response);
      const keyPreview = keys.slice(0, 3).join(', ');
      return `object with ${keys.length} properties (${keyPreview})${keys.length > 3 ? '...' : ''}`;
    }

    return String(response);
  }
}
