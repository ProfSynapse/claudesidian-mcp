/**
 * QueuedSaveManager - Handles queued save operations
 * Follows Single Responsibility Principle by focusing only on save queue management
 */

export interface QueuedSaveResult {
  success: boolean;
  error?: string;
}

/**
 * Service responsible for managing queued save operations
 * Follows SRP by focusing only on save queue operations
 */
export class QueuedSaveManager {
  private saveTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private saveCallbacks: Map<string, () => Promise<void>> = new Map();
  private readonly saveDelayMs: number;

  constructor(saveDelayMs: number = 1000) {
    this.saveDelayMs = saveDelayMs;
  }

  /**
   * Queue a save operation to be executed after a delay
   * This prevents excessive disk I/O when many operations happen in sequence
   */
  queueSave(collectionName: string, saveCallback: () => Promise<void>): void {
    // Cancel any existing timeout for this collection
    this.cancelQueuedSave(collectionName);

    // Store the callback
    this.saveCallbacks.set(collectionName, saveCallback);

    // Set new timeout
    const timeout = setTimeout(async () => {
      try {
        const callback = this.saveCallbacks.get(collectionName);
        if (callback) {
          await callback();
        }
      } catch (error) {
        console.error(`Failed to execute queued save for collection ${collectionName}:`, error);
      } finally {
        // Clean up
        this.saveTimeouts.delete(collectionName);
        this.saveCallbacks.delete(collectionName);
      }
    }, this.saveDelayMs);

    this.saveTimeouts.set(collectionName, timeout);
  }

  /**
   * Cancel a queued save operation
   */
  cancelQueuedSave(collectionName: string): void {
    const timeout = this.saveTimeouts.get(collectionName);
    if (timeout) {
      clearTimeout(timeout);
      this.saveTimeouts.delete(collectionName);
      this.saveCallbacks.delete(collectionName);
    }
  }

  /**
   * Execute all queued saves immediately
   */
  async executeAllQueuedSaves(): Promise<QueuedSaveResult> {
    const collectionNames = Array.from(this.saveCallbacks.keys());
    const results: Array<{ collection: string; success: boolean; error?: string }> = [];

    for (const collectionName of collectionNames) {
      try {
        // Cancel the timeout
        this.cancelQueuedSave(collectionName);

        // Execute the callback
        const callback = this.saveCallbacks.get(collectionName);
        if (callback) {
          await callback();
          results.push({ collection: collectionName, success: true });
        }
      } catch (error) {
        results.push({
          collection: collectionName,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Check if all saves succeeded
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      return {
        success: false,
        error: `Failed to save ${failures.length} collections: ${failures.map(f => `${f.collection}: ${f.error}`).join(', ')}`
      };
    }

    return { success: true };
  }

  /**
   * Get the names of collections with queued saves
   */
  getQueuedCollections(): string[] {
    return Array.from(this.saveCallbacks.keys());
  }

  /**
   * Check if a collection has a queued save
   */
  hasQueuedSave(collectionName: string): boolean {
    return this.saveCallbacks.has(collectionName);
  }

  /**
   * Get the number of queued saves
   */
  getQueuedSaveCount(): number {
    return this.saveCallbacks.size;
  }

  /**
   * Clear all queued saves without executing them
   */
  clearAllQueuedSaves(): void {
    // Cancel all timeouts
    for (const timeout of this.saveTimeouts.values()) {
      clearTimeout(timeout);
    }

    // Clear all maps
    this.saveTimeouts.clear();
    this.saveCallbacks.clear();
  }

  /**
   * Get status of queued saves
   */
  getQueueStatus(): {
    queuedCount: number;
    collections: string[];
    saveDelayMs: number;
  } {
    return {
      queuedCount: this.saveCallbacks.size,
      collections: Array.from(this.saveCallbacks.keys()),
      saveDelayMs: this.saveDelayMs
    };
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.clearAllQueuedSaves();
  }
}