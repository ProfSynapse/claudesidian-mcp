import { IStorageOptions } from '../interfaces/IStorageOptions';

/**
 * Configuration model for vector store setup
 */
export class VectorStoreConfig implements IStorageOptions {
  /**
   * Path for persistent storage
   */
  persistentPath?: string;
  
  /**
   * Whether to use in-memory storage
   */
  inMemory: boolean;
  
  /**
   * Server configuration
   */
  server?: {
    host?: string;
    port?: number;
    protocol?: 'http' | 'https';
    apiKey?: string;
  };
  
  /**
   * Cache configuration
   */
  cache: {
    enabled: boolean;
    maxItems: number;
    ttl: number;
  };
  
  /**
   * Embedding settings
   */
  embedding: {
    dimension: number;
    model: string;
  };
  
  /**
   * Create a new vector store configuration
   * @param options Configuration options
   */
  constructor(options?: Partial<IStorageOptions>) {
    this.persistentPath = options?.persistentPath;
    this.inMemory = options?.inMemory ?? false;
    
    this.server = options?.server;
    
    this.cache = {
      enabled: options?.cache?.enabled ?? true,
      maxItems: options?.cache?.maxItems ?? 1000,
      ttl: options?.cache?.ttl ?? 3600000, // 1 hour
    };
    
    this.embedding = {
      dimension: options?.embedding?.dimension || (() => { throw new Error('Embedding dimension must be specified based on the actual model'); })(),
      model: options?.embedding?.model ?? 'default',
    };
  }
  
  /**
   * Get default configuration for Obsidian plugin
   * @param pluginPath Path to the plugin directory (should be relative like '.obsidian/plugins/plugin-id')
   * @returns Default configuration
   */
  static getDefaultConfig(pluginPath: string): VectorStoreConfig {
    return new VectorStoreConfig({
      persistentPath: `${pluginPath}/data/chroma-db`,
      inMemory: false,
      cache: {
        enabled: true,
        maxItems: 1000,
        ttl: 3600000, // 1 hour
      },
      embedding: {
        dimension: (() => { throw new Error('Default VectorStoreConfig requires embedding dimension to be specified'); })(),
        model: 'default',
      },
    });
  }
}