/**
 * PersistenceManager - Handles file system operations for collection persistence
 * CONSOLIDATED: Now includes DirectoryService functionality for Obsidian integration
 * Applies Single Responsibility Principle by focusing only on file I/O operations
 * Uses Obsidian Vault API for all file operations instead of Node.js fs module
 * Enhanced with Obsidian Plugin API support for advanced directory operations
 */

import { App, normalizePath, Plugin } from 'obsidian';
import { getErrorMessage } from '../../../../utils/errorUtils';

export interface PersistenceData {
  items: any[];
  metadata: Record<string, any>;
}

export class PersistenceManager {
  private app: App;
  private plugin?: Plugin; // Optional Obsidian plugin for enhanced operations
  private saveDebounceMs = 250;
  private saveTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private retryAttempts: Map<string, number> = new Map();
  private activeSaves: Set<string> = new Set(); // Track active save operations
  private maxRetries = 5;
  private baseRetryDelay = 100; // Base delay in milliseconds

  constructor(
    app: App,
    saveDebounceMs = 250, 
    maxRetries = 5, 
    plugin?: Plugin
  ) {
    this.app = app;
    this.plugin = plugin;
    this.saveDebounceMs = saveDebounceMs;
    this.maxRetries = maxRetries;
    console.log('[PersistenceManager] Initialized with Obsidian App instance');
  }

  /**
   * Ensure a directory exists, creating it if necessary
   * Uses Obsidian Vault API for directory operations
   * @param dirPath Directory path to ensure
   */
  async ensureDirectory(dirPath: string): Promise<void> {
    const normalizedPath = normalizePath(dirPath);
    const exists = await this.app.vault.adapter.exists(normalizedPath);
    if (!exists) {
      console.log(`[PersistenceManager] Creating directory: ${normalizedPath}`);
      await this.app.vault.adapter.mkdir(normalizedPath);
    } else {
      console.log(`[PersistenceManager] Directory already exists: ${normalizedPath}`);
    }
  }

  /**
   * Queue a save operation to prevent excessive disk I/O
   * @param collectionName Collection name for the save operation
   * @param saveFunction Function to execute for saving
   */
  queueSave(collectionName: string, saveFunction: () => Promise<void>): void {
    const existingTimeout = this.saveTimeouts.get(collectionName);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(async () => {
      await this.executeSaveWithRetry(collectionName, saveFunction);
    }, this.saveDebounceMs);

    this.saveTimeouts.set(collectionName, timeout);
  }

  /**
   * Cancel queued save for a collection
   * @param collectionName Collection name
   */
  cancelQueuedSave(collectionName: string): void {
    const timeout = this.saveTimeouts.get(collectionName);
    if (timeout) {
      clearTimeout(timeout);
      this.saveTimeouts.delete(collectionName);
    }
    // Reset retry attempts and active save tracking when canceling
    this.retryAttempts.delete(collectionName);
    this.activeSaves.delete(collectionName);
  }

  /**
   * Execute save function with retry logic
   * @param collectionName Collection name for tracking retries
   * @param saveFunction Function to execute for saving
   */
  private async executeSaveWithRetry(collectionName: string, saveFunction: () => Promise<void>): Promise<void> {
    // Check if a save is already active for this collection
    if (this.activeSaves.has(collectionName)) {
      console.log(`[PersistenceManager] Save already active for collection ${collectionName}, skipping duplicate`);
      return;
    }

    // Mark this collection as having an active save
    this.activeSaves.add(collectionName);
    
    const currentAttempt = this.retryAttempts.get(collectionName) || 0;
    
    try {
      await saveFunction();
      // Success - cleanup tracking
      this.saveTimeouts.delete(collectionName);
      this.retryAttempts.delete(collectionName);
      this.activeSaves.delete(collectionName);
      console.log(`[PersistenceManager] Successfully saved collection ${collectionName}${currentAttempt > 0 ? ` after ${currentAttempt} retries` : ''}`);
    } catch (error) {
      const nextAttempt = currentAttempt + 1;
      
      if (nextAttempt <= this.maxRetries && this.isRetryableError(error)) {
        console.warn(`[PersistenceManager] Failed to save collection ${collectionName} (attempt ${nextAttempt}/${this.maxRetries}), retrying...`, error);
        
        // Update retry count
        this.retryAttempts.set(collectionName, nextAttempt);
        
        // Calculate exponential backoff delay
        const delay = this.baseRetryDelay * Math.pow(2, currentAttempt);
        
        // Schedule retry (but keep the save marked as active)
        const timeout = setTimeout(async () => {
          await this.executeSaveWithRetry(collectionName, saveFunction);
        }, delay);
        
        this.saveTimeouts.set(collectionName, timeout);
      } else {
        // Max retries reached or non-retryable error
        console.error(`[PersistenceManager] Failed to save collection ${collectionName} after ${currentAttempt} retries:`, error);
        this.saveTimeouts.delete(collectionName);
        this.retryAttempts.delete(collectionName);
        this.activeSaves.delete(collectionName);
        throw error;
      }
    }
  }

  /**
   * Determine if an error is retryable (transient vs permanent)
   * @param error Error to check
   * @returns True if error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (!error) return false;
    
    const errorMessage = error.message || error.toString();
    const errorCode = error.code;
    
    // Retryable error codes and messages
    const retryableErrors = [
      'ENOENT',    // File not found (temporary)
      'EPERM',     // Permission denied (temporary)
      'EBUSY',     // Resource busy
      'EEXIST',    // File exists (race condition)
      'EMFILE',    // Too many open files
      'EAGAIN',    // Resource temporarily unavailable
      'ENOTDIR',   // Not a directory (race condition)
    ];
    
    // Check error code
    if (errorCode && retryableErrors.includes(errorCode)) {
      return true;
    }
    
    // Check error message for Windows-specific issues
    const retryableMessages = [
      'no such file or directory',
      'resource busy',
      'permission denied',
      'file exists',
      'access denied',
      'sharing violation',
      'being used by another process'
    ];
    
    return retryableMessages.some(msg => errorMessage.toLowerCase().includes(msg));
  }

  /**
   * Execute a file system operation with retry logic
   * @param operation Function to execute
   * @param operationName Name of the operation for logging
   * @param maxRetries Maximum number of retries (default 3 for file operations)
   * @returns Result of the operation
   */
  private async executeWithRetry<T>(
    operation: () => T,
    operationName: string,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return operation();
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries && this.isRetryableError(error)) {
          const delay = this.baseRetryDelay * Math.pow(2, attempt);
          console.warn(`[PersistenceManager] ${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`, error);
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // Max retries reached or non-retryable error
          break;
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Save data to disk using Obsidian Vault API
   * @param dataFilePath Final data file path
   * @param metaFilePath Metadata file path
   * @param data Data to save
   */
  async saveToFile(dataFilePath: string, metaFilePath: string, data: PersistenceData): Promise<void> {
    try {
      console.log(`[PersistenceManager] Saving data to ${dataFilePath}...`);

      // Ensure the directory exists
      const dirPath = dataFilePath.substring(0, dataFilePath.lastIndexOf('/'));
      await this.ensureDirectory(dirPath);

      // Add timestamp to metadata while preserving existing version and itemCount
      const metadata = {
        ...data.metadata,
        // Only override itemCount if metadata doesn't already have it (for metadata-only saves)
        itemCount: data.metadata.itemCount || data.items.length,
        savedAt: new Date().toISOString(),
        // Only set version to 1.0.0 if no version exists
        ...(data.metadata.version ? {} : { version: "1.0.0" })
      };

      // Save metadata to disk
      console.log(`[PersistenceManager] Writing metadata to ${metaFilePath}...`);
      const normalizedMetaPath = normalizePath(metaFilePath);
      await this.app.vault.adapter.write(normalizedMetaPath, JSON.stringify(metadata, null, 2));

      // Write data to final file (Obsidian API handles atomicity)
      console.log(`[PersistenceManager] Writing ${data.items.length} items to ${dataFilePath}...`);
      const jsonData = JSON.stringify({
        items: data.items,
        metadata
      }, this.jsonReplacer.bind(this), 2);
      
      const normalizedDataPath = normalizePath(dataFilePath);
      await this.app.vault.adapter.write(normalizedDataPath, jsonData);

      // Validate file was created successfully
      if (!await this.app.vault.adapter.exists(normalizedDataPath)) {
        throw new Error(`File ${dataFilePath} was not created successfully`);
      }

      // Validate file has reasonable size (not empty/corrupted)
      const fileStats = await this.app.vault.adapter.stat(normalizedDataPath);
      if (!fileStats || fileStats.size < 100) {
        throw new Error(`File ${dataFilePath} appears corrupted (size: ${fileStats?.size || 0} bytes)`);
      }

      // Verify the file was written
      if (await this.app.vault.adapter.exists(normalizedDataPath)) {
        const stats = await this.app.vault.adapter.stat(normalizedDataPath);
        console.log(`[PersistenceManager] Successfully saved data with ${data.items.length} items to disk (size: ${stats?.size || 0} bytes)`);
      } else {
        console.error(`[PersistenceManager] File write verification failed - file ${dataFilePath} doesn't exist after write`);
      }
    } catch (error) {
      console.error(`[PersistenceManager] Failed to save data to disk:`, error);
      
      // Classify error for better debugging
      const errorType = this.isRetryableError(error) ? 'transient' : 'permanent';
      console.error(`[PersistenceManager] Save operation failed with ${errorType} error:`, error);
      
      throw error;
    }
  }

  /**
   * Custom JSON replacer to reduce float precision and save storage space
   * @param key Property key
   * @param value Property value
   * @returns Processed value with reduced precision for floats
   */
  private jsonReplacer(key: string, value: any): any {
    // Reduce precision for embedding arrays to save significant storage space
    if (key === 'embedding' && Array.isArray(value)) {
      return value.map(num => typeof num === 'number' ? parseFloat(num.toFixed(6)) : num);
    }
    // Reduce precision for any other floating point numbers
    if (typeof value === 'number' && !Number.isInteger(value)) {
      return parseFloat(value.toFixed(6));
    }
    return value;
  }

  /**
   * Load data from disk using Obsidian Vault API
   * @param dataFilePath Data file path
   * @returns Loaded data or null if file doesn't exist
   */
  async loadFromFile(dataFilePath: string): Promise<PersistenceData | null> {
    try {
      const normalizedPath = normalizePath(dataFilePath);
      
      // Check if the data file exists
      if (!await this.app.vault.adapter.exists(normalizedPath)) {
        console.log(`[PersistenceManager] No data file found at ${dataFilePath}, starting with empty data`);
        return null;
      }

      // Read the data file
      const fileContents = await this.app.vault.adapter.read(normalizedPath);
      if (!fileContents || fileContents.trim().length === 0) {
        console.log(`[PersistenceManager] Data file at ${dataFilePath} is empty`);
        return null;
      }

      // Parse the JSON data
      const data = JSON.parse(fileContents);

      console.log(`[PersistenceManager] Successfully loaded ${data.items?.length || 0} items from ${dataFilePath}`);
      return {
        items: data.items || [],
        metadata: data.metadata || {}
      };
    } catch (error) {
      console.error(`[PersistenceManager] Failed to load data from disk:`, error);
      throw new Error(`Failed to load data from disk: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List all subdirectories in a given directory using Obsidian API
   * @param dirPath Directory path to scan
   * @returns Array of subdirectory names
   */
  async listSubdirectories(dirPath: string): Promise<string[]> {
    const normalizedPath = normalizePath(dirPath);
    
    if (!await this.app.vault.adapter.exists(normalizedPath)) {
      console.log(`[PersistenceManager] Directory does not exist: ${dirPath}`);
      return [];
    }

    try {
      const listing = await this.app.vault.adapter.list(normalizedPath);
      const subdirs = listing.folders.map(folderPath => {
        const parts = folderPath.split('/');
        return parts[parts.length - 1];
      }).filter(name => !name.startsWith('.'));
      
      console.log(`[PersistenceManager] Found ${subdirs.length} subdirectories in ${dirPath}`);
      return subdirs;
    } catch (error) {
      console.error(`[PersistenceManager] Failed to list subdirectories in ${dirPath}:`, error);
      return [];
    }
  }

  /**
   * Remove a directory and all its contents recursively using Obsidian API
   * @param dirPath Directory path to remove
   */
  async removeDirectory(dirPath: string): Promise<void> {
    const normalizedPath = normalizePath(dirPath);
    
    if (!await this.app.vault.adapter.exists(normalizedPath)) {
      console.log(`[PersistenceManager] Directory does not exist, nothing to remove: ${dirPath}`);
      return;
    }

    try {
      const removeRecursive = async (path: string) => {
        if (await this.app.vault.adapter.exists(path)) {
          const listing = await this.app.vault.adapter.list(path);
          
          // Remove all files first
          for (const filePath of listing.files) {
            console.log(`[PersistenceManager] Removing file: ${filePath}`);
            await this.app.vault.adapter.remove(filePath);
          }
          
          // Remove subdirectories recursively
          for (const folderPath of listing.folders) {
            await removeRecursive(folderPath);
          }
          
          // Remove the empty directory
          console.log(`[PersistenceManager] Removing directory: ${path}`);
          await this.app.vault.adapter.rmdir(path, true);
        }
      };

      await removeRecursive(normalizedPath);
      console.log(`[PersistenceManager] Successfully removed directory ${dirPath} from disk`);
    } catch (error) {
      console.error(`[PersistenceManager] Failed to remove directory ${dirPath}:`, error);
      throw new Error(`Failed to delete directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clean up any pending save operations
   */
  cleanup(): void {
    console.log(`[PersistenceManager] Cleaning up ${this.saveTimeouts.size} pending save operations`);
    for (const [collectionName, timeout] of Array.from(this.saveTimeouts.entries())) {
      clearTimeout(timeout);
    }
    this.saveTimeouts.clear();
    this.retryAttempts.clear();
    this.activeSaves.clear();
  }

  /**
   * Get current retry status for debugging
   * @returns Map of collection names to retry attempts
   */
  getRetryStatus(): Map<string, number> {
    return new Map(this.retryAttempts);
  }

  // ============================================================================
  // OBSIDIAN DIRECTORY SERVICE FUNCTIONALITY (CONSOLIDATED)
  // ============================================================================

  /**
   * Ensure a directory exists using Obsidian API (async version)
   * Enhanced version that uses Obsidian's Plugin API
   */
  async ensureDirectoryExists(path: string): Promise<void> {
    try {
      const normalizedPath = normalizePath(path);
      if (!await this.app.vault.adapter.exists(normalizedPath)) {
        console.log(`[PersistenceManager] Creating directory: ${normalizedPath}`);
        await this.app.vault.adapter.mkdir(normalizedPath);
      } else {
        console.log(`[PersistenceManager] Directory already exists: ${normalizedPath}`);
      }
    } catch (error) {
      console.error(`[PersistenceManager] Failed to ensure directory exists ${path}:`, error);
      throw new Error(`Failed to ensure directory exists ${path}: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Calculate the size of a directory in MB using Obsidian API
   */
  async calculateDirectorySize(directoryPath: string): Promise<number> {
    const calculateSize = async (dirPath: string): Promise<number> => {
      let totalSize = 0;
      
      try {
        const listing = await this.app.vault.adapter.list(dirPath);
        
        // Calculate size of files
        for (const file of listing.files) {
          try {
            const stat = await this.app.vault.adapter.stat(file);
            if (stat?.size) {
              totalSize += stat.size;
            }
          } catch (error) {
            // Skip files we can't stat
            console.warn(`[PersistenceManager] Unable to stat file ${file}: ${getErrorMessage(error)}`);
          }
        }
        
        // Recursively calculate size of subdirectories
        for (const folder of listing.folders) {
          totalSize += await calculateSize(folder);
        }
      } catch (error) {
        // If we can't read a directory, skip it and continue
        console.warn(`[PersistenceManager] Unable to read directory ${dirPath}: ${getErrorMessage(error)}`);
      }
      
      return totalSize;
    };
    
    try {
      const normalizedPath = normalizePath(directoryPath);
      const sizeInBytes = await calculateSize(normalizedPath);
      return sizeInBytes / (1024 * 1024); // Convert to MB
    } catch (error) {
      console.error(`[PersistenceManager] Error calculating size of directory ${directoryPath}:`, error);
      return 0;
    }
  }

  /**
   * Validate directory permissions using Obsidian API
   */
  async validateDirectoryPermissions(path: string): Promise<boolean> {
    try {
      const normalizedPath = normalizePath(path);
      
      if (!await this.directoryExists(normalizedPath)) {
        return false;
      }
      
      // Try to write a test file to check permissions
      const testFilePath = normalizePath(`${normalizedPath}/.test_write`);
      await this.app.vault.adapter.write(testFilePath, 'test');
      await this.app.vault.adapter.remove(testFilePath);
      
      console.log(`[PersistenceManager] Directory permissions validated for ${path}`);
      return true;
    } catch (error) {
      console.error(`[PersistenceManager] Permission check failed for ${path}:`, error);
      return false;
    }
  }

  /**
   * Check if a directory exists using Obsidian API
   */
  async directoryExists(path: string): Promise<boolean> {
    try {
      const normalizedPath = normalizePath(path);
      const stat = await this.app.vault.adapter.stat(normalizedPath);
      return stat?.type === 'folder';
    } catch (error) {
      return false;
    }
  }

  /**
   * Get directory contents using Obsidian API
   */
  async readDirectory(path: string): Promise<string[]> {
    try {
      const normalizedPath = normalizePath(path);
      if (!await this.app.vault.adapter.exists(normalizedPath)) {
        return [];
      }
      const listing = await this.app.vault.adapter.list(normalizedPath);
      // Return both files and folders, extract just the names
      return [...listing.files, ...listing.folders].map(fullPath => {
        const parts = fullPath.split('/');
        return parts[parts.length - 1];
      });
    } catch (error) {
      console.error(`[PersistenceManager] Failed to read directory ${path}: ${getErrorMessage(error)}`);
      throw new Error(`Failed to read directory ${path}: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Get file/directory stats using Obsidian API
   */
  async getStats(path: string): Promise<any> {
    try {
      const normalizedPath = normalizePath(path);
      const stats = await this.app.vault.adapter.stat(normalizedPath);
      console.log(`[PersistenceManager] Got stats for ${path}: ${stats?.type}, ${stats?.size} bytes`);
      return stats;
    } catch (error) {
      console.error(`[PersistenceManager] Failed to get stats for ${path}: ${getErrorMessage(error)}`);
      throw new Error(`Failed to get stats for ${path}: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Calculate size of specific memory collection directories
   */
  async calculateMemoryCollectionsSize(collectionsPath: string): Promise<number> {
    const memoryCollections = ['memory_traces', 'sessions', 'snapshots'];
    let totalSize = 0;

    try {
      const normalizedCollectionsPath = normalizePath(collectionsPath);
      
      if (!await this.directoryExists(normalizedCollectionsPath)) {
        return 0;
      }

      for (const collectionName of memoryCollections) {
        const collectionPath = normalizePath(`${normalizedCollectionsPath}/${collectionName}`);
        
        if (await this.directoryExists(collectionPath)) {
          const sizeInMB = await this.calculateDirectorySize(collectionPath);
          totalSize += sizeInMB;
        }
      }

      console.log(`[PersistenceManager] Memory collections total size: ${totalSize.toFixed(2)} MB`);
      return totalSize;
    } catch (error) {
      console.error('[PersistenceManager] Error calculating memory collections size:', error);
      return 0;
    }
  }

  /**
   * Calculate size of a specific collection directory
   */
  async calculateCollectionSize(collectionsPath: string, collectionName: string): Promise<number> {
    try {
      const normalizedCollectionsPath = normalizePath(collectionsPath);
      const collectionPath = normalizePath(`${normalizedCollectionsPath}/${collectionName}`);
      
      if (!await this.directoryExists(collectionPath)) {
        return 0;
      }

      const size = await this.calculateDirectorySize(collectionPath);
      console.log(`[PersistenceManager] Collection ${collectionName} size: ${size.toFixed(2)} MB`);
      return size;
    } catch (error) {
      console.error(`[PersistenceManager] Error calculating size for collection ${collectionName}:`, error);
      return 0;
    }
  }

  /**
   * Get breakdown of collection sizes
   */
  async getCollectionSizeBreakdown(collectionsPath: string): Promise<Record<string, number>> {
    const breakdown: Record<string, number> = {};

    try {
      const normalizedCollectionsPath = normalizePath(collectionsPath);
      
      if (!await this.directoryExists(normalizedCollectionsPath)) {
        return breakdown;
      }

      const collections = await this.readDirectory(normalizedCollectionsPath);
      
      for (const collectionName of collections) {
        const collectionPath = normalizePath(`${normalizedCollectionsPath}/${collectionName}`);
        
        if (await this.directoryExists(collectionPath)) {
          breakdown[collectionName] = await this.calculateDirectorySize(collectionPath);
        }
      }
      
      console.log(`[PersistenceManager] Collection size breakdown:`, breakdown);
    } catch (error) {
      console.error('[PersistenceManager] Error getting collection size breakdown:', error);
    }

    return breakdown;
  }

  /**
   * Check if a file exists using Obsidian API
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      const normalizedPath = normalizePath(filePath);
      const stat = await this.app.vault.adapter.stat(normalizedPath);
      return stat?.type === 'file';
    } catch (error) {
      return false;
    }
  }

  /**
   * Read file contents using Obsidian API
   */
  async readFile(filePath: string, encoding: string = 'utf8'): Promise<string> {
    try {
      const normalizedPath = normalizePath(filePath);
      const content = await this.app.vault.adapter.read(normalizedPath);
      console.log(`[PersistenceManager] Successfully read file ${filePath} (${content.length} characters)`);
      return content;
    } catch (error) {
      console.error(`[PersistenceManager] File read failed for ${filePath}: ${getErrorMessage(error)}`);
      throw new Error(`File read failed for ${filePath}: ${getErrorMessage(error)}`);
    }
  }
}