/**
 * BatchContentMode - Refactored following SOLID principles
 * Main orchestrator for batch content operations
 */

import { App } from 'obsidian';
import { BaseMode } from '../../../baseMode';
import { BatchContentParams, BatchContentResult } from '../../types';
import { MemoryService } from '../../../memoryManager/services/MemoryService';
import { parseWorkspaceContext, extractContextFromParams } from '../../../../utils/contextUtils';

// Import specialized services
import { OperationValidator } from './validation/OperationValidator';
import { BatchExecutor } from './execution/BatchExecutor';
import { ResultCollector } from './results/ResultCollector';
import { ActivityRecorder } from './activity/ActivityRecorder';
import { SchemaBuilder } from '../../../../utils/schemas/SchemaBuilder';
import { addRecommendations, Recommendation } from '../../../../utils/recommendationUtils';
import { NudgeHelpers } from '../../../../utils/nudgeHelpers';

/**
 * Refactored BatchContentMode following SOLID principles
 * Orchestrates specialized services for batch content operations
 */
export class BatchContentMode extends BaseMode<BatchContentParams, BatchContentResult> {
  private app: App;
  private memoryService: MemoryService | null = null;
  
  // Composed services following Dependency Injection principle
  private operationValidator: OperationValidator;
  private batchExecutor: BatchExecutor;
  private resultCollector: ResultCollector;
  private activityRecorder: ActivityRecorder;
  private schemaBuilder: SchemaBuilder;

  constructor(app: App, memoryService?: MemoryService | null | undefined) {
    super(
      'batchContent',
      'Batch Content Operations',
      'Execute multiple content operations in a batch',
      '1.0.0'
    );
    
    this.app = app;
    this.memoryService = memoryService || null;
    
    // Initialize specialized services
    this.operationValidator = new OperationValidator();
    this.batchExecutor = new BatchExecutor(app);
    this.resultCollector = new ResultCollector();
    this.activityRecorder = new ActivityRecorder(memoryService || null);
    this.schemaBuilder = new SchemaBuilder();
  }

  /**
   * Execute batch content operations
   */
  async execute(params: BatchContentParams): Promise<BatchContentResult> {
    try {
      const { operations, workspaceContext } = params;
      
      // 1. Validate operations
      const validationResult = this.operationValidator.validateOperations(operations);
      if (!validationResult.success) {
        throw new Error(validationResult.error);
      }

      // 2. Execute operations
      const executionResults = await this.batchExecutor.executeOperations(operations);

      // 3. Process results
      const processedResults = this.resultCollector.collectResults(executionResults);

      // 4. Record activity
      await this.activityRecorder.recordBatchActivity(params, processedResults);

      // 5. Prepare response
      const response = this.prepareResult(
        true, 
        { results: processedResults }, 
        undefined, 
        extractContextFromParams(params), 
        parseWorkspaceContext(workspaceContext) || undefined
      );

      // 6. Generate nudges based on batch operations
      const nudges = this.generateBatchContentNudges(operations, processedResults);
      const responseWithNudges = addRecommendations(response, nudges);

      return responseWithNudges;
    } catch (error: unknown) {
      return this.prepareResult(
        false, 
        undefined, 
        error instanceof Error ? error.message : String(error), 
        extractContextFromParams(params), 
        parseWorkspaceContext(params.workspaceContext) || undefined
      );
    }
  }

  /**
   * Get parameter schema
   */
  getParameterSchema(): any {
    return this.schemaBuilder.getParameterSchema();
  }

  /**
   * Get result schema
   */
  getResultSchema(): any {
    return this.schemaBuilder.getResultSchema();
  }

  /**
   * Generate nudges based on batch operations
   */
  private generateBatchContentNudges(operations: any[], results: any[]): Recommendation[] {
    const nudges: Recommendation[] = [];

    // Count operations by type
    const operationCounts = NudgeHelpers.countOperationsByType(operations);

    // Check for multiple read operations (>3 files read)
    const batchReadNudge = NudgeHelpers.checkBatchReadOperations(operationCounts.read);
    if (batchReadNudge) {
      nudges.push(batchReadNudge);
    }

    // Check for multiple create operations (>2 files created)
    const batchCreateNudge = NudgeHelpers.checkBatchCreateOperations(operationCounts.create);
    if (batchCreateNudge) {
      nudges.push(batchCreateNudge);
    }

    return nudges;
  }
}