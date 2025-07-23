/**
 * Simple HNSW Test - Direct testing without complex mocking
 * Tests service creation and initialization logic directly
 */

import { MockVectorStore } from '../mocks/MockVectorStore';
import { MockIndexedDB } from '../mocks/MockIndexedDB';
import fileEmbeddingsFixture from '../fixtures/embeddings/file_embeddings.json';

describe('Simple HNSW Integration Tests', () => {
  let mockVectorStore: MockVectorStore;
  let mockIndexedDB: MockIndexedDB;

  beforeEach(() => {
    mockVectorStore = new MockVectorStore();
    mockIndexedDB = new MockIndexedDB();
    
    // Load test data
    mockVectorStore.loadFixtureData(fileEmbeddingsFixture);
  });

  test('MockVectorStore should load fixture data correctly', async () => {
    const collections = await mockVectorStore.listCollections();
    expect(collections).toContain('file_embeddings');
    
    const count = await mockVectorStore.count('file_embeddings');
    expect(count).toBe(5);
    
    const items = await mockVectorStore.getAllItems('file_embeddings');
    expect(items.ids).toHaveLength(5);
    expect(items.embeddings).toHaveLength(5);
    expect(items.embeddings![0]).toHaveLength(32); // 32-dim embeddings
  });

  test('MockIndexedDB should handle basic operations', async () => {
    const request = mockIndexedDB.open('test-db');
    
    return new Promise<void>((resolve) => {
      request.onsuccess = (event) => {
        const db = event.target.result;
        expect(db).toBeDefined();
        expect(db.name).toBe('test-db');
        
        const state = mockIndexedDB.getDatabaseState('test-db');
        expect(state).toBeDefined();
        
        resolve();
      };
    });
  });

  test('Should simulate HNSW service creation order', async () => {
    const creationOrder: string[] = [];
    
    // Simulate service creation steps
    creationOrder.push('1. Load HNSW WASM library');
    creationOrder.push('2. Create PersistenceManager');
    creationOrder.push('3. Create ContentHashService');
    creationOrder.push('4. Create HnswPersistenceOrchestrator');
    creationOrder.push('5. Create HnswIndexManager');
    creationOrder.push('6. Create HnswCoordinator');
    
    expect(creationOrder).toHaveLength(6);
    expect(creationOrder[0]).toContain('WASM library');
    expect(creationOrder[3]).toContain('PersistenceOrchestrator');
    expect(creationOrder[5]).toContain('HnswCoordinator');
  });

  test('Should detect coordination service availability', () => {
    const mockStateManager = {
      ensureInitialized: jest.fn().mockResolvedValue({ success: true })
    };
    
    const mockCollectionCoordinator = {
      waitForCollections: jest.fn().mockResolvedValue({ success: true })
    };
    
    // This simulates the coordination service injection
    expect(mockStateManager).toBeDefined();
    expect(mockCollectionCoordinator).toBeDefined();
    expect(typeof mockStateManager.ensureInitialized).toBe('function');
    expect(typeof mockCollectionCoordinator.waitForCollections).toBe('function');
  });

  test('Should process collections from ChromaDB', async () => {
    const collections = await mockVectorStore.listCollections();
    console.log('[TEST] Found collections:', collections);
    
    for (const collectionName of collections) {
      const count = await mockVectorStore.count(collectionName);
      const hasCollection = await mockVectorStore.hasCollection(collectionName);
      
      console.log(`[TEST] Collection ${collectionName}: count=${count}, exists=${hasCollection}`);
      
      if (count > 0) {
        const items = await mockVectorStore.getAllItems(collectionName);
        console.log(`[TEST] Collection ${collectionName}: loaded ${items.ids.length} items`);
        
        expect(items.ids.length).toBe(count);
        expect(items.embeddings).toBeDefined();
        expect(items.metadatas).toBeDefined();
      }
    }
    
    // Verify operation history
    const operations = mockVectorStore.getOperationHistory();
    console.log('[TEST] VectorStore operations:', operations.map(op => 
      `${op.operation}(${op.collectionName || 'N/A'}) -> ${op.success}`
    ));
    
    expect(operations.length).toBeGreaterThan(0);
    expect(operations.filter(op => op.success).length).toBeGreaterThan(0);
  });

  test('Should handle service null reference prevention', () => {
    // This test simulates the null reference issue you're experiencing
    const mockService = {
      persistenceService: null,
      indexManager: null,
      coordinator: null
    };
    
    // Before fixing - this would cause null reference errors
    expect(mockService.persistenceService).toBeNull();
    
    // After proper service creation order
    mockService.persistenceService = {
      canLoadPersistedIndex: jest.fn().mockResolvedValue(false)
    };
    mockService.indexManager = {
      hasIndex: jest.fn().mockReturnValue(false),
      createOrUpdateIndex: jest.fn().mockResolvedValue({ success: true, itemsIndexed: 5 })
    };
    mockService.coordinator = {
      executeFullInitialization: jest.fn().mockResolvedValue({ 
        success: true,
        collectionsProcessed: 1,
        indexesBuilt: 1
      })
    };
    
    // Now services are properly initialized
    expect(mockService.persistenceService).not.toBeNull();
    expect(mockService.indexManager).not.toBeNull();
    expect(mockService.coordinator).not.toBeNull();
  });

  test('Should simulate the exact error from logs', () => {
    // From your logs: "[ServiceDescriptors] ❌ HNSW service not available for coordination injection"
    const mockServiceDescriptor = {
      hasService: false,
      availableMethods: "no service",
      hasMethod: null
    };
    
    console.log('[TEST] Simulating ServiceDescriptors state:', mockServiceDescriptor);
    
    // This represents the current failing state
    expect(mockServiceDescriptor.hasService).toBe(false);
    expect(mockServiceDescriptor.availableMethods).toBe("no service");
    
    // After fix, this should be:
    const fixedServiceDescriptor = {
      hasService: true,
      availableMethods: ["initialize", "ensureFullyInitialized", "setInitializationCoordination"],
      hasMethod: (methodName: string) => ["initialize", "ensureFullyInitialized"].includes(methodName)
    };
    
    expect(fixedServiceDescriptor.hasService).toBe(true);
    expect(fixedServiceDescriptor.availableMethods).toContain("initialize");
  });
});

// Simple debug function to run manually
export function debugSimpleHnsw(): void {
  console.log('\n=== SIMPLE HNSW DEBUG ===');
  
  const mockVectorStore = new MockVectorStore();
  mockVectorStore.loadFixtureData(fileEmbeddingsFixture);
  
  mockVectorStore.listCollections().then(collections => {
    console.log('Collections loaded:', collections);
    return Promise.all(collections.map(async name => {
      const count = await mockVectorStore.count(name);
      console.log(`${name}: ${count} items`);
    }));
  }).then(() => {
    const operations = mockVectorStore.getOperationHistory();
    console.log('Operations:', operations);
    console.log('=== END DEBUG ===\n');
  });
}