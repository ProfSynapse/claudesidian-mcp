import { ITool } from './ITool';

/**
 * Interface for agents in the MCP plugin
 * Each agent is responsible for a specific domain and provides a set of tools
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
   * Get all tools provided by this agent
   * @returns Array of tools
   */
  getTools(): ITool[];
  
  /**
   * Initialize the agent
   * @returns Promise that resolves when initialization is complete
   */
  initialize(): Promise<void>;
  
  /**
   * Execute a tool by name
   * @param toolName Name of the tool to execute
   * @param args Arguments to pass to the tool
   * @returns Promise that resolves with the tool's result
   */
  executeTool(toolName: string, args: any): Promise<any>;
}