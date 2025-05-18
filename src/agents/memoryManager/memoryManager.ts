import { BaseAgent } from '../baseAgent';
import { MemoryManagerConfig } from './config';
import * as Modes from './modes';
import * as CollectionModes from './modes/collection';
import { parseWorkspaceContext } from '../../utils/contextUtils';
import { MemoryService } from '../../database/services/MemoryService';
import { WorkspaceService } from '../../database/services/WorkspaceService';

/**
 * Agent for managing workspace memory, sessions, state snapshots, and ChromaDB collections
 */
export class MemoryManagerAgent extends BaseAgent {
  /**
   * Memory service instance
   */
  private memoryService: MemoryService;

  /**
   * Workspace service instance
   */
  private workspaceService: WorkspaceService;

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
    
    // Get services
    this.memoryService = plugin.services.memoryService;
    this.workspaceService = plugin.services.workspaceService;
    
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
    
    // Register collection management modes (except query mode which is in VaultLibrarian)
    this.registerMode(new CollectionModes.CreateCollectionMode(this));
    this.registerMode(new CollectionModes.ListCollectionsMode(this));
    this.registerMode(new CollectionModes.GetCollectionMode(this));
    this.registerMode(new CollectionModes.DeleteCollectionMode(this));
    this.registerMode(new CollectionModes.CollectionAddItemsMode(this));
  }
  
  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    await super.initialize();
    // No additional initialization needed
  }
  
  /**
   * Get the memory service instance
   */
  getMemoryService(): MemoryService {
    return this.memoryService;
  }
  
  /**
   * Get the workspace service instance
   */
  getWorkspaceService(): WorkspaceService {
    return this.workspaceService;
  }
  
  /**
   * Execute a mode with automatic session context tracking
   * @param modeSlug The mode to execute
   * @param params Parameters for the mode
   * @returns Result from mode execution
   */
  async executeMode(modeSlug: string, params: any): Promise<any> {
    // Skip session handling for collection management modes
    const isCollectionMode = [
      'createCollection',
      'listCollections',
      'getCollection',
      'deleteCollection',
      'collectionAddItems'
    ].includes(modeSlug);
    
    // If not a collection mode and there's a workspace context but no session ID,
    // try to get or create a session
    if (!isCollectionMode && params.workspaceContext?.workspaceId && !params.workspaceContext.sessionId) {
      try {
        const workspaceId = parseWorkspaceContext(params.workspaceContext)?.workspaceId;
        if (workspaceId) {
          // Try to get an active session
          let sessionId = null;
          
          // Get the most recent active session for this workspace
          const activeSessions = await this.memoryService.getSessions(workspaceId, true);
          
          if (activeSessions && activeSessions.length > 0) {
            sessionId = activeSessions[0].id;
          }
          
          // If no active session, create one automatically for non-session modes
          // (for session creation, we don't want to create a session automatically)
          if (!sessionId && !modeSlug.startsWith('createSession')) {
            const newSession = await this.memoryService.createSession({
              workspaceId: workspaceId,
              name: `Auto-created session for ${modeSlug}`,
              isActive: true,
              toolCalls: 0,
              startTime: Date.now()
            });
            
            sessionId = newSession.id;
            console.log(`Created new session ${sessionId} for workspace ${workspaceId}`);
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