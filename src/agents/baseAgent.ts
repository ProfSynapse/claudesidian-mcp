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
    
    // Session ID is now required for all tool calls
    if (!params.sessionId) {
      // Return error if sessionId is missing - it's now a required parameter
      return {
        success: false,
        error: createErrorMessage('Session ID required: ', 
          `Mode ${modeSlug} cannot execute without a sessionId.`),
        data: null
      };
    }
    
    // Store the sessionId on the mode instance for use in prepareResult
    (mode as any).sessionId = params.sessionId;
    
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
        error: originalResult.error || createErrorMessage('Handoff failed: ', 'Agent manager not available')
      };
    }
    
    // Get the target agent
    const targetAgent = this.agentManager.getAgent(handoff.tool);
    if (!targetAgent) {
      return {
        ...originalResult,
        error: createErrorMessage('Handoff failed: ', `Target agent '${handoff.tool}' not found`)
      };
    }
    
    try {
      // Prepare parameters for handoff
      // Get the workspace context from the original result or handoff parameters
      let handoffWorkspaceContext = originalResult.workspaceContext || handoff.parameters.workspaceContext;
      
      // If both have workspace context, merge them (prioritizing original result)
      if (originalResult.workspaceContext && handoff.parameters.workspaceContext) {
        // If they have the same workspace ID, merge them
        if (originalResult.workspaceContext.workspaceId === handoff.parameters.workspaceContext.workspaceId) {
          handoffWorkspaceContext = {
            ...handoff.parameters.workspaceContext,
            ...originalResult.workspaceContext,
            // Combine paths if both have workspace paths (using original's if only one has a path)
            workspacePath: originalResult.workspaceContext.workspacePath || 
                          handoff.parameters.workspaceContext.workspacePath
          };
        } else {
          // If workspace IDs differ, prefer the original result's context
          handoffWorkspaceContext = originalResult.workspaceContext;
        }
      }
      
      // Ensure sessionId is passed to the handoff
      const sessionId = originalResult.sessionId || handoff.parameters.sessionId;
      
      // Create the handoff parameters
      const handoffParams = {
        ...handoff.parameters,
        workspaceContext: handoffWorkspaceContext,
        sessionId: sessionId
      };
      
      // Execute the target mode
      const handoffResult = await targetAgent.executeMode(handoff.mode, handoffParams);
      
      // If returning here, pass any updated workspace context from the handoff result
      // back to the original result
      if (handoff.returnHere) {
        let resultWithHandoff = {
          ...originalResult,
          handoffResult
        };
        
        // If the handoff result has a workspace context that's different from the original,
        // and is from the same workspace, update the workspace context in the returned result
        if (handoffResult.workspaceContext && 
            handoffResult.workspaceContext.workspaceId === originalResult.workspaceContext?.workspaceId &&
            JSON.stringify(handoffResult.workspaceContext) !== JSON.stringify(originalResult.workspaceContext)) {
          resultWithHandoff.workspaceContext = handoffResult.workspaceContext;
        }
        
        return resultWithHandoff;
      }
      
      // Otherwise, just return the handoff result with potentially updated context
      return handoffResult;
    } catch (error) {
      // Handle errors in handoff using errorUtils
      return {
        success: false,
        error: createErrorMessage('Handoff error: ', error),
        workspaceContext: originalResult.workspaceContext,
        sessionId: originalResult.sessionId
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