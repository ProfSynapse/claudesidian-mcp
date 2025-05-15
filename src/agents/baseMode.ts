import { IMode } from './interfaces/IMode';

/**
 * Base class for all modes in the MCP plugin
 * Provides common functionality for mode implementation
 */
export abstract class BaseMode<T = any, R = any> implements IMode<T, R> {
  slug: string;
  name: string;
  description: string;
  version: string;
  
  /**
   * Create a new mode
   * @param slug Slug of the mode (used for identification)
   * @param name Name of the mode
   * @param description Description of the mode
   * @param version Version of the mode
   */
  constructor(slug: string, name: string, description: string, version: string) {
    this.slug = slug;
    this.name = name;
    this.description = description;
    this.version = version;
  }
  
  /**
   * Execute the mode with parameters
   * @param params Parameters for the mode
   * @returns Promise that resolves with the mode's result
   */
  abstract execute(params: T): Promise<R>;
  
  /**
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  abstract getParameterSchema(): any;
  
  /**
   * Get the JSON schema for the mode's result
   * @returns JSON schema object
   */
  getResultSchema(): any {
    // Default implementation returns a simple success schema
    return {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the operation was successful'
        },
        error: {
          type: 'string',
          description: 'Error message if operation failed'
        }
      }
    };
  }
}