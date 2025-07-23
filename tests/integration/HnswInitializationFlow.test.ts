/**
 * HNSW Initialization Flow Test
 * Tests the actual initialization flow you're experiencing without external WASM dependencies
 * Focuses on service creation order, coordination injection, and null reference prevention
 */

import { MockVectorStore, MockCollectionData } from '../mocks/MockVectorStore';
import { MockFilesystem } from '../mocks/MockFilesystem';
import fileEmbeddingsFixture from '../fixtures/embeddings/file_embeddings.json';
import workspacesFixture from '../fixtures/embeddings/workspaces.json';

/**
 * Mock HNSW Service that simulates the actual service creation issues
 */
class MockHnswSearchService {
  private initializationStateManager: any = null;
  private collectionCoordinator: any = null;
  private isInitialized = false;
  private fullyInitialized = false;
  private services: any = {};
  private hnswLib: any = null;

  constructor(
    private plugin: any,
    private app?: any,
    private vectorStore?: any,
    private embeddingService?: any,
    private persistentPath?: string,
    private configOptions?: any
  ) {
    console.log('[MOCK-HNSW] Constructor called with dependencies:', {
      hasPlugin: !!plugin,
      hasApp: !!app,
      hasVectorStore: !!vectorStore,
      hasPersistentPath: !!persistentPath
    });
  }

  /**
   * This mimics your actual setInitializationCoordination method
   */
  setInitializationCoordination(
    stateManager: any,
    collectionCoordinator: any
  ): void {
    console.log('[MOCK-HNSW] 🎯 setInitializationCoordination called - injecting coordination services');
    this.initializationStateManager = stateManager;
    this.collectionCoordinator = collectionCoordinator;
    
    console.log('[MOCK-HNSW] 🔥 Coordination services injected:', {
      hasStateManager: !!this.initializationStateManager,
      hasCollectionCoordinator: !!this.collectionCoordinator
    });
    
    // Trigger initialization now that coordination services are available
    console.log('[MOCK-HNSW] 🚀 Coordination services injected, triggering deferred initialization');
    this.initialize().then(() => {
      console.log('[MOCK-HNSW] ✅ Deferred initialization completed successfully');
    }).catch(error => {
      console.error('[MOCK-HNSW] ❌ Failed to initialize after coordination injection:', error);
    });
  }

  /**
   * This simulates your actual initialize method
   */
  async initialize(): Promise<void> {
    console.log('[MOCK-HNSW] 🎯 initialize() called, checking coordination services');
    
    // CRITICAL: Do not auto-initialize until coordination services are injected
    if (!this.initializationStateManager) {
      console.log('[MOCK-HNSW] ⏸️ Coordination services not injected yet, deferring initialization');
      return;
    }

    console.log('[MOCK-HNSW] ✅ Coordination services available, proceeding with initialization');

    // Use coordination system to prevent duplicate initialization
    console.log('[MOCK-HNSW] 🔄 Calling ensureInitialized for hnsw_basic_init');
    const result = await this.initializationStateManager.ensureInitialized(
      'hnsw_basic_init',
      async () => {
        console.log('[MOCK-HNSW] 🚀 Running performBasicInitialization callback');
        await this.performBasicInitialization();
      }
    );
    
    console.log('[MOCK-HNSW] 📊 ensureInitialized result:', { success: result.success, hasError: !!result.error });
    
    if (!result.success) {
      console.error('[MOCK-HNSW] ❌ ensureInitialized failed:', result.error);
      throw result.error || new Error('HNSW basic initialization failed');
    }
    
    console.log('[MOCK-HNSW] ✅ initialize() completed successfully');
  }

  /**
   * This simulates your performBasicInitialization method
   */
  private async performBasicInitialization(): Promise<void> {
    console.log('[MOCK-HNSW] 🎯 performBasicInitialization() called');
    console.log('[MOCK-HNSW] 📊 Current state:', {
      isInitialized: this.isInitialized,
      fullyInitialized: this.fullyInitialized,
      hasServices: !!this.services,
      hasHnswLib: !!this.hnswLib
    });
    
    if (this.isInitialized) {
      console.log('[MOCK-HNSW] ⏸️ Already initialized, skipping basic initialization');
      return;
    }
    
    console.log('[MOCK-HNSW] 🚀 Starting HNSW basic initialization with proper service creation order');

    try {
      // STEP 1: Initialize lightweight services first
      if (!this.services || !this.services.validationService) {
        console.log('[MOCK-HNSW] Creating lightweight services');
        await this.initializeLightweightServices();
      }
      
      // STEP 2: Load HNSW WASM library (mocked)
      console.log('[MOCK-HNSW] Loading HNSW WASM library (mocked)');
      this.hnswLib = { mock: 'hnswlib' }; // Mock the library
      console.log('[MOCK-HNSW] ✅ HNSW WASM library loaded successfully');

      // STEP 3: Create dependencies in correct order
      console.log('[MOCK-HNSW] Creating service dependencies in proper order');
      
      // Mock filesystem interface
      const fsInterface = {
        existsSync: () => true,
        mkdirSync: () => {},
        writeFileSync: () => {},
        readFileSync: () => '{}',
        renameSync: () => {},
        unlinkSync: () => {},
        readdirSync: () => [],
        statSync: () => ({ size: 0, mtime: new Date(), ctime: new Date() }),
        rmdirSync: () => {}
      };
      
      // Create mock services
      const mockPersistenceManager = { mock: 'PersistenceManager' };
      const mockStateManager = { loadState: async () => {} };
      const mockContentHashService = { mock: 'ContentHashService' };
      const mockMetadataManager = { mock: 'HnswMetadataManager' };
      const mockIndexOperations = { mock: 'HnswIndexOperations' };
      
      console.log('[MOCK-HNSW] ✅ Dependencies created');

      // STEP 4: Create persistence orchestrator with all dependencies
      console.log('[MOCK-HNSW] Creating HnswPersistenceOrchestrator with full dependencies');
      this.services.persistenceService = {
        canLoadPersistedIndex: async () => false,
        mock: 'HnswPersistenceOrchestrator'
      };
      console.log('[MOCK-HNSW] ✅ HnswPersistenceOrchestrator created successfully');

      // STEP 5: Create remaining services
      this.services.partitionManager = { mock: 'HnswPartitionManager' };
      console.log('[MOCK-HNSW] ✅ Partition manager created');
      
      this.services.indexManager = {
        hasIndex: () => false,
        createOrUpdateIndex: async () => ({ success: true, itemsIndexed: 0 }),
        getIndexStatistics: () => ({ totalItems: 0 }),
        mock: 'HnswIndexManager'
      };
      console.log('[MOCK-HNSW] ✅ Index manager created');
      
      this.services.searchEngine = { mock: 'HnswSearchEngine' };
      console.log('[MOCK-HNSW] ✅ Search engine created');

      // STEP 6: Initialize coordinator
      this.services.coordinator = {
        executeFullInitialization: async () => ({
          success: true,
          collectionsProcessed: 0,
          indexesBuilt: 0,
          indexesLoaded: 0,
          errors: []
        }),
        mock: 'HnswCoordinator'
      };
      console.log('[MOCK-HNSW] ✅ HnswCoordinator created with proper dependencies');

      this.isInitialized = true;
      console.log('[MOCK-HNSW] 🎉 HNSW basic initialization completed successfully');
      
    } catch (error) {
      console.error('[MOCK-HNSW] ❌ Failed HNSW initialization:', error);
      throw error;
    }
  }

  private async initializeLightweightServices(): Promise<void> {
    console.log('[MOCK-HNSW] Creating basic HNSW services');
    
    this.services = {
      validationService: { mock: 'HnswValidationService' },
      persistenceService: null, // Will be created later
      partitionManager: null,
      indexManager: null,
      searchEngine: null,
      resultProcessor: { mock: 'HnswResultProcessor' }
    };
    
    console.log('[MOCK-HNSW] ✅ Basic HNSW services created successfully');
  }

  async ensureFullyInitialized(): Promise<void> {
    await this.initialize();
    
    if (this.fullyInitialized) {
      return;
    }
    
    if (this.initializationStateManager) {
      const result = await this.initializationStateManager.ensureInitialized(
        'hnsw_full_init',
        async () => {
          await this.performFullInitialization();
        }
      );
      
      if (!result.success) {
        console.error('[MOCK-HNSW] Full initialization failed:', result.error);
        this.fullyInitialized = true; // Mark as initialized to prevent repeated attempts
      }
    }
  }

  private async performFullInitialization(): Promise<void> {
    console.log('[MOCK-HNSW] Starting full HNSW initialization');

    if (this.fullyInitialized) {
      console.log('[MOCK-HNSW] Already fully initialized, skipping');
      return;
    }

    try {
      if (this.collectionCoordinator) {
        const collectionsResult = await this.collectionCoordinator.waitForCollections();
        console.log('[MOCK-HNSW] Collection coordinator completed');
      }
      
      console.log('[MOCK-HNSW] 🔥 Calling coordinator.executeFullInitialization');
      const result = await this.services.coordinator.executeFullInitialization();
      
      this.fullyInitialized = true;
      console.log('[MOCK-HNSW] Full initialization completed successfully');
      
    } catch (error) {
      console.error('[MOCK-HNSW] Critical initialization error:', error);
      this.fullyInitialized = true; // Prevent repeated attempts
    }
  }

  // Public methods for testing
  getServiceStatistics() {
    return {
      isInitialized: this.isInitialized,
      isFullyReady: this.fullyInitialized,
      totalIndexes: 0,
      totalItems: 0,
      configuredCollections: []
    };
  }
}

/**
 * Test Environment that simulates your actual initialization flow
 */
class HnswInitializationTestEnvironment {
  private mockVectorStore: MockVectorStore;
  private mockFilesystem: MockFilesystem;
  private mockPlugin: any;

  constructor() {
    this.mockVectorStore = new MockVectorStore();
    this.mockFilesystem = new MockFilesystem();
    this.mockPlugin = {
      app: { vault: { adapter: { path: '/test-vault' } } },
      manifest: { id: 'test-plugin' },
      loadData: async () => ({}),
      saveData: async () => {}
    };
  }

  setupTestData(): void {
    // Load fixture data
    const fileEmbeddingsCollection: MockCollectionData = {
      name: 'file_embeddings',
      items: fileEmbeddingsFixture.items as any,
      count: fileEmbeddingsFixture.items.length,
      metadata: fileEmbeddingsFixture.metadata
    };

    const workspacesCollection: MockCollectionData = {
      name: 'workspaces',
      items: workspacesFixture.items as any,
      count: workspacesFixture.items.length,
      metadata: workspacesFixture.metadata
    };

    this.mockVectorStore.addMockCollection(fileEmbeddingsCollection);
    this.mockVectorStore.addMockCollection(workspacesCollection);
  }

  createHnswService(): MockHnswSearchService {
    return new MockHnswSearchService(
      this.mockPlugin,
      this.mockPlugin.app,
      this.mockVectorStore,
      undefined,
      '/test-data'
    );
  }

  createCoordinationServices() {
    const stateManager = {
      ensureInitialized: async (key: string, initFn: () => Promise<void>) => {
        console.log(`[TEST-COORD] StateManager.ensureInitialized called for: ${key}`);
        try {
          await initFn();
          console.log(`[TEST-COORD] ✅ Initialization completed for: ${key}`);
          return { success: true, error: null };
        } catch (error) {
          console.log(`[TEST-COORD] ❌ Initialization failed for: ${key}`, error);
          return { success: false, error };
        }
      }
    };

    const collectionCoordinator = {
      waitForCollections: async (timeout?: number) => {
        console.log(`[TEST-COORD] CollectionCoordinator.waitForCollections called (timeout: ${timeout})`);
        // Simulate collection loading
        const collections = await this.mockVectorStore.listCollections();
        console.log(`[TEST-COORD] Found ${collections.length} collections:`, collections);
        return { success: true };
      }
    };

    return { stateManager, collectionCoordinator };
  }

  getDebugInfo() {
    return {
      vectorStoreOps: this.mockVectorStore.getOperationHistory(),
      vectorStoreState: this.mockVectorStore.getState(),
      filesystemOps: this.mockFilesystem.getOperationHistory()
    };
  }

  reset(): void {
    this.mockVectorStore.reset();
    this.mockFilesystem.reset();
  }
}

describe('HNSW Initialization Flow Tests', () => {
  let testEnv: HnswInitializationTestEnvironment;
  let service: MockHnswSearchService;

  beforeEach(() => {
    testEnv = new HnswInitializationTestEnvironment();
    testEnv.setupTestData();
    service = testEnv.createHnswService();
  });

  afterEach(() => {
    testEnv.reset();
  });

  describe('Service Creation and Coordination', () => {
    test('should create service without throwing', () => {
      expect(service).toBeDefined();
    });

    test('should inject coordination services correctly', () => {
      const { stateManager, collectionCoordinator } = testEnv.createCoordinationServices();
      
      expect(() => {
        service.setInitializationCoordination(stateManager, collectionCoordinator);
      }).not.toThrow();
    });

    test('should defer initialization until coordination services are injected', async () => {
      // Call initialize without coordination services - should defer
      await service.initialize();
      
      const stats = service.getServiceStatistics();
      console.log('[TEST] Stats after deferred initialization:', stats);
      
      // Should not be initialized yet
      expect(stats.isInitialized).toBe(false);
    });

    test('should complete initialization after coordination injection', async () => {
      const { stateManager, collectionCoordinator } = testEnv.createCoordinationServices();
      
      // Inject coordination services - this should trigger initialization
      service.setInitializationCoordination(stateManager, collectionCoordinator);
      
      // Wait for async initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const stats = service.getServiceStatistics();
      console.log('[TEST] Stats after coordination injection:', stats);
      
      // Should now be initialized
      expect(stats.isInitialized).toBe(true);
    }, 10000);
  });

  describe('Full Initialization Flow', () => {
    test('should complete full initialization without errors', async () => {
      const { stateManager, collectionCoordinator } = testEnv.createCoordinationServices();
      
      service.setInitializationCoordination(stateManager, collectionCoordinator);
      
      // Trigger full initialization
      await service.ensureFullyInitialized();
      
      const stats = service.getServiceStatistics();
      console.log('[TEST] Final stats:', stats);
      
      expect(stats.isInitialized).toBe(true);
      expect(stats.isFullyReady).toBe(true);
    }, 15000);

    test('should process collections through coordination system', async () => {
      const { stateManager, collectionCoordinator } = testEnv.createCoordinationServices();
      
      service.setInitializationCoordination(stateManager, collectionCoordinator);
      await service.ensureFullyInitialized();
      
      const debugInfo = testEnv.getDebugInfo();
      
      // Verify collections were processed
      const listOps = debugInfo.vectorStoreOps.filter(op => op.operation === 'listCollections');
      expect(listOps.length).toBeGreaterThan(0);
      
      console.log('[TEST] Vector store operations:', debugInfo.vectorStoreOps.map(op => 
        `${op.operation}(${op.collectionName || 'N/A'})`
      ));
    }, 15000);
  });

  describe('Error Scenarios', () => {
    test('should handle coordination service failures gracefully', async () => {
      const failingStateManager = {
        ensureInitialized: async () => {
          throw new Error('Coordination failure');
        }
      };
      
      const { collectionCoordinator } = testEnv.createCoordinationServices();
      
      service.setInitializationCoordination(failingStateManager, collectionCoordinator);
      
      // Should handle the error without crashing
      await expect(service.initialize()).rejects.toThrow('Coordination failure');
    });

    test('should handle collection coordinator timeouts', async () => {
      const { stateManager } = testEnv.createCoordinationServices();
      const timeoutCoordinator = {
        waitForCollections: async () => {
          throw new Error('Collection loading timeout');
        }
      };
      
      service.setInitializationCoordination(stateManager, timeoutCoordinator);
      
      // Should complete despite timeout
      await expect(service.ensureFullyInitialized()).resolves.not.toThrow();
    });
  });
});

// Export for standalone testing
export { HnswInitializationTestEnvironment, MockHnswSearchService };