import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { NoteReaderConfig } from './config';
import {
  ReadNoteMode,
  BatchReadMode,
  ReadLineMode,
  ReadLineNumberedMode
} from './modes';

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
    
    // Register modes
    this.registerMode(new ReadNoteMode(app));
    this.registerMode(new BatchReadMode(app));
    this.registerMode(new ReadLineMode(app));
    this.registerMode(new ReadLineNumberedMode(app));
  }
}