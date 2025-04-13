import { IAgent } from './interfaces/IAgent';
import { ITool } from './interfaces/ITool';

/**
 * Base class for all agents in the MCP plugin
 * Provides common functionality for agent implementation
 */
export abstract class BaseAgent implements IAgent {
  name: string;
  description: string;
  version: string;
  protected tools: Map<string, ITool> = new Map();
  
  /**
   * Create a new agent
   * @param name Name of the agent
   * @param description Description of the agent
   * @param version Version of the agent
   */
  constructor(name: string, description: string, version: string) {
    this.name = name;
    this.description = description;
    this.version = version;
  }
  
  /**
   * Get all tools provided by this agent
   * @returns Array of tools
   */
  getTools(): ITool[] {
    return Array.from(this.tools.values());
  }
  
  /**
   * Register a tool with this agent
   * @param tool Tool to register
   */
  registerTool(tool: ITool): void {
    this.tools.set(tool.name, tool);
  }
  
  /**
   * Initialize the agent
   * Default implementation does nothing
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    // Default implementation does nothing
  }
  
  /**
   * Execute a tool by name
   * @param toolName Name of the tool to execute
   * @param args Arguments to pass to the tool
   * @returns Promise that resolves with the tool's result
   * @throws Error if tool not found
   */
  async executeTool(toolName: string, args: any): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found in agent ${this.name}`);
    }
    
    return await tool.execute(args);
  }
}