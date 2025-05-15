import { Plugin } from "obsidian";
import { StorageAdapter } from "./adapter";

/**
 * Storage adapter implementation using Obsidian's built-in plugin data storage.
 * This adapter interacts with the `data.json` file managed by the plugin.
 * It assumes that the plugin's data object is a simple key-value store
 * at the top level.
 */
export class ObsidianStorageAdapter implements StorageAdapter {
  // Keep a reference to the plugin instance to access loadData and saveData.
  private plugin: Plugin;
  // Cache the loaded data to avoid redundant reads from disk.
  private dataCache: Record<string, any> | null = null;

  /**
   * Creates an instance of ObsidianStorageAdapter.
   * @param plugin The Obsidian Plugin instance.
   */
  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  /**
   * Ensures the data cache is loaded from the plugin's storage.
   * Loads the data only if the cache is currently null.
   * @private
   * @returns A promise that resolves when the data is loaded into the cache.
   */
  private async ensureCacheLoaded(): Promise<void> {
    if (this.dataCache === null) {
      // Use plugin.loadData() which reads and parses data.json.
      // Default to an empty object if no data exists yet.
      this.dataCache = (await this.plugin.loadData()) || {};
    }
  }

  /**
   * Reads data for a specific key from the plugin's storage.
   * @template T The expected type of the data.
   * @param key The key of the data to read.
   * @returns A promise resolving to the data or undefined if the key doesn't exist.
   */
  async read<T>(key: string): Promise<T | undefined> {
    await this.ensureCacheLoaded();
    // Access the data directly from the cache.
    // The type assertion `as T` assumes the caller knows the expected type.
    return this.dataCache?.[key] as T | undefined;
  }

  /**
   * Writes data for a specific key to the plugin's storage.
   * Updates the cache and then saves the entire data object back to disk.
   * @template T The type of the data being written.
   * @param key The key to write data under.
   * @param value The data to write.
   * @returns A promise resolving when the data has been saved.
   */
  async write<T>(key: string, value: T): Promise<void> {
    await this.ensureCacheLoaded();
    // Update the value in the cache.
    if (this.dataCache) {
      this.dataCache[key] = value;
      // Use plugin.saveData() which serializes and writes the entire cache to data.json.
      await this.plugin.saveData(this.dataCache);
    } else {
      // This case should ideally not happen after ensureCacheLoaded, but handle defensively.
      console.error("ObsidianStorageAdapter: Data cache is unexpectedly null during write.");
      // Attempt to write anyway, creating a new data object.
      this.dataCache = { [key]: value };
      await this.plugin.saveData(this.dataCache);
    }
  }

  /**
   * Deletes data associated with a specific key from the plugin's storage.
   * Removes the key from the cache and saves the updated data object.
   * @param key The key of the data to delete.
   * @returns A promise resolving when the data has been saved after deletion.
   */
  async delete(key: string): Promise<void> {
    await this.ensureCacheLoaded();
    if (this.dataCache && key in this.dataCache) {
      // Delete the key from the cache.
      delete this.dataCache[key];
      // Save the modified cache back to disk.
      await this.plugin.saveData(this.dataCache);
    }
    // If the key doesn't exist, do nothing, fulfilling the interface contract.
  }

  /**
   * Lists all keys currently stored in the plugin's data.
   * @returns A promise resolving to an array of keys.
   */
  async list(): Promise<string[]> {
    await this.ensureCacheLoaded();
    // Return the keys from the cached data object.
    return this.dataCache ? Object.keys(this.dataCache) : [];
  }

  /**
   * Clears the internal data cache. Subsequent reads will reload from disk.
   * Useful if the data might have been modified externally.
   */
  public clearCache(): void {
    this.dataCache = null;
  }
}
