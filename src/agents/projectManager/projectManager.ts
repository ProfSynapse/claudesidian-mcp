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

/**
 * Agent for managing projects and workspaces in the vault
 */
export class ProjectManagerAgent extends BaseAgent {
  /**
   * Create a new ProjectManagerAgent
   * @param app Obsidian app instance
   */
  constructor(app: App) {
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
}