import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { NoteEditorConfig } from './config';
import {
  ReplaceMode,
  InsertMode,
  DeleteMode,
  AppendMode,
  PrependMode,
  BatchMode
} from './modes';

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
    
    // Register modes
    this.registerMode(new ReplaceMode(app));
    this.registerMode(new InsertMode(app));
    this.registerMode(new DeleteMode(app));
    this.registerMode(new AppendMode(app));
    this.registerMode(new PrependMode(app));
    this.registerMode(new BatchMode(app));
  }
}