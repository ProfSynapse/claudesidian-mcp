/**
 * PersistentChromaClient - Refactored following SOLID principles
 * Main entry point that exports refactored components
 */

// Export interfaces and types
export type { 
  ChromaClientOptions, 
  ChromaEmbeddingFunction, 
  CollectionMetadata,
  ChromaAddParams,
  ChromaGetParams,
  ChromaQueryParams,
  ChromaDeleteParams,
  ChromaUpdateParams,
  ChromaCollectionOptions,
  Collection
} from './PersistentChromaClient';

// Export refactored components
export { StrictPersistentCollection } from './collection/StrictPersistentCollection';
export { StrictPersistenceChromaClient } from './client/StrictPersistenceChromaClient';

// Export services for external use if needed
export { CollectionOperations } from './collection/operations/CollectionOperations';
export { QueryProcessor } from './collection/operations/QueryProcessor';
export { DataValidator } from './collection/operations/DataValidator';
export { CollectionPersistence } from './collection/persistence/CollectionPersistence';
export { QueuedSaveManager } from './collection/persistence/QueuedSaveManager';
export { MetadataManager } from './collection/metadata/MetadataManager';

export { ClientInitializer } from './client/lifecycle/ClientInitializer';
export { CollectionLoader } from './client/lifecycle/CollectionLoader';
export { ResourceManager } from './client/lifecycle/ResourceManager';
export { CollectionManager } from './client/management/CollectionManager';
export { CollectionCache } from './client/management/CollectionCache';
export { ErrorHandler } from './client/management/ErrorHandler';

// Export the main client as ChromaClient (backward compatibility)
export { StrictPersistenceChromaClient as ChromaClient } from './client/StrictPersistenceChromaClient';