import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager';
import * as JsonSchema from 'json-schema';

/**
 * Mode for deleting a ChromaDB collection
 */
export class DeleteCollectionMode extends BaseMode<{
  name: string;
  confirm: boolean;
}, {
  deleted: boolean;
  name: string;
}> {
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
    return 'Permanently deletes a ChromaDB collection';
  }

  /**
   * Execute the mode to delete a collection
   * @param params Parameters for deleting a collection
   * @returns Result of the deletion operation
   */
  async execute(params: {
    name: string;
    confirm: boolean;
  }): Promise<{
    deleted: boolean;
    name: string;
  }> {
    // Get the memory service from the agent
    const memoryService = (this.agent as MemoryManagerAgent).getMemoryService();
    
    // Only proceed if confirm is true
    if (!params.confirm) {
      return {
        deleted: false,
        name: params.name
      };
    }
    
    try {
      // First check if the collection exists
      const exists = await memoryService.hasCollection(params.name);
      
      // If it doesn't exist, nothing to delete
      if (!exists) {
        return {
          deleted: false,
          name: params.name
        };
      }
      
      // Delete the collection
      await memoryService.deleteCollection(params.name);
      
      return {
        deleted: true,
        name: params.name
      };
    } catch (error) {
      console.error(`Failed to delete collection ${params.name}:`, error);
      throw new Error(`Collection deletion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the parameter schema for deleting a collection
   * @returns JSON schema for parameters
   */
  getParameterSchema(): JsonSchema.JSONSchema4 {
    return {
      type: 'object',
      required: ['name', 'confirm'],
      properties: {
        name: {
          type: 'string',
          description: 'Name of the collection to delete',
          minLength: 1
        },
        confirm: {
          type: 'boolean',
          description: 'Confirmation flag (must be true to proceed with deletion)'
        }
      }
    };
  }

  /**
   * Get the result schema for collection deletion
   * @returns JSON schema for results
   */
  getResultSchema(): JsonSchema.JSONSchema4 {
    return {
      type: 'object',
      properties: {
        deleted: {
          type: 'boolean',
          description: 'Whether the collection was successfully deleted'
        },
        name: {
          type: 'string',
          description: 'Name of the collection'
        }
      },
      required: ['deleted', 'name']
    };
  }
}