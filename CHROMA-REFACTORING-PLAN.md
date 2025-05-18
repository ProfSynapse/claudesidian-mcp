# ChromaDB Memory Manager Refactoring Plan

## Overview

This plan outlines the refactoring of our memory manager to better integrate with ChromaDB. The goal is to make the memory manager the central point for managing ChromaDB collections, while having the vault librarian focus exclusively on search operations using these collections.

## Current Implementation

In the current implementation:
- `ChromaVectorStore` wraps ChromaDB with methods matching our `IVectorStore` interface
- Specialized collection classes (`MemoryTraceCollection`, `SessionCollection`, etc.) interact with ChromaDB indirectly
- `MemoryService` uses these collections but doesn't have direct collection management capabilities
- `VaultLibrarian` handles search operations on collections

## Phase 1: Create ChromaCollectionManager

### New Files to Add

1. **ChromaCollectionManager.ts**
   - Direct interface to ChromaDB collections
   - Methods for creating, getting, listing, and deleting collections
   - Improved type definitions for ChromaDB operations

```typescript
// src/database/providers/chroma/ChromaCollectionManager.ts
import { ChromaClient } from './ChromaWrapper';
import { IVectorStore } from '../../interfaces/IVectorStore';

export class ChromaCollectionManager {
  private client: InstanceType<typeof ChromaClient>;
  private collections: Map<string, any> = new Map();

  constructor(private vectorStore: IVectorStore) {
    this.client = (vectorStore as any).client;
  }

  async initialize(): Promise<void> {
    await this.refreshCollections();
  }

  async refreshCollections(): Promise<void> {
    const collections = await this.client.listCollections();
    this.collections.clear();
    
    for (const collection of collections) {
      const name = typeof collection === 'string' ? collection : collection.name;
      if (name) {
        this.collections.set(name, await this.client.getCollection({ name }));
      }
    }
  }

  async createCollection(name: string, metadata?: Record<string, any>): Promise<any> {
    const collection = await this.client.createCollection({
      name,
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString()
      }
    });
    
    this.collections.set(name, collection);
    return collection;
  }

  async getCollection(name: string): Promise<any> {
    if (this.collections.has(name)) {
      return this.collections.get(name);
    }
    
    try {
      const collection = await this.client.getCollection({ name });
      this.collections.set(name, collection);
      return collection;
    } catch (error) {
      return null;
    }
  }

  async hasCollection(name: string): Promise<boolean> {
    return (await this.getCollection(name)) !== null;
  }

  async listCollections(): Promise<string[]> {
    await this.refreshCollections();
    return Array.from(this.collections.keys());
  }

  async deleteCollection(name: string): Promise<void> {
    await this.client.deleteCollection({ name });
    this.collections.delete(name);
  }
}
```

## Phase 2: Memory Manager Collection Modes

### New Files to Add

1. **Collection Management Modes**
   - Create new directory: `src/agents/memoryManager/modes/collection/`
   - Add the following files:
     - `createCollectionMode.ts`
     - `listCollectionsMode.ts`
     - `getCollectionMode.ts`
     - `deleteCollectionMode.ts`
     - `collectionAddItemsMode.ts`
     - `collectionQueryMode.ts`
     - `index.ts` (exports all modes)

Example implementation for `createCollectionMode.ts`:
```typescript
import { BaseMode } from '../../../baseMode';
import * as JsonSchema from 'json-schema';

export class CreateCollectionMode extends BaseMode<{
  name: string;
  metadata?: Record<string, any>;
}, {
  name: string;
  created: boolean;
}> {
  getSlug() {
    return 'createCollection';
  }

  async execute(params: { name: string; metadata?: Record<string, any>; }): Promise<{
    name: string;
    created: boolean;
  }> {
    const memoryService = this.agent.getMemoryService();
    await memoryService.createCollection(params.name, params.metadata);
    return {
      name: params.name,
      created: true
    };
  }

  getParameterSchema(): JsonSchema.JSONSchema4 {
    return {
      type: 'object',
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          description: 'Name of the collection to create'
        },
        metadata: {
          type: 'object',
          description: 'Optional metadata for the collection'
        }
      }
    };
  }

  getResultSchema(): JsonSchema.JSONSchema4 {
    return {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the created collection'
        },
        created: {
          type: 'boolean',
          description: 'Whether the collection was created successfully'
        }
      }
    };
  }
}
```

Implementation for `collectionAddItemsMode.ts`:
```typescript
import { BaseMode } from '../../../baseMode';
import * as JsonSchema from 'json-schema';

export class CollectionAddItemsMode extends BaseMode<{
  collectionName: string;
  ids: string[];
  embeddings?: number[][];
  metadatas?: Record<string, any>[];
  documents?: string[];
}, {
  added: number;
}> {
  getSlug() {
    return 'collectionAddItems';
  }

  async execute(params: {
    collectionName: string;
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<{
    added: number;
  }> {
    const memoryService = this.agent.getMemoryService();
    await memoryService.addItems(params.collectionName, {
      ids: params.ids,
      embeddings: params.embeddings || [],
      metadatas: params.metadatas,
      documents: params.documents
    });
    
    return {
      added: params.ids.length
    };
  }

  getParameterSchema(): JsonSchema.JSONSchema4 {
    return {
      type: 'object',
      required: ['collectionName', 'ids'],
      properties: {
        collectionName: {
          type: 'string',
          description: 'Name of the collection to add items to'
        },
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Unique IDs for the items'
        },
        embeddings: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: 'number' }
          },
          description: 'Embedding vectors for the items'
        },
        metadatas: {
          type: 'array',
          items: { type: 'object' },
          description: 'Metadata for the items'
        },
        documents: {
          type: 'array',
          items: { type: 'string' },
          description: 'Document content for the items'
        }
      }
    };
  }

  getResultSchema(): JsonSchema.JSONSchema4 {
    return {
      type: 'object',
      properties: {
        added: {
          type: 'number',
          description: 'Number of items added to the collection'
        }
      }
    };
  }
}
```

Implementation for `collectionQueryMode.ts`:
```typescript
import { BaseMode } from '../../../baseMode';
import * as JsonSchema from 'json-schema';

export class CollectionQueryMode extends BaseMode<{
  collectionName: string;
  queryEmbedding: number[];
  nResults?: number;
  where?: Record<string, any>;
  include?: string[];
}, {
  ids: string[][];
  embeddings?: number[][][];
  metadatas?: Record<string, any>[][];
  documents?: string[][];
  distances?: number[][];
}> {
  getSlug() {
    return 'collectionQuery';
  }

  async execute(params: {
    collectionName: string;
    queryEmbedding: number[];
    nResults?: number;
    where?: Record<string, any>;
    include?: string[];
  }): Promise<{
    ids: string[][];
    embeddings?: number[][][];
    metadatas?: Record<string, any>[][];
    documents?: string[][];
    distances?: number[][];
  }> {
    const memoryService = this.agent.getMemoryService();
    
    const results = await memoryService.query(
      params.collectionName,
      params.queryEmbedding,
      {
        nResults: params.nResults,
        where: params.where,
        include: params.include
      }
    );
    
    return results;
  }

  getParameterSchema(): JsonSchema.JSONSchema4 {
    return {
      type: 'object',
      required: ['collectionName', 'queryEmbedding'],
      properties: {
        collectionName: {
          type: 'string',
          description: 'Name of the collection to query'
        },
        queryEmbedding: {
          type: 'array',
          items: { type: 'number' },
          description: 'Query embedding vector'
        },
        nResults: {
          type: 'number',
          description: 'Number of results to return (default: 10)'
        },
        where: {
          type: 'object',
          description: 'Filter condition for metadata'
        },
        include: {
          type: 'array',
          items: { type: 'string', enum: ['embeddings', 'metadatas', 'documents', 'distances'] },
          description: 'What to include in the results'
        }
      }
    };
  }

  getResultSchema(): JsonSchema.JSONSchema4 {
    return {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: 'string' }
          },
          description: 'IDs of matching items'
        },
        embeddings: {
          type: 'array',
          items: {
            type: 'array',
            items: {
              type: 'array',
              items: { type: 'number' }
            }
          },
          description: 'Embeddings of matching items'
        },
        metadatas: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: 'object' }
          },
          description: 'Metadata of matching items'
        },
        documents: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: 'string' }
          },
          description: 'Documents of matching items'
        },
        distances: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: 'number' }
          },
          description: 'Distance scores of matching items'
        }
      }
    };
  }
}
```

## Phase 3: Files to Edit

1. **MemoryService.ts**
   - Add ChromaCollectionManager field
   - Add methods for collection management 
   - Update initialization to initialize collection manager

```typescript
// Add to src/database/services/MemoryService.ts

private collectionManager: ChromaCollectionManager;

constructor(plugin: Plugin, vectorStore: IVectorStore, embeddingService: EmbeddingService) {
  // Existing constructor code...
  this.collectionManager = new ChromaCollectionManager(vectorStore);
}

async initialize(): Promise<void> {
  // Existing initialization code...
  await this.collectionManager.initialize();
}

// Collection management methods
async createCollection(name: string, metadata?: Record<string, any>): Promise<void> {
  await this.collectionManager.createCollection(name, metadata);
}

async getCollection(name: string): Promise<any> {
  return await this.collectionManager.getCollection(name);
}

async hasCollection(name: string): Promise<boolean> {
  return await this.collectionManager.hasCollection(name);
}

async listCollections(): Promise<string[]> {
  return await this.collectionManager.listCollections();
}

async deleteCollection(name: string): Promise<void> {
  await this.collectionManager.deleteCollection(name);
}

// Add methods for operations on collection items
async addItems(collectionName: string, items: {
  ids: string[];
  embeddings: number[][];
  metadatas?: Record<string, any>[];
  documents?: string[];
}): Promise<void> {
  const collection = await this.getCollection(collectionName);
  if (!collection) {
    throw new Error(`Collection ${collectionName} not found`);
  }
  
  await collection.add(items);
}

async query(collectionName: string, queryEmbedding: number[], options?: {
  nResults?: number;
  where?: Record<string, any>;
  include?: string[];
}): Promise<any> {
  const collection = await this.getCollection(collectionName);
  if (!collection) {
    throw new Error(`Collection ${collectionName} not found`);
  }
  
  return await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: options?.nResults || 10,
    where: options?.where,
    include: options?.include || ['embeddings', 'metadatas', 'documents', 'distances']
  });
}
```

2. **ChromaWrapper.ts**
   - Improve type definitions for ChromaDB operations
   - Add interfaces for better type safety

```typescript
// Add to src/database/providers/chroma/ChromaWrapper.ts

// New type definitions
export interface ChromaEmbeddingFunction {
  generate(texts: string[]): Promise<number[][]>;
}

export interface ChromaCollectionOptions {
  name: string;
  metadata?: Record<string, any>;
  embeddingFunction?: ChromaEmbeddingFunction;
}

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
```

3. **MemoryManagerAgent.ts**
   - Update to register new collection modes

```typescript
// Import new modes
import * as CollectionModes from './modes/collection';

constructor(public plugin?: any) {
  // Existing constructor code...
  
  // Register collection modes
  this.registerMode(new CollectionModes.CreateCollectionMode(this));
  this.registerMode(new CollectionModes.ListCollectionsMode(this));
  this.registerMode(new CollectionModes.GetCollectionMode(this));
  this.registerMode(new CollectionModes.DeleteCollectionMode(this));
  this.registerMode(new CollectionModes.CollectionAddItemsMode(this));
  this.registerMode(new CollectionModes.CollectionQueryMode(this));
}
```

4. **VaultLibrarian Agent Search Modes**
   - Update to use MemoryService for collection operations

```typescript
// In search mode execute methods
const memoryService = this.agent.plugin.services.memoryService;
const results = await memoryService.query('file_embeddings', embedding, {
  nResults: params.limit || 10,
  where: params.filters || {},
  include: ['documents', 'metadatas', 'distances']
});
```

## Phase 4: Configuration Updates

1. **Collection Configuration**
   - Add configuration for default collections

```typescript
// Add to appropriate config file
export interface CollectionConfig {
  name: string;
  description: string;
  schema?: Record<string, any>;
  embeddingDimension: number;
  metadata: Record<string, any>;
}

export const DEFAULT_COLLECTIONS: CollectionConfig[] = [
  {
    name: 'file_embeddings',
    description: 'Embeddings for vault files',
    embeddingDimension: 1536,
    metadata: {
      type: 'file',
      version: '1.0'
    }
  },
  {
    name: 'memory_traces',
    description: 'Memory traces for workspace sessions',
    embeddingDimension: 1536,
    metadata: {
      type: 'trace',
      version: '1.0'
    }
  },
  // Other default collections...
];
```

## Code That Can Be Kept

These components can still work with the new design and don't need immediate changes:

1. **Specialized Collection Classes**
   - `MemoryTraceCollection`
   - `SessionCollection`
   - `SnapshotCollection`
   - `FileEmbeddingCollection`

These can continue to work using the IVectorStore interface, which will now internally use the ChromaCollectionManager.

## Benefits of This Approach

1. **Direct ChromaDB Integration**: Better leverage of native ChromaDB functionality
2. **Clean Separation of Concerns**: 
   - Memory Manager handles collection management
   - Vault Librarian focuses on search operations
3. **Improved Type Safety**: Better type definitions for ChromaDB operations
4. **Extensibility**: Easy to add support for additional collection operations
5. **MCP Exposure**: Collection management operations available through MCP

## Implementation Timeline

1. Phase 1 (1-2 days): Create ChromaCollectionManager
2. Phase 2 (2-3 days): Add new Memory Manager collection modes
3. Phase 3 (2-3 days): Update MemoryService and other components
4. Phase 4 (1 day): Add configuration for collection management
5. Testing (2-3 days): Comprehensive testing of new functionality