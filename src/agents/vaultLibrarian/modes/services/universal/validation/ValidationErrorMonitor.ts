/**
 * ValidationErrorMonitor - Comprehensive error monitoring for universal search validation
 * 
 * Provides error tracking, monitoring, and analytics for validation failures
 * throughout the universal search pipeline.
 */

export interface ValidationError {
  component: string;
  stage: string;
  operation: string;
  errorType: 'type_mismatch' | 'null_undefined' | 'invalid_structure' | 'validation_failure';
  severity: 'low' | 'medium' | 'high' | 'critical';
  input: unknown;
  expectedType: string;
  actualType: string;
  timestamp: number;
  recoveryAction: string;
  stackTrace?: string;
}

export interface ValidationErrorSummary {
  totalErrors: number;
  criticalErrors: number;
  errorsByComponent: Record<string, number>;
  errorsByType: Record<string, number>;
  recentErrors: ValidationError[];
  lastErrorTime: number;
}

/**
 * Monitors and tracks validation errors throughout universal search processing
 */
export class ValidationErrorMonitor {
  private errors: ValidationError[] = [];
  private readonly MAX_STORED_ERRORS = 1000;
  private readonly ERROR_RETENTION_TIME = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Record a validation error
   */
  recordValidationError(error: ValidationError): void {
    // Add timestamp if not provided
    if (!error.timestamp) {
      error.timestamp = Date.now();
    }

    // Add stack trace for debugging
    if (!error.stackTrace) {
      error.stackTrace = new Error().stack;
    }

    this.errors.push(error);

    // Log immediately for critical errors
    if (this.isCriticalError(error)) {
      console.error('[ValidationErrorMonitor] Critical validation error:', {
        component: error.component,
        stage: error.stage,
        operation: error.operation,
        errorType: error.errorType,
        input: this.sanitizeInputForLogging(error.input),
        recoveryAction: error.recoveryAction,
        timestamp: new Date(error.timestamp).toISOString()
      });
    } else if (error.severity === 'high') {
      console.warn('[ValidationErrorMonitor] High severity validation error:', {
        component: error.component,
        stage: error.stage,
        errorType: error.errorType,
        recoveryAction: error.recoveryAction
      });
    }

    // Cleanup old errors periodically
    this.cleanupOldErrors();
    
    // Ensure we don't exceed storage limits
    if (this.errors.length > this.MAX_STORED_ERRORS) {
      this.errors = this.errors.slice(-this.MAX_STORED_ERRORS);
    }
  }

  /**
   * Record a validation success for monitoring
   */
  recordValidationSuccess(component: string, stage: string, operation: string): void {
    // For now, just log successful validations in debug mode
    // Could be extended to track success rates
  }

  /**
   * Get error summary for monitoring and diagnostics
   */
  getErrorSummary(): ValidationErrorSummary {
    const now = Date.now();
    const recentErrors = this.errors.filter(e => now - e.timestamp < 3600000); // Last hour
    
    const errorsByComponent: Record<string, number> = {};
    const errorsByType: Record<string, number> = {};
    let criticalErrors = 0;
    let lastErrorTime = 0;

    for (const error of this.errors) {
      // Count by component
      errorsByComponent[error.component] = (errorsByComponent[error.component] || 0) + 1;
      
      // Count by type
      errorsByType[error.errorType] = (errorsByType[error.errorType] || 0) + 1;
      
      // Count critical errors
      if (this.isCriticalError(error)) {
        criticalErrors++;
      }
      
      // Track latest error time
      if (error.timestamp > lastErrorTime) {
        lastErrorTime = error.timestamp;
      }
    }

    return {
      totalErrors: this.errors.length,
      criticalErrors,
      errorsByComponent,
      errorsByType,
      recentErrors,
      lastErrorTime
    };
  }

  /**
   * Get recent critical errors for immediate attention
   */
  getRecentCriticalErrors(minutes: number = 60): ValidationError[] {
    const cutoffTime = Date.now() - (minutes * 60 * 1000);
    return this.errors.filter(error => 
      error.timestamp > cutoffTime && this.isCriticalError(error)
    );
  }

  /**
   * Check if there are any active critical issues
   */
  hasCriticalIssues(minutes: number = 10): boolean {
    return this.getRecentCriticalErrors(minutes).length > 0;
  }

  /**
   * Get error patterns for analysis
   */
  getErrorPatterns(): { component: string; stage: string; count: number; lastOccurrence: number }[] {
    const patterns = new Map<string, { count: number; lastOccurrence: number }>();
    
    for (const error of this.errors) {
      const key = `${error.component}:${error.stage}:${error.errorType}`;
      const existing = patterns.get(key);
      
      if (existing) {
        existing.count++;
        if (error.timestamp > existing.lastOccurrence) {
          existing.lastOccurrence = error.timestamp;
        }
      } else {
        patterns.set(key, { count: 1, lastOccurrence: error.timestamp });
      }
    }
    
    return Array.from(patterns.entries()).map(([key, data]) => {
      const [component, stage] = key.split(':');
      return {
        component,
        stage,
        count: data.count,
        lastOccurrence: data.lastOccurrence
      };
    }).sort((a, b) => b.count - a.count);
  }

  /**
   * Clear all stored errors (for testing or reset)
   */
  clearErrors(): void {
    this.errors = [];
  }

  /**
   * Export errors for external analysis
   */
  exportErrors(): ValidationError[] {
    return [...this.errors]; // Return copy to prevent external modification
  }

  /**
   * Check if an error is critical
   */
  private isCriticalError(error: ValidationError): boolean {
    if (error.severity === 'critical') {
      return true;
    }
    
    // Additional logic for determining criticality
    if (error.errorType === 'null_undefined' && 
        (error.operation.includes('split') || error.operation.includes('toLowerCase'))) {
      return true;
    }
    
    return false;
  }

  /**
   * Clean up old errors to prevent memory bloat
   */
  private cleanupOldErrors(): void {
    const cutoffTime = Date.now() - this.ERROR_RETENTION_TIME;
    const initialCount = this.errors.length;
    
    this.errors = this.errors.filter(error => error.timestamp > cutoffTime);
    
    const removedCount = initialCount - this.errors.length;
    if (removedCount > 0) {
    }
  }

  /**
   * Sanitize input for safe logging
   */
  private sanitizeInputForLogging(input: unknown): any {
    if (input === null || input === undefined) {
      return input;
    }
    
    if (typeof input === 'string') {
      // Truncate long strings
      return input.length > 200 ? input.substring(0, 200) + '...' : input;
    }
    
    if (typeof input === 'object' && input !== null) {
      // Provide safe object representation
      try {
        const str = JSON.stringify(input);
        return str.length > 200 ? str.substring(0, 200) + '...' : str;
      } catch {
        return '[Object - cannot serialize]';
      }
    }
    
    return String(input);
  }

  /**
   * Create a validation error object
   */
  static createError(
    component: string,
    stage: string,
    operation: string,
    errorType: ValidationError['errorType'],
    severity: ValidationError['severity'],
    input: unknown,
    expectedType: string,
    recoveryAction: string
  ): ValidationError {
    return {
      component,
      stage,
      operation,
      errorType,
      severity,
      input,
      expectedType,
      actualType: typeof input,
      timestamp: Date.now(),
      recoveryAction
    };
  }
}

// Global instance for universal search validation monitoring
export const globalValidationErrorMonitor = new ValidationErrorMonitor();