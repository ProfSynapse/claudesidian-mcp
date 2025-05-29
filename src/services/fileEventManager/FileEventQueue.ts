import { FileEvent, ProcessingResult } from './types';

/**
 * Manages file event queueing and deduplication
 */
export class FileEventQueue {
  private fileQueue: Map<string, FileEvent> = new Map();
  private processingFiles: Set<string> = new Set();
  private completedFiles: Map<string, ProcessingResult> = new Map();
  private isProcessingQueue: boolean = false;

  /**
   * Queue a file event for processing
   */
  queueEvent(event: FileEvent): void {
    // Skip system operations unless it's a delete
    if (event.isSystemOperation && event.operation !== 'delete') {
      console.log(`[FileEventQueue] Skipping system operation: ${event.operation} ${event.path}`);
      return;
    }

    console.log(`[FileEventQueue] Queueing file event: ${event.operation} ${event.path} (system: ${event.isSystemOperation})`);

    // Deduplicate by keeping the latest event for each file
    const existingEvent = this.fileQueue.get(event.path);
    if (existingEvent) {
      // Update priority if new event is higher priority
      if (event.priority === 'high' || 
          (event.priority === 'normal' && existingEvent.priority === 'low')) {
        existingEvent.priority = event.priority;
      }
      // Update operation (delete takes precedence)
      if (event.operation === 'delete') {
        existingEvent.operation = 'delete';
      }
      existingEvent.timestamp = event.timestamp;
    } else {
      this.fileQueue.set(event.path, event);
    }

    console.log(`[FileEventQueue] Queue size: ${this.fileQueue.size}`);
  }

  /**
   * Get and clear all queued events, sorted by priority and timestamp
   */
  dequeueAll(): FileEvent[] {
    // Sort events by priority and timestamp
    const events = Array.from(this.fileQueue.values()).sort((a, b) => {
      // Priority order: high > normal > low
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Then by timestamp (older first)
      return a.timestamp - b.timestamp;
    });

    // Clear the queue
    this.fileQueue.clear();

    return events;
  }

  /**
   * Mark a file as being processed
   */
  markProcessing(path: string): void {
    this.processingFiles.add(path);
  }

  /**
   * Mark a file as completed
   */
  markCompleted(path: string, result: ProcessingResult): void {
    this.processingFiles.delete(path);
    this.completedFiles.set(path, result);
  }

  /**
   * Check if a file is currently being processed
   */
  isProcessing(path: string): boolean {
    return this.processingFiles.has(path);
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    queuedFiles: number;
    processingFiles: number;
    completedFiles: number;
  } {
    return {
      queuedFiles: this.fileQueue.size,
      processingFiles: this.processingFiles.size,
      completedFiles: this.completedFiles.size
    };
  }

  /**
   * Set/get processing state
   */
  setProcessingState(state: boolean): void {
    this.isProcessingQueue = state;
  }

  getProcessingState(): boolean {
    return this.isProcessingQueue;
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.fileQueue.size;
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.fileQueue.clear();
    this.processingFiles.clear();
    this.completedFiles.clear();
  }
}