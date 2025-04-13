import { ITool } from './interfaces/ITool';

/**
 * Base class for all tools in the MCP plugin
 * Provides common functionality for tool implementation
 */
export abstract class BaseTool<T = any, R = any> implements ITool<T, R> {
  name: string;
  description: string;
  version: string;
  
  /**
   * Create a new tool
   * @param name Name of the tool
   * @param description Description of the tool
   * @param version Version of the tool
   */
  constructor(name: string, description: string, version: string) {
    this.name = name;
    this.description = description;
    this.version = version;
  }
  
  /**
   * Execute the tool with arguments
   * @param args Arguments for the tool
   * @returns Promise that resolves with the tool's result
   */
  abstract execute(args: T): Promise<R>;
  
  /**
   * Get the JSON schema for the tool
   * @returns JSON schema object
   */
  abstract getSchema(): any;
}