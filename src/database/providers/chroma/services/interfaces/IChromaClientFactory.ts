import { ChromaClient } from '../../PersistentChromaClient';
import { IStorageOptions } from '../../../../interfaces/IStorageOptions';

/**
 * Factory interface for creating ChromaDB clients
 * Implements Strategy pattern for different client types
 */
export interface IChromaClientFactory {
  /**
   * Create a ChromaDB client based on configuration
   * @param options Storage configuration options
   * @returns Configured ChromaDB client instance
   */
  createClient(options: IStorageOptions): InstanceType<typeof ChromaClient>;

  /**
   * Validate client configuration
   * @param options Storage configuration options
   * @returns true if configuration is valid, false otherwise
   */
  validateConfiguration(options: IStorageOptions): boolean;

  /**
   * Get the storage path for the client
   * @param options Storage configuration options
   * @returns The resolved storage path
   */
  getStoragePath(options: IStorageOptions): string | null;
}