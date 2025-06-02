import { BaseMode } from '../../../baseMode';
import { VectorManagerAgent } from '../../vectorManager';
import * as JsonSchema from 'json-schema';
import { DeleteEmbeddingsParams, EmbeddingResult } from '../../types';
import { getErrorMessage, createErrorMessage } from '../../../../utils/errorUtils';

/**
 * Mode for deleting embeddings from a collection
 */
export class DeleteEmbeddingMode extends BaseMode<DeleteEmbeddingsParams, EmbeddingResult> {
  /**
   * The parent agent
   */
  private agent: VectorManagerAgent;
  
  /**
   * Create a new DeleteEmbeddingMode
   * @param agent The parent VectorManagerAgent
   */
  constructor(agent: VectorManagerAgent) {
    super(
      'deleteEmbedding',
      'Delete Embedding',
      'Deletes embeddings from a vector collection',
      '1.0.0'
    );
    
    this.agent = agent;
  }
  
  /**
   * Get the unique mode slug
   * @returns Mode slug
   */
  getSlug(): string {
    return 'deleteEmbedding';
  }

  /**
   * Get the human-readable display name for the mode
   * @returns Display name
   */
  getDisplayName(): string {
    return 'Delete Embedding';
  }

  /**
   * Get the description of what the mode does
   * @returns Mode description
   */
  getDescription(): string {
    return 'Deletes embeddings from a vector collection';
  }

  /**
   * Execute the mode to delete embeddings
   * @param params Parameters for deleting embeddings
   * @returns Result of the delete operation
   */
  async execute(params: DeleteEmbeddingsParams): Promise<EmbeddingResult> {
    // Get the vector store from the agent
    const vectorStore = (this.agent as VectorManagerAgent).getVectorStore();
    
    try {
      try {
        // First check which items actually exist
        const existingItems = await vectorStore.getItems(params.collectionName, params.ids, ['documents']);
        const existingIds = existingItems?.ids || [];
        
        if (existingIds.length === 0) {
          return {
            success: true,
            data: {
              collectionName: params.collectionName,
              deleted: 0
            }
          };
        }
        
        // Only delete the items that actually exist
        await vectorStore.deleteItems(params.collectionName, existingIds);
        
        return {
          success: true,
          data: {
            collectionName: params.collectionName,
            deleted: existingIds.length
          }
        };
      } catch (error) {
        // Check if the error is because the collection doesn't exist
        if (error instanceof Error && 
            (error.message.includes('not found') || 
             error.message.includes('does not exist'))) {
          return {
            success: false,
            error: `Collection '${params.collectionName}' does not exist`
          };
        }
        
        // Re-throw other errors
        throw error;
      }
    } catch (error) {
      console.error(`Failed to delete embeddings from collection ${params.collectionName}:`, getErrorMessage(error));
      return {
        success: false,
        error: createErrorMessage('Failed to delete embeddings: ', error)
      };
    }
  }

  /**
   * Get the parameter schema for deleting embeddings
   * @returns JSON schema for parameters
   */
  getParameterSchema(): JsonSchema.JSONSchema4 {
    return {
      type: 'object',
      required: ['collectionName', 'ids'],
      properties: {
        collectionName: {
          type: 'string',
          description: 'Name of the collection to delete embeddings from',
          minLength: 1
        },
        ids: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'IDs of the embeddings to delete',
          minItems: 1
        }
      }
    };
  }

  /**
   * Get the result schema for deleting embeddings
   * @returns JSON schema for results
   */
  getResultSchema(): JsonSchema.JSONSchema4 {
    return {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the operation was successful'
        },
        error: {
          type: 'string',
          description: 'Error message if the operation failed'
        },
        data: {
          type: 'object',
          properties: {
            collectionName: {
              type: 'string',
              description: 'Collection name'
            },
            deleted: {
              type: 'number',
              description: 'Number of embeddings deleted'
            }
          }
        }
      },
      required: ['success']
    };
  }
}