import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { ProjectManagerConfig } from './config';
import { ProjectPlanMode, AskQuestionMode, CheckpointMode } from './modes';

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
    
    // Register modes
    this.registerMode(new ProjectPlanMode(app));
    this.registerMode(new AskQuestionMode(app));
    this.registerMode(new CheckpointMode(app));
  }
}