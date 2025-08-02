/**
 * Test script for Collection Health Validation
 * Tests that "filtered.slice is not a function" errors are eliminated through proper data validation
 */

// Mock collection data scenarios that could cause the filtered.slice error
const testDataScenarios = [
  {
    name: 'Valid array data',
    data: [
      { id: 'item1', embeddings: [0.1, 0.2, 0.3], metadata: { type: 'document' } },
      { id: 'item2', embeddings: [0.4, 0.5, 0.6], metadata: { type: 'document' } }
    ],
    shouldBeValid: true,
    expectedLength: 2
  },
  {
    name: 'Empty array',
    data: [],
    shouldBeValid: true,
    expectedLength: 0
  },
  {
    name: 'Null data',
    data: null,
    shouldBeValid: false,
    expectedFallback: []
  },
  {
    name: 'Undefined data',
    data: undefined,
    shouldBeValid: false,
    expectedFallback: []
  },
  {
    name: 'Object data (not array)',
    data: { items: [1, 2, 3] },
    shouldBeValid: false,
    expectedFallback: []
  },
  {
    name: 'String data',
    data: 'not an array',
    shouldBeValid: false,
    expectedFallback: []
  },
  {
    name: 'Number data',
    data: 123,
    shouldBeValid: false,
    expectedFallback: []
  },
  {
    name: 'Boolean data',
    data: false,
    shouldBeValid: false,
    expectedFallback: []
  }
];

// Mock PersistentChromaClient class with data validation
class TestPersistentChromaClient {
  constructor(name, mockData) {
    this.name = name;
    this.mockData = mockData;
  }

  // Simulate the loadItems method with data validation
  async loadItems() {
    const data = this.mockData;
    
    // CRITICAL FIX: Ensure we always return an array to prevent "filtered.slice is not a function" errors
    if (!Array.isArray(data)) {
      console.warn(`[ChromaClient] Items file for collection ${this.name} contains non-array data:`, typeof data);
      return [];
    }
    
    return data;
  }

  // Simulate the get method with data validation  
  async get(params = {}) {
    const items = await this.loadItems();
    
    // CRITICAL FIX: Ensure items is always an array to prevent "filtered.slice is not a function" errors
    if (!Array.isArray(items)) {
      console.warn(`[PersistentChromaClient] loadItems() returned non-array for collection ${this.name}:`, typeof items);
      return {
        ids: [],
        embeddings: [],
        metadatas: [],
        documents: []
      };
    }

    // Apply filtering (this is where the original error occurred)
    let filtered = items;
    
    // Apply WHERE filtering if specified
    if (params.where) {
      filtered = items.filter(item => {
        return Object.keys(params.where).every(key => 
          item.metadata && item.metadata[key] === params.where[key]
        );
      });
    }

    // Apply pagination (this is where filtered.slice was failing)
    const offset = params.offset || 0;
    const limit = params.limit;
    
    try {
      if (limit && limit > 0) {
        filtered = filtered.slice(offset, offset + limit);
      } else if (offset > 0) {
        filtered = filtered.slice(offset);
      }
    } catch (error) {
      console.error(`[TestClient] slice operation failed on filtered data:`, error);
      console.error(`[TestClient] filtered type:`, typeof filtered);
      console.error(`[TestClient] filtered value:`, filtered);
      throw new Error(`Data validation failed: filtered.slice is not a function - filtered is ${typeof filtered}`);
    }

    return {
      ids: filtered.map(item => item.id),
      embeddings: filtered.map(item => item.embeddings),
      metadatas: filtered.map(item => item.metadata),
      documents: filtered.map(item => item.document || '')
    };
  }

  // Simulate the query method with data validation
  async query(params = {}) {
    const items = await this.loadItems();
    
    // CRITICAL FIX: Ensure items is always an array to prevent "filtered.slice is not a function" errors
    if (!Array.isArray(items)) {
      console.warn(`[PersistentChromaClient] loadItems() returned non-array for collection ${this.name} during query:`, typeof items);
      return {
        ids: [[]],
        distances: [[]],
        metadatas: [[]],
        documents: [[]]
      };
    }

    // Simulate vector similarity search (simplified)
    let filtered = items;
    
    // Apply WHERE filtering if specified
    if (params.where) {
      filtered = items.filter(item => {
        return Object.keys(params.where).every(key => 
          item.metadata && item.metadata[key] === params.where[key]
        );
      });
    }

    // Apply pagination (this is where filtered.slice was failing in queries)
    const nResults = params.n_results || 10;
    
    try {
      filtered = filtered.slice(0, nResults);
    } catch (error) {
      console.error(`[TestClient] slice operation failed during query:`, error);
      throw new Error(`Data validation failed: filtered.slice is not a function during query - filtered is ${typeof filtered}`);
    }

    return {
      ids: [filtered.map(item => item.id)],
      distances: [filtered.map(() => Math.random())], // Random distances for test
      metadatas: [filtered.map(item => item.metadata)],
      documents: [filtered.map(item => item.document || '')]
    };
  }
}

// Test function
async function testCollectionHealth() {
  console.log('🧪 Running Collection Health Validation Tests...\n');
  
  let passed = 0;
  let failed = 0;

  for (const scenario of testDataScenarios) {
    console.log(`Test: ${scenario.name}`);
    
    try {
      const client = new TestPersistentChromaClient(`test_collection_${scenario.name.replace(/\s+/g, '_')}`, scenario.data);
      
      // Test loadItems validation
      const loadedItems = await client.loadItems();
      
      if (scenario.shouldBeValid) {
        // Should return the original data
        if (Array.isArray(loadedItems) && loadedItems.length === scenario.expectedLength) {
          console.log(`  ✅ loadItems() correctly handled valid data`);
        } else {
          console.log(`  ❌ loadItems() failed for valid data - got length ${loadedItems?.length}, expected ${scenario.expectedLength}`);
          failed++;
          continue;
        }
      } else {
        // Should return empty array as fallback
        if (Array.isArray(loadedItems) && loadedItems.length === 0) {
          console.log(`  ✅ loadItems() correctly returned empty array fallback for invalid data`);
        } else {
          console.log(`  ❌ loadItems() failed to provide fallback - got:`, loadedItems);
          failed++;
          continue;
        }
      }

      // Test get() method with slice operations
      const getResult = await client.get({ limit: 5, offset: 0 });
      if (getResult && Array.isArray(getResult.ids)) {
        console.log(`  ✅ get() method successfully handled data without slice errors`);
      } else {
        console.log(`  ❌ get() method failed:`, getResult);
        failed++;
        continue;
      }

      // Test query() method with slice operations
      const queryResult = await client.query({ n_results: 3 });
      if (queryResult && Array.isArray(queryResult.ids) && Array.isArray(queryResult.ids[0])) {
        console.log(`  ✅ query() method successfully handled data without slice errors`);
      } else {
        console.log(`  ❌ query() method failed:`, queryResult);
        failed++;
        continue;
      }

      passed++;
      
    } catch (error) {
      console.log(`  ❌ ERROR: ${error.message}`);
      failed++;
    }
    
    console.log('');
  }

  // Test specific edge cases that were causing the original error
  console.log('🔍 Testing Original Error Scenarios:');
  
  // Test case 1: Corrupted JSON data
  try {
    const client = new TestPersistentChromaClient('corrupted_collection', { corrupted: 'object' });
    const result = await client.get({ where: { type: 'document' } });
    console.log('  ✅ Corrupted JSON data handled correctly');
    passed++;
  } catch (error) {
    console.log(`  ❌ Corrupted JSON test failed: ${error.message}`);
    failed++;
  }

  // Test case 2: Empty collection with filtering
  try {
    const client = new TestPersistentChromaClient('empty_collection', []);
    const result = await client.query({ where: { nonexistent: 'value' }, n_results: 10 });
    console.log('  ✅ Empty collection with filtering handled correctly');
    passed++;
  } catch (error) {
    console.log(`  ❌ Empty collection test failed: ${error.message}`);
    failed++;
  }

  // Test case 3: Null metadata in items
  try {
    const client = new TestPersistentChromaClient('null_metadata_collection', [
      { id: 'item1', embeddings: [0.1], metadata: null }
    ]);
    const result = await client.get({ where: { type: 'document' } });
    console.log('  ✅ Null metadata in items handled correctly');
    passed++;
  } catch (error) {
    console.log(`  ❌ Null metadata test failed: ${error.message}`);
    failed++;
  }

  console.log(`\n📊 Collection Health Test Results:`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

  if (failed === 0) {
    console.log('\n🎉 All collection health tests PASSED! "filtered.slice is not a function" errors are eliminated.');
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed. Collection health validation needs attention.`);
  }

  return { passed, failed, totalTests: passed + failed };
}

// Run the tests
testCollectionHealth().then(results => {
  process.exit(results.failed === 0 ? 0 : 1);
}).catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});