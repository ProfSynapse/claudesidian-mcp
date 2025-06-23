import { ChromaClient, Collection } from './PersistentChromaClient';
import { BaseVectorStore } from '../base/BaseVectorStore';
import { IStorageOptions } from '../../interfaces/IStorageOptions';
import { VectorStoreConfig } from '../../models/VectorStoreConfig';
import { Plugin } from 'obsidian';

// Import the modular services
import { DirectoryService } from './services/DirectoryService';
import { ChromaClientFactory } from './services/ChromaClientFactory';
import { CollectionManager } from './services/CollectionManager';
import { DiagnosticsService } from './services/DiagnosticsService';
import { SizeCalculatorService } from './services/SizeCalculatorService';

// Import interfaces
import { IDirectoryService } from './services/interfaces/IDirectoryService';
import { IChromaClientFactory } from './services/interfaces/IChromaClientFactory';
import { ICollectionManager } from './services/interfaces/ICollectionManager';
import { IDiagnosticsService, RepairResult, ValidationResult } from './services/interfaces/IDiagnosticsService';
import { ISizeCalculatorService } from './services/interfaces/ISizeCalculatorService';

// Define standard include types for vector store compatibility
type StoreIncludeType = 'embeddings' | 'metadatas' | 'documents' | 'distances';

/**
 * Modular ChromaDB vector store implementation
 * Now follows SOLID principles with focused, single-responsibility services
 * 
 * SOLID Principles Applied:
 * - SRP: Each service has a single, well-defined responsibility
 * - OCP: Open for extension (new services) without modification
 * - LSP: Services can be substituted with different implementations
 * - ISP: Interfaces are focused and not bloated
 * - DIP: Depends on abstractions (interfaces) not concretions
 */
export class ChromaVectorStoreModular extends BaseVectorStore {
  // Service dependencies (injected through constructor)
  private directoryService!: IDirectoryService;
  private clientFactory!: IChromaClientFactory;
  private collectionManager!: ICollectionManager;
  private diagnosticsService!: IDiagnosticsService;
  private sizeCalculatorService!: ISizeCalculatorService;
  
  // ChromaDB client
  private client: InstanceType<typeof ChromaClient> | null = null;
  
  // Plugin instance for accessing paths
  private plugin: Plugin;

  /**
   * Create a new modular ChromaDB vector store
   * Uses dependency injection for better testability and modularity
   */
  constructor(plugin: Plugin, options?: Partial<IStorageOptions>) {
    super(options);
    this.plugin = plugin;
    
    // Initialize services with dependency injection
    this.initializeServices();
  }

  /**
   * Initialize all services with proper dependency injection
   * This demonstrates Dependency Inversion Principle - we depend on abstractions
   */
  private initializeServices(): void {
    // Create directory service (no dependencies)
    this.directoryService = new DirectoryService();
    
    // Create client factory (depends on directory service)
    this.clientFactory = new ChromaClientFactory(this.directoryService, this.plugin);
    
    // Other services will be initialized after client creation in initialize()
  }

  /**
   * Initialize the ChromaDB client and all services
   */
  async initialize(): Promise<void> {
    try {
      // Resolve configuration with sensible defaults
      this.resolveConfiguration();
      
      // Validate configuration
      if (!this.clientFactory.validateConfiguration(this.config)) {
        throw new Error('Invalid ChromaDB configuration');
      }
      
      // Create client using factory
      this.client = this.clientFactory.createClient(this.config);
      
      // Initialize remaining services that depend on the client
      this.initializeClientDependentServices();
      
      // Load existing collections
      await this.collectionManager.refreshCollections();
      
      this.initialized = true;
    } catch (error) {
      throw new Error(`ChromaDB initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Initialize services that depend on the ChromaDB client
   */
  private initializeClientDependentServices(): void {
    if (!this.client) {
      throw new Error('Client must be initialized before dependent services');
    }

    // Create collection manager (depends on client and directory service)
    this.collectionManager = new CollectionManager(
      this.client,
      this.directoryService,
      this.config.persistentPath
    );
    
    // Create size calculator service (depends on directory and collection services)
    this.sizeCalculatorService = new SizeCalculatorService(
      this.directoryService,
      this.collectionManager,
      this.config.persistentPath
    );
    
    // Create diagnostics service (depends on all other services)
    this.diagnosticsService = new DiagnosticsService(
      this.client,
      this.directoryService,
      this.collectionManager,
      this.sizeCalculatorService,
      this.config
    );
  }

  /**
   * Resolve configuration with sensible defaults
   */
  private resolveConfiguration(): void {
    // Set default persistent path if not provided and not in memory/remote
    if (!this.config.persistentPath && !this.config.inMemory && !this.config.server?.host) {
      const path = this.clientFactory.getStoragePath(this.config);
      if (path) {
        this.config.persistentPath = path;
      }
    }
  }

  /**
   * Close the ChromaDB client and cleanup services
   */
  async close(): Promise<void> {
    try {
      if (this.client && !this.config.inMemory) {
        // Use diagnostics service to ensure proper shutdown
        if (typeof (this.client as any).saveAllCollections === 'function') {
          const saveResult = await (this.client as any).saveAllCollections();
          if (!saveResult.success) {
            console.warn('Some collections failed to save during shutdown:', saveResult.errors);
          }
        }
      }
      
      // Clear collection cache
      if (this.collectionManager) {
        this.collectionManager.clearCache();
      }
      
      this.client = null;
      this.initialized = false;
    } catch (error) {
      console.error("Error during ChromaDB shutdown:", error);
      // Reset state even if there was an error
      this.client = null;
      this.initialized = false;
    }
  }

  /**
   * Create a new collection
   * Delegates to collection manager
   */
  async createCollection(collectionName: string, metadata?: Record<string, any>): Promise<void> {
    this.ensureInitialized();
    await this.collectionManager.createCollection(collectionName, metadata);
  }

  /**
   * Check if a collection exists
   * Delegates to collection manager
   */
  async hasCollection(collectionName: string): Promise<boolean> {
    this.ensureInitialized();
    return await this.collectionManager.hasCollection(collectionName);
  }

  /**
   * List all collections
   * Delegates to collection manager
   */
  async listCollections(): Promise<string[]> {
    this.ensureInitialized();
    return await this.collectionManager.listCollections();
  }

  /**
   * Delete a collection
   * Delegates to collection manager
   */
  async deleteCollection(collectionName: string): Promise<void> {
    this.ensureInitialized();
    await this.collectionManager.deleteCollection(collectionName);
  }

  /**
   * Add items to a collection
   * Uses collection manager to get collection instance
   */
  async addItems(collectionName: string, items: {
    ids: string[];
    embeddings: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void> {
    this.ensureInitialized();
    
    const collection = await this.collectionManager.getOrCreateCollection(collectionName);
    
    // Validate input
    this.validateItemArrayLengths(items);
    
    await collection.add({
      ids: items.ids,
      embeddings: items.embeddings,
      metadatas: items.metadatas,
      documents: items.documents
    });
  }

  /**
   * Get items by ID from a collection
   */
  async getItems(collectionName: string, ids: string[], include?: StoreIncludeType[]): Promise<{
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }> {
    this.ensureInitialized();
    
    const collection = await this.collectionManager.getOrCreateCollection(collectionName);
    
    const results = await collection.get({
      ids,
      include: include || ['embeddings', 'metadatas', 'documents']
    } as any);
    
    return this.normalizeGetResults(results);
  }

  /**
   * Update items in a collection
   */
  async updateItems(collectionName: string, items: {
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void> {
    this.ensureInitialized();
    
    const collection = await this.collectionManager.getOrCreateCollection(collectionName);
    
    // Validate that at least one field is provided for update
    if (!items.embeddings && !items.metadatas && !items.documents) {
      throw new Error('At least one of embeddings, metadatas, or documents must be provided');
    }
    
    await collection.update({
      ids: items.ids,
      embeddings: items.embeddings,
      metadatas: items.metadatas,
      documents: items.documents
    });
  }

  /**
   * Delete items from a collection
   */
  async deleteItems(collectionName: string, ids: string[]): Promise<void> {
    this.ensureInitialized();
    
    const collection = await this.collectionManager.getOrCreateCollection(collectionName);
    
    await collection.delete({ ids });
  }

  /**
   * Query a collection by embeddings or text
   */
  async query(collectionName: string, query: {
    queryEmbeddings?: number[][];
    queryTexts?: string[];
    nResults?: number;
    where?: Record<string, any>;
    include?: StoreIncludeType[];
  }): Promise<{
    ids: string[][];
    embeddings?: number[][][];
    metadatas?: Record<string, any>[][];
    documents?: string[][];
    distances?: number[][];
  }> {
    this.ensureInitialized();
    
    const collection = await this.collectionManager.getOrCreateCollection(collectionName);
    
    const results = await collection.query({
      queryEmbeddings: query.queryEmbeddings,
      queryTexts: query.queryTexts,
      nResults: query.nResults || 10,
      where: query.where,
      include: query.include || ['embeddings', 'metadatas', 'documents', 'distances']
    } as any);
    
    return this.normalizeQueryResults(results);
  }

  /**
   * Get count of items in a collection
   */
  async count(collectionName: string): Promise<number> {
    this.ensureInitialized();
    
    const collection = await this.collectionManager.getOrCreateCollection(collectionName);
    
    return await collection.count();
  }

  /**
   * Get diagnostics about the ChromaDB store
   * Delegates to diagnostics service
   */
  async getDiagnostics(): Promise<Record<string, any>> {
    if (!this.initialized) {
      return {
        status: 'error',
        initialized: false,
        error: 'ChromaDB client not initialized'
      };
    }
    
    return await this.diagnosticsService.getDiagnostics();
  }

  /**
   * Repair and reload collections from disk
   * Delegates to diagnostics service
   */
  async repairCollections(): Promise<RepairResult> {
    this.ensureInitialized();
    return await this.diagnosticsService.repairCollections();
  }

  /**
   * Validate collections to ensure they are in sync with disk storage
   * Delegates to diagnostics service
   */
  async validateCollections(): Promise<ValidationResult> {
    this.ensureInitialized();
    return await this.diagnosticsService.validateCollections();
  }

  /**
   * Calculate database size - delegates to size calculator service
   */
  async calculateDatabaseSize(): Promise<number> {
    this.ensureInitialized();
    return await this.sizeCalculatorService.calculateTotalDatabaseSize();
  }

  /**
   * Calculate memory database size - delegates to size calculator service
   */
  async calculateMemoryDatabaseSize(): Promise<number> {
    this.ensureInitialized();
    return await this.sizeCalculatorService.calculateMemoryDatabaseSize();
  }

  /**
   * Get storage breakdown by collection
   */
  async getStorageBreakdown(): Promise<Record<string, number>> {
    this.ensureInitialized();
    return await this.sizeCalculatorService.getStorageBreakdown();
  }

  /**
   * Check if system is healthy
   */
  async isHealthy(): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }
    
    return await this.diagnosticsService.isHealthy();
  }

  /**
   * Run comprehensive health check
   */
  async runHealthCheck(): Promise<{
    isHealthy: boolean;
    issues: string[];
    recommendations: string[];
    severity: 'low' | 'medium' | 'high';
  }> {
    this.ensureInitialized();
    return await this.diagnosticsService.runHealthCheck();
  }

  // Utility methods

  /**
   * Ensure the vector store is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.client) {
      throw new Error('ChromaDB client not initialized');
    }
  }

  /**
   * Validate that all item arrays have the same length
   */
  private validateItemArrayLengths(items: {
    ids: string[];
    embeddings: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): void {
    if (items.metadatas && items.metadatas.length !== items.ids.length) {
      throw new Error('Metadatas array length must match IDs array length');
    }
    
    if (items.documents && items.documents.length !== items.ids.length) {
      throw new Error('Documents array length must match IDs array length');
    }
  }

  /**
   * Normalize get results to handle null values
   */
  private normalizeGetResults(results: any): {
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  } {
    return {
      ids: results.ids,
      embeddings: Array.isArray(results.embeddings) 
        ? results.embeddings.map((e: any) => e === null ? [] : e) as number[][] 
        : undefined,
      metadatas: Array.isArray(results.metadatas) 
        ? results.metadatas.map((m: any) => m === null ? {} : m) as Record<string, any>[] 
        : undefined,
      documents: Array.isArray(results.documents) 
        ? results.documents.map((d: any) => d === null ? '' : d) as string[] 
        : undefined
    };
  }

  /**
   * Normalize query results to handle null values
   */
  private normalizeQueryResults(results: any): {
    ids: string[][];
    embeddings?: number[][][];
    metadatas?: Record<string, any>[][];
    documents?: string[][];
    distances?: number[][];
  } {
    const resultIds = results.ids || [];
    const resultEmbeddings = results.embeddings || [];
    const resultMetadatas = results.metadatas || [];
    const resultDocuments = results.documents || [];
    const resultDistances = results.distances || [];

    return {
      ids: resultIds,
      embeddings: resultEmbeddings.length > 0 
        ? resultEmbeddings.map((batch: any) => 
            Array.isArray(batch) 
              ? batch.map((e: any) => e === null ? [] : Array.isArray(e) ? e : []) 
              : []
          ) 
        : undefined,
      metadatas: resultMetadatas.length > 0 
        ? resultMetadatas.map((batch: any) => 
            Array.isArray(batch) 
              ? batch.map((m: any) => m === null ? {} : (typeof m === 'object' ? m : {})) 
              : []
          ) 
        : undefined,
      documents: resultDocuments.length > 0 
        ? resultDocuments.map((batch: any) => 
            Array.isArray(batch) 
              ? batch.map((d: any) => d === null ? '' : (typeof d === 'string' ? d : '')) 
              : []
          ) 
        : undefined,
      distances: resultDistances.length > 0 ? resultDistances : undefined
    };
  }
}