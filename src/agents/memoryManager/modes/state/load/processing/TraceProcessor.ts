/**
 * TraceProcessor - Processes memory traces for state restoration
 * Follows Single Responsibility Principle by focusing only on trace processing
 */

import { MemoryService } from "../services/MemoryService";
import { WorkspaceMemoryTrace, WorkspaceStateSnapshot } from '../../../../../../database/workspace-types';

export interface TraceProcessingResult {
  success: boolean;
  restoredTraces?: WorkspaceMemoryTrace[];
  conversationHistory?: {
    traces: Array<{
      id: string;
      timestamp: number;
      content: string;
      activityType: string;
      tool?: string;
    }>;
    timeline: Array<{
      date: string;
      event: string;
      summary: string;
    }>;
  };
  toolsUsed?: Array<{
    tool: string;
    mode: string;
    count: number;
    purposes: string[];
  }>;
  error?: string;
}

/**
 * Service responsible for processing memory traces during state restoration
 * Follows SRP by focusing only on trace processing operations
 */
export class TraceProcessor {
  constructor(private memoryService: MemoryService) {}

  /**
   * Process memory traces for comprehensive context restoration
   */
  async processTraces(
    state: WorkspaceStateSnapshot,
    workspaceId: string,
    contextDepth: 'minimal' | 'standard' | 'comprehensive' = 'standard'
  ): Promise<TraceProcessingResult> {
    try {
      const restoredTraces: WorkspaceMemoryTrace[] = [];

      // Only process traces for comprehensive context
      if (contextDepth === 'comprehensive') {
        const tracesResult = await this.retrieveStateTraces(state, workspaceId);
        if (tracesResult.success && tracesResult.traces) {
          restoredTraces.push(...tracesResult.traces);
        }
      }

      // Build conversation history
      const conversationHistory = this.buildConversationHistory(restoredTraces);

      // Analyze tools used
      const toolsUsed = this.analyzeToolsUsed(restoredTraces);

      return {
        success: true,
        restoredTraces,
        conversationHistory,
        toolsUsed
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to process traces: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Retrieve traces referenced in the state
   */
  private async retrieveStateTraces(
    state: WorkspaceStateSnapshot,
    workspaceId: string
  ): Promise<{
    success: boolean;
    traces?: WorkspaceMemoryTrace[];
    error?: string;
  }> {
    try {
      const traces: WorkspaceMemoryTrace[] = [];

      if (state.state?.recentTraces && Array.isArray(state.state.recentTraces) && state.state.recentTraces.length > 0) {
        // Get all memory traces for the workspace
        const allTraces = await this.memoryService.getMemoryTraces(workspaceId, 100);
        
        // Filter to include only the ones referenced in the state
        for (const traceId of state.state.recentTraces) {
          const trace = allTraces.find(t => t.id === traceId);
          if (trace) {
            traces.push(trace);
          }
        }
      }

      return {
        success: true,
        traces
      };
    } catch (error) {
      console.warn(`Failed to retrieve detailed trace information: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        error: `Failed to retrieve traces: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Build conversation history from traces
   */
  private buildConversationHistory(traces: WorkspaceMemoryTrace[]): {
    traces: Array<{
      id: string;
      timestamp: number;
      content: string;
      activityType: string;
      tool?: string;
    }>;
    timeline: Array<{
      date: string;
      event: string;
      summary: string;
    }>;
  } {
    const conversationHistory = {
      traces: traces.map(trace => ({
        id: trace.id,
        timestamp: trace.timestamp,
        content: trace.content.substring(0, 200) + '...',
        activityType: trace.activityType,
        tool: trace.metadata?.tool,
      })),
      timeline: traces.map(trace => ({
        date: new Date(trace.timestamp).toISOString(),
        event: `${trace.activityType} using ${trace.metadata?.tool || 'unknown tool'}`,
        summary: trace.content.substring(0, 100) + '...'
      }))
    };

    return conversationHistory;
  }

  /**
   * Analyze tools used in traces
   */
  private analyzeToolsUsed(traces: WorkspaceMemoryTrace[]): Array<{
    tool: string;
    mode: string;
    count: number;
    purposes: string[];
  }> {
    const toolsUsed = traces.reduce((acc, trace) => {
      const tool = trace.metadata?.tool || 'unknown';
      const existing = acc.find(t => t.tool === tool);
      if (existing) {
        existing.count++;
      } else {
        acc.push({
          tool,
          mode: 'various',
          count: 1,
          purposes: [] // contextDetail property doesn't exist in metadata type
        });
      }
      return acc;
    }, [] as Array<{
      tool: string;
      mode: string;
      count: number;
      purposes: string[];
    }>);

    return toolsUsed;
  }

  /**
   * Get trace statistics
   */
  getTraceStatistics(traces: WorkspaceMemoryTrace[]): {
    totalTraces: number;
    byActivityType: Record<string, number>;
    byTool: Record<string, number>;
    averageImportance: number;
    timeRange: { earliest: number; latest: number };
  } {
    const stats = {
      totalTraces: traces.length,
      byActivityType: {} as Record<string, number>,
      byTool: {} as Record<string, number>,
      averageImportance: 0,
      timeRange: { earliest: 0, latest: 0 }
    };

    if (traces.length === 0) return stats;

    let totalImportance = 0;
    let timestamps: number[] = [];

    for (const trace of traces) {
      // Activity type distribution
      const activityType = trace.activityType;
      stats.byActivityType[activityType] = (stats.byActivityType[activityType] || 0) + 1;

      // Tool distribution
      const tool = trace.metadata?.tool || 'unknown';
      stats.byTool[tool] = (stats.byTool[tool] || 0) + 1;

      // Importance
      totalImportance += trace.importance;

      // Time range
      timestamps.push(trace.timestamp);
    }

    stats.averageImportance = totalImportance / traces.length;
    stats.timeRange = {
      earliest: Math.min(...timestamps),
      latest: Math.max(...timestamps)
    };

    return stats;
  }

  /**
   * Summarize a memory trace for display
   */
  summarizeTrace(trace: WorkspaceMemoryTrace): string {
    const tool = trace.metadata?.tool || 'unknown tool';
    
    // Create a summary based on activity type
    switch (trace.activityType) {
      case 'project_plan':
        return `Project planning with ${tool}`;
      case 'question':
        return `Research/questions using ${tool}`;
      case 'checkpoint':
        return `Progress checkpoint using ${tool}`;
      case 'completion':
        return `Completion status update using ${tool}`;
      case 'research':
        return `Research using ${tool}`;
      default:
        // Extract a short summary from content
        const contentPreview = trace.content.substring(0, 50).trim();
        return contentPreview ? `${contentPreview}...` : `Activity using ${tool}`;
    }
  }
}