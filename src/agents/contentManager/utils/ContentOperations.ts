import { App, Notice, TFile } from 'obsidian';

/**
 * Utility class for content operations
 */
export class ContentOperations {
  /**
   * Read the content of a note
   * @param app Obsidian app instance
   * @param filePath Path to the note
   * @returns Promise that resolves with the note content
   */
  static async readContent(app: App, filePath: string): Promise<string> {
    try {
      const file = app.vault.getAbstractFileByPath(filePath);
      
      if (!file) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      if (!(file instanceof TFile)) {
        throw new Error(`Not a file: ${filePath}`);
      }
      
      return await app.vault.read(file);
    } catch (error) {
      throw new Error(`Error reading file: ${error.message}`);
    }
  }
  
  /**
   * Read the content of a note with line numbers
   * @param app Obsidian app instance
   * @param filePath Path to the note
   * @returns Promise that resolves with the note content including line numbers
   */
  static async readContentWithLineNumbers(app: App, filePath: string): Promise<string> {
    try {
      const content = await this.readContent(app, filePath);
      const lines = content.split('\n');
      
      return lines.map((line, index) => `${index + 1}: ${line}`).join('\n');
    } catch (error) {
      throw new Error(`Error reading file with line numbers: ${error.message}`);
    }
  }
  
  /**
   * Read specific lines from a note
   * @param app Obsidian app instance
   * @param filePath Path to the note
   * @param startLine Start line (1-based)
   * @param endLine End line (1-based, inclusive)
   * @param includeLineNumbers Whether to include line numbers in output
   * @returns Promise that resolves with the specified lines
   */
  static async readLines(
    app: App, 
    filePath: string, 
    startLine: number, 
    endLine: number,
    includeLineNumbers = false
  ): Promise<string[]> {
    try {
      const content = await this.readContent(app, filePath);
      const lines = content.split('\n');
      
      // Adjust for 1-based line numbers
      startLine = Math.max(1, startLine);
      endLine = Math.min(lines.length, endLine);
      
      if (startLine > endLine) {
        throw new Error('Start line cannot be greater than end line');
      }
      
      const selectedLines = lines.slice(startLine - 1, endLine);
      
      if (includeLineNumbers) {
        return selectedLines.map((line, index) => `${startLine + index}: ${line}`);
      }
      
      return selectedLines;
    } catch (error) {
      throw new Error(`Error reading lines: ${error.message}`);
    }
  }
  
  /**
   * Create a new file with content
   * @param app Obsidian app instance
   * @param filePath Path to the new file
   * @param content Content for the new file
   * @returns Promise that resolves with the created file
   */
  static async createContent(app: App, filePath: string, content: string): Promise<TFile> {
    try {
      const file = app.vault.getAbstractFileByPath(filePath);
      
      if (file) {
        throw new Error(`File already exists: ${filePath}`);
      }
      
      // Ensure parent folders exist
      const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
      if (folderPath) {
        await app.vault.createFolder(folderPath).catch(() => {
          // Folder might already exist, ignore error
        });
      }
      
      return await app.vault.create(filePath, content);
    } catch (error) {
      throw new Error(`Error creating file: ${error.message}`);
    }
  }
  
  /**
   * Append content to a file
   * @param app Obsidian app instance
   * @param filePath Path to the file
   * @param content Content to append
   * @returns Promise that resolves when the content is appended
   */
  static async appendContent(app: App, filePath: string, content: string): Promise<{
    appendedLength: number;
    totalLength: number;
  }> {
    try {
      const file = app.vault.getAbstractFileByPath(filePath);
      
      if (!file) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      if (!(file instanceof TFile)) {
        throw new Error(`Not a file: ${filePath}`);
      }
      
      const existingContent = await app.vault.read(file);
      const newContent = existingContent + content;
      
      await app.vault.modify(file, newContent);
      
      return {
        appendedLength: content.length,
        totalLength: newContent.length
      };
    } catch (error) {
      throw new Error(`Error appending to file: ${error.message}`);
    }
  }
  
  /**
   * Prepend content to a file
   * @param app Obsidian app instance
   * @param filePath Path to the file
   * @param content Content to prepend
   * @returns Promise that resolves when the content is prepended
   */
  static async prependContent(app: App, filePath: string, content: string): Promise<{
    prependedLength: number;
    totalLength: number;
  }> {
    try {
      const file = app.vault.getAbstractFileByPath(filePath);
      
      if (!file) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      if (!(file instanceof TFile)) {
        throw new Error(`Not a file: ${filePath}`);
      }
      
      const existingContent = await app.vault.read(file);
      const newContent = content + existingContent;
      
      await app.vault.modify(file, newContent);
      
      return {
        prependedLength: content.length,
        totalLength: newContent.length
      };
    } catch (error) {
      throw new Error(`Error prepending to file: ${error.message}`);
    }
  }
  
  /**
   * Replace content in a file
   * @param app Obsidian app instance
   * @param filePath Path to the file
   * @param oldContent Content to replace
   * @param newContent Content to replace with
   * @returns Promise that resolves with the number of replacements made
   */
  static async replaceContent(
    app: App,
    filePath: string,
    oldContent: string,
    newContent: string
  ): Promise<number> {
    try {
      const file = app.vault.getAbstractFileByPath(filePath);
      
      if (!file) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      if (!(file instanceof TFile)) {
        throw new Error(`Not a file: ${filePath}`);
      }
      
      const existingContent = await app.vault.read(file);
      
      // Count replacements
      const regex = new RegExp(this.escapeRegExp(oldContent), 'g');
      const count = (existingContent.match(regex) || []).length;
      
      if (count === 0) {
        throw new Error('Content to replace not found in file');
      }
      
      // Perform replacement
      const modifiedContent = existingContent.replace(regex, newContent);
      
      await app.vault.modify(file, modifiedContent);
      
      return count;
    } catch (error) {
      throw new Error(`Error replacing content: ${error.message}`);
    }
  }
  
  /**
   * Replace specific lines in a file
   * @param app Obsidian app instance
   * @param filePath Path to the file
   * @param startLine Start line (1-based)
   * @param endLine End line (1-based, inclusive)
   * @param newContent Content to replace with
   * @returns Promise that resolves with the number of lines replaced
   */
  static async replaceByLine(
    app: App,
    filePath: string,
    startLine: number,
    endLine: number,
    newContent: string
  ): Promise<number> {
    try {
      const file = app.vault.getAbstractFileByPath(filePath);
      
      if (!file) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      if (!(file instanceof TFile)) {
        throw new Error(`Not a file: ${filePath}`);
      }
      
      const existingContent = await app.vault.read(file);
      const lines = existingContent.split('\n');
      
      // Adjust for 1-based line numbers
      startLine = Math.max(1, startLine);
      endLine = Math.min(lines.length, endLine);
      
      if (startLine > endLine) {
        throw new Error('Start line cannot be greater than end line');
      }
      
      const linesReplaced = endLine - startLine + 1;
      
      // Replace lines
      const beforeLines = lines.slice(0, startLine - 1);
      const afterLines = lines.slice(endLine);
      
      const newLines = newContent.split('\n');
      
      const modifiedContent = [
        ...beforeLines,
        ...newLines,
        ...afterLines
      ].join('\n');
      
      await app.vault.modify(file, modifiedContent);
      
      return linesReplaced;
    } catch (error) {
      throw new Error(`Error replacing lines: ${error.message}`);
    }
  }
  
  /**
   * Delete content from a file
   * @param app Obsidian app instance
   * @param filePath Path to the file
   * @param content Content to delete
   * @returns Promise that resolves with the number of deletions made
   */
  static async deleteContent(
    app: App,
    filePath: string,
    content: string
  ): Promise<number> {
    try {
      const file = app.vault.getAbstractFileByPath(filePath);
      
      if (!file) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      if (!(file instanceof TFile)) {
        throw new Error(`Not a file: ${filePath}`);
      }
      
      const existingContent = await app.vault.read(file);
      
      // Count deletions
      const regex = new RegExp(this.escapeRegExp(content), 'g');
      const count = (existingContent.match(regex) || []).length;
      
      if (count === 0) {
        throw new Error('Content to delete not found in file');
      }
      
      // Perform deletion
      const modifiedContent = existingContent.replace(regex, '');
      
      await app.vault.modify(file, modifiedContent);
      
      return count;
    } catch (error) {
      throw new Error(`Error deleting content: ${error.message}`);
    }
  }
  
  /**
   * Escape special characters in a string for use in a regular expression
   * @param string String to escape
   * @returns Escaped string
   */
  private static escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}