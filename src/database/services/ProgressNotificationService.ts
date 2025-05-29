import { Notice } from 'obsidian';
import { getErrorMessage } from '../../utils/errorUtils';
import { 
  IProgressNotificationService, 
  ProgressNotice, 
  ProgressEventData 
} from '../interfaces/IProgressNotificationService';
import { PluginContext } from '../../types';
import { updateProgress, completeProgress } from '../../utils/progressHandlerUtils';

/**
 * Service for managing UI notifications and progress tracking
 * Centralizes all notification logic to eliminate duplication
 */
export class ProgressNotificationService implements IProgressNotificationService {
  private pluginContext?: PluginContext;
  
  /**
   * Create a new progress notification service
   * @param pluginContext Optional plugin context for namespacing
   */
  constructor(pluginContext?: PluginContext) {
    this.pluginContext = pluginContext;
  }
  
  /**
   * Show progress notification for batch operations
   * @param message Initial message
   * @param current Current progress
   * @param total Total items
   * @returns Progress notice handle
   */
  showBatchProgress(message: string, current: number, total: number): ProgressNotice {
    const notice = new Notice(`${message}: ${current}/${total}`, 0);
    
    return {
      notice,
      setMessage: (newMessage: string) => notice.setMessage(newMessage),
      hide: () => notice.hide()
    };
  }

  /**
   * Update progress message and count
   * @param notice Progress notice to update
   * @param current Current progress
   * @param total Total items
   */
  updateProgress(progressNotice: ProgressNotice, current: number, total: number): void {
    // Extract base message from current notice message
    const currentMessage = progressNotice.notice.noticeEl?.textContent || '';
    const baseMessage = currentMessage.split(':')[0] || 'Processing';
    
    progressNotice.setMessage(`${baseMessage}: ${current}/${total}`);
  }

  /**
   * Show completion message
   * @param message Completion message
   * @param autoHide Whether to auto-hide after delay
   */
  showCompletion(message: string, autoHide: boolean = true): void {
    const notice = new Notice(message);
    
    if (autoHide) {
      setTimeout(() => notice.hide(), 3000);
    }
  }

  /**
   * Show error message
   * @param error Error message or Error object
   */
  showError(error: string | Error): void {
    const errorMessage = typeof error === 'string' ? error : getErrorMessage(error);
    const notice = new Notice(`Error: ${errorMessage}`);
    
    // Auto-hide error after 5 seconds
    setTimeout(() => notice.hide(), 5000);
  }

  /**
   * Emit progress event to global handlers
   * @param data Progress event data
   */
  emitProgressEvent(data: ProgressEventData): void {
    try {
      if (data.success !== undefined) {
        // Complete progress event
        completeProgress({
          success: data.success,
          processed: data.processed,
          failed: data.failed || 0,
          error: data.error,
          operationId: data.operationId
        }, this.pluginContext);
      } else {
        // Update progress event
        updateProgress({
          processed: data.processed,
          total: data.total,
          remaining: data.remaining,
          operationId: data.operationId
        }, this.pluginContext);
      }
    } catch (error) {
      console.warn('Failed to emit progress event:', error);
    }
  }

  /**
   * Notify batch completion with statistics
   * @param stats Completion statistics
   */
  notifyBatchCompletion(stats: {
    processedCount: number;
    totalTokensProcessed: number;
    operationId: string;
    success: boolean;
    failed?: number;
    error?: string;
  }): void {
    // Emit completion event
    this.emitProgressEvent({
      success: stats.success,
      processed: stats.processedCount,
      failed: stats.failed || 0,
      error: stats.error,
      operationId: stats.operationId,
      total: stats.processedCount + (stats.failed || 0),
      remaining: 0
    });

    // Show completion or error message
    if (stats.success) {
      this.showCompletion(
        `Completed processing ${stats.processedCount} files (${stats.totalTokensProcessed} tokens)`
      );
    } else {
      this.showError(stats.error || 'Operation failed');
    }

    // Emit event for token usage updates
    try {
      const app = (window as any).app;
      const pluginId = this.pluginContext?.pluginId || 'claudesidian-mcp';
      const plugin = this.pluginContext?.plugin || app?.plugins?.getPlugin(pluginId);
      
      if (plugin?.eventManager?.emit) {
        plugin.eventManager.emit('batch-embedding-completed', {
          processedCount: stats.processedCount,
          totalTokensProcessed: stats.totalTokensProcessed,
          timestamp: new Date().toISOString()
        });
        console.log('Emitted batch-embedding-completed event');
      }
    } catch (emitError) {
      console.warn('Failed to emit batch completion event:', emitError);
    }
  }

  /**
   * Create a progress notice
   * @param message Initial message
   * @returns Progress notice handle
   */
  createProgressNotice(message: string): ProgressNotice {
    const notice = new Notice(message, 0); // 0 = no auto-hide
    return {
      notice,
      setMessage: (newMessage: string) => notice.setMessage(newMessage),
      hide: () => notice.hide()
    };
  }

  /**
   * Complete a progress notice
   * @param notice Progress notice to complete
   * @param message Completion message
   */
  completeProgress(notice: ProgressNotice, message: string): void {
    notice.setMessage(message);
    // Auto-hide after 2 seconds
    setTimeout(() => notice.hide(), 2000);
  }
}
