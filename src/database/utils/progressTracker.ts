import { PluginContext } from '../../types';
import { getProgressHandlers } from '../../utils/progressHandlerUtils';

/**
 * Tracks progress for long-running operations
 */
export class ProgressTracker {
  private pluginContext?: PluginContext;
  
  /**
   * Create a new progress tracker
   * @param pluginContext Optional plugin context for namespacing
   */
  constructor(pluginContext?: PluginContext) {
    this.pluginContext = pluginContext;
  }
  
  /**
   * Update progress
   */
  updateProgress(data: {
    processed: number;
    total: number;
    remaining: number;
    operationId: string | null;
  }): void {
    // Use namespaced handler if available
    const handlers = getProgressHandlers(this.pluginContext);
    if (handlers?.updateProgress) {
      handlers.updateProgress(data);
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
    // Use namespaced handler if available
    const handlers = getProgressHandlers(this.pluginContext);
    if (handlers?.completeProgress) {
      handlers.completeProgress(data);
    }
  }

  /**
   * Cancel progress
   */
  cancelProgress(data: {
    operationId: string;
  }): void {
    // Use namespaced handler if available
    const handlers = getProgressHandlers(this.pluginContext);
    if (handlers?.cancelProgress) {
      handlers.cancelProgress(data);
    }
  }
}