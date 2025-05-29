import { Plugin } from 'obsidian';
import { IVectorStore } from '../interfaces/IVectorStore';
import { FileEmbedding } from '../workspace-types';
import { VectorStoreFactory } from '../factory/VectorStoreFactory';
import {
  IVectorStoreOperationsService,
  VectorStoreQuery,
  VectorStoreQueryResult
} from '../interfaces/IVectorStoreOperationsService';

/**
 * Service for all vector store operations
 * Centralizes vector store interactions and system operation management
 */
export class VectorStoreOperationsService implements IVectorStoreOperationsService {
  private vectorStore: IVectorStore;
  private fileEmbeddingCollection: any;
  private isSystemOperation: boolean = false;

  constructor(private plugin: Plugin) {
    // Get vector store from plugin - check if it's the main plugin with vectorStore
    if ('vectorStore' in this.plugin) {
      this.vectorStore = (this.plugin as any).vectorStore;
    } else {
      // Fall back to global access using plugin manifest ID
      const pluginId = this.plugin.manifest?.id || 'claudesidian-mcp';
      const claudesidianPlugin = this.plugin.app.plugins.plugins[pluginId] as any;
      this.vectorStore = claudesidianPlugin?.vectorStore;
    }
    
    if (!this.vectorStore) {
      throw new Error('Vector store not available');
    }

    this.fileEmbeddingCollection = VectorStoreFactory.createFileEmbeddingCollection(this.vectorStore);
  }

  /**
   * Query file embeddings by file path
   * @param filePath Path of the file to query
   * @returns Array of existing embeddings for the file
   */
  async queryFileEmbeddings(filePath: string): Promise<any[]> {
    try {
      const queryResult = await this.vectorStore.query('file_embeddings', {
        where: { filePath: { $eq: filePath } },
        include: ['metadatas', 'documents'],
        nResults: 1000 // Get all chunks for this file
      });

      // Transform the query result to a flat array format
      const existingEmbeddings: any[] = [];
      if (queryResult.ids && queryResult.ids.length > 0) {
        for (let i = 0; i < queryResult.ids[0].length; i++) {
          existingEmbeddings.push({
            id: queryResult.ids[0][i],
            metadata: queryResult.metadatas?.[0]?.[i] || {},
            document: queryResult.documents?.[0]?.[i] || ''
          });
        }
      }

      return existingEmbeddings;
    } catch (error) {
      console.error(`Error querying embeddings for file ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Store a file embedding in the vector store
   * @param embedding File embedding to store
   */
  async storeEmbedding(embedding: FileEmbedding): Promise<void> {
    await this.fileEmbeddingCollection.add(embedding);
  }

  /**
   * Store multiple embeddings in batch
   * @param embeddings Array of embeddings to store
   */
  async storeEmbeddings(embeddings: FileEmbedding[]): Promise<void> {
    // Add embeddings using the vector store's batch interface
    if (embeddings.length === 0) return;

    const ids = embeddings.map(e => e.id);
    const vectors = embeddings.map(e => e.vector);
    const metadatas = embeddings.map(e => e.metadata);
    const documents = embeddings.map(e => e.content).filter((doc): doc is string => doc !== undefined);

    await this.vectorStore.addItems('file_embeddings', {
      ids,
      embeddings: vectors,
      metadatas,
      documents
    });
  }

  /**
   * Delete embeddings by IDs
   * @param ids Array of embedding IDs to delete
   */
  async deleteEmbeddings(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    
    for (const id of ids) {
      await this.vectorStore.deleteItems('file_embeddings', [id]);
    }
  }

  /**
   * Purge an entire collection
   * @param collectionName Name of collection to purge
   */
  async purgeCollection(collectionName: string): Promise<void> {
    try {
      // First get a count to log how many embeddings will be purged
      const beforeCount = await this.vectorStore.count(collectionName);
      console.log(`Found ${beforeCount} existing embeddings in ${collectionName} before purging`);
      
      if (beforeCount > 0) {
        console.log(`Purging ${collectionName} collection...`);
        // Delete the collection
        await this.vectorStore.deleteCollection(collectionName);
        // Recreate it (empty)
        await this.vectorStore.createCollection(collectionName, { 
          createdAt: new Date().toISOString(),
          reindexOperation: true
        });
        console.log(`Successfully purged ${collectionName} collection`);
      }
    } catch (purgeError) {
      console.error(`Error purging ${collectionName} collection:`, purgeError);
      throw purgeError;
    }
  }

  /**
   * Count embeddings in a collection
   * @param collectionName Name of collection to count
   * @returns Number of embeddings in collection
   */
  async countEmbeddings(collectionName: string): Promise<number> {
    try {
      return await this.vectorStore.count(collectionName);
    } catch (error) {
      console.error(`Error counting embeddings in ${collectionName}:`, error);
      return 0;
    }
  }

  /**
   * Execute an operation with system operation flag management
   * @param operation Operation to execute
   * @returns Result of the operation
   */
  async withSystemOperation<T>(operation: () => Promise<T>): Promise<T> {
    // Use the plugin's vectorStore if available, otherwise get from global
    const vectorStore = 'vectorStore' in this.plugin ? (this.plugin as any).vectorStore : 
      this.plugin.app.plugins.plugins[this.plugin.manifest?.id || 'claudesidian-mcp']?.vectorStore;
    
    // Mark this as a system operation to prevent file event loops
    vectorStore?.startSystemOperation();
    
    try {
      return await operation();
    } finally {
      // Always clear the system operation flag
      vectorStore?.endSystemOperation();
    }
  }

  /**
   * Check if collections exist and have embeddings
   * @returns true if embeddings exist in the system
   */
  async hasExistingEmbeddings(): Promise<boolean> {
    try {
      // Check collections that would have embeddings
      const collections = await this.vectorStore.listCollections();
      if (!collections || collections.length === 0) {
        console.log('No collections found');
        return false;
      }
      
      console.log('Found collections:', collections);

      // Check for specific collections that would contain embeddings
      const embeddingCollections = [
        'file_embeddings', 
        'memory_traces', 
        'sessions',
        'snapshots',
        'workspaces'
      ];
      
      const collectionExists = embeddingCollections.some(name => 
        collections.includes(name)
      );

      if (!collectionExists) {
        console.log('No embedding collections found');
        return false;
      }

      // Check if any of those collections have items
      for (const collectionName of embeddingCollections) {
        if (collections.includes(collectionName)) {
          try {
            const count = await this.vectorStore.count(collectionName);
            console.log(`Collection ${collectionName} has ${count} items`);
            if (count > 0) {
              return true;
            }
          } catch (countError) {
            console.warn(`Error getting count for collection ${collectionName}:`, countError);
          }
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking for existing embeddings:', error);
      return false;
    }
  }

  /**
   * Query vector store with custom parameters
   * @param collectionName Collection to query
   * @param query Query parameters
   * @returns Query result
   */
  async query(collectionName: string, query: VectorStoreQuery): Promise<VectorStoreQueryResult> {
    // Transform VectorStoreQuery to IVectorStore query format
    const vectorStoreQuery = {
      where: query.where,
      include: query.include as ('embeddings' | 'metadatas' | 'documents' | 'distances')[] | undefined,
      nResults: query.nResults
    };
    
    return await this.vectorStore.query(collectionName, vectorStoreQuery);
  }

  /**
   * Start a system operation
   * @deprecated Use withSystemOperation instead
   */
  startSystemOperation(): void {
    this.isSystemOperation = true;
  }

  /**
   * End a system operation
   * @deprecated Use withSystemOperation instead
   */
  endSystemOperation(): void {
    this.isSystemOperation = false;
  }

  /**
   * Get file embeddings
   * @param filePath Path of the file to get embeddings for
   * @returns Array of embeddings
   * @deprecated Use queryFileEmbeddings instead
   */
  async getFileEmbeddings(filePath: string): Promise<any[]> {
    return await this.queryFileEmbeddings(filePath);
  }

  /**
   * Add a file embedding
   * @param embedding File embedding to add
   * @deprecated Use storeEmbedding instead
   */
  async addFileEmbedding(embedding: FileEmbedding): Promise<void> {
    await this.storeEmbedding(embedding);
  }

  /**
   * Get collection count
   * @param collectionName Name of collection
   * @returns Number of items in collection
   */
  async getCollectionCount(collectionName: string): Promise<number> {
    return await this.countEmbeddings(collectionName);
  }

  /**
   * Delete a collection
   * @param collectionName Name of collection to delete
   */
  async deleteCollection(collectionName: string): Promise<void> {
    await this.purgeCollection(collectionName);
  }

  /**
   * Create a collection
   * @param collectionName Name of collection to create
   */
  async createCollection(collectionName: string): Promise<void> {
    // VectorStore creates collections automatically when needed
    // This is a no-op for compatibility
    console.log(`Collection ${collectionName} will be created on first use`);
  }
}
