import { StorageAdapter } from "./adapter";
import { TypedEventEmitter, EventTypes } from "../types";

/**
 * Defines the specific event types related to storage operations.
 * Extends the base EventTypes.
 */
interface StorageEventTypes extends EventTypes {
  'storage:changed': { key: string; value: any; operation: 'write' | 'delete' };
  'storage:error': { key?: string; error: Error; operation: 'read' | 'write' | 'delete' | 'list' };
}

/**
 * Manages data persistence using a configurable storage adapter.
 * Provides a consistent API for storing and retrieving data, regardless
 * of the underlying storage mechanism. It also integrates with the
 * event system to notify other parts of the application about data changes.
 */
export class StorageManager {
  private adapter: StorageAdapter;
  private events: TypedEventEmitter<StorageEventTypes>;

  /**
   * Creates an instance of StorageManager.
   * @param adapter The storage adapter to use (e.g., ObsidianStorageAdapter).
   * @param eventEmitter The application's event emitter for notifications.
   */
  constructor(adapter: StorageAdapter, eventEmitter: TypedEventEmitter<StorageEventTypes>) {
    this.adapter = adapter;
    this.events = eventEmitter;
  }

  /**
   * Reads data for a specific key using the configured adapter.
   * Emits a 'storage:error' event if the read operation fails.
   * @template T The expected type of the data.
   * @param key The key of the data to read.
   * @returns A promise resolving to the data or undefined if not found or on error.
   */
  async read<T>(key: string): Promise<T | undefined> {
    try {
      return await this.adapter.read<T>(key);
    } catch (error) {
      console.error(`StorageManager: Error reading key "${key}":`, error);
      this.events.emit('storage:error', { key, error: error as Error, operation: 'read' });
      return undefined; // Return undefined on error to prevent downstream issues
    }
  }

  /**
   * Writes data for a specific key using the configured adapter.
   * Emits 'storage:changed' on successful write.
   * Emits 'storage:error' if the write operation fails.
   * @template T The type of the data being written.
   * @param key The key to write data under.
   * @param value The data to write.
   * @returns A promise resolving when the write is complete, or rejecting on error.
   */
  async write<T>(key: string, value: T): Promise<void> {
    try {
      await this.adapter.write<T>(key, value);
      // Emit change event *after* successful write
      this.events.emit('storage:changed', { key, value, operation: 'write' });
    } catch (error) {
      console.error(`StorageManager: Error writing key "${key}":`, error);
      this.events.emit('storage:error', { key, error: error as Error, operation: 'write' });
      throw error; // Re-throw the error after emitting the event
    }
  }

  /**
   * Deletes data associated with a specific key using the configured adapter.
   * Emits 'storage:changed' on successful delete if the key existed.
   * Emits 'storage:error' if the delete operation fails.
   * @param key The key of the data to delete.
   * @returns A promise resolving when the delete is complete, or rejecting on error.
   */
  async delete(key: string): Promise<void> {
    try {
      // Optionally, check if the key exists before deleting to only emit 'changed' if something was actually removed.
      // const exists = await this.adapter.read(key) !== undefined;
      await this.adapter.delete(key);
      // Emit change event *after* successful delete
      // Consider only emitting if 'exists' was true, depending on desired notification behavior.
      this.events.emit('storage:changed', { key, value: undefined, operation: 'delete' });
    } catch (error) {
      console.error(`StorageManager: Error deleting key "${key}":`, error);
      this.events.emit('storage:error', { key, error: error as Error, operation: 'delete' });
      throw error; // Re-throw the error after emitting the event
    }
  }

  /**
   * Lists all keys currently stored by the adapter.
   * Emits 'storage:error' if the list operation fails.
   * @returns A promise resolving to an array of keys, or an empty array on error.
   */
  async list(): Promise<string[]> {
    try {
      return await this.adapter.list();
    } catch (error) {
      console.error("StorageManager: Error listing keys:", error);
      this.events.emit('storage:error', { error: error as Error, operation: 'list' });
      return []; // Return empty array on error
    }
  }

  /**
   * Provides direct access to the underlying adapter if needed for specific operations
   * not covered by the manager's API. Use with caution.
   * @returns The configured StorageAdapter instance.
   */
  getAdapter(): StorageAdapter {
    return this.adapter;
  }
}
