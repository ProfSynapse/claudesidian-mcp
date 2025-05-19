import { BaseMode } from '../../../baseMode';
import { VectorManagerAgent } from '../../vectorManager';
import * as JsonSchema from 'json-schema';
import { BatchEmbeddingsParams, BatchResult } from '../../types';

/**
 * Mode for batch operations on embeddings
 */
export class BatchEmbeddingMode extends BaseMode<BatchEmbeddingsParams, BatchResult> {
  /**
   * The parent agent
   */
  private agent: VectorManagerAgent;
  
  /**
   * Create a new BatchEmbeddingMode
   * @param agent The parent VectorManagerAgent
   */
  constructor(agent: VectorManagerAgent) {
    super(
      'batchEmbedding',
      'Batch Embedding Operations',
      'Performs batch operations (add, update, delete, query) on embeddings',
      '1.0.0'
    );
    
    this.agent = agent;
  }
  
  /**
   * Get the unique mode slug
   * @returns Mode slug
   */
  getSlug(): string {
    return 'batchEmbedding';
  }

  /**
   * Get the human-readable display name for the mode
   * @returns Display name
   */
  getDisplayName(): string {
    return 'Batch Embedding Operations';
  }

  /**
   * Get the description of what the mode does
   * @returns Mode description
   */
  getDescription(): string {
    return 'Performs batch operations (add, update, delete, query) on embeddings';
  }

  /**
   * Execute the mode to perform batch operations
   * @param params Parameters for batch operations
   * @returns Result of the operation
   */
  async execute(params: BatchEmbeddingsParams): Promise<BatchResult> {
    // Get services from the agent
    const memoryService = (this.agent as VectorManagerAgent).getMemoryService();
    const embeddingService = (this.agent as VectorManagerAgent).getEmbeddingService();
    const searchService = (this.agent as VectorManagerAgent).getSearchService();
    
    try {
      // Ensure the collection exists
      let collectionExists = await memoryService.hasCollection(params.collectionName);
      
      if (!collectionExists && params.operation !== 'delete') {
        await memoryService.createCollection(params.collectionName);
      }
      
      // Implement batch operations based on the operation type
      switch (params.operation) {
        case 'add':
        case 'update':
          return await this.handleAddOrUpdate(params, memoryService, embeddingService);
          
        case 'delete':
          return await this.handleDelete(params, memoryService);
          
        case 'query':
          return await this.handleQuery(params, searchService);
          
        default:
          return {
            success: false,
            error: `Unsupported operation: ${params.operation}`
          };
      }
    } catch (error) {
      console.error(`Failed to perform batch ${params.operation} operation on collection ${params.collectionName}:`, error);
      return {
        success: false,
        error: `Batch operation failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  /**
   * Handle add or update operations
   * @param params Batch parameters
   * @param memoryService Memory service
   * @param embeddingService Embedding service
   * @returns Batch result
   */
  private async handleAddOrUpdate(
    params: BatchEmbeddingsParams,
    memoryService: any,
    embeddingService: any
  ): Promise<BatchResult> {
    // Prepare arrays for Chroma
    const ids: string[] = [];
    const embeddings: number[][] = [];
    const metadatas: Record<string, any>[] = [];
    const documents: string[] = [];
    
    // Process items and generate embeddings if needed
    const results: Array<{ id: string; success: boolean; error?: string }> = [];
    let processed = 0;
    let failed = 0;
    
    for (const item of params.items) {
      try {
        ids.push(item.id);
        
        // If embedding is provided, use it; otherwise generate from text
        if (item.embedding) {
          embeddings.push(item.embedding);
        } else if (item.text) {
          const embedding = await embeddingService.getEmbedding(item.text);
          if (!embedding) {
            throw new Error(`Failed to generate embedding`);
          }
          embeddings.push(embedding);
        } else {
          throw new Error(`Must provide either text or embedding`);
        }
        
        // Add metadata and document
        metadatas.push(item.metadata || {});
        documents.push(item.text || '');
        
        results.push({ id: item.id, success: true });
        processed++;
      } catch (error) {
        results.push({
          id: item.id,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
        failed++;
      }
    }
    
    // Only proceed if we have at least one valid item
    if (processed > 0) {
      // If update operation, first delete existing items
      if (params.operation === 'update' && params.overwrite) {
        try {
          await memoryService.deleteItems(params.collectionName, ids);
        } catch (deleteError) {
          console.warn(`Error pre-deleting items for update: ${deleteError.message}`);
        }
      }
      
      // Add the items to the collection
      await memoryService.addItems(params.collectionName, {
        ids,
        embeddings,
        metadatas,
        documents
      });
    }
    
    return {
      success: processed > 0,
      data: {
        collectionName: params.collectionName,
        operation: params.operation,
        processed,
        failed,
        results
      }
    };
  }
  
  /**
   * Handle delete operations
   * @param params Batch parameters
   * @param memoryService Memory service
   * @returns Batch result
   */
  private async handleDelete(
    params: BatchEmbeddingsParams,
    memoryService: any
  ): Promise<BatchResult> {
    // Extract IDs
    const ids = params.items.map(item => item.id);
    
    // Delete the items
    await memoryService.deleteItems(params.collectionName, ids);
    
    return {
      success: true,
      data: {
        collectionName: params.collectionName,
        operation: 'delete',
        processed: ids.length,
        failed: 0,
        results: ids.map(id => ({ id, success: true }))
      }
    };
  }
  
  /**
   * Handle query operations
   * @param params Batch parameters
   * @param searchService Search service
   * @returns Batch result
   */
  private async handleQuery(
    params: BatchEmbeddingsParams,
    searchService: any
  ): Promise<BatchResult> {
    const results: Array<{
      id: string;
      success: boolean;
      error?: string;
      matches?: Array<{
        id: string;
        similarity: number;
        text?: string;
        metadata?: Record<string, any>;
      }>;
    }> = [];
    
    let processed = 0;
    let failed = 0;
    
    // Process each query item
    for (const item of params.items) {
      try {
        let queryResult;
        
        // Use either embedding or text for the query
        if (item.embedding) {
          queryResult = await searchService.semanticSearchWithEmbedding(
            item.embedding,
            {
              collectionName: params.collectionName,
              limit: params.queryOptions?.limit || 10,
              threshold: params.queryOptions?.threshold || 0.7,
              filters: params.queryOptions?.where
            }
          );
        } else if (item.text) {
          // Use direct query with the collection
          const queryParams = {
            queryTexts: [item.text],
            nResults: params.queryOptions?.limit || 10,
            where: params.queryOptions?.where,
            include: ['metadatas', 'documents', 'distances']
          };
          
          const chromaResult = await searchService.queryCollection(
            params.collectionName,
            queryParams
          );
          
          // Format into consistent result structure
          queryResult = {
            success: true,
            matches: []
          };
          
          if (chromaResult && chromaResult.ids && chromaResult.ids[0]) {
            for (let i = 0; i < chromaResult.ids[0].length; i++) {
              const id = chromaResult.ids[0][i];
              const distance = chromaResult.distances?.[0]?.[i] || 0;
              const metadata = chromaResult.metadatas?.[0]?.[i] || {};
              const document = chromaResult.documents?.[0]?.[i] || '';
              
              queryResult.matches.push({
                id,
                similarity: 1 - distance,
                content: document,
                filePath: metadata.path || '',
                metadata
              });
            }
          }
        } else {
          throw new Error(`Query item must provide either text or embedding`);
        }
        
        // Check if the query was successful
        if (queryResult.success) {
          results.push({
            id: item.id,
            success: true,
            matches: queryResult.matches?.map(match => ({
              id: match.id || '',
              similarity: match.similarity,
              text: match.content,
              metadata: match.metadata
            }))
          });
          processed++;
        } else {
          throw new Error(queryResult.error || 'Unknown query error');
        }
      } catch (error) {
        results.push({
          id: item.id,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
        failed++;
      }
    }
    
    return {
      success: processed > 0,
      data: {
        collectionName: params.collectionName,
        operation: 'query',
        processed,
        failed,
        results
      }
    };
  }

  /**
   * Get the parameter schema for batch operations
   * @returns JSON schema for parameters
   */
  getParameterSchema(): JsonSchema.JSONSchema4 {
    return {
      type: 'object',
      required: ['collectionName', 'operation', 'items'],
      properties: {
        collectionName: {
          type: 'string',
          description: 'Name of the collection to operate on',
          minLength: 1
        },
        operation: {
          type: 'string',
          enum: ['add', 'update', 'delete', 'query'],
          description: 'Type of batch operation to perform'
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id'],
            properties: {
              id: {
                type: 'string',
                description: 'Unique identifier for the item'
              },
              text: {
                type: 'string',
                description: 'Text content (required for add/update if embedding not provided, or for query operations)'
              },
              embedding: {
                type: 'array',
                items: {
                  type: 'number'
                },
                description: 'Pre-computed embedding vector (optional for add/update if text is provided, or for query operations)'
              },
              metadata: {
                type: 'object',
                description: 'Metadata for the item (for add/update operations)',
                additionalProperties: true
              }
            }
          },
          description: 'Items to process in the batch operation',
          minItems: 1
        },
        overwrite: {
          type: 'boolean',
          description: 'Whether to overwrite existing items with the same IDs (for add/update operations)',
          default: false
        },
        queryOptions: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of results per query',
              default: 10
            },
            threshold: {
              type: 'number',
              description: 'Minimum similarity threshold (0-1)',
              default: 0.7
            },
            where: {
              type: 'object',
              description: 'ChromaDB where clause for filtering',
              additionalProperties: true
            },
            includeEmbeddings: {
              type: 'boolean',
              description: 'Whether to include embedding vectors in the results',
              default: false
            }
          },
          description: 'Options for query operations'
        }
      }
    };
  }

  /**
   * Get the result schema for batch operations
   * @returns JSON schema for results
   */
  getResultSchema(): JsonSchema.JSONSchema4 {
    return {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the operation was successful overall'
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
            operation: {
              type: 'string',
              enum: ['add', 'update', 'delete', 'query'],
              description: 'Operation that was performed'
            },
            processed: {
              type: 'number',
              description: 'Number of items successfully processed'
            },
            failed: {
              type: 'number',
              description: 'Number of items that failed processing'
            },
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'Item ID'
                  },
                  success: {
                    type: 'boolean',
                    description: 'Whether this item was processed successfully'
                  },
                  error: {
                    type: 'string',
                    description: 'Error message for this item (if unsuccessful)'
                  },
                  matches: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: {
                          type: 'string',
                          description: 'ID of the matching item'
                        },
                        similarity: {
                          type: 'number',
                          description: 'Similarity score (0-1)'
                        },
                        text: {
                          type: 'string',
                          description: 'Text content of the matching item'
                        },
                        metadata: {
                          type: 'object',
                          description: 'Metadata of the matching item',
                          additionalProperties: true
                        }
                      }
                    },
                    description: 'Query matches (for query operations)'
                  }
                },
                required: ['id', 'success']
              },
              description: 'Individual results for each item'
            }
          }
        }
      },
      required: ['success']
    };
  }
}