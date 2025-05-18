import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { ProjectManagerConfig } from './config';
import { 
  ProjectPlanMode, 
  AskQuestionMode, 
  CheckpointMode, 
  CompletionMode,
  // Workspace management modes
  ListWorkspacesMode,
  CreateWorkspaceMode,
  EditWorkspaceMode,
  DeleteWorkspaceMode,
  LoadWorkspaceMode
} from './modes';
import { parseWorkspaceContext } from '../../utils/contextUtils';

/**
 * Agent for managing projects and workspaces in the vault
 */
export class ProjectManagerAgent extends BaseAgent {
  /**
   * Create a new ProjectManagerAgent
   * @param app Obsidian app instance
   */
  constructor(private app: App, public plugin?: any) {
    super(
      ProjectManagerConfig.name,
      ProjectManagerConfig.description,
      ProjectManagerConfig.version
    );
    
    // Register project modes
    this.registerMode(new ProjectPlanMode(app));
    this.registerMode(new AskQuestionMode(app));
    this.registerMode(new CheckpointMode(app));
    this.registerMode(new CompletionMode(app));
    
    // Register workspace management modes
    this.registerMode(new ListWorkspacesMode(app));
    this.registerMode(new CreateWorkspaceMode(app));
    this.registerMode(new EditWorkspaceMode(app));
    this.registerMode(new DeleteWorkspaceMode(app));
    this.registerMode(new LoadWorkspaceMode(app));
  }
  
  /**
   * Initialize the agent
   * Sets up workspace database connections
   */
  async initialize(): Promise<void> {
    await super.initialize();
    
    // Any additional initialization for workspace functionality will go here
    // For example, setting up database connections or loading active workspace
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
        console.error('Failed to get/create session:', error);
      }
    }
    
    // Call the parent executeMode method
    return super.executeMode(modeSlug, params);
  }
}