import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager';
import * as JsonSchema from 'json-schema';

/**
 * Mode for adding items to a ChromaDB collection
 */
export class CollectionAddItemsMode extends BaseMode<{
  collectionName: string;
  ids: string[];
  embeddings?: number[][];
  metadatas?: Record<string, any>[];
  documents?: string[];
}, {
  added: number;
  collectionName: string;
}> {
  /**
   * Get the unique mode slug
   * @returns Mode slug
   */
  getSlug(): string {
    return 'collectionAddItems';
  }

  /**
   * Get the human-readable display name for the mode
   * @returns Display name
   */
  getDisplayName(): string {
    return 'Add Items to Collection';
  }

  /**
   * Get the description of what the mode does
   * @returns Mode description
   */
  getDescription(): string {
    return 'Adds items to a ChromaDB collection';
  }

  /**
   * Execute the mode to add items to a collection
   * @param params Parameters for adding items
   * @returns Result of the add operation
   */
  async execute(params: {
    collectionName: string;
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<{
    added: number;
    collectionName: string;
  }> {
    // Get the memory service from the agent
    const memoryService = (this.agent as MemoryManagerAgent).getMemoryService();
    
    try {
      // Ensure the collection exists or create it
      let collectionExists = await memoryService.hasCollection(params.collectionName);
      
      if (!collectionExists) {
        await memoryService.createCollection(params.collectionName);
      }
      
      // Add the items to the collection
      await memoryService.addItems(params.collectionName, {
        ids: params.ids,
        embeddings: params.embeddings,
        metadatas: params.metadatas,
        documents: params.documents
      });
      
      return {
        added: params.ids.length,
        collectionName: params.collectionName
      };
    } catch (error) {
      console.error(`Failed to add items to collection ${params.collectionName}:`, error);
      throw new Error(`Failed to add items: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the parameter schema for adding items
   * @returns JSON schema for parameters
   */
  getParameterSchema(): JsonSchema.JSONSchema4 {
    return {
      type: 'object',
      required: ['collectionName', 'ids'],
      properties: {
        collectionName: {
          type: 'string',
          description: 'Name of the collection to add items to',
          minLength: 1
        },
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Unique IDs for the items to add',
          minItems: 1
        },
        embeddings: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: 'number' }
          },
          description: 'Embedding vectors for the items (must match the length of ids)'
        },
        metadatas: {
          type: 'array',
          items: { 
            type: 'object',
            additionalProperties: true
          },
          description: 'Metadata objects for the items (must match the length of ids)'
        },
        documents: {
          type: 'array',
          items: { type: 'string' },
          description: 'Document content for the items (must match the length of ids)'
        }
      }
    };
  }

  /**
   * Get the result schema for the add operation
   * @returns JSON schema for results
   */
  getResultSchema(): JsonSchema.JSONSchema4 {
    return {
      type: 'object',
      properties: {
        added: {
          type: 'number',
          description: 'Number of items added to the collection'
        },
        collectionName: {
          type: 'string',
          description: 'Name of the collection'
        }
      },
      required: ['added', 'collectionName']
    };
  }
}