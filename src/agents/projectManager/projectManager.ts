import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { ProjectManagerConfig } from './config';
import { 
  ProjectPlanMode, 
  AskQuestionMode, 
  CheckpointMode, 
  CompletionMode
} from './modes';
import { parseWorkspaceContext } from '../../utils/contextUtils';
import { getErrorMessage } from '../../utils/errorUtils';

/**
 * Agent for managing projects in the vault
 */
export class ProjectManagerAgent extends BaseAgent {
  /**
   * Create a new ProjectManagerAgent
   * @param _app Obsidian app instance (used for mode initialization)
   * @param plugin Plugin instance for accessing services
   */
  constructor(private readonly _app: App, public plugin?: any) {
    super(
      ProjectManagerConfig.name,
      ProjectManagerConfig.description,
      ProjectManagerConfig.version
    );
    
    // Register project modes
    this.registerMode(new ProjectPlanMode(this._app));
    this.registerMode(new AskQuestionMode(this._app));
    this.registerMode(new CheckpointMode(this._app));
    this.registerMode(new CompletionMode(this._app));
  }
  
  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    await super.initialize();
  }
  
  /**
   * Execute a mode with automatic session management
   * @param modeSlug The mode to execute
   * @param params Parameters for the mode
   * @returns Result from mode execution
   */
  async executeMode(modeSlug: string, params: any): Promise<any> {
    // If there's a workspace context but no session ID, try to get or create a session
    if (params.workspaceContext?.workspaceId && !params.workspaceContext.sessionId && this.plugin) {
      try {
        // Get the activity embedder
        const activityEmbedder = this.plugin.getActivityEmbedder();
        if (activityEmbedder) {
          // Try to get an active session ID
          let sessionId = activityEmbedder.getActiveSession(parseWorkspaceContext(params.workspaceContext)?.workspaceId);
          
          // If no active session, create one automatically
          if (!sessionId) {
            sessionId = await activityEmbedder.createSession(
              parseWorkspaceContext(params.workspaceContext)?.workspaceId,
              `Auto-created session for ${modeSlug}`
            );
            console.log(`Created new session ${sessionId} for workspace ${parseWorkspaceContext(params.workspaceContext)?.workspaceId}`);
          }
          
          // Add the session ID to the parameters
          params.workspaceContext.sessionId = sessionId;
        }
      } catch (error) {
        console.error('Failed to get/create session:', getErrorMessage(error));
      }
    }
    
    // Call the parent executeMode method
    return super.executeMode(modeSlug, params);
  }
}