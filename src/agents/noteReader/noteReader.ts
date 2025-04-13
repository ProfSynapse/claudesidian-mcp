import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { NoteReaderConfig } from './config';
import { ReadNoteTool, BatchReadTool, ReadLineTool } from './tools';

/**
 * Agent for reading notes from the vault
 */
export class NoteReaderAgent extends BaseAgent {
  /**
   * Create a new NoteReaderAgent
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      NoteReaderConfig.name,
      NoteReaderConfig.description,
      NoteReaderConfig.version
    );
    
    // Register tools
    this.registerTool(new ReadNoteTool(app));
    this.registerTool(new BatchReadTool(app));
    this.registerTool(new ReadLineTool(app));
  }
}