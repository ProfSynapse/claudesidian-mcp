import { BaseMode } from '../../../baseMode';
import { VectorManagerAgent } from '../../vectorManager';
import * as JsonSchema from 'json-schema';
import { CreateCollectionParams, CollectionResult } from '../../types';
import { getErrorMessage, createErrorMessage } from '../../../../utils/errorUtils';

/**
 * Mode for creating a new vector collection
 */
export class CreateCollectionMode extends BaseMode<CreateCollectionParams, CollectionResult> {
  /**
   * The parent agent
   */
  private agent: VectorManagerAgent;
  
  /**
   * Create a new CreateCollectionMode
   * @param agent The parent VectorManagerAgent
   */
  constructor(agent: VectorManagerAgent) {
    super(
      'createCollection',
      'Create Collection',
      'Creates a new vector collection for storing embeddings',
      '1.0.0'
    );
    
    this.agent = agent;
  }
  
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
    return 'Creates a new vector collection for storing embeddings';
  }

  /**
   * Execute the mode to create a new collection
   * @param params Parameters for creating a collection
   * @returns Result of the creation operation
   */
  async execute(params: CreateCollectionParams): Promise<CollectionResult> {
    // Get the memory service from the agent
    const memoryService = (this.agent as VectorManagerAgent).getMemoryService();
    
    try {
      // Create a new collection with the given name and metadata
      await memoryService.createCollection(params.name, params.metadata);
      
      return {
        success: true,
        data: {
          name: params.name,
          created: true,
          metadata: params.metadata
        }
      };
    } catch (error) {
      console.error(`Failed to create collection ${params.name}:`, getErrorMessage(error));
      return {
        success: false,
        error: createErrorMessage(`Collection creation failed: `, error)
      };
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
              description: 'Name of the created collection'
            },
            created: {
              type: 'boolean',
              description: 'Whether the collection was created successfully'
            },
            metadata: {
              type: 'object',
              description: 'Collection metadata',
              additionalProperties: true
            }
          }
        }
      },
      required: ['success']
    };
  }
}