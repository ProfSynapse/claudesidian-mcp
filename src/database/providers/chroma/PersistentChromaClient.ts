/**
 * PersistentChromaClient - Refactored following SOLID principles
 * 
 * A ChromaDB-compatible client implementation that prioritizes persistent storage
 * and follows SOLID principles through service composition.
 */

import { 
  VectorCalculator, 
  FilterEngine, 
  PersistenceManager, 
  CollectionRepository,
  type FileSystemInterface,
  type DatabaseItem 
} from './services';

// Interface definitions
export interface ChromaClientOptions {
  path?: string;
  fetchOptions?: Record<string, any>;
}

export interface ChromaEmbeddingFunction {
  generate(texts: string[]): Promise<number[][]>;
}

export interface CollectionMetadata {
  name: string;
  metadata?: Record<string, any>;
}

// Collection operation parameter interfaces
export interface ChromaAddParams {
  ids: string | string[];
  embeddings?: number[] | number[][];
  metadatas?: Record<string, any> | Record<string, any>[];
  documents?: string | string[];
}

export interface ChromaGetParams {
  ids?: string[];
  where?: Record<string, any>;
  limit?: number;
  offset?: number;
  include?: string[];
}

export interface ChromaQueryParams {
  queryEmbeddings?: number[][];
  queryTexts?: string[];
  nResults?: number;
  where?: Record<string, any>;
  include?: string[];
}

export interface ChromaDeleteParams {
  ids?: string[];
  where?: Record<string, any>;
}

export interface ChromaUpdateParams {
  ids: string[];
  embeddings?: number[][];
  metadatas?: Record<string, any>[];
  documents?: string[];
}

export interface ChromaCollectionOptions {
  name: string;
  metadata?: Record<string, any>;
  embeddingFunction?: ChromaEmbeddingFunction;
}

export interface Collection {
  name: string;
  
  add(params: ChromaAddParams): Promise<void>;
  get(params: ChromaGetParams): Promise<{
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }>;
  update(params: ChromaUpdateParams): Promise<void>;
  delete(params: ChromaDeleteParams): Promise<void>;
  query(params: ChromaQueryParams): Promise<{
    ids: string[][];
    embeddings?: number[][][];
    metadatas?: Record<string, any>[][];
    documents?: string[][];
    distances?: number[][];
  }>;
  count(): Promise<number>;
  metadata?(): Promise<Record<string, any>>;
}

// Import and re-export refactored components
export { StrictPersistentCollection } from './collection/StrictPersistentCollection';
export { StrictPersistenceChromaClient } from './client/StrictPersistenceChromaClient';

// Export the refactored client as the main ChromaClient
export { StrictPersistenceChromaClient as ChromaClient } from './client/StrictPersistenceChromaClient';

// Export individual services if needed
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