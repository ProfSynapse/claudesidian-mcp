import { BaseAgent } from '../baseAgent';
import { MemoryManagerConfig } from './config';
import * as Modes from './modes';
import { parseWorkspaceContext } from '../../utils/contextUtils';

/**
 * Agent for managing workspace memory, sessions, and state snapshots
 */
export class MemoryManagerAgent extends BaseAgent {
  /**
   * Create a new MemoryManagerAgent
   * @param plugin Plugin instance for accessing shared services
   */
  constructor(public plugin?: any) {
    super(
      MemoryManagerConfig.name,
      MemoryManagerConfig.description,
      MemoryManagerConfig.version
    );
    
    // Register session modes
    this.registerMode(new Modes.CreateSessionMode(this));
    this.registerMode(new Modes.ListSessionsMode(this));
    this.registerMode(new Modes.EditSessionMode(this));
    this.registerMode(new Modes.DeleteSessionMode(this));
    
    // Register state modes
    this.registerMode(new Modes.CreateStateMode(this));
    this.registerMode(new Modes.ListStatesMode(this));
    this.registerMode(new Modes.LoadStateMode(this));
    this.registerMode(new Modes.EditStateMode(this));
    this.registerMode(new Modes.DeleteStateMode(this));
  }
  
  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    await super.initialize();
    
    // Initialize the workspace database
    const workspaceDb = this.getWorkspaceDb();
    if (workspaceDb && typeof workspaceDb.initialize === 'function') {
      await workspaceDb.initialize();
    }
    
    // Initialize the activity embedder
    const activityEmbedder = this.getActivityEmbedder();
    if (activityEmbedder && typeof activityEmbedder.initialize === 'function') {
      await activityEmbedder.initialize();
    }
  }
  
  /**
   * Get the activity embedder instance
   */
  getActivityEmbedder() {
    return this.plugin?.getActivityEmbedder();
  }
  
  /**
   * Get the workspace database instance
   */
  getWorkspaceDb() {
    return this.plugin?.workspaceDb;
  }
  
  /**
   * Execute a mode with automatic session context tracking
   * @param modeSlug The mode to execute
   * @param params Parameters for the mode
   * @returns Result from mode execution
   */
  async executeMode(modeSlug: string, params: any): Promise<any> {
    // If there's a workspace context but no session ID, try to get or create a session
    if (params.workspaceContext?.workspaceId && !params.workspaceContext.sessionId) {
      try {
        // Get the activity embedder
        const activityEmbedder = this.getActivityEmbedder();
        if (activityEmbedder) {
          // Try to get an active session ID
          let sessionId = activityEmbedder.getActiveSession(parseWorkspaceContext(params.workspaceContext)?.workspaceId);
          
          // If no active session, create one automatically for non-session modes
          // (for session creation, we don't want to create a session automatically)
          if (!sessionId && !modeSlug.startsWith('createSession')) {
            sessionId = await activityEmbedder.createSession(
              parseWorkspaceContext(params.workspaceContext)?.workspaceId,
              `Auto-created session for ${modeSlug}`
            );
            console.log(`Created new session ${sessionId} for workspace ${parseWorkspaceContext(params.workspaceContext)?.workspaceId}`);
          }
          
          if (sessionId) {
            // Add the session ID to the parameters
            params.workspaceContext.sessionId = sessionId;
          }
        }
      } catch (error) {
        console.error('Failed to get/create session:', error);
      }
    }
    
    // Call the parent executeMode method
    return super.executeMode(modeSlug, params);
  }
}