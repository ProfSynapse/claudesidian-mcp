import { IDirectoryService } from './interfaces/IDirectoryService';
import { getErrorMessage } from '../../../../utils/errorUtils';
import { Plugin, normalizePath } from 'obsidian';
import { PathManager } from '../../../../utils/PathManager';

/**
 * Directory service implementation
 * Handles all filesystem operations using Obsidian's Plugin API
 * Follows SRP - only responsible for directory/file operations
 * Uses PathManager for consistent path handling across the plugin
 */
export class DirectoryService implements IDirectoryService {
  private plugin: Plugin;
  private pathManager: PathManager;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.pathManager = new PathManager(plugin.app, plugin);
  }

  /**
   * Ensure a directory exists, creating it if necessary
   * Uses PathManager for consistent path handling
   */
  async ensureDirectoryExists(path: string): Promise<void> {
    console.log(`[DirectoryService] ensureDirectoryExists called with: ${path}`);
    
    return this.pathManager.safePathOperation(
      path,
      async (validPath) => {
        if (!await this.plugin.app.vault.adapter.exists(validPath)) {
          console.log(`[DirectoryService] Creating directory: ${validPath}`);
          await this.plugin.app.vault.adapter.mkdir(validPath);
          console.log(`[DirectoryService] ✅ Directory created: ${validPath}`);
        } else {
          console.log(`[DirectoryService] Directory already exists: ${validPath}`);
        }
      },
      'ensureDirectoryExists'
    );
  }

  /**
   * Calculate the size of a directory in MB
   */
  async calculateDirectorySize(directoryPath: string): Promise<number> {
    const calculateSize = async (dirPath: string): Promise<number> => {
      let totalSize = 0;
      
      try {
        const normalizedPath = normalizePath(dirPath);
        const listing = await this.plugin.app.vault.adapter.list(normalizedPath);
        
        // Calculate size of files
        for (const file of listing.files) {
          try {
            const stat = await this.plugin.app.vault.adapter.stat(normalizePath(file));
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
      const sizeInBytes = await calculateSize(directoryPath);
      return sizeInBytes / (1024 * 1024); // Convert to MB
    } catch (error) {
      console.error(`Error calculating size of directory ${directoryPath}:`, error);
      return 0;
    }
  }

  /**
   * Validate directory permissions (read/write access)
   * Uses PathManager for consistent path handling
   */
  async validateDirectoryPermissions(path: string): Promise<boolean> {
    console.log(`[DirectoryService] Checking permissions for: ${path}`);
    
    try {
      return await this.pathManager.safePathOperation(
        path,
        async (validPath) => {
          if (!await this.directoryExists(validPath)) {
            console.log(`[DirectoryService] Directory does not exist: ${validPath}`);
            return false;
          }
          
          // Try to write a test file to check permissions
          const testFilePath = normalizePath(`${validPath}/.test_write`);
          console.log(`[DirectoryService] Testing write to: ${testFilePath}`);
          
          await this.plugin.app.vault.adapter.write(testFilePath, 'test');
          await this.plugin.app.vault.adapter.remove(testFilePath);
          
          console.log(`[DirectoryService] ✅ Write permissions OK for: ${validPath}`);
          return true;
        },
        'validateDirectoryPermissions'
      );
    } catch (error) {
      console.error(`[DirectoryService] Permission check failed for ${path}:`, error);
      return false;
    }
  }

  /**
   * Check if a directory exists
   * Uses PathManager for consistent path handling
   */
  async directoryExists(path: string): Promise<boolean> {
    try {
      return await this.pathManager.safePathOperation(
        path,
        async (validPath) => {
          console.log(`[DirectoryService] Checking if directory exists: ${validPath}`);
          
          const stat = await this.plugin.app.vault.adapter.stat(validPath);
          const exists = stat?.type === 'folder';
          
          console.log(`[DirectoryService] Directory ${validPath} exists: ${exists}`);
          return exists;
        },
        'directoryExists'
      );
    } catch (error) {
      console.log(`[DirectoryService] Directory check failed for ${path}:`, error);
      return false;
    }
  }

  /**
   * Get directory contents
   */
  async readDirectory(path: string): Promise<string[]> {
    try {
      if (!await this.directoryExists(path)) {
        return [];
      }
      const normalizedPath = normalizePath(path);
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
      if (!this.directoryExists(collectionsPath)) {
        return 0;
      }

      for (const collectionName of memoryCollections) {
        // Use simple string concatenation to avoid path duplication in Electron environment
        const collectionPath = `${collectionsPath}/${collectionName}`;
        
        if (await this.directoryExists(collectionPath)) {
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
      // Use simple string concatenation to avoid path duplication in Electron environment
      const collectionPath = `${collectionsPath}/${collectionName}`;
      
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
      if (!await this.directoryExists(collectionsPath)) {
        return breakdown;
      }

      const collections = await this.readDirectory(collectionsPath);
      
      for (const collectionName of collections) {
        // Use simple string concatenation to avoid path duplication in Electron environment
        const collectionPath = `${collectionsPath}/${collectionName}`;
        
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