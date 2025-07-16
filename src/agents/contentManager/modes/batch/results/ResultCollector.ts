/**
 * ResultCollector - Handles result collection and processing
 * Follows Single Responsibility Principle by focusing only on result processing
 */

import { ExecutionResult } from '../execution/BatchExecutor';

export interface ProcessedResult {
  success: boolean;
  error?: string;
  data?: any;
  type: "read" | "create" | "append" | "prepend" | "replace" | "replaceByLine" | "delete" | "findReplace";
  filePath: string;
}

/**
 * Service responsible for collecting and processing batch operation results
 * Follows SRP by focusing only on result processing operations
 */
export class ResultCollector {
  /**
   * Collect and process execution results
   */
  collectResults(executionResults: ExecutionResult[]): ProcessedResult[] {
    return executionResults.map(result => this.processResult(result));
  }

  /**
   * Process a single execution result
   */
  private processResult(result: ExecutionResult): ProcessedResult {
    return {
      success: result.success,
      error: result.error,
      data: result.data,
      type: result.type as ProcessedResult['type'],
      filePath: result.filePath
    };
  }

  /**
   * Filter successful results
   */
  getSuccessfulResults(results: ProcessedResult[]): ProcessedResult[] {
    return results.filter(result => result.success);
  }

  /**
   * Filter failed results
   */
  getFailedResults(results: ProcessedResult[]): ProcessedResult[] {
    return results.filter(result => !result.success);
  }

  /**
   * Get results by operation type
   */
  getResultsByType(results: ProcessedResult[], type: ProcessedResult['type']): ProcessedResult[] {
    return results.filter(result => result.type === type);
  }

  /**
   * Get results by file path
   */
  getResultsByFilePath(results: ProcessedResult[], filePath: string): ProcessedResult[] {
    return results.filter(result => result.filePath === filePath);
  }

  /**
   * Get unique file paths from results
   */
  getUniqueFilePaths(results: ProcessedResult[]): string[] {
    const filePaths = results.map(result => result.filePath);
    return [...new Set(filePaths)];
  }

  /**
   * Get operation type counts
   */
  getOperationTypeCounts(results: ProcessedResult[]): Record<string, number> {
    const counts: Record<string, number> = {};
    
    for (const result of results) {
      counts[result.type] = (counts[result.type] || 0) + 1;
    }
    
    return counts;
  }

  /**
   * Get success/failure statistics
   */
  getResultStatistics(results: ProcessedResult[]): {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    operationTypes: Record<string, number>;
    uniqueFiles: number;
  } {
    const successful = this.getSuccessfulResults(results);
    const failed = this.getFailedResults(results);
    
    const self = this;
    return {
      total: results.length,
      successful: successful.length,
      failed: failed.length,
      successRate: results.length > 0 ? successful.length / results.length : 0,
      operationTypes: self.getOperationTypeCounts(results),
      uniqueFiles: self.getUniqueFilePaths(results).length
    };
  }

  /**
   * Format results for display
   */
  formatResults(results: ProcessedResult[]): {
    summary: string;
    details: ProcessedResult[];
    statistics: any;
  } {
    const stats = this.getResultStatistics(results);
    const operationTypes = Object.keys(stats.operationTypes).join(', ');
    
    const summary = `Executed ${stats.total} operations (${operationTypes}) ` +
      `on ${stats.uniqueFiles} files. Success rate: ${Math.round(stats.successRate * 100)}%`;

    return {
      summary,
      details: results,
      statistics: stats
    };
  }

  /**
   * Create error summary for failed operations
   */
  createErrorSummary(results: ProcessedResult[]): {
    hasErrors: boolean;
    errorCount: number;
    errors: Array<{
      type: string;
      filePath: string;
      error: string;
    }>;
  } {
    const failedResults = this.getFailedResults(results);
    
    return {
      hasErrors: failedResults.length > 0,
      errorCount: failedResults.length,
      errors: failedResults.map(result => ({
        type: result.type,
        filePath: result.filePath,
        error: result.error || 'Unknown error'
      }))
    };
  }
}