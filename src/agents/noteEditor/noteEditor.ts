import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { NoteEditorConfig } from './config';
import { SingleEditTool, BatchEditTool } from './tools';

/**
 * Agent for editing notes in the vault
 */
export class NoteEditorAgent extends BaseAgent {
  /**
   * Create a new NoteEditorAgent
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      NoteEditorConfig.name,
      NoteEditorConfig.description,
      NoteEditorConfig.version
    );
    
    // Register tools
    this.registerTool(new SingleEditTool(app));
    this.registerTool(new BatchEditTool(app));
  }
}