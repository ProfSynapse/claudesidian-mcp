import { IDirectoryService } from './interfaces/IDirectoryService';
import { getErrorMessage } from '../../../../utils/errorUtils';
import { Plugin, normalizePath } from 'obsidian';

/**
 * Directory service implementation
 * Handles all filesystem operations using Obsidian's Plugin API
 * Follows SRP - only responsible for directory/file operations
 * Uses Obsidian's native normalizePath for path handling
 */
export class DirectoryService implements IDirectoryService {
  private plugin: Plugin;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  /**
   * Ensure a directory exists, creating it if necessary
   */
  async ensureDirectoryExists(path: string): Promise<void> {
    try {
      const normalizedPath = normalizePath(path);
      if (!await this.plugin.app.vault.adapter.exists(normalizedPath)) {
        await this.plugin.app.vault.adapter.mkdir(normalizedPath);
      }
    } catch (error) {
      throw new Error(`Failed to ensure directory exists ${path}: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Calculate the size of a directory in MB
   */
  async calculateDirectorySize(directoryPath: string): Promise<number> {
    const calculateSize = async (dirPath: string): Promise<number> => {
      let totalSize = 0;
      
      try {
        const listing = await this.plugin.app.vault.adapter.list(dirPath);
        
        // Calculate size of files
        for (const file of listing.files) {
          try {
            const stat = await this.plugin.app.vault.adapter.stat(file);
            if (stat?.size) {
              totalSize += stat.size;
            }
          } catch (error) {
            // Skip files we can't stat
            console.warn(`Unable to stat file ${file}: ${getErrorMessage(error)}`);
          }
        }
        
        // Recursively calculate size of subdirectories
        for (const folder of listing.folders) {
          totalSize += await calculateSize(folder);
        }
      } catch (error) {
        // If we can't read a directory, skip it and continue
        console.warn(`Unable to read directory ${dirPath}: ${getErrorMessage(error)}`);
      }
      
      return totalSize;
    };
    
    try {
      const normalizedPath = normalizePath(directoryPath);
      const sizeInBytes = await calculateSize(normalizedPath);
      return sizeInBytes / (1024 * 1024); // Convert to MB
    } catch (error) {
      console.error(`Error calculating size of directory ${directoryPath}:`, error);
      return 0;
    }
  }

  /**
   * Validate directory permissions (read/write access)
   */
  async validateDirectoryPermissions(path: string): Promise<boolean> {
    try {
      const normalizedPath = normalizePath(path);
      
      if (!await this.directoryExists(normalizedPath)) {
        return false;
      }
      
      // Try to write a test file to check permissions
      const testFilePath = normalizePath(`${normalizedPath}/.test_write`);
      await this.plugin.app.vault.adapter.write(testFilePath, 'test');
      await this.plugin.app.vault.adapter.remove(testFilePath);
      
      return true;
    } catch (error) {
      console.error(`Permission check failed for ${path}:`, error);
      return false;
    }
  }

  /**
   * Check if a directory exists
   */
  async directoryExists(path: string): Promise<boolean> {
    try {
      const normalizedPath = normalizePath(path);
      const stat = await this.plugin.app.vault.adapter.stat(normalizedPath);
      return stat?.type === 'folder';
    } catch (error) {
      return false;
    }
  }

  /**
   * Get directory contents
   */
  async readDirectory(path: string): Promise<string[]> {
    try {
      const normalizedPath = normalizePath(path);
      if (!await this.plugin.app.vault.adapter.exists(normalizedPath)) {
        return [];
      }
      const listing = await this.plugin.app.vault.adapter.list(normalizedPath);
      // Return both files and folders, extract just the names
      return [...listing.files, ...listing.folders].map(fullPath => {
        const parts = fullPath.split('/');
        return parts[parts.length - 1];
      });
    } catch (error) {
      throw new Error(`Failed to read directory ${path}: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Internal method to read directory contents without path processing
   * @private
   */
  private async readDirectoryInternal(normalizedPath: string): Promise<string[]> {
    try {
      if (!await this.plugin.app.vault.adapter.exists(normalizedPath)) {
        return [];
      }
      const listing = await this.plugin.app.vault.adapter.list(normalizedPath);
      // Return both files and folders, extract just the names
      return [...listing.files, ...listing.folders].map(fullPath => {
        const parts = fullPath.split('/');
        return parts[parts.length - 1];
      });
    } catch (error) {
      throw new Error(`Failed to read directory ${normalizedPath}: ${getErrorMessage(error)}`);
    }
  }


  /**
   * Get file/directory stats
   */
  async getStats(path: string): Promise<any> {
    try {
      const normalizedPath = normalizePath(path);
      return await this.plugin.app.vault.adapter.stat(normalizedPath);
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
      const normalizedCollectionsPath = normalizePath(collectionsPath);
      const collectionPath = normalizePath(`${normalizedCollectionsPath}/${collectionName}`);
      
      if (!await this.directoryExists(collectionPath)) {
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
    } catch (error) {
      console.error('Error getting collection size breakdown:', error);
    }

    return breakdown;
  }

  /**
   * Check if a file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      const normalizedPath = normalizePath(filePath);
      const stat = await this.plugin.app.vault.adapter.stat(normalizedPath);
      return stat?.type === 'file';
    } catch (error) {
      return false;
    }
  }

  /**
   * Read file contents
   */
  async readFile(filePath: string, encoding: string = 'utf8'): Promise<string> {
    try {
      const normalizedPath = normalizePath(filePath);
      return await this.plugin.app.vault.adapter.read(normalizedPath);
    } catch (error) {
      throw new Error(`File read failed for ${filePath}: ${getErrorMessage(error)}`);
    }
  }
}