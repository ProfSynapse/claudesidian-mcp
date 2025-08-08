import { ChromaClient, Collection } from './PersistentChromaClient';
import { BaseVectorStore } from '../base/BaseVectorStore';
import { IStorageOptions } from '../../interfaces/IStorageOptions';
import { VectorStoreConfig } from '../../models/VectorStoreConfig';
import { Plugin } from 'obsidian';

// Import extracted coordination services
import { VectorStoreInitializer, VectorStoreInitializationResult, InitializationContext } from './VectorStoreInitializer';
import { ServiceCoordinator, ServiceCoordinatorInterface, ServiceRegistry, ClientDependentServices } from './ServiceCoordinator';

// Import core interfaces
import { IDirectoryService } from './services/interfaces/IDirectoryService';
import { IChromaClientFactory } from './services/interfaces/IChromaClientFactory';
import { ICollectionManager } from './services/interfaces/ICollectionManager';
import { IDiagnosticsService, RepairResult, ValidationResult } from './services/interfaces/IDiagnosticsService';
import { ISizeCalculatorService } from './services/interfaces/ISizeCalculatorService';

// Import initialization coordination
import { ICollectionLoadingCoordinator } from '../../../services/initialization/interfaces/ICollectionLoadingCoordinator';

// Import collection service (consolidated)
import { CollectionService } from '../../services/core/CollectionService';

// Define standard include types for vector store compatibility
type StoreIncludeType = 'embeddings' | 'metadatas' | 'documents' | 'distances';

/**
 * Modular ChromaDB vector store implementation
 * Now follows SOLID principles with focused, single-responsibility services
 * Enhanced with initialization coordination to prevent duplicate collection loading
 * 
 * SOLID Principles Applied:
 * - SRP: Each service has a single, well-defined responsibility
 * - OCP: Open for extension (new services) without modification
 * - LSP: Services can be substituted with different implementations
 * - ISP: Interfaces are focused and not bloated
 * - DIP: Depends on abstractions (interfaces) not concretions
 */
export class ChromaVectorStoreModular extends BaseVectorStore {
  // Extracted coordination services
  private serviceCoordinator: ServiceCoordinatorInterface;
  private vectorStoreInitializer: VectorStoreInitializer;
  
  // Service registry for organized service access
  private services: ServiceRegistry;
  
  // ChromaDB client
  private client: InstanceType<typeof ChromaClient> | null = null;
  
  // Plugin instance for accessing paths
  private plugin: Plugin;
  
  // Collection loading coordinator (injected)
  private collectionCoordinator: ICollectionLoadingCoordinator | null = null;
  
  // Collection lifecycle management (managed by initializer)
  private collectionLifecycleManager: CollectionLifecycleManager | null = null;
  private collectionHealthMonitor: CollectionHealthMonitor | null = null;

  /**
   * Create a new modular ChromaDB vector store
   * Uses dependency injection for better testability and modularity
   */
  constructor(plugin: Plugin, options?: Partial<IStorageOptions>) {
    super(options);
    this.plugin = plugin;
    
    // Initialize coordination services
    this.serviceCoordinator = new ServiceCoordinator();
    this.vectorStoreInitializer = new VectorStoreInitializer();
    
    // Initialize core services with dependency injection
    this.services = this.serviceCoordinator.initializeServices(plugin);
  }
  
  /**
   * Set collection loading coordinator (injected by service manager)
   * Follows Dependency Inversion Principle
   */
  setCollectionCoordinator(coordinator: ICollectionLoadingCoordinator): void {
    this.collectionCoordinator = coordinator;
  }

  /**
   * Get service for external access (following interface segregation)
   */
  private getDirectoryService(): IDirectoryService {
    return this.services.directoryService;
  }
  
  private getCollectionManager(): ICollectionManager {
    if (!this.services.collectionManager) {
      throw new Error('Collection manager not initialized - call initialize() first');
    }
    return this.services.collectionManager;
  }
  
  private getDiagnosticsService(): IDiagnosticsService {
    if (!this.services.diagnosticsService) {
      throw new Error('Diagnostics service not initialized - call initialize() first');
    }
    return this.services.diagnosticsService;
  }
  
  private getSizeCalculatorService(): ISizeCalculatorService {
    if (!this.services.sizeCalculatorService) {
      throw new Error('Size calculator service not initialized - call initialize() first');
    }
    return this.services.sizeCalculatorService;
  }

  /**
   * Initialize the ChromaDB client and all services using extracted coordinators
   */
  async initialize(): Promise<void> {
    try {
      // Validate service dependencies
      if (!this.serviceCoordinator.validateServiceDependencies(this.services)) {
        throw new Error('Service dependencies validation failed');
      }
      
      // Prepare initialization context (services will be updated after creation)
      const context: InitializationContext = {
        plugin: this.plugin,
        config: this.config,
        directoryService: this.services.directoryService,
        clientFactory: this.services.clientFactory,
        collectionManager: undefined as any, // Will be set after service initialization
        diagnosticsService: undefined as any, // Will be set after service initialization
        sizeCalculatorService: undefined as any, // Will be set after service initialization
        collectionCoordinator: this.collectionCoordinator || undefined
      };
      
      // First create a temporary client for client-dependent services initialization
      const tempClient = await this.services.clientFactory.createClient(this.config);
      
      // Initialize client-dependent services
      const clientDependentServices = this.serviceCoordinator.initializeClientDependentServices(
        tempClient,
        this.services,
        this.config
      );
      
      // Setup service communication
      this.serviceCoordinator.setupServiceCommunication(
        this.services,
        clientDependentServices,
        this.plugin
      );
      
      // Update context with initialized services
      context.collectionManager = this.services.collectionManager!;
      context.diagnosticsService = this.services.diagnosticsService!;
      context.sizeCalculatorService = this.services.sizeCalculatorService!;
      
      // Perform complete vector store initialization
      const initResult = await this.vectorStoreInitializer.initialize(context);
      
      // Store initialized components
      this.client = initResult.client;
      this.collectionLifecycleManager = initResult.collectionLifecycleManager || null;
      
      // Initialize health monitor now that vector store is ready
      if (this.collectionLifecycleManager) {
        try {
          this.collectionHealthMonitor = await this.vectorStoreInitializer.initializeHealthMonitoring(
            context, 
            this, 
            this.collectionLifecycleManager
          ) || null;
        } catch (error) {
          console.warn('Health monitoring initialization failed:', error);
          this.collectionHealthMonitor = null;
        }
      } else {
        this.collectionHealthMonitor = null;
      }
      
      // Set initialized flag after successful initialization
      this.initialized = true;
      
      // Now start health monitoring after vector store is fully initialized
      if (this.collectionHealthMonitor) {
        this.collectionHealthMonitor.startMonitoring().catch(error => {
          console.warn('Health monitoring startup failed:', error);
          // Continue without health monitoring - it's not critical for normal operation
        });
      }
      
      // Initialization completed successfully
      
    } catch (error) {
      // Reset initialized flag on error
      this.initialized = false;
      console.error('Initialization failed:', error);
      throw new Error(`ChromaDB initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Note: This method has been moved to ServiceCoordinator.initializeClientDependentServices()
  // The coordination logic is now handled by the ServiceCoordinator service

  // Note: Collection loading is now handled by ContextualEmbeddingManager on-demand
  // The context-aware loading approach replaces eager collection initialization

  // Note: This method has been moved to VectorStoreInitializer.ensureStandardCollections()
  // The collection setup logic is now handled by the VectorStoreInitializer service

  // Note: This method has been moved to VectorStoreInitializer.initializeHealthMonitoring()
  // The health monitoring setup is now handled by the VectorStoreInitializer service
  
  // Note: This method has been moved to VectorStoreInitializer coordination
  // Collection loading is now handled by the initialization services

  // Note: This method has been moved to VectorStoreInitializer.resolveConfiguration()
  // Configuration resolution is now handled by the VectorStoreInitializer service

  /**
   * Close the ChromaDB client and cleanup services using coordinators
   */
  async close(): Promise<void> {
    try {
      // Use VectorStoreInitializer for graceful shutdown
      if (this.client) {
        const initResult: VectorStoreInitializationResult = {
          client: this.client,
          collectionLifecycleManager: this.collectionLifecycleManager || undefined,
          collectionHealthMonitor: this.collectionHealthMonitor || undefined
        };
        
        await this.vectorStoreInitializer.shutdown(initResult, this.config);
      }
      
      // Shutdown all services using service coordinator
      await this.serviceCoordinator.shutdownServices(this.services);
      
      // Reset state
      this.client = null;
      this.initialized = false;
      this.collectionLifecycleManager = null;
      this.collectionHealthMonitor = null;
      
      // Shutdown completed successfully
      
    } catch (error) {
      console.error("Error during shutdown:", error);
      // Reset state even if there was an error
      this.client = null;
      this.initialized = false;
      this.collectionLifecycleManager = null;
      this.collectionHealthMonitor = null;
    }
  }

  /**
   * Create a new collection
   * Delegates to collection manager
   */
  async createCollection(collectionName: string, metadata?: Record<string, any>): Promise<void> {
    this.ensureInitialized();
    await this.getCollectionManager().createCollection(collectionName, metadata);
  }

  /**
   * Check if a collection exists
   * Delegates to collection manager
   */
  async hasCollection(collectionName: string): Promise<boolean> {
    this.ensureInitialized();
    return await this.getCollectionManager().hasCollection(collectionName);
  }

  /**
   * List all collections
   * Delegates to collection manager
   */
  async listCollections(): Promise<string[]> {
    this.ensureInitialized();
    return await this.getCollectionManager().listCollections();
  }

  /**
   * Delete a collection
   * Delegates to collection manager
   */
  async deleteCollection(collectionName: string): Promise<void> {
    this.ensureInitialized();
    await this.getCollectionManager().deleteCollection(collectionName);
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
    
    const collection = await this.getCollectionManager().getOrCreateCollection(collectionName);
    
    // Validate input
    this.validateItemArrayLengths(items);
    
    await collection.add({
      ids: items.ids,
      embeddings: items.embeddings,
      metadatas: items.metadatas,
      documents: items.documents
    });
    
    // Update metadata with current count after adding items
    await this.updateCollectionMetadata(collectionName);
  }

  /**
   * Get items by ID from a collection
   * Returns empty result when IDs array is empty (Settings UI usage)
   */
  async getItems(collectionName: string, ids: string[], include?: StoreIncludeType[]): Promise<{
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }> {
    this.ensureInitialized();
    
    // When empty IDs array is passed (Settings UI usage), return empty result
    const isSettingsUICall = !ids || ids.length === 0;
    const collection = await this.getCollectionManager().getOrCreateCollection(collectionName, isSettingsUICall);
    
    if (isSettingsUICall) {
      // For Settings UI calls with empty IDs, return empty result
      return {
        ids: [],
        embeddings: include?.includes('embeddings') ? [] : undefined,
        metadatas: include?.includes('metadatas') ? [] : undefined,
        documents: include?.includes('documents') ? [] : undefined,
      };
    }
    
    const results = await collection.get({
      ids,
      include: include || ['embeddings', 'metadatas', 'documents'],
      contextAware: false // Normal search operations need full data
    } as any);
    
    return this.normalizeGetResults(results);
  }

  /**
   * Get all items from a collection
   */
  async getAllItems(collectionName: string, options?: { limit?: number; offset?: number }): Promise<{
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }> {
    console.log(`[ChromaVectorStore.getAllItems] Called for collection: ${collectionName}`);
    console.log(`[ChromaVectorStore.getAllItems] Options:`, options);
    
    this.ensureInitialized();
    
    // Get collection with normal loading - let memory management handle this
    const collection = await this.getCollectionManager().getOrCreateCollection(collectionName, false);
    
    // Use reasonable default limit based on collection size
    const actualLimit = options?.limit || await this.count(collectionName);
    
    // Get all items without specifying IDs
    const results = await collection.get({
      include: ['embeddings', 'metadatas', 'documents'],
      limit: actualLimit,
      offset: options?.offset,
      contextAware: false // Full load requested
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
    
    const collection = await this.getCollectionManager().getOrCreateCollection(collectionName);
    
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
    
    const collection = await this.getCollectionManager().getOrCreateCollection(collectionName);
    
    await collection.delete({ ids });
    
    // Update metadata with current count after deleting items
    await this.updateCollectionMetadata(collectionName);
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
    
    const collection = await this.getCollectionManager().getOrCreateCollection(collectionName);
    
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
    
    // Use context-aware mode to get collection without loading data
    const collection = await this.getCollectionManager().getOrCreateCollection(collectionName, true);
    
    // Use context-aware count to get estimate without loading all data
    return await collection.count(true);
  }

  /**
   * Update collection metadata with current item count
   * @param collectionName Collection name to update metadata for
   */
  private async updateCollectionMetadata(collectionName: string): Promise<void> {
    // Skip metadata updates - let the system handle this through proper persistence layer
    // The root cause is that we're bypassing the normal persistence flow
    console.log(`[ChromaVectorStore] Skipping metadata update for ${collectionName} - delegating to persistence layer`);
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
    
    return await this.getDiagnosticsService().getDiagnostics();
  }

  /**
   * Repair and reload collections from disk
   * Delegates to diagnostics service
   */
  async repairCollections(): Promise<RepairResult> {
    this.ensureInitialized();
    return await this.getDiagnosticsService().repairCollections();
  }

  /**
   * Validate collections to ensure they are in sync with disk storage
   * Delegates to diagnostics service
   */
  async validateCollections(): Promise<ValidationResult> {
    this.ensureInitialized();
    return await this.getDiagnosticsService().validateCollections();
  }

  /**
   * Calculate database size - delegates to size calculator service
   */
  async calculateDatabaseSize(): Promise<number> {
    this.ensureInitialized();
    return await this.getSizeCalculatorService().calculateTotalDatabaseSize();
  }

  /**
   * Calculate memory database size - delegates to size calculator service
   */
  async calculateMemoryDatabaseSize(): Promise<number> {
    this.ensureInitialized();
    return await this.getSizeCalculatorService().calculateMemoryDatabaseSize();
  }

  /**
   * Get storage breakdown by collection
   */
  async getStorageBreakdown(): Promise<Record<string, number>> {
    this.ensureInitialized();
    return await this.getSizeCalculatorService().getStorageBreakdown();
  }

  /**
   * Check if system is healthy
   */
  async isHealthy(): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }
    
    return await this.getDiagnosticsService().isHealthy();
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
    return await this.getDiagnosticsService().runHealthCheck();
  }

  /**
   * Get collection lifecycle manager for advanced collection operations
   */
  getCollectionLifecycleManager(): CollectionLifecycleManager | null {
    return this.collectionLifecycleManager;
  }

  /**
   * Get collection health monitor for health monitoring operations
   */
  getCollectionHealthMonitor(): CollectionHealthMonitor | null {
    return this.collectionHealthMonitor;
  }

  /**
   * Perform collection health check on all collections
   * Exposes lifecycle manager functionality
   */
  async performCollectionHealthCheck(): Promise<any> {
    this.ensureInitialized();
    
    if (!this.collectionLifecycleManager) {
      throw new Error('Collection lifecycle manager not initialized');
    }
    
    return await this.collectionLifecycleManager.performHealthCheck();
  }

  /**
   * Validate specific collection health
   * Exposes lifecycle manager functionality  
   */
  async validateCollectionHealth(collectionName: string): Promise<any> {
    this.ensureInitialized();
    
    if (!this.collectionLifecycleManager) {
      throw new Error('Collection lifecycle manager not initialized');
    }
    
    return await this.collectionLifecycleManager.validateCollection(collectionName);
  }

  /**
   * Recover a specific collection
   * Exposes lifecycle manager functionality
   */
  async recoverCollection(collectionName: string, strategy: 'soft' | 'hard' | 'data' = 'soft'): Promise<any> {
    this.ensureInitialized();
    
    if (!this.collectionLifecycleManager) {
      throw new Error('Collection lifecycle manager not initialized');
    }
    
    return await this.collectionLifecycleManager.recoverCollection(collectionName, strategy);
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