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
  async createClient(options: IStorageOptions): Promise<InstanceType<typeof ChromaClient>> {
    const resolvedOptions = await this.resolveConfiguration(options);

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
  async validateConfiguration(options: IStorageOptions): Promise<boolean> {
    try {
      // Basic validation
      if (options.inMemory) {
        return true; // In-memory always valid
      }

      if (options.server?.host) {
        return this.validateRemoteConfiguration(options);
      }

      if (options.persistentPath) {
        return await this.validatePersistentConfiguration(options);
      }

      // If no specific config, we'll use default persistent path
      return true;
    } catch (error) {
      console.error('[ChromaClientFactory] Configuration validation error:', error);
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
      // Ensure we only work with relative paths for Obsidian vault adapter
      const isAbsolute = /^[A-Za-z]:\\|^\//.test(options.persistentPath);
      if (isAbsolute) {
        console.warn(`[ChromaClientFactory] Converting absolute path to relative: ${options.persistentPath}`);
        // Extract the relative portion after the plugin directory
        const relativePart = options.persistentPath.replace(/.*[\\\/](\.obsidian[\\\/]plugins[\\\/][^\\\/]+[\\\/].*)$/, '$1');
        return relativePart.replace(/\\/g, '/'); // Normalize to forward slashes
      }
      
      return options.persistentPath;
    }

    // Generate default path
    return this.generateDefaultPath();
  }

  /**
   * Resolve and validate configuration options
   */
  private async resolveConfiguration(options: IStorageOptions): Promise<IStorageOptions> {
    const resolved = { ...options };

    // If no persistent path is provided and we're not in memory or remote, generate one
    if (!resolved.inMemory && !resolved.server?.host && !resolved.persistentPath) {
      resolved.persistentPath = this.generateDefaultPath();
    }

    // Ensure directories exist for persistent storage
    if (resolved.persistentPath && !resolved.inMemory) {
      await this.ensureStorageDirectories(resolved.persistentPath);
    }

    return resolved;
  }

  /**
   * Create an in-memory client
   */
  private createInMemoryClient(): InstanceType<typeof ChromaClient> {
    return new ChromaClient({ plugin: this.plugin });
  }

  /**
   * Create a remote server client
   */
  private createRemoteClient(options: IStorageOptions): InstanceType<typeof ChromaClient> {
    const protocol = options.server!.protocol || 'http';
    const port = options.server!.port || 8000;
    const host = options.server!.host;

    return new ChromaClient({
      path: `${protocol}://${host}:${port}`,
      plugin: this.plugin
    });
  }

  /**
   * Create a persistent client
   */
  private async createPersistentClient(options: IStorageOptions): Promise<InstanceType<typeof ChromaClient>> {
    // CRITICAL FIX: Use getStoragePath() to ensure relative path conversion
    const storagePath = this.getStoragePath(options)!;
    
    // Ensure storage directories exist - use original path for directory operations
    await this.ensureStorageDirectories(options.persistentPath!);

    return new ChromaClient({
      path: storagePath,
      plugin: this.plugin
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
  private async validatePersistentConfiguration(options: IStorageOptions): Promise<boolean> {
    const path = options.persistentPath;
    if (!path) {
      return false;
    }

    try {
      // Convert absolute path to relative if needed
      let relativePath = path;
      const isAbsolute = /^[A-Za-z]:\\|^\//.test(path);
      if (isAbsolute) {
        console.warn(`[ChromaClientFactory] Converting absolute path to relative: ${path}`);
        const relativePart = path.replace(/.*[\\\/](\.obsidian[\\\/]plugins[\\\/][^\\\/]+[\\\/].*)$/, '$1');
        if (relativePart && relativePart !== path) {
          relativePath = relativePart.replace(/\\/g, '/');
        }
      }
      
      // Check if we can create the directory
      await this.directoryService.ensureDirectoryExists(relativePath);
      
      // Check if we have write permissions - use the relative path
      const hasPermissions = await this.directoryService.validateDirectoryPermissions(relativePath);
      
      return hasPermissions;
    } catch (error) {
      console.error(`[ChromaClientFactory] Validation failed for ${path}:`, error);
      return false;
    }
  }

  /**
   * Generate default storage path based on plugin configuration
   */
  private generateDefaultPath(): string {
    // Always use relative path - Obsidian's vault adapter handles absolute path resolution
    const relativePath = 'data/chroma-db';
    return relativePath;
  }

  /**
   * Ensure storage directories exist
   */
  private async ensureStorageDirectories(storagePath: string): Promise<void> {
    // Ensure the main storage directory exists
    await this.directoryService.ensureDirectoryExists(storagePath);
    
    // Ensure the collections subdirectory exists
    const collectionsDir = `${storagePath}/collections`;
    await this.directoryService.ensureDirectoryExists(collectionsDir);
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
  async createClientWithRetry(options: IStorageOptions, maxRetries = 3): Promise<InstanceType<typeof ChromaClient>> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = await this.createClient(options);
        
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