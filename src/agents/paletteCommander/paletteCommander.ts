import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { PaletteCommanderConfig } from './config';
import {
  ListCommandsMode,
  ExecuteCommandMode
} from './modes';

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
    
    // Register modes
    this.registerMode(new ListCommandsMode(app));
    this.registerMode(new ExecuteCommandMode(app));
  }
}