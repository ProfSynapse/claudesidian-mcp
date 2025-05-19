import { BaseMode } from '../../../baseMode';
import { VectorManagerAgent } from '../../vectorManager';
import * as JsonSchema from 'json-schema';
import { GetCollectionParams, CollectionResult } from '../../types';
import { getErrorMessage, createErrorMessage } from '../../../../utils/errorUtils';

/**
 * Mode for getting collection details
 */
export class GetCollectionMode extends BaseMode<GetCollectionParams, CollectionResult> {
  /**
   * The parent agent
   */
  private agent: VectorManagerAgent;
  
  /**
   * Create a new GetCollectionMode
   * @param agent The parent VectorManagerAgent
   */
  constructor(agent: VectorManagerAgent) {
    super(
      'getCollection',
      'Get Collection',
      'Gets details about a specific vector collection',
      '1.0.0'
    );
    
    this.agent = agent;
  }
  
  /**
   * Get the unique mode slug
   * @returns Mode slug
   */
  getSlug(): string {
    return 'getCollection';
  }

  /**
   * Get the human-readable display name for the mode
   * @returns Display name
   */
  getDisplayName(): string {
    return 'Get Collection';
  }

  /**
   * Get the description of what the mode does
   * @returns Mode description
   */
  getDescription(): string {
    return 'Gets details about a specific vector collection';
  }

  /**
   * Execute the mode to get collection details
   * @param params Parameters for getting collection details
   * @returns Result of the get operation
   */
  async execute(params: GetCollectionParams): Promise<CollectionResult> {
    // Get the memory service from the agent
    const memoryService = (this.agent as VectorManagerAgent).getMemoryService();
    const searchService = (this.agent as VectorManagerAgent).getSearchService();
    
    try {
      // Check if collection exists
      const collectionExists = await memoryService.hasCollection(params.name);
      
      if (!collectionExists) {
        return {
          success: false,
          error: `Collection ${params.name} not found`
        };
      }
      
      // Get collection metadata
      // Getting the raw collection to access any metadata
      const collection = await memoryService.getCollection(params.name);
      const metadata = collection ? (collection.metadata ? await collection.metadata() : {}) : {};
      
      // Get item count
      const itemCount = await memoryService.countItems(params.name);
      
      const result: CollectionResult = {
        success: true,
        data: {
          name: params.name,
          metadata
        }
      };
      
      // Add stats if requested
      if (params.includeStats) {
        try {
          // Get collection details using the search service
          const searchResult = await searchService.queryCollection(params.name, {
            limit: 1,
            include: ['metadatas']
          });
          
          // Add the stats
          result.data!.stats = {
            itemCount,
            totalEmbeddings: itemCount,
            dimensionality: searchResult?.embeddings?.[0]?.[0]?.length ?? 0,
            lastUpdated: new Date().toISOString() // Not stored directly, use current time
          };
        } catch (statsError) {
          console.warn(`Error getting detailed stats for collection ${params.name}:`, getErrorMessage(statsError));
          // Provide basic stats
          result.data!.stats = {
            itemCount,
            totalEmbeddings: itemCount,
            dimensionality: 0,
            lastUpdated: new Date().toISOString()
          };
        }
      }
      
      return result;
    } catch (error) {
      console.error(`Failed to get collection ${params.name}:`, getErrorMessage(error));
      return {
        success: false,
        error: createErrorMessage('Failed to get collection: ', error)
      };
    }
  }

  /**
   * Get the parameter schema for getting collection details
   * @returns JSON schema for parameters
   */
  getParameterSchema(): JsonSchema.JSONSchema4 {
    return {
      type: 'object',
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          description: 'Name of the collection to get',
          minLength: 1
        },
        includeStats: {
          type: 'boolean',
          description: 'Whether to include detailed statistics about the collection',
          default: false
        }
      }
    };
  }

  /**
   * Get the result schema for getting collection details
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
            name: {
              type: 'string',
              description: 'Collection name'
            },
            metadata: {
              type: 'object',
              description: 'Collection metadata',
              additionalProperties: true
            },
            stats: {
              type: 'object',
              properties: {
                itemCount: {
                  type: 'number',
                  description: 'Number of items in the collection'
                },
                totalEmbeddings: {
                  type: 'number',
                  description: 'Total number of embeddings'
                },
                dimensionality: {
                  type: 'number',
                  description: 'Dimensionality of the embeddings'
                },
                lastUpdated: {
                  type: 'string',
                  description: 'ISO timestamp of the last update'
                }
              }
            }
          }
        }
      },
      required: ['success']
    };
  }
}