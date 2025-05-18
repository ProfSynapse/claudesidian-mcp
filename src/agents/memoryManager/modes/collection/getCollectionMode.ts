import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager';
import * as JsonSchema from 'json-schema';

/**
 * Mode for getting information about a ChromaDB collection
 */
export class GetCollectionMode extends BaseMode<{
  name: string;
}, {
  exists: boolean;
  name: string;
  metadata?: Record<string, any>;
  count?: number;
}> {
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
    return 'Gets details about a specific ChromaDB collection';
  }

  /**
   * Execute the mode to get collection information
   * @param params Parameters for getting a collection
   * @returns Collection information
   */
  async execute(params: {
    name: string;
  }): Promise<{
    exists: boolean;
    name: string;
    metadata?: Record<string, any>;
    count?: number;
  }> {
    // Get the memory service from the agent
    const memoryService = (this.agent as MemoryManagerAgent).getMemoryService();
    
    try {
      // Check if the collection exists
      const exists = await memoryService.hasCollection(params.name);
      
      // If it doesn't exist, return minimal info
      if (!exists) {
        return {
          exists: false,
          name: params.name
        };
      }
      
      // Get the collection to retrieve metadata
      const collection = await memoryService.getCollection(params.name);
      
      // Get collection metadata if available
      let metadata: Record<string, any> | undefined = undefined;
      try {
        if (collection && typeof collection.metadata === 'function') {
          metadata = await collection.metadata();
        }
      } catch (error) {
        console.warn(`Failed to retrieve metadata for collection ${params.name}:`, error);
      }
      
      // Get item count
      let count: number | undefined = undefined;
      try {
        count = await memoryService.countItems(params.name);
      } catch (error) {
        console.warn(`Failed to retrieve item count for collection ${params.name}:`, error);
      }
      
      // Return collection information
      return {
        exists: true,
        name: params.name,
        metadata,
        count
      };
    } catch (error) {
      console.error(`Failed to get collection ${params.name}:`, error);
      throw new Error(`Collection retrieval failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the parameter schema for getting a collection
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
        }
      }
    };
  }

  /**
   * Get the result schema for collection information
   * @returns JSON schema for results
   */
  getResultSchema(): JsonSchema.JSONSchema4 {
    return {
      type: 'object',
      properties: {
        exists: {
          type: 'boolean',
          description: 'Whether the collection exists'
        },
        name: {
          type: 'string',
          description: 'Name of the collection'
        },
        metadata: {
          type: 'object',
          description: 'Collection metadata (if available)',
          additionalProperties: true
        },
        count: {
          type: 'number',
          description: 'Number of items in the collection (if available)'
        }
      },
      required: ['exists', 'name']
    };
  }
}