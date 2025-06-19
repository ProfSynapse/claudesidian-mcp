/**
 * Interface for database size calculation operations
 * Handles various size metrics and storage analysis
 */
export interface ISizeCalculatorService {
  /**
   * Calculate the total database size in MB
   * @returns Total size in MB
   */
  calculateTotalDatabaseSize(): Promise<number>;

  /**
   * Calculate the size of memory-related collections only
   * @returns Size in MB for memory traces, sessions, and snapshots
   */
  calculateMemoryDatabaseSize(): Promise<number>;

  /**
   * Calculate the size of a specific collection
   * @param collectionName Name of the collection
   * @returns Size in MB for the specified collection
   */
  calculateCollectionSize(collectionName: string): Promise<number>;

  /**
   * Get storage usage breakdown by collection
   * @returns Object mapping collection names to their sizes in MB
   */
  getStorageBreakdown(): Promise<Record<string, number>>;

  /**
   * Check if database size exceeds a threshold
   * @param thresholdMB Threshold in MB
   * @returns true if size exceeds threshold, false otherwise
   */
  exceedsThreshold(thresholdMB: number): Promise<boolean>;

  /**
   * Get storage efficiency metrics
   * @returns Object with efficiency metrics
   */
  getStorageEfficiency(): Promise<{
    totalSize: number;
    itemCount: number;
    averageItemSize: number;
    compression: number;
  }>;
}