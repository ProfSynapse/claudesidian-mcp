/**
 * Interface for directory management operations
 * Handles all filesystem operations with proper error handling
 */
export interface IDirectoryService {
  /**
   * Ensure a directory exists, creating it if necessary
   * @param path Directory path to ensure exists
   * @throws Error if directory creation fails
   */
  ensureDirectoryExists(path: string): void;

  /**
   * Calculate the size of a directory in MB
   * @param directoryPath Path to the directory
   * @returns Size in MB
   */
  calculateDirectorySize(directoryPath: string): Promise<number>;

  /**
   * Validate directory permissions (read/write access)
   * @param path Directory path to validate
   * @returns true if permissions are OK, false otherwise
   */
  validateDirectoryPermissions(path: string): boolean;

  /**
   * Check if a directory exists
   * @param path Directory path to check
   * @returns true if directory exists, false otherwise
   */
  directoryExists(path: string): boolean;

  /**
   * Get directory contents
   * @param path Directory path to read
   * @returns Array of file/directory names
   */
  readDirectory(path: string): string[];

  /**
   * Get file/directory stats
   * @param path Path to get stats for
   * @returns File stats object
   */
  getStats(path: string): any;

  /**
   * Calculate size of specific memory collections
   * @param collectionsPath Path to the collections directory
   * @returns Size in MB for memory collections
   */
  calculateMemoryCollectionsSize(collectionsPath: string): Promise<number>;

  /**
   * Calculate size of a specific collection
   * @param collectionsPath Path to the collections directory
   * @param collectionName Name of the collection
   * @returns Size in MB for the collection
   */
  calculateCollectionSize(collectionsPath: string, collectionName: string): Promise<number>;

  /**
   * Get breakdown of collection sizes
   * @param collectionsPath Path to the collections directory
   * @returns Object mapping collection names to their sizes in MB
   */
  getCollectionSizeBreakdown(collectionsPath: string): Promise<Record<string, number>>;
}