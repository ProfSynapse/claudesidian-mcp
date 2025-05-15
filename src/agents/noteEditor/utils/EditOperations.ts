import { App, TFile, Editor, MarkdownView, EditorPosition } from 'obsidian';
import {
  EditOperation,
  EditOperationType,
  ReplaceOperation,
  ReplaceLineOperation,
  InsertOperation,
  DeleteOperation,
  AppendOperation,
  PrependOperation
} from '../types';

/**
 * Utility class for edit operations that directly leverages Obsidian's API
 * for performing edits on documents. This class provides methods for executing
 * various types of edit operations (replace, insert, delete, append, prepend)
 * using Obsidian's Editor API when available, with fallbacks for when the editor
 * is not available.
 */
export class EditOperations {
  /**
   * Execute an edit operation
   * @param app Obsidian app instance
   * @param operation Edit operation
   * @returns Promise that resolves when the operation is complete
   * @throws Error if the operation fails
   */
  static async executeOperation(app: App, operation: EditOperation): Promise<void> {
    const file = app.vault.getAbstractFileByPath(operation.path);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${operation.path}`);
    }
    
    // Try to get the active editor for this file
    const editor = EditOperations.getEditorForFile(app, file);
    
    if (editor) {
      // If we have an editor, use direct editing operations
      switch (operation.type) {
        case EditOperationType.REPLACE:
          EditOperations.executeReplaceWithEditor(editor, operation as ReplaceOperation);
          break;
        case EditOperationType.REPLACE_LINE:
          EditOperations.executeReplaceLineWithEditor(editor, operation as ReplaceLineOperation);
          break;
        case EditOperationType.INSERT:
          EditOperations.executeInsertWithEditor(editor, operation as InsertOperation);
          break;
        case EditOperationType.DELETE:
          EditOperations.executeDeleteWithEditor(editor, operation as DeleteOperation);
          break;
        case EditOperationType.APPEND:
          EditOperations.executeAppendWithEditor(editor, operation as AppendOperation);
          break;
        case EditOperationType.PREPEND:
          EditOperations.executePrependWithEditor(editor, operation as PrependOperation);
          break;
        default:
          throw new Error(`Unknown operation type: ${(operation as any).type}`);
      }
    } else {
      // Fallback to string manipulation if no editor is available
      const content = await app.vault.read(file);
      let newContent: string;
      
      switch (operation.type) {
        case EditOperationType.REPLACE:
          newContent = EditOperations.executeReplace(content, operation as ReplaceOperation);
          break;
        case EditOperationType.REPLACE_LINE:
          newContent = EditOperations.executeReplaceLine(content, operation as ReplaceLineOperation);
          break;
        case EditOperationType.INSERT:
          newContent = EditOperations.executeInsert(content, operation as InsertOperation);
          break;
        case EditOperationType.DELETE:
          newContent = EditOperations.executeDelete(content, operation as DeleteOperation);
          break;
        case EditOperationType.APPEND:
          newContent = EditOperations.executeAppend(content, operation as AppendOperation);
          break;
        case EditOperationType.PREPEND:
          newContent = EditOperations.executePrepend(content, operation as PrependOperation);
          break;
        default:
          throw new Error(`Unknown operation type: ${(operation as any).type}`);
      }
      
      await app.vault.modify(file, newContent);
    }
  }
  
  /**
   * Get the editor instance for a file if it's open
   * @param app Obsidian app instance
   * @param file File to get editor for
   * @returns Editor instance or null if not available
   */
  private static getEditorForFile(app: App, file: TFile): Editor | null {
    const leaves = app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file && view.file.path === file.path) {
        return view.editor;
      }
    }
    return null;
  }
  
  /**
   * Convert a 1-based line number to an EditorPosition at the start of the line
   * @param editor Editor instance
   * @param line Line number (1-based)
   * @returns EditorPosition at the start of the line
   */
  private static lineToPos(editor: Editor, line: number): EditorPosition {
    // Adjust for 1-based indexing
    const adjustedLine = Math.max(0, line - 1);
    // Ensure the line exists in the document
    const lineCount = editor.lineCount();
    const validLine = Math.min(adjustedLine, lineCount - 1);
    
    return {
      line: validLine,
      ch: 0
    };
  }
  
  /**
   * Get the EditorPosition at the end of a line
   * @param editor Editor instance
   * @param line Line number (1-based)
   * @returns EditorPosition at the end of the line
   */
  private static lineEndPos(editor: Editor, line: number): EditorPosition {
    // Adjust for 1-based indexing
    const adjustedLine = Math.max(0, line - 1);
    // Ensure the line exists in the document
    const lineCount = editor.lineCount();
    const validLine = Math.min(adjustedLine, lineCount - 1);
    
    const lineContent = editor.getLine(validLine) || '';
    
    return {
      line: validLine,
      ch: lineContent.length
    };
  }
  
  /**
   * Find the EditorPosition for a specific text in the document
   * @param editor Editor instance
   * @param text Text to find
   * @param startPos Starting position for the search (optional)
   * @returns Object containing start and end positions, or null if not found
   */
  private static findTextPosition(
    editor: Editor,
    text: string,
    startPos?: EditorPosition
  ): { from: EditorPosition; to: EditorPosition } | null {
    const content = editor.getValue();
    const startIndex = startPos ? editor.posToOffset(startPos) : 0;
    
    // Find the text in the content
    const searchIndex = content.indexOf(text, startIndex);
    if (searchIndex === -1) {
      return null;
    }
    
    // Convert the index to a position
    const from = editor.offsetToPos(searchIndex);
    const to = editor.offsetToPos(searchIndex + text.length);
    
    return { from, to };
  }
  
  /**
   * Execute a replace operation using the editor
   * @param editor Editor instance
   * @param operation Replace operation
   * @throws Error if the text to replace is not found
   */
  private static executeReplaceWithEditor(editor: Editor, operation: ReplaceOperation): void {
    const { search, replace, replaceAll } = operation;
    const content = editor.getValue();
    
    // Check if the search text exists in the content
    if (content.indexOf(search) === -1) {
      throw new Error(`Text "${search}" not found in note`);
    }
    
    if (replaceAll) {
      // Use a more efficient approach for replacing all occurrences
      // Get the current content
      const currentContent = editor.getValue();
      
      // Escape special regex characters in the search string
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Create a regex with the global flag to replace all occurrences
      const regex = new RegExp(escapedSearch, 'g');
      
      // Perform the replacement
      const newContent = currentContent.replace(regex, replace);
      
      // Update the editor content
      const from = { line: 0, ch: 0 };
      const to = editor.offsetToPos(currentContent.length);
      editor.replaceRange(newContent, from, to);
    } else {
      // For single replace, find the first occurrence
      const textPosition = EditOperations.findTextPosition(editor, search);
      
      if (textPosition) {
        // Replace the text
        editor.replaceRange(replace, textPosition.from, textPosition.to);
      } else {
        throw new Error(`Text "${search}" not found in note`);
      }
    }
  }
  
  /**
   * Execute a replace line operation using the editor
   * @param editor Editor instance
   * @param operation Replace line operation
   * @throws Error if the line to replace is out of bounds
   */
  private static executeReplaceLineWithEditor(editor: Editor, operation: ReplaceLineOperation): void {
    const { lineNumber, newContent } = operation;
    
    // Validate line number
    if (lineNumber < 1) {
      throw new Error(`Invalid line number: ${lineNumber}. Line numbers are 1-based.`);
    }
    
    // Get document line count
    const lineCount = editor.lineCount();
    
    // Ensure the line exists in the document
    if (lineNumber > lineCount) {
      throw new Error(`Invalid line number: ${lineNumber}. Document has only ${lineCount} lines.`);
    }
    
    // Adjust for 0-based indexing
    const adjustedLine = lineNumber - 1;
    
    // Get positions for the start and end of the line
    const from = { line: adjustedLine, ch: 0 };
    const to = { line: adjustedLine, ch: editor.getLine(adjustedLine).length };
    
    // Replace the line
    editor.replaceRange(newContent, from, to);
  }
  
  /**
   * Execute an insert operation using the editor
   * @param editor Editor instance
   * @param operation Insert operation
   * @throws Error if the position is invalid
   */
  private static executeInsertWithEditor(editor: Editor, operation: InsertOperation): void {
    const { position, content: insertContent } = operation;
    
    // Validate position
    if (position < 1) {
      throw new Error(`Invalid position: ${position}. Position must be at least 1 (1-based indexing).`);
    }
    
    // Adjust for 1-based indexing
    const adjustedLine = position - 1;
    
    // Get the document line count
    const lineCount = editor.lineCount();
    
    // Allow insertion at one past the end of the document (to append a new line)
    if (adjustedLine > lineCount) {
      throw new Error(`Invalid position: ${position}. Document has only ${lineCount} lines. Valid positions are 1-${lineCount + 1}.`);
    }
    
    // Handle special case: inserting at one past the end of the document
    if (adjustedLine === lineCount) {
      // Get the position at the end of the last line
      const lastLineContent = editor.getLine(lineCount - 1) || '';
      const endPos = { line: lineCount - 1, ch: lastLineContent.length };
      
      // Insert with a newline prefix
      editor.replaceRange('\n' + insertContent, endPos, endPos);
    } else {
      // Normal case: insert at the beginning of the specified line
      const pos = { line: adjustedLine, ch: 0 };
      editor.replaceRange(insertContent, pos, pos);
    }
  }
  
  /**
   * Execute a delete operation using the editor
   * @param editor Editor instance
   * @param operation Delete operation
   * @throws Error if the positions are invalid
   */
  private static executeDeleteWithEditor(editor: Editor, operation: DeleteOperation): void {
    const { startPosition, endPosition } = operation;
    
    // Validate positions
    if (startPosition < 1) {
      throw new Error(`Invalid start position: ${startPosition}. Position must be at least 1.`);
    }
    
    if (endPosition < startPosition) {
      throw new Error(`Invalid end position: ${endPosition}. End position must be greater than or equal to start position ${startPosition}.`);
    }
    
    // Adjust for 1-based indexing
    const adjustedStartLine = startPosition - 1;
    const adjustedEndLine = endPosition - 1;
    
    // Ensure the lines exist in the document
    const lineCount = editor.lineCount();
    if (adjustedStartLine >= lineCount) {
      throw new Error(`Invalid start position: ${startPosition}. Document has only ${lineCount} lines.`);
    }
    
    // Get the positions for the range to delete
    const startPos = { line: adjustedStartLine, ch: 0 };
    
    // If end position is the last line, use its end; otherwise include the newline by going to start of next line
    let endPos;
    if (adjustedEndLine >= lineCount - 1) {
      // Last line - use end of line
      const lastLineContent = editor.getLine(lineCount - 1) || '';
      endPos = { line: lineCount - 1, ch: lastLineContent.length };
    } else {
      // Not last line - include the newline by going to start of next line
      endPos = { line: adjustedEndLine + 1, ch: 0 };
    }
    
    // Delete the content in the range
    editor.replaceRange('', startPos, endPos);
  }
  
  /**
   * Execute an append operation using the editor
   * @param editor Editor instance
   * @param operation Append operation
   */
  private static executeAppendWithEditor(editor: Editor, operation: AppendOperation): void {
    const { content: appendContent } = operation;
    
    // Get the position at the end of the document
    const lastLine = editor.lineCount() - 1;
    const lastLineLength = editor.getLine(lastLine).length;
    const endPos = { line: lastLine, ch: lastLineLength };
    
    // Append the content
    editor.replaceRange(appendContent, endPos, endPos);
  }
  
  /**
   * Execute a prepend operation using the editor
   * @param editor Editor instance
   * @param operation Prepend operation
   */
  private static executePrependWithEditor(editor: Editor, operation: PrependOperation): void {
    const { content: prependContent } = operation;
    
    // Get the position at the beginning of the document
    const startPos = { line: 0, ch: 0 };
    
    // Prepend the content
    editor.replaceRange(prependContent, startPos, startPos);
  }
  
  /**
   * Execute a replace operation (fallback implementation)
   * @param content Current content
   * @param operation Replace operation
   * @returns New content
   * @throws Error if the text to replace is not found
   */
  private static executeReplace(content: string, operation: ReplaceOperation): string {
    const { search, replace, replaceAll } = operation;
    
    // Check if the search text exists in the content
    if (content.indexOf(search) === -1) {
      throw new Error(`Text "${search}" not found in note`);
    }
    
    if (replaceAll) {
      // Escape special regex characters in the search string
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Create a regex with the global flag to replace all occurrences
      const regex = new RegExp(escapedSearch, 'g');
      
      // Perform the replacement
      return content.replace(regex, replace);
    } else {
      // For single replace, find the first occurrence and replace it
      const index = content.indexOf(search);
      return content.substring(0, index) + replace + content.substring(index + search.length);
    }
  }
  
  /**
   * Execute a replace line operation (fallback implementation)
   * @param content Current content
   * @param operation Replace line operation
   * @returns New content
   * @throws Error if the line to replace is out of bounds
   */
  private static executeReplaceLine(content: string, operation: ReplaceLineOperation): string {
    const { lineNumber, newContent } = operation;
    
    // Normalize line endings to \n
    const normalizedContent = content.replace(/\r\n/g, '\n');
    const lines = normalizedContent.split('\n');
    
    // Validate line number
    if (lineNumber < 1) {
      throw new Error(`Invalid line number: ${lineNumber}. Line numbers are 1-based.`);
    }
    
    // Ensure the line exists in the document
    if (lineNumber > lines.length) {
      throw new Error(`Invalid line number: ${lineNumber}. Document has only ${lines.length} lines.`);
    }
    
    // Adjust for 0-based indexing
    const adjustedLine = lineNumber - 1;
    
    // Replace the line
    lines[adjustedLine] = newContent;
    
    return lines.join('\n');
  }
  
  /**
   * Execute an insert operation (fallback implementation)
   * @param content Current content
   * @param operation Insert operation
   * @returns New content
   * @throws Error if the position is invalid
   */
  private static executeInsert(content: string, operation: InsertOperation): string {
    const { position, content: insertContent } = operation;
    
    // Normalize line endings to \n
    const normalizedContent = content.replace(/\r\n/g, '\n');
    const lines = normalizedContent.split('\n');
    
    // Validate position
    if (position < 1) {
      throw new Error(`Invalid position: ${position}. Position must be at least 1 (1-based indexing).`);
    }
    
    // Adjust for 1-based indexing
    const insertPosition = position - 1;
    
    // Allow insertion at one past the end of the document (to append a new line)
    if (insertPosition > lines.length) {
      throw new Error(`Invalid position: ${position}. Document has only ${lines.length} lines. Valid positions are 1-${lines.length + 1}.`);
    }
    
    // Handle special case: inserting at one past the end of the document
    if (insertPosition === lines.length) {
      // Add a new line at the end
      lines.push(insertContent);
    } else {
      // Normal case: insert at the beginning of the specified line
      lines[insertPosition] = insertContent + lines[insertPosition];
    }
    
    return lines.join('\n');
  }
  
  /**
   * Execute a delete operation (fallback implementation)
   * @param content Current content
   * @param operation Delete operation
   * @returns New content
   * @throws Error if the positions are invalid
   */
  private static executeDelete(content: string, operation: DeleteOperation): string {
    const { startPosition, endPosition } = operation;
    const lines = content.split('\n');
    
    // Validate positions
    if (startPosition < 1) {
      throw new Error(`Invalid start position: ${startPosition}. Position must be at least 1.`);
    }
    
    if (endPosition < startPosition) {
      throw new Error(`Invalid end position: ${endPosition}. End position must be greater than or equal to start position ${startPosition}.`);
    }
    
    // Adjust for 1-based indexing
    const start = startPosition - 1;
    const end = endPosition - 1;
    
    // Ensure the positions are valid
    if (start >= lines.length) {
      throw new Error(`Invalid start position: ${startPosition}. Document has only ${lines.length} lines.`);
    }
    
    // Calculate how many lines to remove (end - start + 1)
    // If end is beyond document length, adjust accordingly
    const linesToRemove = Math.min(end - start + 1, lines.length - start);
    
    // Remove the lines in the range
    lines.splice(start, linesToRemove);
    
    return lines.join('\n');
  }
  
  /**
   * Execute an append operation (fallback implementation)
   * @param content Current content
   * @param operation Append operation
   * @returns New content
   */
  private static executeAppend(content: string, operation: AppendOperation): string {
    const { content: appendContent } = operation;
    
    // Ensure there's a newline between content and appended content if needed
    const needsNewline = content.length > 0 && !content.endsWith('\n') && !appendContent.startsWith('\n');
    const separator = needsNewline ? '\n' : '';
    
    return content + separator + appendContent;
  }
  
  /**
   * Execute a prepend operation (fallback implementation)
   * @param content Current content
   * @param operation Prepend operation
   * @returns New content
   */
  private static executePrepend(content: string, operation: PrependOperation): string {
    const { content: prependContent } = operation;
    
    // Ensure there's a newline between prepended content and content if needed
    const needsNewline = content.length > 0 && !prependContent.endsWith('\n') && !content.startsWith('\n');
    const separator = needsNewline ? '\n' : '';
    
    return prependContent + separator + content;
  }
}