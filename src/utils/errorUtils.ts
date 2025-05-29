/**
 * Utility functions for error handling
 */

/**
 * Extracts a readable message from any error type
 * @param error Any error type (Error, string, unknown, etc.)
 * @returns A string message representing the error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  } else if (typeof error === 'string') {
    return error;
  } else if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  } else if (error === null) {
    return 'Null error';
  } else if (error === undefined) {
    return 'Undefined error';
  } else {
    return String(error);
  }
}

/**
 * Creates a prefixed error message from any error type
 * @param prefix The prefix to add to the error message (e.g. "Failed to create folder: ")
 * @param error Any error type (Error, string, unknown, etc.)
 * @returns A string message with the prefix and the error
 */
export function createErrorMessage(prefix: string, error: unknown): string {
  return `${prefix}${getErrorMessage(error)}`;
}

/**
 * Handles operation errors with consistent logging and error creation
 * @param operation Name of the operation that failed
 * @param entityId ID of the entity involved in the operation
 * @param error The error that occurred
 * @throws Error with formatted message
 */
export function handleOperationError(operation: string, entityId: string, error: unknown): never {
  const errorMessage = `Failed to ${operation} ${entityId}`;
  console.error(`${errorMessage}:`, error);
  throw new Error(createErrorMessage(`${errorMessage}: `, error));
}