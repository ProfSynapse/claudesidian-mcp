import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { PaletteCommanderConfig } from './config';
import { ListCommandsTool, ExecuteCommandTool } from './tools';

/**
 * Agent for executing commands from the command palette
 */
export class PaletteCommanderAgent extends BaseAgent {
  /**
   * Create a new PaletteCommanderAgent
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      PaletteCommanderConfig.name,
      PaletteCommanderConfig.description,
      PaletteCommanderConfig.version
    );
    
    // Register tools
    this.registerTool(new ListCommandsTool(app));
    this.registerTool(new ExecuteCommandTool(app));
  }
}