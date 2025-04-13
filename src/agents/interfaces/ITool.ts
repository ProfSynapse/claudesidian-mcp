/**
 * Interface for tools in the MCP plugin
 * Each tool provides a specific functionality within an agent's domain
 */
export interface ITool<T = any, R = any> {
  /**
   * Name of the tool
   */
  name: string;
  
  /**
   * Description of the tool
   */
  description: string;
  
  /**
   * Version of the tool
   */
  version: string;
  
  /**
   * Execute the tool with arguments
   * @param args Arguments for the tool
   * @returns Promise that resolves with the tool's result
   */
  execute(args: T): Promise<R>;
  
  /**
   * Get the JSON schema for the tool
   * @returns JSON schema object
   */
  getSchema(): any;
}