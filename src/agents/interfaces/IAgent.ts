// Import IMode from separate file
import { IMode } from './IMode';

/**
 * Interface for agents in the MCP plugin
 * Each agent is responsible for a specific domain and provides a set of modes
 */
export interface IAgent {
  /**
   * Name of the agent
   */
  name: string;
  
  /**
   * Description of the agent
   */
  description: string;
  
  /**
   * Version of the agent
   */
  version: string;
  
  /**
   * Get all modes provided by this agent
   * @returns Array of modes
   */
  getModes(): IMode[];
  
  /**
   * Get a specific mode by slug
   * @param modeSlug Slug of the mode to get
   * @returns Mode with the specified slug or undefined if not found
   */
  getMode(modeSlug: string): IMode | undefined;
  
  /**
   * Initialize the agent
   * @returns Promise that resolves when initialization is complete
   */
  initialize(): Promise<void>;
  
  /**
   * Execute a mode with parameters
   * @param modeSlug Slug of the mode to execute
   * @param params Parameters to pass to the mode
   * @returns Promise that resolves with the mode's result
   */
  executeMode(modeSlug: string, params: any): Promise<any>;
  
}