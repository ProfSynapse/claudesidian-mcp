import { App, TFile } from 'obsidian';
import { 
  EditOperation, 
  EditOperationType, 
  ReplaceOperation, 
  InsertOperation, 
  DeleteOperation, 
  AppendOperation, 
  PrependOperation 
} from '../types';

/**
 * Utility class for edit operations
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
    
    const content = await app.vault.read(file);
    let newContent: string;
    
    switch (operation.type) {
      case EditOperationType.REPLACE:
        newContent = EditOperations.executeReplace(content, operation as ReplaceOperation);
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
  
  /**
   * Execute a replace operation
   * @param content Current content
   * @param operation Replace operation
   * @returns New content
   */
  private static executeReplace(content: string, operation: ReplaceOperation): string {
    const { search, replace, replaceAll } = operation;
    
    if (replaceAll) {
      return content.split(search).join(replace);
    } else {
      return content.replace(search, replace);
    }
  }
  
  /**
   * Execute an insert operation
   * @param content Current content
   * @param operation Insert operation
   * @returns New content
   */
  private static executeInsert(content: string, operation: InsertOperation): string {
    const { position, content: insertContent } = operation;
    const lines = content.split('\n');
    
    // Adjust for 1-based indexing
    const insertPosition = Math.max(0, Math.min(lines.length, position - 1));
    
    lines.splice(insertPosition, 0, insertContent);
    return lines.join('\n');
  }
  
  /**
   * Execute a delete operation
   * @param content Current content
   * @param operation Delete operation
   * @returns New content
   */
  private static executeDelete(content: string, operation: DeleteOperation): string {
    const { startPosition, endPosition } = operation;
    const lines = content.split('\n');
    
    // Adjust for 1-based indexing
    const start = Math.max(0, startPosition - 1);
    const end = Math.min(lines.length, endPosition);
    const deleteCount = end - start;
    
    lines.splice(start, deleteCount);
    return lines.join('\n');
  }
  
  /**
   * Execute an append operation
   * @param content Current content
   * @param operation Append operation
   * @returns New content
   */
  private static executeAppend(content: string, operation: AppendOperation): string {
    const { content: appendContent } = operation;
    return content + appendContent;
  }
  
  /**
   * Execute a prepend operation
   * @param content Current content
   * @param operation Prepend operation
   * @returns New content
   */
  private static executePrepend(content: string, operation: PrependOperation): string {
    const { content: prependContent } = operation;
    return prependContent + content;
  }
}