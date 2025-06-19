import { IDirectoryService } from './interfaces/IDirectoryService';
import { getErrorMessage } from '../../../../utils/errorUtils';

/**
 * Directory service implementation
 * Handles all filesystem operations with proper error handling and validation
 * Follows SRP - only responsible for directory/file operations
 */
export class DirectoryService implements IDirectoryService {
  private fs: any;
  private path: any;

  constructor() {
    this.fs = require('fs');
    this.path = require('path');
  }

  /**
   * Ensure a directory exists, creating it if necessary
   */
  ensureDirectoryExists(path: string): void {
    try {
      if (!this.fs.existsSync(path)) {
        this.fs.mkdirSync(path, { recursive: true });
      }
    } catch (error) {
      throw new Error(`Directory creation failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Calculate the size of a directory in MB
   */
  async calculateDirectorySize(directoryPath: string): Promise<number> {
    const { promisify } = require('util');
    const readdirAsync = promisify(this.fs.readdir);
    const statAsync = promisify(this.fs.stat);
    
    const calculateSize = async (dirPath: string): Promise<number> => {
      let totalSize = 0;
      
      try {
        const items = await readdirAsync(dirPath);
        
        for (const item of items) {
          const itemPath = this.path.join(dirPath, item);
          const stats = await statAsync(itemPath);
          
          if (stats.isDirectory()) {
            totalSize += await calculateSize(itemPath);
          } else {
            totalSize += stats.size;
          }
        }
      } catch (error) {
        // If we can't read a directory, skip it and continue
        console.warn(`Unable to read directory ${dirPath}: ${getErrorMessage(error)}`);
      }
      
      return totalSize;
    };
    
    try {
      const sizeInBytes = await calculateSize(directoryPath);
      return sizeInBytes / (1024 * 1024); // Convert to MB
    } catch (error) {
      console.error(`Error calculating size of directory ${directoryPath}:`, error);
      return 0;
    }
  }

  /**
   * Validate directory permissions (read/write access)
   */
  validateDirectoryPermissions(path: string): boolean {
    try {
      if (!this.directoryExists(path)) {
        return false;
      }
      
      // Try to write a test file to check permissions
      const testFilePath = this.path.join(path, '.test_write');
      this.fs.writeFileSync(testFilePath, 'test');
      this.fs.unlinkSync(testFilePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if a directory exists
   */
  directoryExists(path: string): boolean {
    try {
      return this.fs.existsSync(path) && this.fs.statSync(path).isDirectory();
    } catch (error) {
      return false;
    }
  }

  /**
   * Get directory contents
   */
  readDirectory(path: string): string[] {
    try {
      if (!this.directoryExists(path)) {
        return [];
      }
      return this.fs.readdirSync(path);
    } catch (error) {
      throw new Error(`Failed to read directory ${path}: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Get file/directory stats
   */
  getStats(path: string): any {
    try {
      return this.fs.statSync(path);
    } catch (error) {
      throw new Error(`Failed to get stats for ${path}: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Calculate size of specific collection directories
   */
  async calculateMemoryCollectionsSize(collectionsPath: string): Promise<number> {
    const memoryCollections = ['memory_traces', 'sessions', 'snapshots'];
    let totalSize = 0;

    try {
      if (!this.directoryExists(collectionsPath)) {
        return 0;
      }

      for (const collectionName of memoryCollections) {
        const collectionPath = this.path.join(collectionsPath, collectionName);
        
        if (this.directoryExists(collectionPath)) {
          const sizeInBytes = await this.calculateDirectorySize(collectionPath);
          totalSize += sizeInBytes;
        }
      }

      return totalSize;
    } catch (error) {
      console.error('Error calculating memory collections size:', error);
      return 0;
    }
  }

  /**
   * Calculate size of a specific collection
   */
  async calculateCollectionSize(collectionsPath: string, collectionName: string): Promise<number> {
    try {
      const collectionPath = this.path.join(collectionsPath, collectionName);
      
      if (!this.directoryExists(collectionPath)) {
        return 0;
      }

      return await this.calculateDirectorySize(collectionPath);
    } catch (error) {
      console.error(`Error calculating size for collection ${collectionName}:`, error);
      return 0;
    }
  }

  /**
   * Get breakdown of collection sizes
   */
  async getCollectionSizeBreakdown(collectionsPath: string): Promise<Record<string, number>> {
    const breakdown: Record<string, number> = {};

    try {
      if (!this.directoryExists(collectionsPath)) {
        return breakdown;
      }

      const collections = this.readDirectory(collectionsPath);
      
      for (const collectionName of collections) {
        const collectionPath = this.path.join(collectionsPath, collectionName);
        
        if (this.directoryExists(collectionPath)) {
          breakdown[collectionName] = await this.calculateDirectorySize(collectionPath);
        }
      }
    } catch (error) {
      console.error('Error getting collection size breakdown:', error);
    }

    return breakdown;
  }
}