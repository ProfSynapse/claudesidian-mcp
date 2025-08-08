/**
 * IndexingProgressTracker - Handles progress tracking and UI updates during indexing
 * Follows Single Responsibility Principle by focusing only on progress tracking
 */

import { Notice } from 'obsidian';
import { getErrorMessage } from '../../../../utils/errorUtils';

export interface ProgressState {
  current: number;
  total: number;
  processed: number;
  failed: number;
  operationId: string;
  notice?: Notice;
}

export interface ProgressResult {
  success: boolean;
  processed: number;
  failed: number;
  error?: string;
  operationId: string;
}

export class IndexingProgressTracker {
  private progressState: ProgressState | null = null;

  /**
   * Initialize progress tracking
   * @param total Total number of items to process
   * @param operationId Unique identifier for this operation
   * @param showNotice Whether to show progress notices
   * @returns Progress state object
   */
  initializeProgress(total: number, operationId: string, showNotice = true): ProgressState {
    const notice = showNotice ? new Notice(`Processing 0/${total} items`, 0) : undefined;
    
    this.progressState = {
      current: 0,
      total,
      processed: 0,
      failed: 0,
      operationId,
      notice
    };

    // Notify progress handlers if available
    this.notifyProgressHandlers('start', this.progressState);

    return this.progressState;
  }

  /**
   * Update progress
   * @param current Current item being processed
   * @param processed Number of successfully processed items
   * @param failed Number of failed items
   * @param progressCallback Optional external progress callback
   */
  updateProgress(
    current: number, 
    processed = 0, 
    failed = 0,
    progressCallback?: (current: number, total: number) => void
  ): void {
    if (!this.progressState) {
      return;
    }

    this.progressState.current = current;
    this.progressState.processed = processed;
    this.progressState.failed = failed;

    // Update notice if available
    if (this.progressState.notice) {
      const successCount = processed;
      const failCount = failed;
      let message = `Processing ${current}/${this.progressState.total} items`;
      
      if (successCount > 0 || failCount > 0) {
        message += ` (✓${successCount}`;
        if (failCount > 0) {
          message += ` ✗${failCount}`;
        }
        message += ')';
      }
      
      this.progressState.notice.setMessage(message);
    }

    // Call external progress callback
    if (progressCallback) {
      progressCallback(current, this.progressState.total);
    }

    // Notify progress handlers
    this.notifyProgressHandlers('update', this.progressState);
  }

  /**
   * Complete progress tracking
   * @param success Whether the operation completed successfully
   * @param error Optional error message
   * @param finalMessage Optional final message to display
   * @param hideDelay How long to show final message before hiding (ms)
   */
  completeProgress(
    success: boolean, 
    error?: string, 
    finalMessage?: string, 
    hideDelay = 3000
  ): ProgressResult {
    if (!this.progressState) {
      return {
        success: false,
        processed: 0,
        failed: 0,
        error: 'No progress state initialized',
        operationId: 'unknown'
      };
    }

    const result: ProgressResult = {
      success,
      processed: this.progressState.processed,
      failed: this.progressState.failed,
      error,
      operationId: this.progressState.operationId
    };

    // Update notice with final message and capture notice reference before cleanup
    let noticeToHide: Notice | null = null;
    if (this.progressState.notice) {
      const message = finalMessage || this.generateCompletionMessage(success, result, error);
      this.progressState.notice.setMessage(message);
      noticeToHide = this.progressState.notice; // Capture reference before cleanup
      
      if (hideDelay > 0) {
        setTimeout(() => {
          if (noticeToHide) {
            noticeToHide.hide();
          }
        }, hideDelay);
      }
    }

    // Notify completion to progress handlers
    this.notifyProgressHandlers('complete', this.progressState, result);

    // Clean up progress state
    const finalResult = { ...result };
    this.progressState = null;

    return finalResult;
  }

  /**
   * Get current progress state
   */
  getProgressState(): ProgressState | null {
    return this.progressState;
  }

  /**
   * Check if progress tracking is active
   */
  isTracking(): boolean {
    return this.progressState !== null;
  }

  /**
   * Cancel progress tracking
   */
  cancelProgress(): void {
    if (this.progressState?.notice) {
      this.progressState.notice.hide();
    }
    this.progressState = null;
  }

  /**
   * Generate completion message based on results
   */
  private generateCompletionMessage(success: boolean, result: ProgressResult, error?: string): string {
    if (!success && error) {
      return `Operation failed: ${error}`;
    }

    const { processed, failed } = result;
    const total = processed + failed;

    if (failed === 0) {
      return `✅ Successfully processed ${processed} items`;
    } else if (processed === 0) {
      return `❌ Failed to process ${failed} items`;
    } else {
      return `⚠️ Completed with ${processed} successes and ${failed} failures`;
    }
  }

  /**
   * Notify external progress handlers
   */
  private notifyProgressHandlers(
    phase: 'start' | 'update' | 'complete', 
    state: ProgressState, 
    result?: ProgressResult
  ): void {
    try {
      const globalHandlers = (window as any).mcpProgressHandlers;
      
      if (globalHandlers) {
        switch (phase) {
          case 'start':
            if (globalHandlers.startProgress) {
              globalHandlers.startProgress({
                total: state.total,
                operationId: state.operationId
              });
            }
            break;
            
          case 'update':
            if (globalHandlers.updateProgress) {
              globalHandlers.updateProgress({
                current: state.current,
                total: state.total,
                processed: state.processed,
                failed: state.failed,
                operationId: state.operationId
              });
            }
            break;
            
          case 'complete':
            if (globalHandlers.completeProgress && result) {
              globalHandlers.completeProgress(result);
            }
            break;
        }
      }

      // Also emit browser events for broader compatibility
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        const eventName = `mcp-progress-${phase}`;
        const eventData = phase === 'complete' ? result : state;
        
        window.dispatchEvent(new CustomEvent(eventName, {
          detail: eventData
        }));
      }
    } catch (emitError) {
      console.warn(`Failed to emit ${phase} progress event:`, emitError);
    }
  }

  /**
   * Create a progress callback function that updates this tracker
   * @returns Function that can be passed to operations for progress updates
   */
  createProgressCallback(): (current: number, total?: number) => void {
    return (current: number, total?: number) => {
      if (this.progressState) {
        // If total is provided and different, update it
        if (total !== undefined && total !== this.progressState.total) {
          this.progressState.total = total;
        }
        
        this.updateProgress(current);
      }
    };
  }

  /**
   * Create a batch progress tracker for processing items in batches
   * @param totalItems Total number of items to process
   * @param batchSize Size of each batch
   * @returns Object with methods to track batch progress
   */
  createBatchTracker(totalItems: number, batchSize: number) {
    let processedItems = 0;
    let failedItems = 0;

    return {
      updateBatch: (batchProcessed: number, batchFailed = 0) => {
        processedItems += batchProcessed;
        failedItems += batchFailed;
        
        this.updateProgress(
          Math.min(processedItems + failedItems, totalItems),
          processedItems,
          failedItems
        );
      },
      
      getStats: () => ({
        processed: processedItems,
        failed: failedItems,
        remaining: Math.max(0, totalItems - processedItems - failedItems)
      })
    };
  }
}