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

  constructor(fs: FileSystemInterface, saveDebounceMs = 250) {
    this.fs = fs;
    this.saveDebounceMs = saveDebounceMs;
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
      try {
        await saveFunction();
        this.saveTimeouts.delete(collectionName);
      } catch (error) {
        console.error(`Failed to save collection ${collectionName} on queue:`, error);
      }
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
      const tempFile = `${dataFilePath}.tmp`;

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

      // Then rename to final file (more atomic operation)
      console.log(`Moving temporary file to final location ${dataFilePath}...`);
      if (this.fs.existsSync(dataFilePath)) {
        // Create a backup of the previous file
        const backupFile = `${dataFilePath}.bak`;
        this.fs.renameSync(dataFilePath, backupFile);
      }

      this.fs.renameSync(tempFile, dataFilePath);

      // Verify the file was written
      if (this.fs.existsSync(dataFilePath)) {
        const stats = this.fs.statSync(dataFilePath);
        console.log(`Successfully saved data with ${data.items.length} items to disk (size: ${stats.size} bytes)`);
      } else {
        console.error(`File write verification failed - file ${dataFilePath} doesn't exist after write`);
      }
    } catch (error) {
      console.error(`Failed to save data to disk:`, error);
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
    
    try {
      // Start JSON object
      stream.write('{\n  "items": [');
      
      // Serialize items in chunks to avoid memory/string length limits
      const items = data.items;
      const CHUNK_SIZE = 100; // Process 100 items at a time
      
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        
        for (let j = 0; j < chunk.length; j++) {
          const item = chunk[j];
          const itemIndex = i + j;
          
          // Add comma before item (except for first item)
          if (itemIndex > 0) {
            stream.write(',');
          }
          
          stream.write('\n    ');
          // Serialize each item with precision reduction to save space
          stream.write(JSON.stringify(item, this.jsonReplacer.bind(this), 4).replace(/\n/g, '\n    '));
        }
        
        // Yield control occasionally to prevent blocking
        if (i % (CHUNK_SIZE * 10) === 0 && i > 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }
      
      // Close items array and add metadata
      stream.write('\n  ],\n  "metadata": ');
      stream.write(JSON.stringify(data.metadata, this.jsonReplacer.bind(this), 2).replace(/\n/g, '\n  '));
      stream.write('\n}');
      
      // Close stream and wait for completion
      await new Promise((resolve, reject) => {
        stream.end((error: any) => {
          if (error) reject(error);
          else resolve(void 0);
        });
      });
    } catch (error) {
      stream.destroy();
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
  }
}