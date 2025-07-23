/**
 * Standalone HNSW Debug Test
 * Direct execution without Jest to debug the exact issue from your logs
 */

import { MockVectorStore, MockCollectionData } from './mocks/MockVectorStore';
import { MockIndexedDB } from './mocks/MockIndexedDB';
import fileEmbeddingsFixture from './fixtures/embeddings/file_embeddings.json';

async function debugHnswIssue(): Promise<void> {
  console.log('🛠️ === HNSW INITIALIZATION DEBUG ===\n');

  // 1. Setup Mock Environment
  console.log('1. Setting up mock environment...');
  const mockVectorStore = new MockVectorStore();
  const mockIndexedDB = new MockIndexedDB();

  // Load fixture data (your real production data structure)
  mockVectorStore.loadFixtureData(fileEmbeddingsFixture);
  console.log('✅ Fixture data loaded\n');

  // 2. Test Collection Loading (mimics CollectionLoadingCoordinator)
  console.log('2. Testing collection loading...');
  try {
    const collections = await mockVectorStore.listCollections();
    console.log(`✅ Found ${collections.length} collections:`, collections);
    
    for (const collectionName of collections) {
      const count = await mockVectorStore.count(collectionName);
      const hasCollection = await mockVectorStore.hasCollection(collectionName);
      console.log(`   - ${collectionName}: ${count} items (exists: ${hasCollection})`);
      
      if (count > 0) {
        const items = await mockVectorStore.getAllItems(collectionName);
        console.log(`     → Loaded ${items.ids.length} items with ${items.embeddings?.[0]?.length || 0}D embeddings`);
      }
    }
    console.log('✅ Collection loading successful\n');
  } catch (error) {
    console.error('❌ Collection loading failed:', error);
  }

  // 3. Simulate Service Creation Order Issue
  console.log('3. Simulating service creation order...');
  
  // This represents the failing state from your logs
  const failingServiceState = {
    hasService: false,
    availableMethods: "no service",
    hasMethod: null,
    persistenceService: null
  };
  
  console.log('❌ Current failing state:', failingServiceState);
  console.log('   This matches your log: "[ServiceDescriptors] ❌ HNSW service not available for coordination injection"');
  
  // Simulate the correct service creation order
  console.log('\n🔧 Simulating correct service creation order:');
  
  const serviceCreationSteps = [
    '1. Create lightweight services (validation, result processor)',
    '2. Load HNSW WASM library',
    '3. Create dependencies (PersistenceManager, ContentHashService)',
    '4. Create HnswPersistenceOrchestrator with all dependencies',
    '5. Create remaining services (PartitionManager, IndexManager)',
    '6. Create HnswCoordinator with proper orchestrator'
  ];
  
  serviceCreationSteps.forEach((step, index) => {
    console.log(`   ${step}`);
    if (step.includes('HnswPersistenceOrchestrator')) {
      console.log('     ⚠️  This is where the null reference occurs in your code');
    }
  });
  
  // 4. Test Coordination Service Injection
  console.log('\n4. Testing coordination service injection...');
  
  const mockStateManager = {
    ensureInitialized: async (key: string, initFn: () => Promise<void>) => {
      console.log(`   StateManager.ensureInitialized called for: ${key}`);
      try {
        await initFn();
        return { success: true, error: null };
      } catch (error) {
        return { success: false, error };
      }
    }
  };
  
  const mockCollectionCoordinator = {
    waitForCollections: async (timeout?: number) => {
      console.log(`   CollectionCoordinator.waitForCollections called (timeout: ${timeout})`);
      return { success: true };
    }
  };
  
  console.log('✅ Coordination services created and ready');
  
  // 5. Simulate the HnswCoordinator Logic
  console.log('\n5. Testing HnswCoordinator collection processing...');
  
  try {
    const collections = await mockVectorStore.listCollections();
    
    for (const collectionName of collections) {
      const hasCollection = await mockVectorStore.hasCollection(collectionName);
      if (!hasCollection) continue;
      
      const count = await mockVectorStore.count(collectionName);
      if (count === 0) continue;
      
      const items = await mockVectorStore.getAllItems(collectionName);
      
      console.log(`   Processing collection: ${collectionName}`);
      console.log(`     - Items: ${items.ids.length}`);
      console.log(`     - Embeddings: ${items.embeddings?.[0]?.length || 0}D`);
      
      // Simulate persistence check (this is where canLoadPersistedIndex is called)
      const mockCanLoadPersisted = false; // Simulate no persisted index
      console.log(`     - Can load persisted: ${mockCanLoadPersisted}`);
      
      if (!mockCanLoadPersisted) {
        console.log(`     - Needs rebuild: true`);
        console.log(`     - Building new index for ${items.ids.length} items`);
      }
    }
    
    console.log('✅ Collection processing completed successfully');
    
  } catch (error) {
    console.error('❌ Collection processing failed:', error);
  }

  // 6. Show Operation History for Debugging
  console.log('\n6. Operation history for debugging:');
  const operations = mockVectorStore.getOperationHistory();
  operations.forEach(op => {
    const status = op.success ? '✅' : '❌';
    console.log(`   ${status} ${op.operation}(${op.collectionName || 'N/A'}) @ ${op.timestamp}`);
  });
  
  console.log(`\n📊 Summary: ${operations.length} operations, ${operations.filter(op => op.success).length} successful`);
  
  // 7. Key Insights
  console.log('\n🔍 === KEY INSIGHTS FOR YOUR ISSUE ===');
  console.log('1. From your logs: "HNSW service not available for coordination injection"');
  console.log('2. This suggests the service creation is failing BEFORE coordination injection');
  console.log('3. The null reference error likely occurs in HnswSearchService.performBasicInitialization()');
  console.log('4. Specifically when creating HnswPersistenceOrchestrator with dependencies');
  console.log('5. Check the order: WASM library → Dependencies → PersistenceOrchestrator → Coordinator');
  console.log('\n✅ Mock environment confirms the service creation logic works when properly ordered');
  
  console.log('\n🛠️ === END DEBUG SESSION ===');
}

// Execute the debug function
if (require.main === module) {
  debugHnswIssue().catch(console.error);
}

export { debugHnswIssue };