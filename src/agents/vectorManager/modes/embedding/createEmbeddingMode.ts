import { BaseMode } from '../../../baseMode';
import { VectorManagerAgent } from '../../vectorManager';
import * as JsonSchema from 'json-schema';
import { AddEmbeddingsParams, EmbeddingResult } from '../../types';
import { getErrorMessage, createErrorMessage } from '../../../../utils/errorUtils';

/**
 * Mode for adding embeddings to a collection
 */
export class CreateEmbeddingMode extends BaseMode<AddEmbeddingsParams, EmbeddingResult> {
  /**
   * The parent agent
   */
  private agent: VectorManagerAgent;
  
  /**
   * Create a new CreateEmbeddingMode
   * @param agent The parent VectorManagerAgent
   */
  constructor(agent: VectorManagerAgent) {
    super(
      'createEmbedding',
      'Create Embedding',
      'Adds embeddings to a vector collection',
      '1.0.0'
    );
    
    this.agent = agent;
  }
  
  /**
   * Get the unique mode slug
   * @returns Mode slug
   */
  getSlug(): string {
    return 'createEmbedding';
  }

  /**
   * Get the human-readable display name for the mode
   * @returns Display name
   */
  getDisplayName(): string {
    return 'Create Embedding';
  }

  /**
   * Get the description of what the mode does
   * @returns Mode description
   */
  getDescription(): string {
    return 'Adds embeddings to a vector collection';
  }

  /**
   * Execute the mode to add embeddings
   * @param params Parameters for adding embeddings
   * @returns Result of the operation
   */
  async execute(params: AddEmbeddingsParams): Promise<EmbeddingResult> {
    // Get services from the agent
    const memoryService = (this.agent as VectorManagerAgent).getMemoryService();
    const embeddingService = (this.agent as VectorManagerAgent).getEmbeddingService();
    
    try {
      // Ensure the collection exists
      let collectionExists = await memoryService.hasCollection(params.collectionName);
      
      if (!collectionExists) {
        await memoryService.createCollection(params.collectionName);
      }
      
      // Prepare arrays for Chroma
      const ids: string[] = [];
      const embeddings: number[][] = [];
      const metadatas: Record<string, any>[] = [];
      const documents: string[] = [];
      
      // Process items and generate embeddings if needed
      for (const item of params.items) {
        ids.push(item.id);
        
        // If embedding is provided, use it; otherwise generate from text
        if (item.embedding) {
          embeddings.push(item.embedding);
        } else if (item.text) {
          const embedding = await embeddingService.getEmbedding(item.text);
          if (!embedding) {
            throw new Error(`Failed to generate embedding for item with ID ${item.id}`);
          }
          embeddings.push(embedding);
        } else {
          throw new Error(`Item with ID ${item.id} must provide either text or embedding`);
        }
        
        // Add metadata and document
        metadatas.push(item.metadata || {});
        documents.push(item.text || '');
      }
      
      // Add the items to the collection
      await memoryService.addItems(params.collectionName, {
        ids,
        embeddings,
        metadatas,
        documents
      });
      
      return {
        success: true,
        data: {
          collectionName: params.collectionName,
          added: ids.length
        }
      };
    } catch (error) {
      console.error(`Failed to add embeddings to collection ${params.collectionName}:`, getErrorMessage(error));
      return {
        success: false,
        error: createErrorMessage('Failed to add embeddings: ', error)
      };
    }
  }

  /**
   * Get the parameter schema for adding embeddings
   * @returns JSON schema for parameters
   */
  getParameterSchema(): JsonSchema.JSONSchema4 {
    return {
      type: 'object',
      required: ['collectionName', 'items'],
      properties: {
        collectionName: {
          type: 'string',
          description: 'Name of the collection to add embeddings to',
          minLength: 1
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id'],
            properties: {
              id: {
                type: 'string',
                description: 'Unique identifier for the embedding'
              },
              text: {
                type: 'string',
                description: 'Text content to be embedded (optional if embedding is provided)'
              },
              embedding: {
                type: 'array',
                items: {
                  type: 'number'
                },
                description: 'Pre-computed embedding vector (optional if text is provided)'
              },
              metadata: {
                type: 'object',
                description: 'Metadata to associate with the embedding',
                additionalProperties: true
              }
            }
          },
          description: 'Items to add (each item must provide either text or embedding)',
          minItems: 1
        },
        overwrite: {
          type: 'boolean',
          description: 'Whether to overwrite existing embeddings with the same IDs',
          default: false
        }
      }
    };
  }

  /**
   * Get the result schema for adding embeddings
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
              description: 'Name of the collection'
            },
            added: {
              type: 'number',
              description: 'Number of embeddings added to the collection'
            }
          }
        }
      },
      required: ['success']
    };
  }
}