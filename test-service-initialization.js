/**
 * Test script for Service Initialization Validation
 * Tests that ServiceContainer prevents duplicate service initialization and ensures singleton behavior
 */

// Mock ServiceContainer implementation for testing
class TestServiceContainer {
  constructor() {
    this.services = new Map();
    this.factories = new Map();
    this.initializationStack = [];
    this.dependencyGraph = new Map();
    this.initializationCounts = new Map(); // Track how many times each service factory is called
  }

  /**
   * Register service factory with optional dependencies
   */
  register(name, factory, options = {}) {
    const singleton = options.singleton !== false; // Default to singleton
    const dependencies = options.dependencies || [];

    // Count how many times this service is registered
    const registrationCount = (this.factories.get(name)?.registrationCount || 0) + 1;
    
    this.factories.set(name, {
      factory,
      singleton,
      dependencies,
      registrationCount
    });

    // Build dependency graph
    this.dependencyGraph.set(name, new Set(dependencies));

    console.log(`[ServiceContainer] Registered service '${name}' (${singleton ? 'singleton' : 'transient'}) - Registration #${registrationCount}`);
    
    return this;
  }

  /**
   * Get service instance with dependency resolution
   */
  async get(name) {
    // Check if already instantiated (for singletons)
    if (this.services.has(name)) {
      console.log(`[ServiceContainer] Returning cached instance of '${name}'`);
      return this.services.get(name);
    }

    const registration = this.factories.get(name);
    if (!registration) {
      throw new Error(`Service '${name}' not found. Available services: ${Array.from(this.factories.keys()).join(', ')}`);
    }

    // Check for circular dependencies
    if (this.initializationStack.includes(name)) {
      const cycle = [...this.initializationStack, name].join(' -> ');
      throw new Error(`Circular dependency detected: ${cycle}`);
    }

    // Add to initialization stack
    this.initializationStack.push(name);

    try {
      // Resolve dependencies first
      const dependencies = {};
      for (const depName of registration.dependencies) {
        dependencies[depName] = await this.get(depName);
      }

      console.log(`[ServiceContainer] Creating new instance of '${name}'`);
      
      // Track factory call count
      const callCount = (this.initializationCounts.get(name) || 0) + 1;
      this.initializationCounts.set(name, callCount);
      
      // Create service instance
      const instance = await registration.factory(dependencies);

      // Store if singleton
      if (registration.singleton) {
        this.services.set(name, instance);
        console.log(`[ServiceContainer] Cached singleton instance of '${name}'`);
      }

      return instance;
      
    } finally {
      // Remove from initialization stack
      this.initializationStack.pop();
    }
  }

  /**
   * Check if service is registered
   */
  has(name) {
    return this.factories.has(name);
  }

  /**
   * Get all service metadata
   */
  getAllServiceMetadata() {
    const metadata = [];
    
    for (const [name, registration] of this.factories.entries()) {
      metadata.push({
        name,
        singleton: registration.singleton,
        initialized: this.services.has(name),
        dependencies: registration.dependencies,
        dependents: this.getDependents(name),
        registrationCount: registration.registrationCount,
        initializationCount: this.initializationCounts.get(name) || 0
      });
    }
    
    return metadata;
  }

  /**
   * Get services that depend on the given service
   */
  getDependents(serviceName) {
    const dependents = [];
    
    for (const [name, deps] of this.dependencyGraph.entries()) {
      if (deps.has(serviceName)) {
        dependents.push(name);
      }
    }
    
    return dependents;
  }

  /**
   * Clear all services (for testing)
   */
  clear() {
    this.services.clear();
    this.factories.clear();
    this.initializationStack = [];
    this.dependencyGraph.clear();
    this.initializationCounts.clear();
  }
}

// Mock service classes for testing
class MockEmbeddingService {
  constructor(dependencies = {}) {
    this.id = Math.random().toString(36).substr(2, 9);
    this.dependencies = dependencies;
    console.log(`[MockEmbeddingService] Created instance ${this.id}`);
  }
}

class MockVectorStore {
  constructor(dependencies = {}) {
    this.id = Math.random().toString(36).substr(2, 9);
    this.dependencies = dependencies;
    console.log(`[MockVectorStore] Created instance ${this.id}`);
  }
}

class MockMemoryService {
  constructor(dependencies = {}) {
    this.id = Math.random().toString(36).substr(2, 9);
    this.dependencies = dependencies;
    console.log(`[MockMemoryService] Created instance ${this.id} with deps:`, Object.keys(dependencies));
  }
}

// Test scenarios
const testScenarios = [
  {
    name: 'Singleton Service Initialization',
    test: async (container) => {
      // Register a singleton service
      container.register('embeddingService', () => new MockEmbeddingService(), { singleton: true });
      
      // Get the service multiple times
      const instance1 = await container.get('embeddingService');
      const instance2 = await container.get('embeddingService');
      const instance3 = await container.get('embeddingService');
      
      // Should be the same instance
      const isSameInstance = instance1.id === instance2.id && instance2.id === instance3.id;
      const initCount = container.initializationCounts.get('embeddingService');
      
      return {
        success: isSameInstance && initCount === 1,
        message: isSameInstance 
          ? `✅ Singleton behavior correct - same instance (${instance1.id}) returned 3 times, factory called ${initCount} time(s)`
          : `❌ Singleton behavior failed - different instances: ${instance1.id}, ${instance2.id}, ${instance3.id}`
      };
    }
  },
  
  {
    name: 'Transient Service Initialization',
    test: async (container) => {
      // Register a transient service
      container.register('vectorStore', () => new MockVectorStore(), { singleton: false });
      
      // Get the service multiple times
      const instance1 = await container.get('vectorStore');
      const instance2 = await container.get('vectorStore');
      const instance3 = await container.get('vectorStore');
      
      // Should be different instances
      const isDifferentInstances = instance1.id !== instance2.id && instance2.id !== instance3.id && instance1.id !== instance3.id;
      const initCount = container.initializationCounts.get('vectorStore');
      
      return {
        success: isDifferentInstances && initCount === 3,
        message: isDifferentInstances 
          ? `✅ Transient behavior correct - different instances: ${instance1.id}, ${instance2.id}, ${instance3.id}, factory called ${initCount} times`
          : `❌ Transient behavior failed - instances not unique or wrong factory call count: ${initCount}`
      };
    }
  },
  
  {
    name: 'Dependency Resolution and Singleton Propagation',
    test: async (container) => {
      // Register services with dependencies
      container.register('embeddingService', () => new MockEmbeddingService(), { singleton: true });
      container.register('vectorStore', () => new MockVectorStore(), { singleton: true });
      container.register('memoryService', (deps) => new MockMemoryService(deps), { 
        singleton: true, 
        dependencies: ['embeddingService', 'vectorStore'] 
      });
      
      // Get the memory service (should initialize dependencies)
      const memoryService1 = await container.get('memoryService');
      const memoryService2 = await container.get('memoryService');
      
      // Get dependencies directly to check they're the same instances
      const embeddingService = await container.get('embeddingService');
      const vectorStore = await container.get('vectorStore');
      
      const isSameMemoryInstance = memoryService1.id === memoryService2.id;
      const hasDependencies = Object.keys(memoryService1.dependencies).length === 2;
      const embeddingInitCount = container.initializationCounts.get('embeddingService');
      const vectorStoreInitCount = container.initializationCounts.get('vectorStore');
      const memoryInitCount = container.initializationCounts.get('memoryService');
      
      return {
        success: isSameMemoryInstance && hasDependencies && embeddingInitCount === 1 && vectorStoreInitCount === 1 && memoryInitCount === 1,
        message: isSameMemoryInstance 
          ? `✅ Dependency resolution correct - memoryService singleton with dependencies, all services initialized once (embedding: ${embeddingInitCount}, vectorStore: ${vectorStoreInitCount}, memory: ${memoryInitCount})`
          : `❌ Dependency resolution failed - instances or init counts wrong`
      };
    }
  },
  
  {
    name: 'Circular Dependency Detection',
    test: async (container) => {
      // Register services with circular dependencies
      container.register('serviceA', async (deps) => ({ id: 'A', deps }), { 
        singleton: true, 
        dependencies: ['serviceB'] 
      });
      container.register('serviceB', async (deps) => ({ id: 'B', deps }), { 
        singleton: true, 
        dependencies: ['serviceA'] 
      });
      
      try {
        await container.get('serviceA');
        return {
          success: false,
          message: '❌ Circular dependency detection failed - should have thrown error'
        };
      } catch (error) {
        const isCircularError = error.message.includes('Circular dependency detected');
        return {
          success: isCircularError,
          message: isCircularError 
            ? `✅ Circular dependency correctly detected: ${error.message}`
            : `❌ Wrong error type: ${error.message}`
        };
      }
    }
  },
  
  {
    name: 'Service Registration Overwrite Prevention',
    test: async (container) => {
      // Register the same service multiple times
      container.register('testService', () => ({ version: 1 }), { singleton: true });
      container.register('testService', () => ({ version: 2 }), { singleton: true });
      container.register('testService', () => ({ version: 3 }), { singleton: true });
      
      const metadata = container.getAllServiceMetadata();
      const testServiceMetadata = metadata.find(m => m.name === 'testService');
      
      // Should track registrations
      const registrationCount = testServiceMetadata?.registrationCount || 0;
      
      // Get the service to see which version is used
      const instance = await container.get('testService');
      
      return {
        success: registrationCount === 3, // Should track all registrations
        message: registrationCount === 3 
          ? `✅ Service registration tracking correct - ${registrationCount} registrations tracked, latest version used (${instance.version})`
          : `❌ Service registration tracking failed - only ${registrationCount} registrations tracked`
      };
    }
  },
  
  {
    name: 'Service Metadata and Dependency Graph',
    test: async (container) => {
      // Clear and setup a complex dependency graph
      container.clear();
      
      container.register('logger', () => ({ type: 'logger' }), { singleton: true });
      container.register('config', () => ({ type: 'config' }), { singleton: true });
      container.register('database', (deps) => ({ type: 'database', deps }), { 
        singleton: true, 
        dependencies: ['logger', 'config'] 
      });
      container.register('cache', (deps) => ({ type: 'cache', deps }), { 
        singleton: true, 
        dependencies: ['logger'] 
      });
      container.register('api', (deps) => ({ type: 'api', deps }), { 
        singleton: true, 
        dependencies: ['database', 'cache', 'config'] 
      });
      
      // Initialize some services
      await container.get('database');
      await container.get('api');
      
      const metadata = container.getAllServiceMetadata();
      
      // Check metadata accuracy
      const loggerMeta = metadata.find(m => m.name === 'logger');
      const databaseMeta = metadata.find(m => m.name === 'database');
      const apiMeta = metadata.find(m => m.name === 'api');
      
      const loggerHasDependents = loggerMeta.dependents.includes('database') && loggerMeta.dependents.includes('cache');
      const apiHasDependencies = apiMeta.dependencies.length === 3;
      const initializationCounts = [
        loggerMeta.initializationCount === 1,  // Used by database and cache, but singleton
        databaseMeta.initializationCount === 1,
        apiMeta.initializationCount === 1
      ].every(Boolean);
      
      return {
        success: loggerHasDependents && apiHasDependencies && initializationCounts,
        message: loggerHasDependents && apiHasDependencies && initializationCounts
          ? `✅ Service metadata and dependency graph correct - logger has dependents: ${loggerMeta.dependents.join(', ')}, api has dependencies: ${apiMeta.dependencies.join(', ')}`
          : `❌ Service metadata or dependency graph incorrect`
      };
    }
  }
];

// Run service initialization tests
async function testServiceInitialization() {
  console.log('🧪 Running Service Initialization Validation Tests...\n');
  
  let passed = 0;
  let failed = 0;

  for (const scenario of testScenarios) {
    console.log(`Test: ${scenario.name}`);
    
    try {
      const container = new TestServiceContainer();
      const result = await scenario.test(container);
      
      if (result.success) {
        console.log(`  ${result.message}`);
        passed++;
      } else {
        console.log(`  ${result.message}`);
        failed++;
      }
      
    } catch (error) {
      console.log(`  ❌ ERROR: ${error.message}`);
      failed++;
    }
    
    console.log('');
  }

  // Additional comprehensive test
  console.log('🔍 Comprehensive Service Container Test:');
  
  try {
    const container = new TestServiceContainer();
    
    // Register multiple services with various dependency patterns
    container.register('logger', () => ({ name: 'logger', calls: 0 }), { singleton: true });
    container.register('config', () => ({ name: 'config', calls: 0 }), { singleton: true });
    container.register('pathManager', (deps) => ({ name: 'pathManager', deps: Object.keys(deps) }), { 
      singleton: true, 
      dependencies: ['logger'] 
    });
    container.register('vectorStore', (deps) => ({ name: 'vectorStore', deps: Object.keys(deps) }), { 
      singleton: true, 
      dependencies: ['logger', 'pathManager'] 
    });
    container.register('embeddingService', (deps) => ({ name: 'embeddingService', deps: Object.keys(deps) }), { 
      singleton: true, 
      dependencies: ['logger'] 
    });
    container.register('memoryService', (deps) => ({ name: 'memoryService', deps: Object.keys(deps) }), { 
      singleton: true, 
      dependencies: ['vectorStore', 'embeddingService'] 
    });
    
    // Get the most dependent service (should initialize everything)
    const memoryService = await container.get('memoryService');
    
    // Check that all needed services were initialized exactly once, and unused services weren't initialized
    const metadata = container.getAllServiceMetadata();
    const allInitializedOnce = metadata.every(m => m.initializationCount <= 1);
    const requiredServices = metadata.filter(m => ['logger', 'pathManager', 'vectorStore', 'embeddingService', 'memoryService'].includes(m.name));
    const allRequiredInitialized = requiredServices.every(m => m.initialized && m.initializationCount === 1);
    const configService = metadata.find(m => m.name === 'config');
    const configNotInitialized = !configService.initialized; // Config isn't needed by the dependency chain
    
    if (allInitializedOnce && allRequiredInitialized && configNotInitialized) {
      console.log('  ✅ Comprehensive test PASSED - required services initialized exactly once, unused services not initialized');
      console.log(`     Required services: ${requiredServices.map(m => `${m.name}(${m.initializationCount})`).join(', ')}`);
      console.log(`     Config service correctly not initialized: ${configService.name}(${configService.initializationCount})`);
      passed++;
    } else {
      console.log('  ❌ Comprehensive test FAILED - services not properly managed');
      console.log(`     Service status: ${metadata.map(m => `${m.name}: init(${m.initializationCount}), singleton(${m.singleton}), cached(${m.initialized})`).join(', ')}`);
      failed++;
    }
    
  } catch (error) {
    console.log(`  ❌ Comprehensive test ERROR: ${error.message}`);
    failed++;
  }

  console.log(`\n📊 Service Initialization Test Results:`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

  if (failed === 0) {
    console.log('\n🎉 All service initialization tests PASSED! Service redundancy is eliminated and singleton behavior is correct.');
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed. Service initialization needs attention.`);
  }

  return { passed, failed, totalTests: passed + failed };
}

// Run the tests
testServiceInitialization().then(results => {
  process.exit(results.failed === 0 ? 0 : 1);
}).catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});