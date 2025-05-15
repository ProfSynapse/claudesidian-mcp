/**
 * Interface for modes in the MCP plugin
 * Each mode provides a specific functionality within an agent's domain
 */
export interface IMode<T = any, R = any> {
  /**
   * Slug of the mode (used for identification)
   */
  slug: string;
  
  /**
   * Name of the mode
   */
  name: string;
  
  /**
   * Description of the mode
   */
  description: string;
  
  /**
   * Version of the mode
   */
  version: string;
  
  /**
   * Execute the mode with parameters
   * @param params Parameters for the mode
   * @returns Promise that resolves with the mode's result
   */
  execute(params: T): Promise<R>;
  
  /**
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any;
  
  /**
   * Get the JSON schema for the mode's result
   * @returns JSON schema object
   */
  getResultSchema(): any;
}