/**
 * Defines the interface for storage adapters.
 * This abstraction allows the StorageManager to work with different
 * underlying storage mechanisms (e.g., Obsidian's data.json,
 * in-memory for testing, potentially others like IndexedDB).
 */
export interface StorageAdapter {
  /**
   * Reads data associated with a given key.
   * @template T The expected type of the data.
   * @param key The key identifying the data to read.
   * @returns A promise that resolves with the data if found, or undefined otherwise.
   */
  read<T>(key: string): Promise<T | undefined>;

  /**
   * Writes data associated with a given key.
   * If the key already exists, its value will be overwritten.
   * @template T The type of the data being written.
   * @param key The key to associate with the data.
   * @param value The data to write.
   * @returns A promise that resolves when the write operation is complete.
   */
  write<T>(key: string, value: T): Promise<void>;

  /**
   * Deletes data associated with a given key.
   * If the key does not exist, the operation should succeed silently.
   * @param key The key identifying the data to delete.
   * @returns A promise that resolves when the delete operation is complete.
   */
  delete(key: string): Promise<void>;

  /**
   * Lists all keys currently stored by the adapter.
   * Useful for debugging, migration, or cleanup tasks.
   * @returns A promise that resolves with an array of stored keys.
   */
  list(): Promise<string[]>;
}
