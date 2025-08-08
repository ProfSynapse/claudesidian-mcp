/**
 * MemoryTracer - Handles memory trace creation for state operations
 * Follows Single Responsibility Principle by focusing only on memory trace recording
 */

import { MemoryService } from "../services/MemoryService";
import { StateSummary } from '../context/SummaryGenerator';
import { HierarchyType } from '../../../../../../database/types/workspace/WorkspaceTypes';

export interface TraceCreationResult {
  success: boolean;
  traceId?: string;
  error?: string;
}

/**
 * Service responsible for creating memory traces for state operations
 * Follows SRP by focusing only on trace recording and management
 */
export class MemoryTracer {
  constructor(private memoryService: MemoryService) {}

  /**
   * Create memory trace for state creation
   */
  async createStateCreationTrace(
    workspaceId: string,
    sessionId: string,
    stateId: string,
    stateName: string,
    summary: StateSummary
  ): Promise<TraceCreationResult> {
    try {
      const traceData = this.buildStateCreationTrace(
        stateId,
        stateName,
        summary
      );

      // Set the required fields
      traceData.workspaceId = workspaceId;
      traceData.sessionId = sessionId;
      traceData.workspacePath = [workspaceId]; // Simple path

      const traceId = await this.memoryService.storeMemoryTrace(traceData);

      console.log(`Created memory trace ${traceId} for state creation ${stateId}`);

      return {
        success: true,
        traceId
      };
    } catch (error) {
      console.error('Error creating state creation trace:', error);
      return {
        success: false,
        error: `Failed to create memory trace: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Build trace data for state creation
   */
  private buildStateCreationTrace(
    stateId: string,
    stateName: string,
    summary: StateSummary
  ): Omit<any, 'id' | 'embedding'> {
    return {
      workspaceId: '', // Will be set by caller
      workspacePath: [], // Will be set by caller
      contextLevel: 'workspace' as HierarchyType,
      activityType: 'project_plan' as const, // Use valid activityType
      content: `Created state: ${stateName}. ${summary.purpose}`,
      timestamp: Date.now(),
      metadata: {
        tool: 'createState',
        params: { stateName, stateId },
        result: { success: true, stateId },
        relatedFiles: summary.files.slice(0, 10) // Limit to prevent oversized traces
      },
      importance: 0.8, // High importance for state creation
      tags: ['state_creation', ...summary.tags.slice(0, 5)], // Limit tags
      sessionId: undefined // Will be set by caller
    };
  }

  /**
   * Create memory trace for state operation failure
   */
  async createStateFailureTrace(
    workspaceId: string,
    sessionId: string,
    stateName: string,
    error: string,
    reason?: string
  ): Promise<TraceCreationResult> {
    try {
      const traceData = {
        workspaceId,
        workspacePath: [workspaceId],
        contextLevel: 'workspace' as HierarchyType,
        activityType: 'project_plan' as const,
        content: `Failed to create state: ${stateName}. Error: ${error}`,
        timestamp: Date.now(),
        metadata: {
          tool: 'createState',
          params: { stateName, reason },
          result: { success: false, error },
          relatedFiles: []
        },
        importance: 0.3,
        tags: ['state_creation', 'error'],
        sessionId
      };

      const traceId = await this.memoryService.storeMemoryTrace(traceData);

      console.log(`Created failure trace ${traceId} for state creation attempt`);

      return {
        success: true,
        traceId
      };
    } catch (traceError) {
      console.error('Error creating failure trace:', traceError);
      return {
        success: false,
        error: `Failed to create failure trace: ${traceError instanceof Error ? traceError.message : String(traceError)}`
      };
    }
  }

  /**
   * Create memory trace for state validation issues
   */
  async createValidationTrace(
    workspaceId: string,
    sessionId: string,
    stateName: string,
    validationErrors: string[],
    warnings?: string[]
  ): Promise<TraceCreationResult> {
    try {
      const traceData = {
        workspaceId,
        workspacePath: [workspaceId],
        contextLevel: 'workspace' as HierarchyType,
        activityType: 'question' as const,
        content: `Validation issues for state: ${stateName}. ${validationErrors.length} errors, ${warnings?.length || 0} warnings`,
        timestamp: Date.now(),
        metadata: {
          tool: 'createState',
          params: { stateName, validationErrors, warnings },
          result: { severity: validationErrors.length > 0 ? 'error' : 'warning' },
          relatedFiles: []
        },
        importance: 0.5,
        tags: ['state_creation', 'validation'],
        sessionId
      };

      const traceId = await this.memoryService.storeMemoryTrace(traceData);

      return {
        success: true,
        traceId
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create validation trace: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Categorize failure type for better tracking
   */
  private categorizeFailure(error: string): string {
    if (error.includes('validation') || error.includes('Invalid')) {
      return 'validation_error';
    }
    
    if (error.includes('database') || error.includes('index')) {
      return 'database_error';
    }
    
    if (error.includes('session') || error.includes('workspace')) {
      return 'context_error';
    }
    
    if (error.includes('permission') || error.includes('access')) {
      return 'permission_error';
    }
    
    return 'unknown_error';
  }

  /**
   * Batch create traces for multiple operations
   */
  async createBatchTraces(
    workspaceId: string,
    sessionId: string,
    traces: Array<{
      type: 'creation' | 'failure' | 'validation';
      data: any;
    }>
  ): Promise<{
    successful: string[];
    failed: Array<{ error: string; data: any }>;
  }> {
    const successful: string[] = [];
    const failed: Array<{ error: string; data: any }> = [];

    for (const trace of traces) {
      try {
        let result: TraceCreationResult;
        
        switch (trace.type) {
          case 'creation':
            result = await this.createStateCreationTrace(
              workspaceId,
              sessionId,
              trace.data.stateId,
              trace.data.stateName,
              trace.data.summary
            );
            break;
            
          case 'failure':
            result = await this.createStateFailureTrace(
              workspaceId,
              sessionId,
              trace.data.stateName,
              trace.data.error,
              trace.data.reason
            );
            break;
            
          case 'validation':
            result = await this.createValidationTrace(
              workspaceId,
              sessionId,
              trace.data.stateName,
              trace.data.validationErrors,
              trace.data.warnings
            );
            break;
            
          default:
            failed.push({ error: `Unknown trace type: ${trace.type}`, data: trace.data });
            continue;
        }

        if (result.success && result.traceId) {
          successful.push(result.traceId);
        } else {
          failed.push({ error: result.error || 'Unknown error', data: trace.data });
        }
      } catch (error) {
        failed.push({ 
          error: error instanceof Error ? error.message : String(error), 
          data: trace.data 
        });
      }
    }

    return { successful, failed };
  }
}