/**
 * Minimal logger that only logs critical system errors.
 * Used to replace all console.log/warn/error calls with a centralized system
 * that only logs absolute essential errors.
 */
export const logger = {
    /**
     * Log only fatal system errors that prevent core functionality
     */
    systemError(error: Error, context?: string) {
        console.error(
            `SYSTEM ERROR${context ? ` [${context}]` : ''}: ${error.message}`
        );
    },

    /**
     * Log operation errors but only in batches or critical operations
     * This is more selective than systemError and used for important operations
     * that should be logged but don't necessarily indicate system failure
     */
    operationError(error: Error, operation: string, detail?: string) {
        if (detail) {
            console.error(`Operation Error [${operation}] ${detail}: ${error.message}`);
        } else {
            console.error(`Operation Error [${operation}]: ${error.message}`);
        }
    }
};
