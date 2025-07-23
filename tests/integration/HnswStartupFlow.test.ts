/**
 * HNSW Startup Flow Integration Test
 * Tests complete HNSW initialization flow with mock dependencies
 * Isolates and debugs service creation order, dependency injection, and coordination issues
 */

import { MockIndexedDB } from '../mocks/MockIndexedDB';
import { MockVectorStore, MockCollectionData } from '../mocks/MockVectorStore';
import { MockFilesystem } from '../mocks/MockFilesystem';
import { HnswSearchService } from '../../src/database/services/hnsw/HnswSearchService';
import { HnswConfig } from '../../src/database/services/hnsw/config/HnswConfig';
import { PersistenceManager } from '../../src/database/providers/chroma/services/PersistenceManager';

// Load fixture data
import fileEmbeddingsFixture from '../fixtures/embeddings/file_embeddings.json';
import workspacesFixture from '../fixtures/embeddings/workspaces.json';
import freshStartupScenario from '../fixtures/scenarios/fresh_startup.json';
import staleIndexesScenario from '../fixtures/scenarios/stale_indexes.json';

/**
 * Test Environment for HNSW initialization testing
 */
class HnswTestEnvironment {
  private mockIndexedDB: MockIndexedDB;
  private mockVectorStore: MockVectorStore;
  private mockFilesystem: MockFilesystem;
  private mockPlugin: any;

  constructor() {
    this.mockIndexedDB = new MockIndexedDB();
    this.mockVectorStore = new MockVectorStore();
    this.mockFilesystem = new MockFilesystem();
    this.mockPlugin = this.createMockPlugin();
  }

  /**
   * Setup test environment with fixture data
   */
  setupEnvironment(scenario: 'fresh_startup' | 'stale_indexes'): void {
    // Reset all mocks
    this.mockIndexedDB.reset();
    this.mockVectorStore.reset();
    this.mockFilesystem.reset();

    // Load fixture data into mock vector store
    const fileEmbeddingsCollection: MockCollectionData = {
      name: 'file_embeddings',
      items: fileEmbeddingsFixture.items,
      count: fileEmbeddingsFixture.items.length,
      metadata: fileEmbeddingsFixture.metadata
    };

    const workspacesCollection: MockCollectionData = {
      name: 'workspaces', 
      items: workspacesFixture.items,
      count: workspacesFixture.items.length,
      metadata: workspacesFixture.metadata
    };

    this.mockVectorStore.addMockCollection(fileEmbeddingsCollection);
    this.mockVectorStore.addMockCollection(workspacesCollection);

    // Setup IndexedDB state based on scenario
    if (scenario === 'stale_indexes') {
      this.setupStaleIndexedDBState();
    }

    // Setup filesystem structure
    this.mockFilesystem.createStructure({
      '/test-data': {},
      '/test-data/chroma-db': {},
      '/test-data/chroma-db/collections': {}
    });
  }

  /**
   * Create HNSW Search Service with mocked dependencies
   */
  createHnswSearchService(): HnswSearchService {
    const config = HnswConfig.getTestConfig();
    
    // Create persistence manager with mock filesystem
    const persistenceManager = new PersistenceManager(this.mockFilesystem as any);
    
    // Create service with mocked dependencies
    const service = new HnswSearchService(
      this.mockPlugin,
      undefined, // app
      this.mockVectorStore,
      undefined, // embedding service (not needed for initialization tests)
      '/test-data',
      config.toOptions()
    );

    return service;
  }

  /**
   * Create mock coordination services
   */
  createMockCoordinationServices(): {
    stateManager: any;
    collectionCoordinator: any;
  } {
    const stateManager = {
      ensureInitialized: async (key: string, initFn: () => Promise<void>) => {
        console.log(`[TEST] StateManager.ensureInitialized called for: ${key}`);
        try {
          await initFn();
          return { success: true, error: null };
        } catch (error) {
          return { success: false, error };
        }
      }
    };

    const collectionCoordinator = {
      waitForCollections: async (timeout?: number) => {
        console.log(`[TEST] CollectionCoordinator.waitForCollections called (timeout: ${timeout})`);
        return { success: true };
      }
    };

    return { stateManager, collectionCoordinator };
  }

  /**
   * Get all mock operation histories for debugging
   */
  getDebugInfo(): {
    vectorStoreOps: any[];
    indexedDBOps: any[];
    filesystemOps: any[];
    vectorStoreState: any;
    indexedDBState: any;
    filesystemState: any;
  } {
    return {
      vectorStoreOps: this.mockVectorStore.getOperationHistory(),
      indexedDBOps: this.mockIndexedDB.getOperationHistory(),
      filesystemOps: this.mockFilesystem.getOperationHistory(),
      vectorStoreState: this.mockVectorStore.getState(),
      indexedDBState: this.mockIndexedDB.getDatabaseState(),
      filesystemState: this.mockFilesystem.getFilesystemState()
    };
  }

  /**
   * Setup stale IndexedDB state for testing index comparison
   */
  private setupStaleIndexedDBState(): void {
    // Add some old/stale index data to IndexedDB
    const db = this.mockIndexedDB.open('hnsw-indexes');
    // This would simulate existing but outdated indexes
  }

  /**
   * Create mock Obsidian plugin
   */
  private createMockPlugin(): any {
    return {
      app: {
        vault: {
          adapter: {
            path: '/test-obsidian-vault'
          }
        }
      },
      manifest: {
        id: 'claudesidian-mcp-test'
      },
      loadData: async () => ({}),
      saveData: async (data: any) => {}
    };
  }
}

/**
 * Test Suite for HNSW Startup Flow
 */
describe('HNSW Startup Flow Integration Tests', () => {
  let testEnv: HnswTestEnvironment;
  let service: HnswSearchService;
  let coordinationServices: any;

  beforeEach(() => {
    testEnv = new HnswTestEnvironment();
    // Suppress console.log during tests unless debugging
    if (!process.env.DEBUG_TESTS) {
      jest.spyOn(console, 'log').mockImplementation(() => {});
    }
  });

  afterEach(() => {
    if (!process.env.DEBUG_TESTS) {
      (console.log as jest.Mock).mockRestore();
    }
  });

  describe('Fresh Startup Scenario', () => {
    beforeEach(() => {
      testEnv.setupEnvironment('fresh_startup');
      service = testEnv.createHnswSearchService();
      coordinationServices = testEnv.createMockCoordinationServices();
    });

    test('should initialize services without null reference errors', async () => {
      // This is the critical test - ensure no null reference errors during initialization
      expect(() => {
        service.setInitializationCoordination(
          coordinationServices.stateManager,
          coordinationServices.collectionCoordinator
        );
      }).not.toThrow();

      // Allow initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const debugInfo = testEnv.getDebugInfo();
      console.log('[TEST] Debug Info:', JSON.stringify(debugInfo, null, 2));

      // Verify no critical errors occurred
      expect(debugInfo.vectorStoreOps.filter(op => !op.success)).toHaveLength(0);
    });

    test('should complete basic initialization with proper service creation order', async () => {
      // Track service creation order
      const creationOrder: string[] = [];
      const originalConsoleLog = console.log;
      
      console.log = (message: string) => {
        if (message.includes('[HNSW-UPDATE]') && message.includes('created')) {
          creationOrder.push(message);
        }
        if (process.env.DEBUG_TESTS) {
          originalConsoleLog(message);
        }
      };

      // Set coordination services and trigger initialization
      service.setInitializationCoordination(
        coordinationServices.stateManager,
        coordinationServices.collectionCoordinator
      );

      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      console.log = originalConsoleLog;

      // Verify service creation order was correct
      expect(creationOrder.length).toBeGreaterThan(0);
      
      // Check that no services were created before dependencies
      const persistenceServiceCreated = creationOrder.findIndex(msg => 
        msg.includes('HnswPersistenceOrchestrator created'));
      const wasmLibLoaded = creationOrder.findIndex(msg => 
        msg.includes('HNSW WASM library loaded'));
      
      expect(wasmLibLoaded).toBeLessThan(persistenceServiceCreated);
    });

    test('should process ChromaDB collections and build indexes', async () => {
      service.setInitializationCoordination(
        coordinationServices.stateManager,
        coordinationServices.collectionCoordinator
      );

      // Manually trigger full initialization to test coordination logic
      await service.ensureFullyInitialized();

      const debugInfo = testEnv.getDebugInfo();

      // Verify ChromaDB operations
      const listCollectionsOps = debugInfo.vectorStoreOps.filter(op => 
        op.operation === 'listCollections' && op.success);
      expect(listCollectionsOps.length).toBeGreaterThan(0);

      // Verify collections were queried
      const getAllItemsOps = debugInfo.vectorStoreOps.filter(op => 
        op.operation === 'getAllItems' && op.success);
      expect(getAllItemsOps.length).toBeGreaterThan(0);

      // Verify expected collections were processed
      const processedCollections = getAllItemsOps.map(op => op.collectionName);
      expect(processedCollections).toContain('file_embeddings');
      expect(processedCollections).toContain('workspaces');
    });

    test('should handle coordination service timeouts gracefully', async () => {
      // Create coordination services with timeout simulation
      const timeoutCoordinator = {
        waitForCollections: async (timeout?: number) => {
          throw new Error('Collection coordinator timeout');
        }
      };

      service.setInitializationCoordination(
        coordinationServices.stateManager,
        timeoutCoordinator
      );

      // Should not throw despite coordinator timeout
      await expect(service.ensureFullyInitialized()).resolves.not.toThrow();
    });
  });

  describe('Stale Indexes Scenario', () => {
    beforeEach(() => {
      testEnv.setupEnvironment('stale_indexes');
      service = testEnv.createHnswSearchService();
      coordinationServices = testEnv.createMockCoordinationServices();
    });

    test('should detect stale indexes and rebuild them', async () => {
      service.setInitializationCoordination(
        coordinationServices.stateManager,
        coordinationServices.collectionCoordinator
      );

      await service.ensureFullyInitialized();

      const debugInfo = testEnv.getDebugInfo();

      // Should have attempted to load persisted indexes first
      const vectorStoreOps = debugInfo.vectorStoreOps;
      expect(vectorStoreOps.some(op => op.operation === 'getAllItems')).toBe(true);

      // Should have processed collections for rebuilding
      const processedCollections = vectorStoreOps
        .filter(op => op.operation === 'getAllItems')
        .map(op => op.collectionName);
      expect(processedCollections.length).toBeGreaterThan(0);
    });
  });

  describe('Error Recovery', () => {
    beforeEach(() => {
      testEnv.setupEnvironment('fresh_startup');
      service = testEnv.createHnswSearchService();
      coordinationServices = testEnv.createMockCoordinationServices();
    });

    test('should handle ChromaDB connection failures gracefully', async () => {
      // Configure vector store to simulate failures
      const mockVectorStore = testEnv['mockVectorStore'];
      mockVectorStore.setFailureMode({
        listCollections: true
      });

      service.setInitializationCoordination(
        coordinationServices.stateManager,
        coordinationServices.collectionCoordinator
      );

      // Should not throw despite ChromaDB failures
      await expect(service.ensureFullyInitialized()).resolves.not.toThrow();

      const debugInfo = testEnv.getDebugInfo();
      
      // Should have recorded the failure
      const failedOps = debugInfo.vectorStoreOps.filter(op => !op.success);
      expect(failedOps.length).toBeGreaterThan(0);
    });

    test('should handle IndexedDB storage failures gracefully', async () => {
      // Configure IndexedDB to simulate failures
      const mockIndexedDB = testEnv['mockIndexedDB'];
      mockIndexedDB.setFailureMode({
        failOnPut: true
      });

      service.setInitializationCoordination(
        coordinationServices.stateManager,
        coordinationServices.collectionCoordinator
      );

      // Should complete initialization despite storage failures
      await expect(service.ensureFullyInitialized()).resolves.not.toThrow();
    });

    test('should handle missing coordination services gracefully', async () => {
      // Don't set coordination services - test fallback behavior
      // This tests the old initialization path
      
      await expect(service.initialize()).resolves.not.toThrow();
    });
  });

  describe('Service Statistics and Diagnostics', () => {
    beforeEach(() => {
      testEnv.setupEnvironment('fresh_startup');
      service = testEnv.createHnswSearchService();
      coordinationServices = testEnv.createMockCoordinationServices();
    });

    test('should provide accurate service statistics', async () => {
      service.setInitializationCoordination(
        coordinationServices.stateManager,
        coordinationServices.collectionCoordinator
      );

      await service.ensureFullyInitialized();

      const stats = service.getServiceStatistics();
      
      expect(stats).toHaveProperty('isInitialized');
      expect(stats).toHaveProperty('isFullyReady');
      expect(stats).toHaveProperty('totalIndexes');
      expect(stats).toHaveProperty('totalItems');
      expect(stats).toHaveProperty('configuredCollections');

      console.log('[TEST] Service Statistics:', stats);
    });

    test('should provide comprehensive diagnostics', async () => {
      service.setInitializationCoordination(
        coordinationServices.stateManager,
        coordinationServices.collectionCoordinator
      );

      await service.ensureFullyInitialized();

      const diagnostics = await service.diagnose();
      
      expect(diagnostics).toHaveProperty('status');
      expect(diagnostics).toHaveProperty('details');
      expect(diagnostics).toHaveProperty('recommendations');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(diagnostics.status);

      console.log('[TEST] Service Diagnostics:', JSON.stringify(diagnostics, null, 2));
    });
  });
});

// Additional utility functions for debugging

/**
 * Run a specific test scenario with full debugging output
 */
export async function debugHnswInitialization(scenario: 'fresh_startup' | 'stale_indexes'): Promise<void> {
  const testEnv = new HnswTestEnvironment();
  testEnv.setupEnvironment(scenario);
  
  const service = testEnv.createHnswSearchService();
  const coordinationServices = testEnv.createMockCoordinationServices();

  console.log(`\n=== DEBUGGING HNSW INITIALIZATION: ${scenario} ===\n`);

  try {
    console.log('1. Setting coordination services...');
    service.setInitializationCoordination(
      coordinationServices.stateManager,
      coordinationServices.collectionCoordinator
    );

    console.log('2. Triggering full initialization...');
    await service.ensureFullyInitialized();

    console.log('3. Getting service statistics...');
    const stats = service.getServiceStatistics();
    console.log('Service Stats:', stats);

    console.log('4. Running diagnostics...');
    const diagnostics = await service.diagnose();
    console.log('Diagnostics:', diagnostics);

    console.log('5. Getting debug information...');
    const debugInfo = testEnv.getDebugInfo();
    console.log('Debug Info:', JSON.stringify(debugInfo, null, 2));

  } catch (error) {
    console.error('Initialization failed:', error);
    const debugInfo = testEnv.getDebugInfo();
    console.log('Debug Info (on error):', JSON.stringify(debugInfo, null, 2));
  }

  console.log(`\n=== END DEBUG SESSION ===\n`);
}

// Export for use in other test files
export { HnswTestEnvironment };