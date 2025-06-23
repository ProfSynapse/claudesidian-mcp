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
  private saveDebounceMs: number = 250;
  private saveTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(fs: FileSystemInterface, saveDebounceMs: number = 250) {
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
   * Save data to disk atomically using temporary file
   * @param dataFilePath Final data file path
   * @param metaFilePath Metadata file path
   * @param data Data to save
   */
  async saveToFile(dataFilePath: string, metaFilePath: string, data: PersistenceData): Promise<void> {
    try {
      console.log(`Saving data to ${dataFilePath}...`);

      // Ensure the directory exists
      const dirPath = dataFilePath.substring(0, dataFilePath.lastIndexOf('/'));
      this.ensureDirectory(dirPath);

      // Add timestamp to metadata
      const metadata = {
        ...data.metadata,
        itemCount: data.items.length,
        savedAt: new Date().toISOString(),
        version: "1.0.0"
      };

      // Save metadata to disk
      console.log(`Writing metadata to ${metaFilePath}...`);
      this.fs.writeFileSync(metaFilePath, JSON.stringify(metadata, null, 2));

      // Save items to disk using a temp file for atomicity
      const tempFile = `${dataFilePath}.tmp`;

      // First write to temp file
      console.log(`Writing ${data.items.length} items to temporary file ${tempFile}...`);
      this.fs.writeFileSync(tempFile, JSON.stringify({
        items: data.items,
        metadata
      }, null, 2));

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

      console.log(`Loading data from ${dataFilePath}...`);

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