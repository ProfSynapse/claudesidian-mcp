import { App, TFile } from 'obsidian';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { TemporaryEditor } from './TemporaryEditor';
import { EditorPosition } from './EditorInterfaces';

/**
 * Operation types for text manipulation
 */
export enum TextOperationType {
    InsertAtHeading = 'insertAtHeading',
    InsertAtPosition = 'insertAtPosition',
    ReplaceText = 'replaceText',
    ReplaceAllText = 'replaceAllText',
    AppendToFile = 'appendToFile',
    PrependToFile = 'prependToFile'
}

/**
 * Base interface for all text operations
 */
interface BaseTextOperation {
    type: TextOperationType;
}

/**
 * Operation to insert content under a specific heading
 */
export interface InsertAtHeadingOperation extends BaseTextOperation {
    type: TextOperationType.InsertAtHeading;
    heading: string;
    content: string;
}

/**
 * Operation to insert content at a specific position
 */
export interface InsertAtPositionOperation extends BaseTextOperation {
    type: TextOperationType.InsertAtPosition;
    position: EditorPosition;
    content: string;
}

/**
 * Operation to replace text in the note
 */
export interface ReplaceTextOperation extends BaseTextOperation {
    type: TextOperationType.ReplaceText;
    search: string;
    replace: string;
}

/**
 * Operation to replace all occurrences of text in the note
 */
export interface ReplaceAllTextOperation extends BaseTextOperation {
    type: TextOperationType.ReplaceAllText;
    search: string;
    replace: string;
}

/**
 * Operation to append content to the end of the file
 */
export interface AppendToFileOperation extends BaseTextOperation {
    type: TextOperationType.AppendToFile;
    content: string;
}

/**
 * Operation to prepend content to the beginning of the file
 */
export interface PrependToFileOperation extends BaseTextOperation {
    type: TextOperationType.PrependToFile;
    content: string;
}

/**
 * Union type for all text operations
 */
export type TextOperation = 
    | InsertAtHeadingOperation
    | InsertAtPositionOperation
    | ReplaceTextOperation
    | ReplaceAllTextOperation
    | AppendToFileOperation
    | PrependToFileOperation;

/**
 * Result of text operations
 */
export interface TextOperationResult {
    oldContent: string;
    newContent: string;
    operationsApplied: number;
}

/**
 * Processes text operations using Obsidian's APIs
 */
export class TextOperationProcessor {
    /**
     * Creates a new TextOperationProcessor
     * @param app Obsidian app
     */
    constructor(private app: App) {}
    
    /**
     * Processes operations on a note
     * @param path Path to the note
     * @param operations Operations to execute
     * @returns Result with old and new content
     */
    async processOperations(path: string, operations: TextOperation[]): Promise<TextOperationResult> {
        // Get the file
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file || !(file instanceof TFile)) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `File not found: ${path}`
            );
        }
        
        // Read the original content
        const oldContent = await this.app.vault.read(file);
        let newContent = oldContent;
        let operationsApplied = 0;
        
        // Create a temporary editor for position calculations
        const tempEditor = new TemporaryEditor(newContent);
        
        // Process each operation
        for (let i = 0; i < operations.length; i++) {
            const operation = operations[i];
            try {
                console.debug(`TextOperationProcessor: Processing operation ${i+1}/${operations.length} of type ${operation.type}`);
                
                switch (operation.type) {
                    case TextOperationType.InsertAtHeading:
                        newContent = await this.insertAtHeading(tempEditor, newContent, operation.heading, operation.content);
                        break;
                    case TextOperationType.InsertAtPosition:
                        newContent = await this.insertAtPosition(tempEditor, newContent, operation.position, operation.content);
                        break;
                    case TextOperationType.ReplaceText:
                        newContent = await this.replaceText(tempEditor, newContent, operation.search, operation.replace, false);
                        break;
                    case TextOperationType.ReplaceAllText:
                        newContent = await this.replaceText(tempEditor, newContent, operation.search, operation.replace, true);
                        break;
                    case TextOperationType.AppendToFile:
                        newContent = await this.appendToFile(tempEditor, newContent, operation.content);
                        break;
                    case TextOperationType.PrependToFile:
                        newContent = await this.prependToFile(tempEditor, newContent, operation.content);
                        break;
                    default:
                        console.warn(`TextOperationProcessor: Unknown operation type: ${(operation as any).type}`);
                        continue;
                }
                
                // Update the temporary editor with the new content
                tempEditor.setValue(newContent);
                operationsApplied++;
                console.debug(`TextOperationProcessor: Operation ${i+1} completed successfully`);
            } catch (error) {
                console.error(`TextOperationProcessor: Error processing operation ${i+1}: ${error}`);
                if (error instanceof Error) {
                    console.error(`TextOperationProcessor: Error details: ${error.stack}`);
                }
            }
        }
        
        // Write the updated content back to the file
        await this.app.vault.modify(file, newContent);
        
        return { oldContent, newContent, operationsApplied };
    }
    
    /**
     * Inserts content under a heading
     * @param editor Temporary editor
     * @param content Current content
     * @param heading Heading to insert under
     * @param newContent Content to insert
     * @returns Updated content
     */
    private async insertAtHeading(editor: TemporaryEditor, content: string, heading: string, newContent: string): Promise<string> {
        // Find the heading
        const headingLine = this.findHeadingLine(editor, heading);
        if (headingLine === -1) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Heading "${heading}" not found in note. Please check that:
1. The heading exists exactly as specified (including any ## markers)
2. The heading has the correct level (number of # symbols)
3. The heading includes any [[wiki-links]] if present in the original`
            );
        }
        
        // Calculate the position to insert at
        const position = { line: headingLine + 1, ch: 0 };
        const offset = editor.posToOffset(position);
        
        // Insert the content
        return content.substring(0, offset) + newContent + '\n' + content.substring(offset);
    }
    
    /**
     * Finds a heading in the editor
     * @param editor Temporary editor
     * @param heading Heading to find
     * @returns Line number of the heading, or -1 if not found
     */
    private findHeadingLine(editor: TemporaryEditor, heading: string): number {
        const lineCount = editor.lineCount();
        const normalizedHeading = heading.trim();
        
        console.debug(`TextOperationProcessor: Searching for heading: "${normalizedHeading}"`);
        
        for (let i = 0; i < lineCount; i++) {
            const line = editor.getLine(i);
            
            // Check for exact match
            if (line.trim() === normalizedHeading) {
                console.debug(`TextOperationProcessor: Found exact match at line ${i}: "${line}"`);
                return i;
            }
            
            // Check for match with wiki-links
            if (line.startsWith('#')) {
                const lineWithoutBrackets = line.replace(/\[\[|\]\]/g, '');
                const headingWithoutBrackets = normalizedHeading.replace(/\[\[|\]\]/g, '');
                
                if (lineWithoutBrackets.trim() === headingWithoutBrackets.trim()) {
                    console.debug(`TextOperationProcessor: Found match with wiki-links at line ${i}: "${line}"`);
                    return i;
                }
            }
        }
        
        console.debug(`TextOperationProcessor: No match found for heading "${normalizedHeading}"`);
        return -1;
    }
    
    /**
     * Inserts content at a specific position
     * @param editor Temporary editor
     * @param content Current content
     * @param position Position to insert at
     * @param newContent Content to insert
     * @returns Updated content
     */
    private async insertAtPosition(editor: TemporaryEditor, content: string, position: EditorPosition, newContent: string): Promise<string> {
        const lineCount = editor.lineCount();
        
        if (position.line < 0 || position.line > lineCount) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Invalid line number: ${position.line}. Valid range is 0-${lineCount}`
            );
        }
        
        // If the line exists, check the character position
        if (position.line < lineCount) {
            const line = editor.getLine(position.line);
            if (position.ch < 0 || position.ch > line.length) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Invalid character position: ${position.ch}. Valid range is 0-${line.length}`
                );
            }
        }
        
        // Calculate the offset
        const offset = editor.posToOffset(position);
        
        // Insert the content
        return content.substring(0, offset) + newContent + content.substring(offset);
    }
    
    /**
     * Replaces text in the content
     * @param editor Temporary editor
     * @param content Current content
     * @param search Text to search for
     * @param replace Text to replace with
     * @param replaceAll Whether to replace all occurrences
     * @returns Updated content
     */
    private async replaceText(editor: TemporaryEditor, content: string, search: string, replace: string, replaceAll: boolean): Promise<string> {
        if (content.indexOf(search) === -1) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Text "${search}" not found in note`
            );
        }
        
        console.debug(`TextOperationProcessor: Replacing ${replaceAll ? 'all occurrences of' : 'first occurrence of'} text "${search.substring(0, 20)}${search.length > 20 ? '...' : ''}" with "${replace.substring(0, 20)}${replace.length > 20 ? '...' : ''}"`);
        
        if (replaceAll) {
            // Use a regular expression with the global flag to replace all occurrences
            const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedSearch, 'g');
            return content.replace(regex, replace);
        } else {
            // Replace only the first occurrence
            const index = content.indexOf(search);
            return content.substring(0, index) + replace + content.substring(index + search.length);
        }
    }
    
    /**
     * Appends content to the end of the file
     * @param editor Temporary editor
     * @param content Current content
     * @param newContent Content to append
     * @returns Updated content
     */
    private async appendToFile(editor: TemporaryEditor, content: string, newContent: string): Promise<string> {
        return `${content}\n\n${newContent}`;
    }
    
    /**
     * Prepends content to the beginning of the file
     * @param editor Temporary editor
     * @param content Current content
     * @param newContent Content to prepend
     * @returns Updated content
     */
    private async prependToFile(editor: TemporaryEditor, content: string, newContent: string): Promise<string> {
        return `${newContent}\n\n${content}`;
    }
}