import { App, TFile } from 'obsidian';

/**
 * Utility class for reading operations
 */
export class ReadOperations {
  /**
   * Read the content of a note
   * @param app Obsidian app instance
   * @param path Path to the note
   * @returns Promise that resolves with the note content
   * @throws Error if the note doesn't exist or can't be read
   */
  static async readNote(app: App, path: string): Promise<string> {
    const file = app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`);
    }
    
    return await app.vault.read(file);
  }
  
  /**
   * Read multiple notes at once
   * @param app Obsidian app instance
   * @param paths Paths to the notes
   * @returns Promise that resolves with a map of note paths to contents
   */
  static async batchRead(app: App, paths: string[]): Promise<{
    notes: Record<string, string>;
    errors?: Record<string, string>;
  }> {
    const notes: Record<string, string> = {};
    const errors: Record<string, string> = {};
    
    // Validate paths array
    if (!Array.isArray(paths)) {
      throw new Error('Invalid paths parameter: must be an array');
    }
    
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      
      // Skip invalid paths
      if (typeof path !== 'string') {
        errors[`index_${i}`] = `Invalid path at index ${i}: path must be a string`;
        continue;
      }
      
      if (!path.trim()) {
        errors[`index_${i}`] = `Invalid path at index ${i}: path cannot be empty`;
        continue;
      }
      
      try {
        notes[path] = await ReadOperations.readNote(app, path);
      } catch (error) {
        console.error(`ReadOperations: Error reading file at path ${path}:`, error);
        errors[path] = error.message || `Failed to read file at path: ${path}`;
      }
    }
    
    return { notes, errors: Object.keys(errors).length > 0 ? errors : undefined };
  }
  
  /**
   * Read specific lines from a note
   * @param app Obsidian app instance
   * @param path Path to the note
   * @param startLine Start line (1-based)
   * @param endLine End line (1-based, inclusive)
   * @returns Promise that resolves with the specified lines
   * @throws Error if the note doesn't exist or can't be read
   */
  static async readLines(app: App, path: string, startLine: number, endLine: number): Promise<string[]> {
    const content = await ReadOperations.readNote(app, path);
    
    // Normalize line endings to \n and split
    const normalizedContent = content.replace(/\r\n/g, '\n');
    const lines = normalizedContent.split('\n');
    
    // Validate line numbers
    if (startLine < 1) {
      throw new Error(`Invalid start line: ${startLine}. Line numbers are 1-based.`);
    }
    
    if (endLine < startLine) {
      throw new Error(`Invalid end line: ${endLine}. End line must be greater than or equal to start line ${startLine}.`);
    }
    
    // Adjust for 1-based indexing
    const start = Math.max(0, startLine - 1);
    const end = Math.min(lines.length, endLine);
    
    return lines.slice(start, end);
  }
}