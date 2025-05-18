import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager';
import * as JsonSchema from 'json-schema';

/**
 * Mode for listing all ChromaDB collections
 */
export class ListCollectionsMode extends BaseMode<{
  includeMetadata?: boolean;
}, {
  collections: Array<{ name: string; metadata?: Record<string, any> }> | string[];
}> {
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
    return 'Lists all ChromaDB collections in the vector store';
  }

  /**
   * Execute the mode to list collections
   * @param params Parameters for listing collections
   * @returns Array of collection names or collection details
   */
  async execute(params: {
    includeMetadata?: boolean;
  }): Promise<{
    collections: Array<{ name: string; metadata?: Record<string, any> }> | string[];
  }> {
    // Get the memory service from the agent
    const memoryService = (this.agent as MemoryManagerAgent).getMemoryService();
    
    try {
      // If metadata is requested, get detailed collection information
      if (params.includeMetadata) {
        const details = await memoryService.getCollectionDetails();
        return {
          collections: details
        };
      }
      
      // Otherwise, just get collection names
      const collections = await memoryService.listCollections();
      return {
        collections
      };
    } catch (error) {
      console.error('Failed to list collections:', error);
      throw new Error(`Collection listing failed: ${error instanceof Error ? error.message : String(error)}`);
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
        includeMetadata: {
          type: 'boolean',
          description: 'Whether to include metadata in the results',
          default: false
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
        collections: {
          oneOf: [
            {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Array of collection names (when includeMetadata=false)'
            },
            {
              type: 'array',
              items: {
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
                  }
                },
                required: ['name']
              },
              description: 'Array of collection details (when includeMetadata=true)'
            }
          ]
        }
      },
      required: ['collections']
    };
  }
}