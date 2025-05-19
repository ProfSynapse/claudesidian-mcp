import { BaseMode } from '../../../baseMode';
import { VectorManagerAgent } from '../../vectorManager';
import * as JsonSchema from 'json-schema';
import { DeleteCollectionParams, CollectionResult } from '../../types';
import { getErrorMessage, createErrorMessage } from '../../../../utils/errorUtils';

/**
 * Mode for deleting a vector collection
 */
export class DeleteCollectionMode extends BaseMode<DeleteCollectionParams, CollectionResult> {
  /**
   * The parent agent
   */
  private agent: VectorManagerAgent;
  
  /**
   * Create a new DeleteCollectionMode
   * @param agent The parent VectorManagerAgent
   */
  constructor(agent: VectorManagerAgent) {
    super(
      'deleteCollection',
      'Delete Collection',
      'Deletes a vector collection',
      '1.0.0'
    );
    
    this.agent = agent;
  }
  
  /**
   * Get the unique mode slug
   * @returns Mode slug
   */
  getSlug(): string {
    return 'deleteCollection';
  }

  /**
   * Get the human-readable display name for the mode
   * @returns Display name
   */
  getDisplayName(): string {
    return 'Delete Collection';
  }

  /**
   * Get the description of what the mode does
   * @returns Mode description
   */
  getDescription(): string {
    return 'Deletes a vector collection';
  }

  /**
   * Execute the mode to delete a collection
   * @param params Parameters for deleting a collection
   * @returns Result of the delete operation
   */
  async execute(params: DeleteCollectionParams): Promise<CollectionResult> {
    // Get the memory service from the agent
    const memoryService = (this.agent as VectorManagerAgent).getMemoryService();
    
    try {
      // Check if collection exists
      const collectionExists = await memoryService.hasCollection(params.name);
      
      if (!collectionExists) {
        return {
          success: false,
          error: `Collection ${params.name} not found`
        };
      }
      
      // Check if collection has items and force flag is not set
      if (!params.force) {
        const itemCount = await memoryService.countItems(params.name);
        if (itemCount > 0) {
          return {
            success: false,
            error: `Collection ${params.name} contains ${itemCount} items. Use force=true to delete anyway.`
          };
        }
      }
      
      // Delete the collection
      await memoryService.deleteCollection(params.name);
      
      return {
        success: true,
        data: {
          name: params.name,
          deleted: true
        }
      };
    } catch (error) {
      console.error(`Failed to delete collection ${params.name}:`, getErrorMessage(error));
      return {
        success: false,
        error: createErrorMessage('Failed to delete collection: ', error)
      };
    }
  }

  /**
   * Get the parameter schema for deleting a collection
   * @returns JSON schema for parameters
   */
  getParameterSchema(): JsonSchema.JSONSchema4 {
    return {
      type: 'object',
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          description: 'Name of the collection to delete',
          minLength: 1
        },
        force: {
          type: 'boolean',
          description: 'Whether to force deletion even if collection contains items',
          default: false
        }
      }
    };
  }

  /**
   * Get the result schema for deleting a collection
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
            deleted: {
              type: 'boolean',
              description: 'Whether the collection was deleted successfully'
            }
          }
        }
      },
      required: ['success']
    };
  }
}