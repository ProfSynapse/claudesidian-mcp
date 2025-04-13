import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { ProjectManagerConfig } from './config';
import { ProjectPlanTool, AskQuestionTool, CheckpointTool } from './tools';

/**
 * Agent for managing projects in the vault
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
    
    // Register tools
    this.registerTool(new ProjectPlanTool(app));
    this.registerTool(new AskQuestionTool(app));
    this.registerTool(new CheckpointTool(app));
  }
}