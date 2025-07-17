/**
 * Initialization Service Exports
 * Provides clean API for initialization coordination
 * Follows Boy Scout Rule - clean, organized exports
 */

// Interfaces
export * from './interfaces/IInitializationStateManager';
export * from './interfaces/ICollectionLoadingCoordinator';
export * from './interfaces/IInitializationCoordinator';

// Implementations
export { InitializationStateManager } from './InitializationStateManager';
export { CollectionLoadingCoordinator } from './CollectionLoadingCoordinator';
export { InitializationCoordinator } from './InitializationCoordinator';

// Diagnostic and monitoring tools
export { InitializationDiagnostics } from './InitializationDiagnostics';
export { StartupPerformanceMonitor } from './StartupPerformanceMonitor';

// Factory function for creating initialization services
export function createInitializationServices(plugin: any, vectorStore: any, serviceManager: any) {
  // CRITICAL: Validate service manager parameter to prevent the ServiceDescriptors bug
  if (!serviceManager) {
    throw new Error('DIAGNOSTIC FAILURE: createInitializationServices received null/undefined service manager');
  }
  
  if (typeof serviceManager.get !== 'function') {
    throw new Error(`DIAGNOSTIC FAILURE: createInitializationServices received invalid service manager. Type: ${serviceManager.constructor.name}, Expected: LazyServiceManager with get() method. Available methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(serviceManager))}`);
  }
  
  if (serviceManager.constructor.name === 'ServiceDescriptors') {
    throw new Error('DIAGNOSTIC FAILURE: createInitializationServices received ServiceDescriptors instead of LazyServiceManager - this is the exact bug we are trying to prevent!');
  }
  
  console.log('[createInitializationServices] ✅ Valid service manager received:', serviceManager.constructor.name);
  // Import here to avoid circular dependency issues
  const { InitializationStateManager: StateManager } = require('./InitializationStateManager');
  const { CollectionLoadingCoordinator: LoadingCoordinator } = require('./CollectionLoadingCoordinator');
  const { InitializationCoordinator: Coordinator } = require('./InitializationCoordinator');
  const { InitializationDiagnostics: Diagnostics } = require('./InitializationDiagnostics');
  const { StartupPerformanceMonitor: PerformanceMonitor } = require('./StartupPerformanceMonitor');

  const stateManager = new StateManager();
  const collectionCoordinator = new LoadingCoordinator(plugin, stateManager, vectorStore);
  const coordinator = new Coordinator(plugin, stateManager, collectionCoordinator, serviceManager);

  // Create diagnostic tools
  const diagnostics = new Diagnostics(stateManager, collectionCoordinator, coordinator);
  const performanceMonitor = new PerformanceMonitor();

  return {
    stateManager,
    collectionCoordinator,
    coordinator,
    diagnostics,
    performanceMonitor
  };
}