/**
 * ClientInitializer - Handles client initialization and setup
 * Follows Single Responsibility Principle by focusing only on initialization
 */

import { PersistenceManager } from '../../services/PersistenceManager';
import { FileSystemInterface } from '../../services';
import { ChromaClientOptions } from '../../PersistentChromaClient';

export interface InitializationResult {
  success: boolean;
  error?: string;
  storagePath?: string;
  fs?: FileSystemInterface;
  persistenceManager?: PersistenceManager;
}

/**
 * Service responsible for client initialization
 * Follows SRP by focusing only on client setup operations
 */
export class ClientInitializer {
  /**
   * Initialize client with storage and file system
   */
  async initializeClient(options: ChromaClientOptions): Promise<InitializationResult> {
    try {
      // Get Node.js fs module
      const fs = this.getFileSystem();
      if (!fs) {
        return {
          success: false,
          error: 'File system not available'
        };
      }

      // Validate and process storage path
      const storagePathResult = this.processStoragePath(options.path);
      if (!storagePathResult.success) {
        return storagePathResult;
      }

      const storagePath = storagePathResult.storagePath!;

      // Initialize persistence manager
      const persistenceManager = new PersistenceManager(fs);

      // Create storage directories
      const directoryResult = await this.createStorageDirectories(storagePath, persistenceManager);
      if (!directoryResult.success) {
        return directoryResult;
      }

      return {
        success: true,
        storagePath,
        fs,
        persistenceManager
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to initialize client: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Get file system interface
   */
  private getFileSystem(): FileSystemInterface | null {
    try {
      return require('fs');
    } catch (error) {
      console.error('Failed to load file system:', error);
      return null;
    }
  }

  /**
   * Process and validate storage path
   */
  private processStoragePath(path?: string): {
    success: boolean;
    error?: string;
    storagePath?: string;
  } {
    if (!path) {
      return {
        success: false,
        error: 'Storage path is required for StrictPersistenceChromaClient'
      };
    }

    try {
      const pathModule = require('path');
      
      // Check if the path is absolute
      const isAbsolutePath = pathModule.isAbsolute(path);
      
      // Use the path as-is WITHOUT resolving to preserve user intent
      const storagePath = path;

      return {
        success: true,
        storagePath
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to process storage path: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Create required storage directories
   */
  private async createStorageDirectories(
    storagePath: string, 
    persistenceManager: PersistenceManager
  ): Promise<InitializationResult> {
    try {
      // Create the storage directory if it doesn't exist
      persistenceManager.ensureDirectory(storagePath);
      
      // Create the collections directory if it doesn't exist
      const collectionsDir = `${storagePath}/collections`;
      persistenceManager.ensureDirectory(collectionsDir);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create storage directories: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Validate client options
   */
  validateClientOptions(options: ChromaClientOptions): {
    valid: boolean;
    error?: string;
  } {
    if (!options.path) {
      return {
        valid: false,
        error: 'Storage path is required'
      };
    }

    if (typeof options.path !== 'string') {
      return {
        valid: false,
        error: 'Storage path must be a string'
      };
    }

    if (options.path.trim().length === 0) {
      return {
        valid: false,
        error: 'Storage path cannot be empty'
      };
    }

    // Validate fetchOptions if provided
    if (options.fetchOptions && typeof options.fetchOptions !== 'object') {
      return {
        valid: false,
        error: 'fetchOptions must be an object'
      };
    }

    return { valid: true };
  }

  /**
   * Get initialization requirements
   */
  getInitializationRequirements(): {
    requiredModules: string[];
    requiredOptions: string[];
    optionalOptions: string[];
  } {
    return {
      requiredModules: ['fs', 'path'],
      requiredOptions: ['path'],
      optionalOptions: ['fetchOptions']
    };
  }
}