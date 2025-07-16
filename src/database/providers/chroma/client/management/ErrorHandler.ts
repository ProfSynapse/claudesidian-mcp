/**
 * ErrorHandler - Handles centralized error handling
 * Follows Single Responsibility Principle by focusing only on error management
 */

export interface ErrorResult {
  success: false;
  error: string;
  errorType?: string;
  errorCode?: string;
  timestamp?: number;
}

export interface ErrorLog {
  timestamp: number;
  error: string;
  errorType: string;
  context?: string;
  stackTrace?: string;
}

/**
 * Service responsible for centralized error handling
 * Follows SRP by focusing only on error management operations
 */
export class ErrorHandler {
  private errorLogs: ErrorLog[] = [];
  private readonly maxErrorLogs = 100;

  /**
   * Handle and format an error
   */
  handleError(error: any, context: string = 'unknown', errorType: string = 'general'): ErrorResult {
    const timestamp = Date.now();
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stackTrace = error instanceof Error ? error.stack : undefined;

    // Log the error
    this.logError(errorMessage, errorType, context, stackTrace);

    // Return formatted error result
    return {
      success: false,
      error: errorMessage,
      errorType,
      errorCode: this.getErrorCode(errorType),
      timestamp
    };
  }

  /**
   * Log an error
   */
  private logError(error: string, errorType: string, context?: string, stackTrace?: string): void {
    const errorLog: ErrorLog = {
      timestamp: Date.now(),
      error,
      errorType,
      context,
      stackTrace
    };

    this.errorLogs.push(errorLog);

    // Maintain maximum log size
    if (this.errorLogs.length > this.maxErrorLogs) {
      this.errorLogs.shift();
    }

    // Console log for debugging
    console.error(`[${errorType}] ${context ? `(${context})` : ''}: ${error}`);
    if (stackTrace) {
      console.error('Stack trace:', stackTrace);
    }
  }

  /**
   * Get error code for error type
   */
  private getErrorCode(errorType: string): string {
    const errorCodes: Record<string, string> = {
      'initialization': 'E001',
      'collection': 'E002',
      'persistence': 'E003',
      'validation': 'E004',
      'operation': 'E005',
      'query': 'E006',
      'resource': 'E007',
      'general': 'E999'
    };

    return errorCodes[errorType] || 'E999';
  }

  /**
   * Handle initialization errors
   */
  handleInitializationError(error: any, context: string = 'Client initialization'): ErrorResult {
    return this.handleError(error, context, 'initialization');
  }

  /**
   * Handle collection errors
   */
  handleCollectionError(error: any, collectionName: string, operation: string): ErrorResult {
    return this.handleError(error, `Collection: ${collectionName}, Operation: ${operation}`, 'collection');
  }

  /**
   * Handle persistence errors
   */
  handlePersistenceError(error: any, operation: string, filePath?: string): ErrorResult {
    const context = filePath ? `Persistence: ${operation} (${filePath})` : `Persistence: ${operation}`;
    return this.handleError(error, context, 'persistence');
  }

  /**
   * Handle validation errors
   */
  handleValidationError(error: any, validationType: string): ErrorResult {
    return this.handleError(error, `Validation: ${validationType}`, 'validation');
  }

  /**
   * Handle operation errors
   */
  handleOperationError(error: any, operation: string, details?: string): ErrorResult {
    const context = details ? `Operation: ${operation} (${details})` : `Operation: ${operation}`;
    return this.handleError(error, context, 'operation');
  }

  /**
   * Handle query errors
   */
  handleQueryError(error: any, queryType: string, details?: string): ErrorResult {
    const context = details ? `Query: ${queryType} (${details})` : `Query: ${queryType}`;
    return this.handleError(error, context, 'query');
  }

  /**
   * Handle resource errors
   */
  handleResourceError(error: any, resource: string, operation: string): ErrorResult {
    return this.handleError(error, `Resource: ${resource}, Operation: ${operation}`, 'resource');
  }

  /**
   * Get error logs
   */
  getErrorLogs(): ErrorLog[] {
    return [...this.errorLogs];
  }

  /**
   * Get error logs by type
   */
  getErrorLogsByType(errorType: string): ErrorLog[] {
    return this.errorLogs.filter(log => log.errorType === errorType);
  }

  /**
   * Get recent error logs
   */
  getRecentErrorLogs(count: number = 10): ErrorLog[] {
    return this.errorLogs.slice(-count);
  }

  /**
   * Clear error logs
   */
  clearErrorLogs(): void {
    this.errorLogs = [];
  }

  /**
   * Get error statistics
   */
  getErrorStatistics(): {
    totalErrors: number;
    errorsByType: Record<string, number>;
    recentErrorCount: number;
    oldestErrorTimestamp?: number;
    newestErrorTimestamp?: number;
  } {
    const errorsByType: Record<string, number> = {};
    let oldestErrorTimestamp: number | undefined;
    let newestErrorTimestamp: number | undefined;

    for (const log of this.errorLogs) {
      // Count by type
      errorsByType[log.errorType] = (errorsByType[log.errorType] || 0) + 1;

      // Track timestamp range
      if (!oldestErrorTimestamp || log.timestamp < oldestErrorTimestamp) {
        oldestErrorTimestamp = log.timestamp;
      }
      if (!newestErrorTimestamp || log.timestamp > newestErrorTimestamp) {
        newestErrorTimestamp = log.timestamp;
      }
    }

    // Count recent errors (last 5 minutes)
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    const recentErrorCount = this.errorLogs.filter(log => log.timestamp > fiveMinutesAgo).length;

    return {
      totalErrors: this.errorLogs.length,
      errorsByType,
      recentErrorCount,
      oldestErrorTimestamp,
      newestErrorTimestamp
    };
  }

  /**
   * Format error for display
   */
  formatError(error: any, includeStackTrace: boolean = false): string {
    if (error instanceof Error) {
      let formatted = `Error: ${error.message}`;
      if (includeStackTrace && error.stack) {
        formatted += `\nStack trace: ${error.stack}`;
      }
      return formatted;
    }
    return `Error: ${String(error)}`;
  }

  /**
   * Check if error is critical
   */
  isCriticalError(error: any): boolean {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    const criticalPatterns = [
      'cannot read property',
      'cannot read properties',
      'is not a function',
      'permission denied',
      'disk full',
      'out of memory',
      'corrupted',
      'database locked'
    ];

    return criticalPatterns.some(pattern => 
      errorMessage.toLowerCase().includes(pattern)
    );
  }

  /**
   * Suggest error recovery actions
   */
  suggestRecoveryActions(error: any, context: string): string[] {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const suggestions: string[] = [];

    if (errorMessage.includes('not found')) {
      suggestions.push('Check if the resource exists');
      suggestions.push('Verify the path or identifier');
    }

    if (errorMessage.includes('permission')) {
      suggestions.push('Check file/directory permissions');
      suggestions.push('Run with appropriate privileges');
    }

    if (errorMessage.includes('disk') || errorMessage.includes('space')) {
      suggestions.push('Free up disk space');
      suggestions.push('Check storage quotas');
    }

    if (errorMessage.includes('timeout')) {
      suggestions.push('Increase timeout values');
      suggestions.push('Check network connectivity');
    }

    if (context.includes('persistence')) {
      suggestions.push('Check file system integrity');
      suggestions.push('Verify storage path configuration');
    }

    if (context.includes('collection')) {
      suggestions.push('Reload collection from disk');
      suggestions.push('Verify collection metadata');
    }

    if (suggestions.length === 0) {
      suggestions.push('Check system logs for more details');
      suggestions.push('Restart the application');
    }

    return suggestions;
  }
}