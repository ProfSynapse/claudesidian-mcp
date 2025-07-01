import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { MemoryManagerConfig } from './config';
import * as Modes from './modes';
import { parseWorkspaceContext } from '../../utils/contextUtils';
import { MemoryService } from '../../database/services/MemoryService';
import { WorkspaceService } from '../../database/services/WorkspaceService';
import { getErrorMessage } from '../../utils/errorUtils';
import { sanitizeVaultName } from '../../utils/vaultUtils';

/**
 * Agent for managing workspace memory, sessions, and state snapshots
 */
export class MemoryManagerAgent extends BaseAgent {
  /**
   * Memory service instance
   */
  private memoryService!: MemoryService;

  /**
   * Workspace service instance
   */
  private workspaceService!: WorkspaceService;
  
  /**
   * App instance
   */
  private app: App;

  /**
   * Vault name for multi-vault support
   */
  private vaultName: string;

  /**
   * Flag to prevent infinite recursion in description getter
   */
  private isGettingDescription = false;

  /**
   * Create a new MemoryManagerAgent
   * @param app Obsidian app instance
   * @param plugin Plugin instance for accessing shared services
   */
  constructor(app: App, public plugin?: any) {
    super(
      MemoryManagerConfig.name,
      MemoryManagerConfig.description,
      MemoryManagerConfig.version
    );
    
    this.app = app;
    this.vaultName = sanitizeVaultName(app.vault.getName());
    
    // Get services if plugin is defined
    if (plugin && plugin.services) {
      this.memoryService = plugin.services.memoryService;
      this.workspaceService = plugin.services.workspaceService;
    }
    
    // Register session modes
    this.registerMode(new Modes.CreateSessionMode(this));
    this.registerMode(new Modes.ListSessionsMode(this));
    this.registerMode(new Modes.EditSessionMode(this));
    this.registerMode(new Modes.DeleteSessionMode(this));
    this.registerMode(new Modes.LoadSessionMode(this));
    
    // Register state modes
    this.registerMode(new Modes.CreateStateMode(this));
    this.registerMode(new Modes.ListStatesMode(this));
    this.registerMode(new Modes.LoadStateMode(this));
    this.registerMode(new Modes.EditStateMode(this));
    this.registerMode(new Modes.DeleteStateMode(this));
    
    // Register workspace modes
    this.registerMode(new Modes.AddFilesToWorkspaceMode(this.app));
    this.registerMode(new Modes.CreateWorkspaceMode(this.app));
    this.registerMode(new Modes.DeleteWorkspaceMode(this.app));
    this.registerMode(new Modes.EditWorkspaceMode(this.app));
    this.registerMode(new Modes.ListWorkspacesMode(this.app));
    this.registerMode(new Modes.LoadWorkspaceMode(this.app));
    this.registerMode(new Modes.ManageAssociatedNotesMode(this.app));
  }

  /**
   * Dynamic description that includes current workspace information
   */
  get description(): string {
    const baseDescription = MemoryManagerConfig.description;
    
    // Prevent infinite recursion
    if (this.isGettingDescription) {
      return `[${this.vaultName}] ${baseDescription}`;
    }
    
    this.isGettingDescription = true;
    try {
      const workspaceContext = this.getWorkspacesSummary();
      return `[${this.vaultName}] ${baseDescription}\n\n${workspaceContext}`;
    } finally {
      this.isGettingDescription = false;
    }
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
   * Get the Obsidian app instance
   */
  getApp() {
    return this.app;
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
        const workspaceId = parseWorkspaceContext(params.workspaceContext)?.workspaceId;
        if (workspaceId) {
          // Try to get an active session
          let sessionId: string | null = null;
          
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
        console.error('Failed to get/create session:', getErrorMessage(error));
      }
    }
    
    // Call the parent executeMode method
    return super.executeMode(modeSlug, params);
  }

  /**
   * Get a summary of available workspaces
   * @returns Formatted string with workspace information
   * @private
   */
  private getWorkspacesSummary(): string {
    try {
      // Check if workspace service is available
      if (!this.workspaceService) {
        return `🏗️ Workspaces: Service not available (memory features may be disabled)`;
      }

      // Get workspaces synchronously by calling the service
      // Note: Since this is called in a getter, we need to handle async carefully
      // We'll attempt to get cached/immediate workspace data
      const workspacesPromise = this.workspaceService.getWorkspaces();
      
      // For now, return a placeholder that indicates workspaces are available
      // The actual workspace data will be shown when tools are used
      return `🏗️ Workspaces: Available (use listWorkspaces mode to see details)`;
      
    } catch (error) {
      return `🏗️ Workspaces: Error loading workspace information (${error})`;
    }
  }
}