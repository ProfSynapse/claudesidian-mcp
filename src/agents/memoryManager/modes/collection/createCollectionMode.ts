import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager';
import * as JsonSchema from 'json-schema';

/**
 * Mode for creating a new ChromaDB collection
 */
export class CreateCollectionMode extends BaseMode<{
  name: string;
  metadata?: Record<string, any>;
}, {
  name: string;
  created: boolean;
}> {
  /**
   * Get the unique mode slug
   * @returns Mode slug
   */
  getSlug(): string {
    return 'createCollection';
  }

  /**
   * Get the human-readable display name for the mode
   * @returns Display name
   */
  getDisplayName(): string {
    return 'Create Collection';
  }

  /**
   * Get the description of what the mode does
   * @returns Mode description
   */
  getDescription(): string {
    return 'Creates a new ChromaDB collection for vector storage';
  }

  /**
   * Execute the mode to create a new collection
   * @param params Parameters for creating a collection
   * @returns Result of the creation operation
   */
  async execute(params: {
    name: string;
    metadata?: Record<string, any>;
  }): Promise<{
    name: string;
    created: boolean;
  }> {
    // Get the memory service from the agent
    const memoryService = (this.agent as MemoryManagerAgent).getMemoryService();
    
    try {
      // Create a new collection with the given name and metadata
      await memoryService.createCollection(params.name, params.metadata);
      
      return {
        name: params.name,
        created: true
      };
    } catch (error) {
      console.error(`Failed to create collection ${params.name}:`, error);
      throw new Error(`Collection creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the parameter schema for collection creation
   * @returns JSON schema for parameters
   */
  getParameterSchema(): JsonSchema.JSONSchema4 {
    return {
      type: 'object',
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          description: 'Name of the collection to create (must be unique)',
          minLength: 1
        },
        metadata: {
          type: 'object',
          description: 'Optional metadata for the collection (any key-value pairs)',
          properties: {
            description: {
              type: 'string',
              description: 'Optional description of the collection purpose'
            }
          },
          additionalProperties: true
        }
      }
    };
  }

  /**
   * Get the result schema for collection creation
   * @returns JSON schema for results
   */
  getResultSchema(): JsonSchema.JSONSchema4 {
    return {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the created collection'
        },
        created: {
          type: 'boolean',
          description: 'Whether the collection was created successfully'
        }
      },
      required: ['name', 'created']
    };
  }
}