import { BaseMode } from '../../../baseMode';
import { VectorManagerAgent } from '../../vectorManager';
import * as JsonSchema from 'json-schema';
import { GetEmbeddingsParams, EmbeddingResult } from '../../types';
import { getErrorMessage, createErrorMessage } from '../../../../utils/errorUtils';

/**
 * Mode for getting embeddings from a collection
 */
export class GetEmbeddingMode extends BaseMode<GetEmbeddingsParams, EmbeddingResult> {
  /**
   * The parent agent
   */
  private agent: VectorManagerAgent;
  
  /**
   * Create a new GetEmbeddingMode
   * @param agent The parent VectorManagerAgent
   */
  constructor(agent: VectorManagerAgent) {
    super(
      'getEmbedding',
      'Get Embedding',
      'Gets embeddings from a vector collection by ID',
      '1.0.0'
    );
    
    this.agent = agent;
  }
  
  /**
   * Get the unique mode slug
   * @returns Mode slug
   */
  getSlug(): string {
    return 'getEmbedding';
  }

  /**
   * Get the human-readable display name for the mode
   * @returns Display name
   */
  getDisplayName(): string {
    return 'Get Embedding';
  }

  /**
   * Get the description of what the mode does
   * @returns Mode description
   */
  getDescription(): string {
    return 'Gets embeddings from a vector collection by ID';
  }

  /**
   * Execute the mode to get embeddings
   * @param params Parameters for getting embeddings
   * @returns Result of the get operation
   */
  async execute(params: GetEmbeddingsParams): Promise<EmbeddingResult> {
    // Get the vector store from the agent
    const vectorStore = (this.agent as VectorManagerAgent).getVectorStore();
    
    try {
      // Try to get the items by their IDs
      try {
        // Prepare the include parameter
        const include = [
          'documents',
          'metadatas'
        ] as string[];
        
        // Include embeddings if requested
        if (params.includeEmbeddings) {
          include.push('embeddings');
        }
        
        // Use getItems method to get specific items by ID
        const results = await vectorStore.getItems(params.collectionName, params.ids, include);
        
        // Process results
        if (!results || !results.ids || results.ids.length === 0) {
          return {
            success: true,
            data: {
              collectionName: params.collectionName,
              items: []
            }
          };
        }
        
        // Map results to items
        const items: Array<{
          id: string;
          text?: string;
          metadata?: Record<string, any>;
          embedding?: number[];
        }> = [];
        
        // getItems returns flat arrays (not nested like query)
        for (let i = 0; i < results.ids.length; i++) {
          const item: {
            id: string;
            text?: string;
            metadata?: Record<string, any>;
            embedding?: number[];
          } = {
            id: results.ids[i],
            text: results.documents?.[i],
            metadata: results.metadatas?.[i]
          };
          
          // Add embedding if requested
          if (params.includeEmbeddings && results.embeddings) {
            item.embedding = results.embeddings[i];
          }
          
          items.push(item);
        }
        
        return {
          success: true,
          data: {
            collectionName: params.collectionName,
            items
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
        
        // For other errors, re-throw to be caught by the outer try/catch
        throw error;
      }
    } catch (error) {
      console.error(`Failed to get embeddings from collection ${params.collectionName}:`, getErrorMessage(error));
      return {
        success: false,
        error: createErrorMessage('Failed to get embeddings: ', error)
      };
    }
  }

  /**
   * Get the parameter schema for getting embeddings
   * @returns JSON schema for parameters
   */
  getParameterSchema(): JsonSchema.JSONSchema4 {
    return {
      type: 'object',
      required: ['collectionName', 'ids'],
      properties: {
        collectionName: {
          type: 'string',
          description: 'Name of the collection to get embeddings from',
          minLength: 1
        },
        ids: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'IDs of the embeddings to get',
          minItems: 1
        },
        includeEmbeddings: {
          type: 'boolean',
          description: 'Whether to include the actual embedding vectors in the result',
          default: false
        }
      }
    };
  }

  /**
   * Get the result schema for getting embeddings
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
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'Embedding ID'
                  },
                  text: {
                    type: 'string',
                    description: 'Original text content'
                  },
                  embedding: {
                    type: 'array',
                    items: {
                      type: 'number'
                    },
                    description: 'Embedding vector (only included if includeEmbeddings is true)'
                  },
                  metadata: {
                    type: 'object',
                    description: 'Metadata associated with the embedding',
                    additionalProperties: true
                  }
                },
                required: ['id']
              },
              description: 'List of embedding items'
            }
          }
        }
      },
      required: ['success']
    };
  }
}