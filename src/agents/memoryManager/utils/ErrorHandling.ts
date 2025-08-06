/**
 * Location: /src/agents/memoryManager/utils/ErrorHandling.ts
 * Purpose: Standardized error handling patterns for memory manager operations
 * 
 * This utility provides:
 * - Consistent error categorization and response formatting
 * - Context-aware error messages with actionable suggestions
 * - Error recovery strategies and fallback mechanisms
 * - Performance and operation logging
 * - User-friendly error reporting
 * 
 * Used by: All memory manager modes for consistent error handling and user experience
 */

import { getErrorMessage } from '../../../utils/errorUtils';
import { CommonResult } from '../../../types';

/**
 * Error categories for memory manager operations
 */
export enum ErrorCategory {
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  DATA_CORRUPTION = 'DATA_CORRUPTION',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'LOW',        // User can continue with limited functionality
  MEDIUM = 'MEDIUM',  // Feature unavailable but other features work
  HIGH = 'HIGH',      // Major functionality broken
  CRITICAL = 'CRITICAL' // System unusable
}

/**
 * Structured error information
 */
export interface MemoryManagerError {
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  userMessage: string;
  technicalDetails: string;
  suggestions: string[];
  recoveryActions: string[];
  context: {
    operation: string;
    mode: string;
    timestamp: number;
    parameters?: any;
    stackTrace?: string;
  };
}

/**
 * Error handling result with recovery options
 */
export interface ErrorHandlingResult<T> extends CommonResult {
  success: false;
  error: string;
  data?: any;
  errorDetails?: MemoryManagerError;
  recoveryOptions?: {
    canRetry: boolean;
    alternativeActions: Array<{
      name: string;
      description: string;
      parameters?: any;
    }>;
  };
}

/**
 * Recovery strategy interface
 */
export interface RecoveryStrategy {
  name: string;
  description: string;
  canApply(error: MemoryManagerError): boolean;
  apply(error: MemoryManagerError, context: any): Promise<any>;
}

/**
 * Standardized error handling utility for memory manager operations
 */
export class MemoryManagerErrorHandler {
  private recoveryStrategies: RecoveryStrategy[] = [];

  constructor() {
    this.initializeDefaultRecoveryStrategies();
  }

  /**
   * Handle service unavailable errors
   */
  handleServiceUnavailable(
    operation: string,
    mode: string,
    serviceName: string,
    error?: unknown,
    parameters?: any
  ): MemoryManagerError {
    const technicalError = error ? getErrorMessage(error) : 'Service not accessible';
    
    return {
      category: ErrorCategory.SERVICE_UNAVAILABLE,
      severity: ErrorSeverity.HIGH,
      message: `${serviceName} is not available`,
      userMessage: `Unable to ${operation.toLowerCase()} because the ${serviceName.replace('Service', '').toLowerCase()} system is not ready. This may be temporary during plugin initialization.`,
      technicalDetails: `Service access failed: ${technicalError}`,
      suggestions: [
        'Wait a few moments and try again',
        'Check if the plugin is fully loaded',
        'Restart Obsidian if the issue persists',
        'Check the console for initialization errors'
      ],
      recoveryActions: [
        'retry_after_delay',
        'check_plugin_status',
        'use_alternative_method'
      ],
      context: {
        operation,
        mode,
        timestamp: Date.now(),
        parameters,
        stackTrace: error instanceof Error ? error.stack : undefined
      }
    };
  }

  /**
   * Handle validation errors with specific field information
   */
  handleValidationError(
    operation: string,
    mode: string,
    field: string,
    value: any,
    requirement: string,
    parameters?: any
  ): MemoryManagerError {
    return {
      category: ErrorCategory.VALIDATION_ERROR,
      severity: ErrorSeverity.LOW,
      message: `Invalid ${field}: ${requirement}`,
      userMessage: `The ${field} you provided doesn't meet the requirements. ${requirement}`,
      technicalDetails: `Validation failed for field '${field}' with value '${JSON.stringify(value)}': ${requirement}`,
      suggestions: [
        `Provide a valid ${field} that ${requirement.toLowerCase()}`,
        'Check the parameter schema for exact requirements',
        'Review examples of valid values'
      ],
      recoveryActions: [
        'fix_parameter',
        'show_examples',
        'use_default_value'
      ],
      context: {
        operation,
        mode,
        timestamp: Date.now(),
        parameters
      }
    };
  }

  /**
   * Handle not found errors (workspace, state, session)
   */
  handleNotFound(
    operation: string,
    mode: string,
    resourceType: string,
    resourceId: string,
    parameters?: any
  ): MemoryManagerError {
    return {
      category: ErrorCategory.NOT_FOUND,
      severity: ErrorSeverity.MEDIUM,
      message: `${resourceType} '${resourceId}' not found`,
      userMessage: `The ${resourceType.toLowerCase()} you're looking for doesn't exist or may have been deleted.`,
      technicalDetails: `Resource lookup failed: ${resourceType} with ID '${resourceId}' not found in storage`,
      suggestions: [
        `Check if the ${resourceType.toLowerCase()} ID is correct`,
        `List available ${resourceType.toLowerCase()}s to find the right one`,
        `Create a new ${resourceType.toLowerCase()} if needed`
      ],
      recoveryActions: [
        'list_available',
        'create_new',
        'search_similar'
      ],
      context: {
        operation,
        mode,
        timestamp: Date.now(),
        parameters
      }
    };
  }

  /**
   * Handle data corruption or integrity errors
   */
  handleDataCorruption(
    operation: string,
    mode: string,
    description: string,
    error?: unknown,
    parameters?: any
  ): MemoryManagerError {
    return {
      category: ErrorCategory.DATA_CORRUPTION,
      severity: ErrorSeverity.HIGH,
      message: `Data integrity issue: ${description}`,
      userMessage: `There's an issue with the stored data that prevents this operation. The data may be corrupted or in an unexpected format.`,
      technicalDetails: `Data validation failed: ${description}. ${error ? getErrorMessage(error) : ''}`,
      suggestions: [
        'Try recreating the affected data',
        'Check for recent changes that might have caused this',
        'Contact support if this persists',
        'Consider backing up and resetting the workspace'
      ],
      recoveryActions: [
        'recreate_data',
        'repair_data',
        'use_backup'
      ],
      context: {
        operation,
        mode,
        timestamp: Date.now(),
        parameters,
        stackTrace: error instanceof Error ? error.stack : undefined
      }
    };
  }

  /**
   * Handle timeout errors
   */
  handleTimeout(
    operation: string,
    mode: string,
    timeoutMs: number,
    error?: unknown,
    parameters?: any
  ): MemoryManagerError {
    return {
      category: ErrorCategory.TIMEOUT,
      severity: ErrorSeverity.MEDIUM,
      message: `Operation timed out after ${timeoutMs}ms`,
      userMessage: `The operation took too long to complete and was cancelled. This might be due to a large amount of data or system load.`,
      technicalDetails: `Timeout after ${timeoutMs}ms: ${error ? getErrorMessage(error) : 'No response'}`,
      suggestions: [
        'Try again with a smaller data set',
        'Wait for system load to decrease',
        'Check your network connection',
        'Increase timeout if possible'
      ],
      recoveryActions: [
        'retry_with_timeout',
        'split_operation',
        'check_system_load'
      ],
      context: {
        operation,
        mode,
        timestamp: Date.now(),
        parameters,
        stackTrace: error instanceof Error ? error.stack : undefined
      }
    };
  }

  /**
   * Handle unexpected errors with fallback information
   */
  handleUnexpected(
    operation: string,
    mode: string,
    error: unknown,
    parameters?: any
  ): MemoryManagerError {
    return {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      message: `Unexpected error during ${operation}`,
      userMessage: `An unexpected error occurred. This is likely a bug or system issue that needs investigation.`,
      technicalDetails: `Unhandled error: ${getErrorMessage(error)}`,
      suggestions: [
        'Try the operation again',
        'Check the browser console for more details',
        'Report this issue with the error details',
        'Try an alternative approach if available'
      ],
      recoveryActions: [
        'retry_operation',
        'report_bug',
        'use_fallback'
      ],
      context: {
        operation,
        mode,
        timestamp: Date.now(),
        parameters,
        stackTrace: error instanceof Error ? error.stack : undefined
      }
    };
  }

  /**
   * Create error handling result with recovery options and appropriate data defaults
   */
  createErrorResult<T>(
    error: MemoryManagerError,
    workspaceContext?: any,
    defaultData?: any
  ): T {
    const recoveryOptions = this.generateRecoveryOptions(error);
    
    // Determine appropriate default data based on the operation
    let data = defaultData;
    if (!data) {
      if (error.context.mode.includes('list') && error.context.mode.includes('Workspace')) {
        data = { workspaces: [] };
      } else if (error.context.mode.includes('list') && error.context.mode.includes('State')) {
        data = { states: [], total: 0 };
      } else {
        data = {};
      }
    }
    
    return {
      success: false,
      error: error.userMessage,
      data,
      errorDetails: error,
      recoveryOptions,
      workspaceContext,
      sessionId: workspaceContext?.sessionId
    } as T;
  }

  /**
   * Generate recovery options based on error type
   */
  private generateRecoveryOptions(error: MemoryManagerError): {
    canRetry: boolean;
    alternativeActions: Array<{
      name: string;
      description: string;
      parameters?: any;
    }>;
  } {
    const canRetry = [
      ErrorCategory.SERVICE_UNAVAILABLE,
      ErrorCategory.NETWORK_ERROR,
      ErrorCategory.TIMEOUT
    ].includes(error.category);

    const alternativeActions: Array<{
      name: string;
      description: string;
      parameters?: any;
    }> = [];

    switch (error.category) {
      case ErrorCategory.SERVICE_UNAVAILABLE:
        alternativeActions.push(
          {
            name: 'check_service_status',
            description: 'Check if services are available now'
          },
          {
            name: 'use_fallback_method',
            description: 'Try alternative approach without this service'
          }
        );
        break;

      case ErrorCategory.VALIDATION_ERROR:
        alternativeActions.push(
          {
            name: 'show_parameter_help',
            description: 'Show parameter requirements and examples'
          },
          {
            name: 'use_wizard',
            description: 'Use step-by-step guided input'
          }
        );
        break;

      case ErrorCategory.NOT_FOUND:
        alternativeActions.push(
          {
            name: 'list_available',
            description: 'Show available options'
          },
          {
            name: 'create_new',
            description: 'Create a new item instead'
          }
        );
        break;

      case ErrorCategory.DATA_CORRUPTION:
        alternativeActions.push(
          {
            name: 'validate_data',
            description: 'Run data validation and repair'
          },
          {
            name: 'reset_workspace',
            description: 'Reset workspace to clean state'
          }
        );
        break;
    }

    return {
      canRetry,
      alternativeActions
    };
  }

  /**
   * Log error with appropriate level and context
   */
  logError(error: MemoryManagerError): void {
    const logLevel = this.getLogLevel(error.severity);
    const logMessage = `[${error.context.mode}] ${error.message}`;
    const logDetails = {
      category: error.category,
      severity: error.severity,
      operation: error.context.operation,
      technicalDetails: error.technicalDetails,
      parameters: error.context.parameters
    };

    switch (logLevel) {
      case 'error':
        console.error(logMessage, logDetails);
        break;
      case 'warn':
        console.warn(logMessage, logDetails);
        break;
      case 'info':
        console.info(logMessage, logDetails);
        break;
      default:
        console.log(logMessage, logDetails);
        break;
    }
  }

  /**
   * Get appropriate log level for error severity
   */
  private getLogLevel(severity: ErrorSeverity): 'error' | 'warn' | 'info' | 'log' {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        return 'error';
      case ErrorSeverity.MEDIUM:
        return 'warn';
      case ErrorSeverity.LOW:
        return 'info';
      default:
        return 'log';
    }
  }

  /**
   * Initialize default recovery strategies
   */
  private initializeDefaultRecoveryStrategies(): void {
    // Implementation would include actual recovery strategy classes
    // For now, this is a placeholder for the recovery system
  }

  /**
   * Add custom recovery strategy
   */
  addRecoveryStrategy(strategy: RecoveryStrategy): void {
    this.recoveryStrategies.push(strategy);
  }

  /**
   * Apply recovery strategy if available
   */
  async applyRecovery(error: MemoryManagerError, context: any): Promise<any> {
    for (const strategy of this.recoveryStrategies) {
      if (strategy.canApply(error)) {
        try {
          return await strategy.apply(error, context);
        } catch (recoveryError) {
          console.warn(`Recovery strategy '${strategy.name}' failed:`, recoveryError);
        }
      }
    }
    return null;
  }
}

/**
 * Global error handler instance for memory manager operations
 */
export const memoryManagerErrorHandler = new MemoryManagerErrorHandler();

/**
 * Convenience function to create error results with proper data defaults
 */
export function createMemoryManagerError<T>(
  operation: string,
  mode: string,
  error: unknown,
  workspaceContext?: any,
  parameters?: any
): T {
  let memoryError: MemoryManagerError;

  if (typeof error === 'string' && error.includes('not available')) {
    memoryError = memoryManagerErrorHandler.handleServiceUnavailable(
      operation,
      mode,
      'Service',
      error,
      parameters
    );
  } else if (typeof error === 'string' && error.includes('not found')) {
    memoryError = memoryManagerErrorHandler.handleNotFound(
      operation,
      mode,
      'Resource',
      'unknown',
      parameters
    );
  } else if (typeof error === 'string' && error.includes('timeout')) {
    memoryError = memoryManagerErrorHandler.handleTimeout(
      operation,
      mode,
      5000,
      error,
      parameters
    );
  } else {
    memoryError = memoryManagerErrorHandler.handleUnexpected(
      operation,
      mode,
      error,
      parameters
    );
  }

  memoryManagerErrorHandler.logError(memoryError);
  
  // Create error result with proper type-specific defaults
  const baseErrorResult = {
    success: false as const,
    error: memoryError.userMessage,
    errorDetails: memoryError,
    workspaceContext,
    sessionId: workspaceContext?.sessionId
  };
  
  // Add appropriate default data based on the mode type
  if (mode.includes('Workspace') || mode.includes('workspace')) {
    if (mode.includes('list') || mode.includes('List')) {
      return { ...baseErrorResult, data: { workspaces: [] } } as T;
    } else {
      return { ...baseErrorResult, data: {} } as T;
    }
  } else if (mode.includes('State') || mode.includes('state')) {
    if (mode.includes('list') || mode.includes('List')) {
      return { ...baseErrorResult, data: { states: [], total: 0 } } as T;
    } else {
      return { ...baseErrorResult, data: {} } as T;
    }
  }
  
  // Default fallback
  return { ...baseErrorResult, data: {} } as T;
}