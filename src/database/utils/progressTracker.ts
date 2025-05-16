/**
 * Tracks progress for long-running operations
 */
export class ProgressTracker {
  /**
   * Update progress
   */
  updateProgress(data: {
    processed: number;
    total: number;
    remaining: number;
    operationId: string | null;
  }): void {
    // Use global handler if available
    if ((window as any).mcpProgressHandlers?.updateProgress) {
      (window as any).mcpProgressHandlers.updateProgress(data);
    }
  }

  /**
   * Complete progress
   */
  completeProgress(data: {
    success: boolean;
    processed: number;
    failed: number;
    error?: string;
    operationId: string;
  }): void {
    // Use global handler if available
    if ((window as any).mcpProgressHandlers?.completeProgress) {
      (window as any).mcpProgressHandlers.completeProgress(data);
    }
  }

  /**
   * Cancel progress
   */
  cancelProgress(data: {
    operationId: string;
  }): void {
    // Use global handler if available
    if ((window as any).mcpProgressHandlers?.cancelProgress) {
      (window as any).mcpProgressHandlers.cancelProgress(data);
    }
  }
}