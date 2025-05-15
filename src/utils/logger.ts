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
    }
    
    // operationError function removed to eliminate unnecessary console logs
};
