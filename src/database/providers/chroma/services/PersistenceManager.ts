/**
 * PersistenceManager - Handles file system operations for collection persistence
 * Applies Single Responsibility Principle by focusing only on file I/O operations
 * Applies Dependency Inversion Principle through filesystem abstraction
 */

export interface FileSystemInterface {
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  writeFileSync(path: string, data: string): void;
  readFileSync(path: string, encoding: string): string;
  renameSync(oldPath: string, newPath: string): void;
  unlinkSync(path: string): void;
  readdirSync(path: string): string[];
  statSync(path: string): { isDirectory(): boolean; size: number };
  rmdirSync(path: string): void;
}

export interface PersistenceData {
  items: any[];
  metadata: Record<string, any>;
}

export class PersistenceManager {
  private fs: FileSystemInterface;
  private saveDebounceMs = 250;
  private saveTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private retryAttempts: Map<string, number> = new Map();
  private activeSaves: Set<string> = new Set(); // Track active save operations
  private maxRetries = 5;
  private baseRetryDelay = 100; // Base delay in milliseconds

  constructor(fs: FileSystemInterface, saveDebounceMs = 250, maxRetries = 5) {
    this.fs = fs;
    this.saveDebounceMs = saveDebounceMs;
    this.maxRetries = maxRetries;
  }

  /**
   * Ensure a directory exists, creating it if necessary
   * @param dirPath Directory path to ensure
   */
  ensureDirectory(dirPath: string): void {
    if (!this.fs.existsSync(dirPath)) {
      console.log(`Creating directory: ${dirPath}`);
      this.fs.mkdirSync(dirPath, { recursive: true });
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
      console.log(`Save already active for collection ${collectionName}, skipping duplicate`);
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
      console.log(`Successfully saved collection ${collectionName}${currentAttempt > 0 ? ` after ${currentAttempt} retries` : ''}`);
    } catch (error) {
      const nextAttempt = currentAttempt + 1;
      
      if (nextAttempt <= this.maxRetries && this.isRetryableError(error)) {
        console.warn(`Failed to save collection ${collectionName} (attempt ${nextAttempt}/${this.maxRetries}), retrying...`, error);
        
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
        console.error(`Failed to save collection ${collectionName} after ${currentAttempt} retries:`, error);
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
          console.warn(`${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`, error);
          
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
   * Save data to disk atomically using temporary file with chunked serialization
   * @param dataFilePath Final data file path
   * @param metaFilePath Metadata file path
   * @param data Data to save
   */
  async saveToFile(dataFilePath: string, metaFilePath: string, data: PersistenceData): Promise<void> {
    try {
      console.log(`Saving data to ${dataFilePath}...`);

      // Ensure the directory exists
      const path = require('path');
      const dirPath = path.dirname(dataFilePath);
      this.ensureDirectory(dirPath);

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
      console.log(`Writing metadata to ${metaFilePath}...`);
      this.fs.writeFileSync(metaFilePath, JSON.stringify(metadata, null, 2));

      // Save items to disk using a temp file for atomicity with chunked serialization
      // Use unique temp file name to avoid conflicts between concurrent saves
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const tempFile = `${dataFilePath}.tmp.${timestamp}.${randomSuffix}`;

      console.log(`Using unique temp file: ${tempFile}`);

      // Check collection size and warn if approaching limits
      const itemCount = data.items.length;
      if (itemCount > 10000) {
        console.warn(`Large collection detected: ${itemCount} items. Consider implementing collection splitting for better performance.`);
      }

      // First write to temp file using chunked serialization to handle large collections
      console.log(`Writing ${data.items.length} items to temporary file ${tempFile}...`);
      await this.writeChunkedJSON(tempFile, {
        items: data.items,
        metadata
      });

      // Validate temp file was created successfully
      if (!this.fs.existsSync(tempFile)) {
        throw new Error(`Temporary file ${tempFile} was not created successfully`);
      }

      // Validate temp file has reasonable size (not empty/corrupted)
      const tempFileStats = this.fs.statSync(tempFile);
      if (tempFileStats.size < 100) {
        throw new Error(`Temporary file ${tempFile} appears corrupted (size: ${tempFileStats.size} bytes)`);
      }

      // Then rename to final file (more atomic operation)
      console.log(`Moving temporary file to final location ${dataFilePath}...`);
      
      // Use retry logic for file operations
      if (this.fs.existsSync(dataFilePath)) {
        // Create a backup of the previous file
        const backupFile = `${dataFilePath}.bak`;
        await this.executeWithRetry(
          () => this.fs.renameSync(dataFilePath, backupFile),
          `Backup existing file ${dataFilePath}`,
          3
        );
      }

      await this.executeWithRetry(
        () => this.fs.renameSync(tempFile, dataFilePath),
        `Move temp file to final location ${dataFilePath}`,
        3
      );

      // Verify the file was written
      if (this.fs.existsSync(dataFilePath)) {
        const stats = this.fs.statSync(dataFilePath);
        console.log(`Successfully saved data with ${data.items.length} items to disk (size: ${stats.size} bytes)`);
      } else {
        console.error(`File write verification failed - file ${dataFilePath} doesn't exist after write`);
      }
    } catch (error) {
      console.error(`Failed to save data to disk:`, error);
      
      // Cleanup temp file if it exists
      const tempFile = `${dataFilePath}.tmp`;
      if (this.fs.existsSync(tempFile)) {
        try {
          this.fs.unlinkSync(tempFile);
          console.log(`Cleaned up temporary file ${tempFile}`);
        } catch (cleanupError) {
          console.warn(`Failed to cleanup temporary file ${tempFile}:`, cleanupError);
        }
      }
      
      // Classify error for better debugging
      const errorType = this.isRetryableError(error) ? 'transient' : 'permanent';
      console.error(`Save operation failed with ${errorType} error:`, error);
      
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
   * Write JSON data using chunked serialization to avoid string length limits
   * @param filePath File path to write to
   * @param data Data to serialize
   */
  private async writeChunkedJSON(filePath: string, data: any): Promise<void> {
    const fs = require('fs');
    const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
    
    // Track stream errors
    let streamError: any = null;
    stream.on('error', (error: any) => {
      streamError = error;
      console.error(`Write stream error for ${filePath}:`, error);
    });
    
    try {
      // Helper function to write with backpressure handling
      const writeWithBackpressure = async (data: string): Promise<void> => {
        if (streamError) {
          throw streamError;
        }
        
        return new Promise((resolve, reject) => {
          const needsDrain = !stream.write(data);
          if (needsDrain) {
            stream.once('drain', () => {
              if (streamError) reject(streamError);
              else resolve();
            });
            stream.once('error', reject);
          } else {
            // Check for immediate errors
            setImmediate(() => {
              if (streamError) reject(streamError);
              else resolve();
            });
          }
        });
      };

      // Start JSON object
      await writeWithBackpressure('{\n  "items": [');
      
      // Serialize items in chunks to avoid memory/string length limits
      const items = data.items;
      const CHUNK_SIZE = 50; // Reduced chunk size for better memory management
      
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        
        for (let j = 0; j < chunk.length; j++) {
          const item = chunk[j];
          const itemIndex = i + j;
          
          // Add comma before item (except for first item)
          if (itemIndex > 0) {
            await writeWithBackpressure(',');
          }
          
          await writeWithBackpressure('\n    ');
          
          // Serialize each item with precision reduction to save space
          const itemJson = JSON.stringify(item, this.jsonReplacer.bind(this), 4).replace(/\n/g, '\n    ');
          await writeWithBackpressure(itemJson);
        }
        
        // Yield control and check for errors more frequently
        if (i % CHUNK_SIZE === 0 && i > 0) {
          await new Promise(resolve => setImmediate(resolve));
          if (streamError) {
            throw streamError;
          }
        }
      }
      
      // Close items array and add metadata
      await writeWithBackpressure('\n  ],\n  "metadata": ');
      const metadataJson = JSON.stringify(data.metadata, this.jsonReplacer.bind(this), 2).replace(/\n/g, '\n  ');
      await writeWithBackpressure(metadataJson);
      await writeWithBackpressure('\n}');
      
      // Close stream and wait for completion
      await new Promise((resolve, reject) => {
        stream.end((error: any) => {
          if (error || streamError) {
            reject(error || streamError);
          } else {
            resolve(void 0);
          }
        });
      });
      
      console.log(`Successfully wrote chunked JSON to ${filePath}`);
    } catch (error) {
      console.error(`Failed to write chunked JSON to ${filePath}:`, error);
      stream.destroy();
      
      // Try to clean up the partial file
      try {
        if (this.fs.existsSync(filePath)) {
          this.fs.unlinkSync(filePath);
          console.log(`Cleaned up partial file ${filePath}`);
        }
      } catch (cleanupError) {
        console.warn(`Failed to cleanup partial file ${filePath}:`, cleanupError);
      }
      
      throw error;
    }
  }

  /**
   * Load data from disk
   * @param dataFilePath Data file path
   * @returns Loaded data or null if file doesn't exist
   */
  async loadFromFile(dataFilePath: string): Promise<PersistenceData | null> {
    try {
      // Check if the data file exists
      if (!this.fs.existsSync(dataFilePath)) {
        console.log(`No data file found at ${dataFilePath}, starting with empty data`);
        return null;
      }

      // Loading collection data

      // Read the data file
      const fileContents = this.fs.readFileSync(dataFilePath, 'utf8');
      if (!fileContents || fileContents.trim().length === 0) {
        console.log(`Data file at ${dataFilePath} is empty`);
        return null;
      }

      // Parse the JSON data
      const data = JSON.parse(fileContents);

      return {
        items: data.items || [],
        metadata: data.metadata || {}
      };
    } catch (error) {
      console.error(`Failed to load data from disk:`, error);
      throw new Error(`Failed to load data from disk: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List all subdirectories in a given directory
   * @param dirPath Directory path to scan
   * @returns Array of subdirectory names
   */
  listSubdirectories(dirPath: string): string[] {
    if (!this.fs.existsSync(dirPath)) {
      return [];
    }

    const dirContents = this.fs.readdirSync(dirPath);
    return dirContents.filter((item: string) => {
      const fullPath = `${dirPath}/${item}`;
      return this.fs.statSync(fullPath).isDirectory() && !item.startsWith('.');
    });
  }

  /**
   * Remove a directory and all its contents recursively
   * @param dirPath Directory path to remove
   */
  removeDirectory(dirPath: string): void {
    if (!this.fs.existsSync(dirPath)) {
      return;
    }

    try {
      const removeRecursive = (path: string) => {
        if (this.fs.existsSync(path)) {
          this.fs.readdirSync(path).forEach((file: string) => {
            const curPath = `${path}/${file}`;
            if (this.fs.statSync(curPath).isDirectory()) {
              removeRecursive(curPath);
            } else {
              this.fs.unlinkSync(curPath);
            }
          });
          this.fs.rmdirSync(path);
        }
      };

      removeRecursive(dirPath);
      console.log(`Removed directory ${dirPath} from disk`);
    } catch (error) {
      console.error(`Failed to remove directory ${dirPath}:`, error);
      throw new Error(`Failed to delete directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clean up any pending save operations
   */
  cleanup(): void {
    for (const [collectionName, timeout] of this.saveTimeouts.entries()) {
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
}