import { BaseMode } from '../../../baseMode';
import { VectorManagerAgent } from '../../vectorManager';
import * as JsonSchema from 'json-schema';
import { ListCollectionsParams, CollectionResult } from '../../types';
import { getErrorMessage, createErrorMessage } from '../../../../utils/errorUtils';

/**
 * Mode for listing vector collections
 */
export class ListCollectionsMode extends BaseMode<ListCollectionsParams, CollectionResult> {
  /**
   * The parent agent
   */
  private agent: VectorManagerAgent;
  
  /**
   * Create a new ListCollectionsMode
   * @param agent The parent VectorManagerAgent
   */
  constructor(agent: VectorManagerAgent) {
    super(
      'listCollections',
      'List Collections',
      'Lists available vector collections',
      '1.0.0'
    );
    
    this.agent = agent;
  }
  
  /**
   * Get the unique mode slug
   * @returns Mode slug
   */
  getSlug(): string {
    return 'listCollections';
  }

  /**
   * Get the human-readable display name for the mode
   * @returns Display name
   */
  getDisplayName(): string {
    return 'List Collections';
  }

  /**
   * Get the description of what the mode does
   * @returns Mode description
   */
  getDescription(): string {
    return 'Lists available vector collections';
  }

  /**
   * Execute the mode to list collections
   * @param params Parameters for listing collections
   * @returns Result of the list operation
   */
  async execute(params: ListCollectionsParams): Promise<CollectionResult> {
    // Get the memory service from the agent
    const memoryService = (this.agent as VectorManagerAgent).getMemoryService();
    
    try {
      // Get collections from the memory service
      const collections = await memoryService.listCollections();
      
      // Filter by pattern if specified
      let filteredCollections = collections;
      if (params.pattern) {
        const regex = new RegExp(params.pattern, 'i');
        filteredCollections = collections.filter((collectionName: string) => regex.test(collectionName));
      }

      // Get collection details
      const collectionManager = memoryService.getCollectionManager();
      const collectionsWithMetadata = await collectionManager.getCollectionDetails();
      
      // Get item count for each collection
      const collectionDetails = await Promise.all(
        filteredCollections.map(async (collectionName: string) => {
          try {
            const count = await memoryService.countItems(collectionName);
            // Find metadata for this collection
            const metadataObj = collectionsWithMetadata.find(c => c.name === collectionName);
            return {
              name: collectionName,
              itemCount: count,
              metadata: metadataObj?.metadata || {}
            };
          } catch (error) {
            console.warn(`Failed to get item count for collection ${collectionName}:`, getErrorMessage(error));
            return {
              name: collectionName,
              metadata: {}
            };
          }
        })
      );
      
      return {
        success: true,
        data: {
          collections: collectionDetails
        }
      };
    } catch (error) {
      console.error('Failed to list collections:', getErrorMessage(error));
      return {
        success: false,
        error: createErrorMessage('Failed to list collections: ', error)
      };
    }
  }

  /**
   * Get the parameter schema for listing collections
   * @returns JSON schema for parameters
   */
  getParameterSchema(): JsonSchema.JSONSchema4 {
    return {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Optional pattern to filter collection names (regular expression)'
        }
      }
    };
  }

  /**
   * Get the result schema for listing collections
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
            collections: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'Collection name'
                  },
                  itemCount: {
                    type: 'number',
                    description: 'Number of items in the collection'
                  },
                  metadata: {
                    type: 'object',
                    description: 'Collection metadata',
                    additionalProperties: true
                  }
                },
                required: ['name']
              },
              description: 'List of collections'
            }
          }
        }
      },
      required: ['success']
    };
  }
}