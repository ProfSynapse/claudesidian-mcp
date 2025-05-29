import { Notice } from 'obsidian';

export interface ProgressNotice {
  notice: Notice;
  setMessage(message: string): void;
  hide(): void;
}

export interface ProgressEventData {
  processed: number;
  total: number;
  remaining: number;
  operationId: string;
  success?: boolean;
  failed?: number;
  error?: string;
}

export interface IProgressNotificationService {
  /**
   * Show progress notification for batch operations
   * @param message Initial message
   * @param current Current progress
   * @param total Total items
   * @returns Progress notice handle
   */
  showBatchProgress(message: string, current: number, total: number): ProgressNotice;

  /**
   * Update progress message and count
   * @param notice Progress notice to update
   * @param current Current progress
   * @param total Total items
   */
  updateProgress(notice: ProgressNotice, current: number, total: number): void;

  /**
   * Show completion message
   * @param message Completion message
   * @param autoHide Whether to auto-hide after delay
   */
  showCompletion(message: string, autoHide?: boolean): void;

  /**
   * Show error message
   * @param error Error message or Error object
   */
  showError(error: string | Error): void;

  /**
   * Emit progress event to global handlers
   * @param data Progress event data
   */
  emitProgressEvent(data: ProgressEventData): void;

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
  }): void;

  /**
   * Create a progress notice
   * @param message Initial message
   * @returns Progress notice handle
   */
  createProgressNotice(message: string): ProgressNotice;

  /**
   * Complete a progress notice
   * @param notice Progress notice to complete
   * @param message Completion message
   */
  completeProgress(notice: ProgressNotice, message: string): void;
}
