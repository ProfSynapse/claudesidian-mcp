# Vector Store Module

This module provides a modular implementation of a vector store using IndexedDB for the Claudesidian Memory Manager.

## Architecture

The module is organized into several layers:

- **Core**: Base database operations with IndexedDB
- **Operations**: Business logic for different database operations
- **Utils**: Utility functions for vector math and link processing
- **Interfaces**: Strong typing for all components

## Directory Structure

```
db/
├── README.md              # This documentation
├── constants.ts           # Shared constants
├── index.ts               # Main exports
├── interfaces.ts          # Interface definitions
├── core/                  # Core database functionality
│   ├── index.ts
│   └── IndexedDBStore.ts  # IndexedDB wrapper
├── operations/            # Database operations
│   ├── index.ts
│   ├── EmbeddingOperations.ts  # CRUD operations for embeddings
│   ├── FileOperations.ts       # File-specific operations
│   ├── GraphOperations.ts      # Graph-based relevance boosting
│   └── SearchOperations.ts     # Vector similarity search
└── utils/                 # Utility functions
    ├── index.ts
    ├── LinkUtils.ts       # Link text normalization and matching
    └── VectorMath.ts      # Vector math operations
```

## Usage

Basic usage:

```typescript
import { VectorStore } from './db';

// Create and initialize the vector store
const vectorStore = new VectorStore('my-database');
await vectorStore.initialize();

// Add embeddings
await vectorStore.addEmbeddings([
  {
    id: 'embed1',
    content: 'Sample content',
    embedding: [0.1, 0.2, 0.3],
    filePath: '/path/to/file.md',
    // ... other properties
  }
]);

// Search for similar content
const results = await vectorStore.findSimilar(
  [0.1, 0.2, 0.3], 
  { 
    threshold: 0.7,
    limit: 5
  }
);
```

## Advanced Usage

For more advanced use cases, you can directly access the individual components:

```typescript
import { 
  IndexedDBStore, 
  EmbeddingOperations,
  SearchOperations,
  VectorMath
} from './db';

// Create custom instances
const dbStore = new IndexedDBStore('custom-db');
const vectorMath = new VectorMath();
const embeddingOps = new EmbeddingOperations(dbStore);
const searchOps = new SearchOperations(embeddingOps, vectorMath);

// Use the specific operations
await searchOps.findSimilar(queryEmbedding, params);
```

## Benefits of Modular Design

1. **Improved Maintainability**: Each module has a single responsibility
2. **Better Testability**: Modules can be tested in isolation
3. **Enhanced Readability**: Smaller files are easier to understand
4. **Flexibility**: Components can be replaced or extended independently

## Key Components

### IndexedDBStore

Provides a wrapper around the native IndexedDB API with promise-based methods.

### EmbeddingOperations

Handles CRUD operations for embeddings.

### FileOperations

Manages operations related to files, such as getting embeddings for a file or checking if a file needs reindexing.

### SearchOperations

Implements vector similarity search with various filtering options.

### GraphOperations

Enhances search results using graph-based relevance boosting.

### VectorMath

Provides mathematical operations for vectors, including cosine similarity calculation.

### LinkUtils

Utilities for normalizing and matching links between documents.