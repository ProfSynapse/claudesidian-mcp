import { IAgent } from './interfaces/IAgent';
import { IMode } from './interfaces/IMode';
import { CommonParameters, CommonResult } from '../types';
import { parseWorkspaceContext } from '../utils/contextUtils';
import { createErrorMessage } from '../utils/errorUtils';

/**
 * Base class for all agents in the MCP plugin
 * Provides common functionality for agent implementation
 */
export abstract class BaseAgent implements IAgent {
  name: string;
  protected _description: string;
  version: string;
  protected modes: Map<string, IMode> = new Map();
  
  // Reference to agent manager
  protected agentManager?: {
    getAgent(agentName: string): IAgent | undefined;
  };
  
  /**
   * Create a new agent
   * @param name Name of the agent
   * @param description Description of the agent
   * @param version Version of the agent
   */
  constructor(name: string, description: string, version: string) {
    this.name = name;
    this._description = description;
    this.version = version;
  }

  /**
   * Get the agent description
   * Can be overridden by subclasses for dynamic descriptions
   */
  get description(): string {
    return this._description;
  }
  
  /**
   * Set the agent manager reference
   * @param manager Agent manager instance
   */
  setAgentManager(manager: { getAgent(agentName: string): IAgent | undefined }): void {
    this.agentManager = manager;
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
    
    // Session ID and description are now required for all tool calls (in context)
    if (!params.context?.sessionId) {
      // Return error if sessionId is missing - provide helpful message about providing session name
      return {
        success: false,
        error: createErrorMessage('Session ID required: ', 
          `Mode ${modeSlug} requires context.sessionId. Provide a 2-4 word session name or existing session ID in the context block.`),
        data: null
      };
    }
    
    // sessionDescription is optional but recommended for better session management
    if (!params.context?.sessionDescription) {
      console.warn(`[${this.name}] context.sessionDescription not provided for ${modeSlug}. Consider providing a brief description for better session tracking.`);
    }
    
    // Store the sessionId on the mode instance for use in prepareResult
    (mode as any).sessionId = params.context.sessionId;
    
    // If the mode has setParentContext method, use it to propagate workspace context
    // Pass the workspace context even if undefined, as the mode's setParentContext
    // method can handle the default context inheritance logic
    if (typeof (mode as any).setParentContext === 'function') {
      (mode as any).setParentContext(params.workspaceContext);
    }
    
    // If the mode supports getInheritedWorkspaceContext and there's no explicit workspace context,
    // try to retrieve the inherited context and apply it to the params
    if (typeof (mode as any).getInheritedWorkspaceContext === 'function' && 
        (!params.workspaceContext || !parseWorkspaceContext(params.workspaceContext)?.workspaceId)) {
      const inheritedContext = (mode as any).getInheritedWorkspaceContext(params);
      if (inheritedContext) {
        params = {
          ...params,
          workspaceContext: inheritedContext
        };
      }
    }
    
    // Execute the requested mode
    const result = await mode.execute(params);
    
    return result;
  }
  
  
  /**
   * Clean up resources when the agent is unloaded
   * This is a base implementation that child classes can extend
   */
  onunload(): void {
    // Default implementation does nothing
  }
}