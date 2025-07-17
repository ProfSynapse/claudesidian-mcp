/**
 * StrictPersistentCollection - Refactored following SOLID principles
 * Orchestrates specialized services for collection operations
 */

import { Collection, ChromaAddParams, ChromaGetParams, ChromaUpdateParams, ChromaDeleteParams, ChromaQueryParams } from '../PersistentChromaClient';
import { CollectionRepository } from '../services/CollectionRepository';
import { PersistenceManager } from '../services/PersistenceManager';
import { CollectionOperations } from './operations/CollectionOperations';
import { QueryProcessor } from './operations/QueryProcessor';
import { DataValidator } from './operations/DataValidator';
import { CollectionPersistence } from './persistence/CollectionPersistence';
import { QueuedSaveManager } from './persistence/QueuedSaveManager';
import { MetadataManager } from './metadata/MetadataManager';
import { FileSystemInterface } from '../services';

/**
 * Refactored StrictPersistentCollection following SOLID principles
 * Orchestrates specialized services for collection operations
 */
export class StrictPersistentCollection implements Collection {
  public name: string;
  
  // Composed services following Dependency Injection principle
  private repository: CollectionRepository;
  private persistenceManager: PersistenceManager;
  private collectionOperations: CollectionOperations;
  private queryProcessor: QueryProcessor;
  private dataValidator: DataValidator;
  private collectionPersistence: CollectionPersistence;
  private queuedSaveManager: QueuedSaveManager;
  private metadataManager: MetadataManager;

  constructor(
    name: string, 
    storageDir: string, 
    fs: FileSystemInterface, 
    metadata: Record<string, any> = {}, 
    _parent: any,
    embeddingFunction?: any
  ) {
    this.name = name;
    
    // Initialize core services
    this.repository = new CollectionRepository(metadata, name, storageDir);
    this.persistenceManager = new PersistenceManager(fs);
    
    // Initialize specialized services
    this.collectionOperations = new CollectionOperations(this.repository, embeddingFunction);
    this.queryProcessor = new QueryProcessor(this.repository, embeddingFunction);
    this.dataValidator = new DataValidator();
    this.collectionPersistence = new CollectionPersistence(name, storageDir, this.persistenceManager, this.repository);
    this.queuedSaveManager = new QueuedSaveManager(1000);
    this.metadataManager = new MetadataManager(this.repository, name);
    
    // Ensure collection directory exists
    this.collectionPersistence.ensureDirectoryExists();
  }

  /**
   * Add items to the collection
   */
  async add(params: ChromaAddParams): Promise<void> {
    // Validate parameters
    const validation = this.dataValidator.validateAndNormalizeAddParams(params);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Add items through operations service
    const result = await this.collectionOperations.addItems(params);
    if (!result.success) {
      throw new Error(result.error);
    }

    // Queue a save after adding items
    this.queueSave();
  }

  /**
   * Get items from the collection
   */
  async get(params: ChromaGetParams): Promise<{
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }> {
    // Validate parameters
    const validation = this.dataValidator.validateGetParams(params);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Get items through operations service
    return await this.collectionOperations.getItems(params);
  }

  /**
   * Update items in the collection
   */
  async update(params: ChromaUpdateParams): Promise<void> {
    // Validate parameters
    const validation = this.dataValidator.validateAndNormalizeUpdateParams(params);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Update items through operations service
    const result = await this.collectionOperations.updateItems(params);
    if (!result.success) {
      throw new Error(result.error);
    }

    // Queue a save after updating items
    this.queueSave();
  }

  /**
   * Delete items from the collection
   */
  async delete(params: ChromaDeleteParams): Promise<void> {
    // Validate parameters
    const validation = this.dataValidator.validateDeleteParams(params);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Delete items through operations service
    const result = await this.collectionOperations.deleteItems(params);
    if (!result.success) {
      throw new Error(result.error);
    }

    // Queue a save after deleting items
    this.queueSave();
  }

  /**
   * Query the collection
   */
  async query(params: ChromaQueryParams): Promise<{
    ids: string[][];
    embeddings?: number[][][];
    metadatas?: Record<string, any>[][];
    documents?: string[][];
    distances?: number[][];
  }> {
    // Validate parameters
    const validation = this.dataValidator.validateQueryParams(params);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Execute query through query processor
    return await this.queryProcessor.executeQuery(params);
  }

  /**
   * Count items in the collection
   */
  async count(): Promise<number> {
    return await this.collectionOperations.countItems();
  }

  /**
   * Get collection metadata
   */
  async metadata(): Promise<Record<string, any>> {
    const result = await this.metadataManager.getMetadata();
    if (!result.success) {
      throw new Error(result.error);
    }
    return result.metadata!;
  }

  /**
   * Load collection data from disk
   */
  async loadFromDisk(): Promise<void> {
    console.log(`[COLLECTION-LOAD-DEBUG] Loading ${this.name} from disk`);
    const result = await this.collectionPersistence.loadFromDisk();
    if (!result.success) {
      console.error(`[COLLECTION-LOAD-DEBUG] Failed to load ${this.name}:`, result.error);
      throw new Error(result.error);
    }
    const itemCount = this.repository.count();
    console.log(`[COLLECTION-LOAD-DEBUG] Successfully loaded ${this.name} with ${itemCount} items`);
  }

  /**
   * Force an immediate save to disk
   */
  async forceSave(): Promise<void> {
    const result = await this.collectionPersistence.saveCollectionToDisk();
    if (!result.success) {
      throw new Error(result.error);
    }
  }

  /**
   * Queue a save operation to be executed after a short delay
   */
  private queueSave(): void {
    this.queuedSaveManager.queueSave(this.name, async () => {
      await this.collectionPersistence.saveCollectionToDisk();
    });
  }

  /**
   * Cancel any queued save operations
   */
  cancelQueuedSave(): void {
    this.queuedSaveManager.cancelQueuedSave(this.name);
  }

  /**
   * Check if collection exists on disk
   */
  async existsOnDisk(): Promise<boolean> {
    return await this.collectionPersistence.existsOnDisk();
  }

  /**
   * Get collection size information
   */
  async getSize(): Promise<{
    itemCount: number;
    diskSize?: number;
    error?: string;
  }> {
    return await this.collectionPersistence.getCollectionSize();
  }

  /**
   * Get collection statistics
   */
  async getStatistics(): Promise<{
    success: boolean;
    error?: string;
    statistics?: {
      itemCount: number;
      createdAt?: string;
      lastModified?: string;
      metadataKeys: string[];
    };
  }> {
    return await this.metadataManager.getStatistics();
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.queuedSaveManager.cleanup();
  }
}