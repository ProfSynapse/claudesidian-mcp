/**
 * ActivityRecorder - Handles activity recording for batch operations
 * Follows Single Responsibility Principle by focusing only on activity recording
 */

import { MemoryService } from '../../../../../database/services/MemoryService';
import { BatchContentParams } from '../../../types';
import { ProcessedResult } from '../results/ResultCollector';
import { parseWorkspaceContext } from '../../../../../utils/contextUtils';

/**
 * Service responsible for recording batch operation activities
 * Follows SRP by focusing only on activity recording operations
 */
export class ActivityRecorder {
  constructor(private memoryService: MemoryService | null) {}

  /**
   * Record batch operation activity in workspace memory
   */
  async recordBatchActivity(params: BatchContentParams, results: ProcessedResult[]): Promise<void> {
    try {
      // Skip if no memory service is available
      if (!this.memoryService) {
        return;
      }

      // Parse workspace context
      const parsedContext = parseWorkspaceContext(params.workspaceContext);
      
      // Skip if no workspace context is available
      if (!parsedContext?.workspaceId) {
        return;
      }

      // Get successful operations and their file paths
      const successfulOps = results.filter(result => result.success);
      const relatedFiles = successfulOps.map(result => result.filePath);

      // Create activity content
      const activityContent = this.createActivityContent(successfulOps, relatedFiles);

      // Record activity using MemoryService
      await this.memoryService.storeMemoryTrace({
        workspaceId: parsedContext.workspaceId,
        workspacePath: parsedContext.workspacePath || [parsedContext.workspaceId],
        activityType: 'research', // Using valid activity type
        content: activityContent,
        metadata: this.createActivityMetadata(successfulOps, relatedFiles),
        sessionId: params.sessionId || '',
        timestamp: Date.now(),
        importance: 0.7,
        contextLevel: 'workspace', // Using valid context level
        tags: ['batch', 'edit', 'content']
      });
    } catch (error) {
      console.error('Error recording batch activity with ChromaDB:', error);
      // Don't throw - activity recording is a secondary operation
    }
  }

  /**
   * Create activity content description
   */
  private createActivityContent(successfulOps: ProcessedResult[], relatedFiles: string[]): string {
    const opTypes = successfulOps.map(result => result.type);
    const uniqueOpTypes = [...new Set(opTypes)];

    return `Performed batch operation with ${successfulOps.length} operations ` +
      `(${uniqueOpTypes.join(', ')}) on ${relatedFiles.length} files.`;
  }

  /**
   * Create activity metadata
   */
  private createActivityMetadata(successfulOps: ProcessedResult[], relatedFiles: string[]): any {
    const opTypes = successfulOps.map(result => result.type);
    
    return {
      tool: 'BatchContentMode',
      params: {
        operations: opTypes
      },
      result: {
        files: relatedFiles,
        count: successfulOps.length
      },
      relatedFiles: relatedFiles
    };
  }

  /**
   * Create detailed activity summary
   */
  createActivitySummary(results: ProcessedResult[]): {
    operationCount: number;
    operationTypes: string[];
    fileCount: number;
    successRate: number;
    summary: string;
  } {
    const successfulOps = results.filter(result => result.success);
    const opTypes = successfulOps.map(result => result.type);
    const uniqueOpTypes = [...new Set(opTypes)];
    const relatedFiles = successfulOps.map(result => result.filePath);
    const uniqueFiles = [...new Set(relatedFiles)];

    const successRate = results.length > 0 ? successfulOps.length / results.length : 0;

    return {
      operationCount: successfulOps.length,
      operationTypes: uniqueOpTypes,
      fileCount: uniqueFiles.length,
      successRate,
      summary: `Executed ${successfulOps.length} operations (${uniqueOpTypes.join(', ')}) ` +
        `on ${uniqueFiles.length} files with ${Math.round(successRate * 100)}% success rate.`
    };
  }

  /**
   * Check if activity recording is available
   */
  isActivityRecordingAvailable(): boolean {
    return !!this.memoryService;
  }

  /**
   * Get activity recording statistics
   */
  getRecordingStats(): {
    memoryServiceAvailable: boolean;
    canRecordActivity: boolean;
  } {
    return {
      memoryServiceAvailable: !!this.memoryService,
      canRecordActivity: this.isActivityRecordingAvailable()
    };
  }
}