import { IChromaClientFactory } from './interfaces/IChromaClientFactory';
import { ChromaClient } from '../PersistentChromaClient';
import { IStorageOptions } from '../../../interfaces/IStorageOptions';
import { IDirectoryService } from './interfaces/IDirectoryService';
import { Plugin } from 'obsidian';

/**
 * Factory for creating ChromaDB clients
 * Implements Factory pattern and Strategy pattern for different client types
 * Follows OCP - open for extension (new client types) without modification
 */
export class ChromaClientFactory implements IChromaClientFactory {
  private directoryService: IDirectoryService;
  private plugin: Plugin;

  constructor(directoryService: IDirectoryService, plugin: Plugin) {
    this.directoryService = directoryService;
    this.plugin = plugin;
  }

  /**
   * Create a ChromaDB client based on configuration
   * Uses Strategy pattern to select appropriate client type
   */
  createClient(options: IStorageOptions): InstanceType<typeof ChromaClient> {
    const resolvedOptions = this.resolveConfiguration(options);

    if (resolvedOptions.inMemory) {
      return this.createInMemoryClient();
    } else if (resolvedOptions.server?.host) {
      return this.createRemoteClient(resolvedOptions);
    } else {
      return this.createPersistentClient(resolvedOptions);
    }
  }

  /**
   * Validate client configuration
   */
  validateConfiguration(options: IStorageOptions): boolean {
    try {
      // Basic validation
      if (options.inMemory) {
        return true; // In-memory always valid
      }

      if (options.server?.host) {
        return this.validateRemoteConfiguration(options);
      }

      if (options.persistentPath) {
        return this.validatePersistentConfiguration(options);
      }

      // If no specific config, we'll use default persistent path
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the storage path for the client
   */
  getStoragePath(options: IStorageOptions): string | null {
    if (options.inMemory || options.server?.host) {
      return null;
    }

    if (options.persistentPath) {
      return options.persistentPath;
    }

    // Generate default path
    return this.generateDefaultPath();
  }

  /**
   * Resolve and validate configuration options
   */
  private resolveConfiguration(options: IStorageOptions): IStorageOptions {
    const resolved = { ...options };

    // If no persistent path is provided and we're not in memory or remote, generate one
    if (!resolved.inMemory && !resolved.server?.host && !resolved.persistentPath) {
      resolved.persistentPath = this.generateDefaultPath();
    }

    // Ensure directories exist for persistent storage
    if (resolved.persistentPath && !resolved.inMemory) {
      this.ensureStorageDirectories(resolved.persistentPath);
    }

    return resolved;
  }

  /**
   * Create an in-memory client
   */
  private createInMemoryClient(): InstanceType<typeof ChromaClient> {
    return new ChromaClient();
  }

  /**
   * Create a remote server client
   */
  private createRemoteClient(options: IStorageOptions): InstanceType<typeof ChromaClient> {
    const protocol = options.server!.protocol || 'http';
    const port = options.server!.port || 8000;
    const host = options.server!.host;

    return new ChromaClient({
      path: `${protocol}://${host}:${port}`
    });
  }

  /**
   * Create a persistent client
   */
  private createPersistentClient(options: IStorageOptions): InstanceType<typeof ChromaClient> {
    const storagePath = options.persistentPath!;
    
    // Ensure storage directories exist
    this.ensureStorageDirectories(storagePath);

    return new ChromaClient({
      path: storagePath
    });
  }

  /**
   * Validate remote server configuration
   */
  private validateRemoteConfiguration(options: IStorageOptions): boolean {
    const server = options.server;
    if (!server?.host) {
      return false;
    }

    // Basic hostname validation
    const hostPattern = /^[a-zA-Z0-9.-]+$/;
    if (!hostPattern.test(server.host)) {
      return false;
    }

    // Port validation
    if (server.port && (server.port < 1 || server.port > 65535)) {
      return false;
    }

    return true;
  }

  /**
   * Validate persistent storage configuration
   */
  private validatePersistentConfiguration(options: IStorageOptions): boolean {
    const path = options.persistentPath;
    if (!path) {
      return false;
    }

    try {
      // Check if we can create the directory
      this.directoryService.ensureDirectoryExists(path);
      
      // Check if we have write permissions
      return this.directoryService.validateDirectoryPermissions(path);
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate default storage path based on plugin configuration
   */
  private generateDefaultPath(): string {
    const path = require('path');
    
    // Get the vault's base path using FileSystemAdapter
    let basePath;
    if (this.plugin.app.vault.adapter instanceof require('obsidian').FileSystemAdapter) {
      basePath = (this.plugin.app.vault.adapter as any).getBasePath();
    } else {
      throw new Error('FileSystemAdapter not available');
    }

    // Construct the correct plugin directory within the vault
    const pluginDir = path.join(basePath, '.obsidian', 'plugins', this.plugin.manifest.id);
    return path.join(pluginDir, 'data', 'chroma-db');
  }

  /**
   * Ensure storage directories exist
   */
  private ensureStorageDirectories(storagePath: string): void {
    const path = require('path');
    
    // Ensure the main storage directory exists
    this.directoryService.ensureDirectoryExists(storagePath);
    
    // Ensure the collections subdirectory exists
    const collectionsDir = path.join(storagePath, 'collections');
    this.directoryService.ensureDirectoryExists(collectionsDir);
  }

  /**
   * Test client connectivity
   */
  async testClientConnectivity(client: InstanceType<typeof ChromaClient>): Promise<boolean> {
    try {
      // Try a simple heartbeat operation
      await client.heartbeat();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create client with retry logic
   */
  async createClientWithRetry(options: IStorageOptions, maxRetries: number = 3): Promise<InstanceType<typeof ChromaClient>> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = this.createClient(options);
        
        // Test connectivity
        const isConnected = await this.testClientConnectivity(client);
        if (isConnected) {
          return client;
        } else {
          throw new Error('Client connectivity test failed');
        }
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw new Error(`Failed to create client after ${maxRetries} attempts: ${lastError?.message}`);
  }
}