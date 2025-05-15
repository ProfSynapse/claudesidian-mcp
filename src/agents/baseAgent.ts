import { IAgent } from './interfaces/IAgent';
import { IMode } from './interfaces/IMode';
import { CommonParameters, CommonResult } from '../types';

/**
 * Base class for all agents in the MCP plugin
 * Provides common functionality for agent implementation
 */
export abstract class BaseAgent implements IAgent {
  name: string;
  description: string;
  version: string;
  protected modes: Map<string, IMode> = new Map();
  
  // Reference to agent manager for handoffs
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
    this.description = description;
    this.version = version;
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
    
    // Execute the requested mode
    const result = await mode.execute(params);
    
    // Handle handoff if present in result parameters
    if (params.handoff && this.agentManager) {
      return await this.handleHandoff(params.handoff, result);
    }
    
    return result;
  }
  
  /**
   * Handle handoff to another agent/mode
   * @param handoff Handoff parameters
   * @param originalResult Result from the original mode execution
   * @returns Result from handoff or combined result
   */
  protected async handleHandoff(
    handoff: NonNullable<CommonParameters['handoff']>,
    originalResult: CommonResult
  ): Promise<CommonResult> {
    if (!this.agentManager) {
      // If no agent manager is available, return original result with error
      return {
        ...originalResult,
        error: originalResult.error || 'Handoff failed: Agent manager not available'
      };
    }
    
    // Get the target agent
    const targetAgent = this.agentManager.getAgent(handoff.tool);
    if (!targetAgent) {
      return {
        ...originalResult,
        error: `Handoff failed: Target agent '${handoff.tool}' not found`
      };
    }
    
    try {
      // Prepare parameters for handoff
      // If the original result has workspace context, pass it through
      const handoffParams = {
        ...handoff.parameters,
        workspaceContext: originalResult.workspaceContext || handoff.parameters.workspaceContext
      };
      
      // Execute the target mode
      const handoffResult = await targetAgent.executeMode(handoff.mode, handoffParams);
      
      // If returnHere is true, return original result with handoff result attached
      if (handoff.returnHere) {
        return {
          ...originalResult,
          handoffResult
        };
      }
      
      // Otherwise, just return the handoff result
      return handoffResult;
    } catch (error) {
      // Handle errors in handoff
      return {
        success: false,
        error: `Handoff error: ${error.message || 'Unknown error'}`,
        workspaceContext: originalResult.workspaceContext
      };
    }
  }
  
  /**
   * Clean up resources when the agent is unloaded
   * This is a base implementation that child classes can extend
   */
  onunload(): void {
    // Default implementation does nothing
  }
}