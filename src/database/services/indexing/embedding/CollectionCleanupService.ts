import { Plugin } from 'obsidian';

/**
 * Information about a provider change that requires collection cleanup
 */
export interface ProviderChangeInfo {
  /** Previous embedding provider name */
  oldProvider: string;
  /** New embedding provider name */
  newProvider: string;
  /** Previous embedding dimensions */
  oldDimensions: number;
  /** New embedding dimensions */
  newDimensions: number;
}

/**
 * Service responsible for cleaning up vector store collections when
 * embedding providers change or when a full reset is needed.
 * 
 * @remarks
 * This service ensures data consistency when switching between embedding
 * providers with different dimensions or models. It handles the deletion
 * and recreation of collections to prevent dimension mismatch errors.
 */
export class CollectionCleanupService {
  /**
   * Creates a new CollectionCleanupService instance
   * @param plugin - Obsidian plugin instance
   */
  constructor(private plugin: Plugin) {}

  /**
   * Clear all embeddings when switching providers or when dimensions change.
   * This is necessary because embeddings from different providers or with
   * different dimensions are incompatible.
   * 
   * @param comparison - Information about the provider change
   * @returns Promise that resolves when cleanup is complete
   * 
   * @remarks
   * This method:
   * - Sets a reindexing flag to prevent concurrent operations
   * - Deletes and recreates the file_embeddings collection
   * - Clears dependent collections (memory_traces, sessions, snapshots)
   * - Preserves metadata about the provider change for debugging
   * 
   * @example
   * ```typescript
   * await cleanupService.clearEmbeddingsForProviderChange({
   *   oldProvider: 'openai',
   *   newProvider: 'cohere',
   *   oldDimensions: 1536,
   *   newDimensions: 1024
   * });
   * ```
   */
  async clearEmbeddingsForProviderChange(comparison: ProviderChangeInfo): Promise<void> {
    const plugin = this.plugin.app.plugins.plugins['claudesidian-mcp'] as any;
    if (!plugin) return;
    
    plugin.isReindexing = true;
    
    try {
      const vectorStore = plugin.vectorStore;
      if (vectorStore) {
        console.log('🔄 Clearing existing embeddings due to provider/dimension change...');
        
        // Delete and recreate file_embeddings collection
        await vectorStore.deleteCollection('file_embeddings');
        await vectorStore.createCollection('file_embeddings', { 
          providerChange: true,
          previousProvider: comparison.oldProvider,
          newProvider: comparison.newProvider,
          previousDimensions: comparison.oldDimensions,
          newDimensions: comparison.newDimensions,
          clearedAt: new Date().toISOString()
        });
        
        // Clear other embedding-dependent collections
        const embeddingCollections = ['memory_traces', 'sessions', 'snapshots'];
        for (const collectionName of embeddingCollections) {
          const hasCollection = await vectorStore.hasCollection(collectionName);
          if (hasCollection) {
            await vectorStore.deleteCollection(collectionName);
            await vectorStore.createCollection(collectionName, { 
              providerChange: true,
              clearedAt: new Date().toISOString()
            });
          }
        }
      }
    } finally {
      plugin.isReindexing = false;
    }
  }

  /**
   * Clear all embedding collections for a complete reset.
   * Use this when you need to start fresh with all embeddings.
   * 
   * @returns Promise that resolves when all collections are cleared
   * 
   * @remarks
   * Clears the following collections:
   * - file_embeddings: Document embeddings
   * - memory_traces: Conversation memory embeddings
   * - sessions: Session state embeddings
   * - snapshots: Workspace snapshot embeddings
   */
  async clearAllEmbeddings(): Promise<void> {
    const plugin = this.plugin.app.plugins.plugins['claudesidian-mcp'] as any;
    if (!plugin || !plugin.vectorStore) return;

    const vectorStore = plugin.vectorStore;
    const collections = ['file_embeddings', 'memory_traces', 'sessions', 'snapshots'];
    
    for (const collectionName of collections) {
      const hasCollection = await vectorStore.hasCollection(collectionName);
      if (hasCollection) {
        await vectorStore.deleteCollection(collectionName);
        await vectorStore.createCollection(collectionName, {
          clearedAt: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Check if embeddings need to be cleared due to provider or dimension changes.
   * 
   * @param oldProvider - Previous provider name
   * @param newProvider - New provider name
   * @param oldDimensions - Previous embedding dimensions
   * @param newDimensions - New embedding dimensions
   * @returns True if embeddings need to be cleared, false otherwise
   * 
   * @example
   * ```typescript
   * const needsClear = await cleanupService.checkProviderCompatibility(
   *   'openai', 'openai', 1536, 3072
   * ); // Returns true due to dimension change
   * ```
   */
  async checkProviderCompatibility(
    oldProvider: string,
    newProvider: string,
    oldDimensions: number,
    newDimensions: number
  ): Promise<boolean> {
    return oldProvider !== newProvider || oldDimensions !== newDimensions;
  }
}