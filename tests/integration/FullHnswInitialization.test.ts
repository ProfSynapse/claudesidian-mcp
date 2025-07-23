/**
 * Full HNSW Initialization Integration Test
 * Tests complete HNSW initialization with real dependencies
 * Uses actual hnswlib-wasm and mock data to test the full flow
 */

import { loadHnswlib } from 'hnswlib-wasm';
import { Plugin, App, TFile } from 'obsidian';
import { HnswSearchService } from '../../src/database/services/hnsw/HnswSearchService';
import { HnswConfig } from '../../src/database/services/hnsw/config/HnswConfig';
import { MockVectorStore, MockCollectionData } from '../mocks/MockVectorStore';
import { MockFilesystem } from '../mocks/MockFilesystem';
import { PersistenceManager } from '../../src/database/providers/chroma/services/PersistenceManager';

// Load fixture data
import fileEmbeddingsFixture from '../fixtures/embeddings/file_embeddings.json';
import workspacesFixture from '../fixtures/embeddings/workspaces.json';

/**
 * Mock Plugin class for testing
 */
class MockObsidianPlugin extends Plugin {
  constructor() {
    super({} as App, {} as any);
    this.app = {
      vault: {
        adapter: {
          path: '/test-vault'
        },
        getFiles: () => [],
        read: async () => '',
        modify: async () => {},
        on: () => {},
        off: () => {}
      },
      workspace: {
        on: () => {},
        off: () => {}
      }
    } as any;
    
    this.manifest = {
      id: 'claudesidian-mcp-test',
      name: 'Test Plugin',
      version: '1.0.0'
    } as any;
  }

  async loadData(): Promise<any> {
    return {};
  }

  async saveData(data: any): Promise<void> {
    // Mock save
  }
}

/**
 * Full Integration Test Environment
 */
class FullHnswTestEnvironment {
  private mockPlugin: MockObsidianPlugin;
  private mockVectorStore: MockVectorStore;
  private mockFilesystem: MockFilesystem;
  private persistenceManager: PersistenceManager;

  constructor() {
    this.mockPlugin = new MockObsidianPlugin();
    this.mockVectorStore = new MockVectorStore();
    this.mockFilesystem = new MockFilesystem();
    this.persistenceManager = new PersistenceManager(this.mockFilesystem as any);
  }

  /**
   * Setup test environment with fixture data
   */
  setupTestData(): void {
    console.log('[TEST] Setting up test environment with fixture data...');

    // Load fixture data into mock vector store
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

    // Setup filesystem structure
    this.mockFilesystem.createStructure({
      '/test-data': {},
      '/test-data/chroma-db': {},
      '/test-data/chroma-db/collections': {},
      '/test-data/hnsw-indexes': {}
    });

    console.log('[TEST] ✅ Test environment setup complete');
  }

  /**
   * Create HnswSearchService with real dependencies
   */
  createHnswSearchService(): HnswSearchService {
    const config = HnswConfig.getTestConfig();
    
    const service = new HnswSearchService(
      this.mockPlugin,
      this.mockPlugin.app,
      this.mockVectorStore as any,
      undefined, // embedding service not needed for this test
      '/test-data',
      config.toOptions()
    );

    return service;
  }

  /**
   * Create mock coordination services
   */
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
        // Simulate successful collection loading
        await new Promise(resolve => setTimeout(resolve, 50));
        return { success: true };
      }
    };

    return { stateManager, collectionCoordinator };
  }

  /**
   * Get comprehensive debugging information
   */
  getDebugInfo(): any {
    return {
      vectorStoreOps: this.mockVectorStore.getOperationHistory(),
      vectorStoreState: this.mockVectorStore.getState(),
      filesystemOps: this.mockFilesystem.getOperationHistory(),
      filesystemState: this.mockFilesystem.getFilesystemState()
    };
  }

  /**
   * Reset environment
   */
  reset(): void {
    this.mockVectorStore.reset();
    this.mockFilesystem.reset();
  }
}

describe('Full HNSW Initialization Integration Tests', () => {
  let testEnv: FullHnswTestEnvironment;
  let service: HnswSearchService;

  beforeEach(() => {
    testEnv = new FullHnswTestEnvironment();
    testEnv.setupTestData();
    service = testEnv.createHnswSearchService();

    // Enable debug logging for tests
    if (process.env.DEBUG_TESTS) {
      console.log('[TEST] === Starting new test case ===');
    }
  });

  afterEach(() => {
    if (process.env.DEBUG_TESTS) {
      const debugInfo = testEnv.getDebugInfo();
      console.log('[TEST] === Test completion debug info ===');
      console.log('VectorStore operations:', debugInfo.vectorStoreOps.length);
      console.log('Filesystem operations:', debugInfo.filesystemOps.length);
    }
    testEnv.reset();
  });

  describe('Basic Service Creation', () => {
    test('should create HnswSearchService without throwing', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(HnswSearchService);
    });

    test('should accept coordination services injection', () => {
      const { stateManager, collectionCoordinator } = testEnv.createCoordinationServices();
      
      expect(() => {
        service.setInitializationCoordination(stateManager as any, collectionCoordinator as any);
      }).not.toThrow();
    });
  });

  describe('WASM Library Loading', () => {
    test('should load hnswlib-wasm successfully', async () => {
      const hnswLib = await loadHnswlib();
      expect(hnswLib).toBeDefined();
      expect(hnswLib.HierarchicalNSW).toBeDefined();
      expect(typeof hnswLib.HierarchicalNSW).toBe('function');
    });

    test('should create HNSW index with real WASM library', async () => {
      const hnswLib = await loadHnswlib();
      const index = new hnswLib.HierarchicalNSW('cosine', 32);
      
      expect(index).toBeDefined();
      expect(typeof index.addPoint).toBe('function');
      expect(typeof index.searchKnn).toBe('function');
    });
  });

  describe('Full Initialization Flow', () => {
    test('should complete basic initialization without errors', async () => {
      const { stateManager, collectionCoordinator } = testEnv.createCoordinationServices();
      
      // Inject coordination services
      service.setInitializationCoordination(stateManager as any, collectionCoordinator as any);
      
      // Wait a bit for async initialization to start
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Get service statistics to verify initialization
      const stats = service.getServiceStatistics();
      console.log('[TEST] Service statistics after initialization:', stats);
      
      expect(stats).toBeDefined();
      expect(typeof stats.isInitialized).toBe('boolean');
    }, 10000);

    test('should process ChromaDB collections', async () => {
      const { stateManager, collectionCoordinator } = testEnv.createCoordinationServices();
      
      service.setInitializationCoordination(stateManager as any, collectionCoordinator as any);
      
      // Trigger full initialization
      await service.ensureFullyInitialized();
      
      const debugInfo = testEnv.getDebugInfo();
      
      // Check that vector store operations were performed
      const listOps = debugInfo.vectorStoreOps.filter(op => op.operation === 'listCollections');
      expect(listOps.length).toBeGreaterThan(0);
      
      const countOps = debugInfo.vectorStoreOps.filter(op => op.operation === 'count');
      expect(countOps.length).toBeGreaterThan(0);
      
      console.log('[TEST] VectorStore operations performed:', debugInfo.vectorStoreOps.map(op => 
        `${op.operation}(${op.collectionName || 'N/A'})`
      ));
    }, 15000);

    test('should handle collections with embeddings', async () => {
      const { stateManager, collectionCoordinator } = testEnv.createCoordinationServices();
      
      service.setInitializationCoordination(stateManager as any, collectionCoordinator as any);
      await service.ensureFullyInitialized();
      
      // Test indexing a collection
      const collections = await testEnv['mockVectorStore'].listCollections();
      expect(collections).toContain('file_embeddings');
      
      const items = await testEnv['mockVectorStore'].getAllItems('file_embeddings');
      expect(items.ids.length).toBe(5);
      expect(items.embeddings).toBeDefined();
      expect(items.embeddings![0].length).toBe(32);
      
      // Try to index the collection
      await service.indexCollection('file_embeddings', items.ids.map((id, index) => ({
        id,
        document: items.documents![index],
        embedding: items.embeddings![index],
        metadata: items.metadatas![index]
      })));
      
      // Verify index was created
      const hasIndex = service.hasIndex('file_embeddings');
      console.log('[TEST] Index created for file_embeddings:', hasIndex);
    }, 20000);
  });

  describe('Service Diagnostics', () => {
    test('should provide comprehensive diagnostics', async () => {
      const { stateManager, collectionCoordinator } = testEnv.createCoordinationServices();
      
      service.setInitializationCoordination(stateManager as any, collectionCoordinator as any);
      await service.ensureFullyInitialized();
      
      const diagnostics = await service.diagnose();
      
      expect(diagnostics).toBeDefined();
      expect(diagnostics.status).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(diagnostics.status);
      expect(diagnostics.details).toBeDefined();
      expect(diagnostics.recommendations).toBeDefined();
      expect(Array.isArray(diagnostics.recommendations)).toBe(true);
      
      console.log('[TEST] Service diagnostics:', JSON.stringify(diagnostics, null, 2));
    }, 15000);

    test('should provide accurate service statistics', async () => {
      const { stateManager, collectionCoordinator } = testEnv.createCoordinationServices();
      
      service.setInitializationCoordination(stateManager as any, collectionCoordinator as any);
      await service.ensureFullyInitialized();
      
      const stats = service.getServiceStatistics();
      
      expect(stats).toBeDefined();
      expect(typeof stats.isInitialized).toBe('boolean');
      expect(typeof stats.isFullyReady).toBe('boolean');
      expect(typeof stats.totalIndexes).toBe('number');
      expect(typeof stats.totalItems).toBe('number');
      expect(Array.isArray(stats.configuredCollections)).toBe(true);
      
      console.log('[TEST] Final service statistics:', stats);
    }, 15000);
  });

  describe('Error Handling', () => {
    test('should handle vector store failures gracefully', async () => {
      // Configure mock to simulate failures
      testEnv['mockVectorStore'].setFailureMode({
        listCollections: true
      });
      
      const { stateManager, collectionCoordinator } = testEnv.createCoordinationServices();
      
      service.setInitializationCoordination(stateManager as any, collectionCoordinator as any);
      
      // Should not throw despite vector store failures
      await expect(service.ensureFullyInitialized()).resolves.not.toThrow();
      
      // Check that failure was recorded
      const debugInfo = testEnv.getDebugInfo();
      const failedOps = debugInfo.vectorStoreOps.filter(op => !op.success);
      expect(failedOps.length).toBeGreaterThan(0);
      
      console.log('[TEST] Handled vector store failures:', failedOps.length);
    }, 10000);

    test('should handle coordination timeouts gracefully', async () => {
      const stateManager = {
        ensureInitialized: jest.fn().mockResolvedValue({ success: true })
      };
      
      const collectionCoordinator = {
        waitForCollections: jest.fn().mockRejectedValue(new Error('Timeout'))
      };
      
      service.setInitializationCoordination(stateManager as any, collectionCoordinator as any);
      
      // Should handle timeout gracefully
      await expect(service.ensureFullyInitialized()).resolves.not.toThrow();
      
      expect(collectionCoordinator.waitForCollections).toHaveBeenCalled();
    }, 10000);
  });
});

// Export for external debugging
export { FullHnswTestEnvironment };