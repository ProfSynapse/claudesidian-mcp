import { IAgent } from './interfaces/IAgent';
import { IMode } from './interfaces/IMode';

/**
 * Base class for all agents in the MCP plugin
 * Provides common functionality for agent implementation
 */
export abstract class BaseAgent implements IAgent {
  name: string;
  description: string;
  version: string;
  protected modes: Map<string, IMode> = new Map();
  
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
   * Get all modes provided by this agent
   * @returns Array of modes
   */
  getModes(): IMode[] {
    return Array.from(this.modes.values());
  }
  
  /**
   * Get a specific mode by slug
   * @param modeSlug Slug of the mode to get
   * @returns Mode with the specified slug or undefined if not found
   */
  getMode(modeSlug: string): IMode | undefined {
    return this.modes.get(modeSlug);
  }
  
  /**
   * Register a mode with this agent
   * @param mode Mode to register
   */
  registerMode(mode: IMode): void {
    this.modes.set(mode.slug, mode);
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
   * Execute a mode by slug
   * @param modeSlug Slug of the mode to execute
   * @param params Parameters to pass to the mode
   * @returns Promise that resolves with the mode's result
   * @throws Error if mode not found
   */
  async executeMode(modeSlug: string, params: any): Promise<any> {
    const mode = this.modes.get(modeSlug);
    if (!mode) {
      throw new Error(`Mode ${modeSlug} not found in agent ${this.name}`);
    }
    
    return await mode.execute(params);
  }
  
}