import { EditorPosition, EditorRange } from './EditorInterfaces';
import { LineUtils } from '../../../utils/LineUtils';

/**
 * A lightweight implementation of Obsidian's Editor API for text manipulation
 * This class provides the necessary methods for position calculations without requiring an actual editor instance
 */
export class TemporaryEditor {
    private content: string;
    private lineUtils: LineUtils;
    
    /**
     * Creates a new TemporaryEditor
     * @param content Initial content
     */
    constructor(content: string) {
        this.content = content;
        this.lineUtils = new LineUtils(content);
    }
    
    /**
     * Gets the editor content
     * @returns The content
     */
    getValue(): string {
        return this.content;
    }
    
    /**
     * Sets the editor content
     * @param content New content
     */
    setValue(content: string): void {
        this.content = content;
        this.lineUtils = new LineUtils(content);
    }
    
    /**
     * Gets a line of text
     * @param line Line number (0-based)
     * @returns The line text
     */
    getLine(line: number): string {
        return this.lineUtils.getLine(line);
    }
    
    /**
     * Gets the number of lines in the document
     * @returns Line count
     */
    lineCount(): number {
        return this.lineUtils.getLineCount();
    }
    
    /**
     * Gets the last line number
     * @returns Last line number
     */
    lastLine(): number {
        return this.lineUtils.getLineCount() - 1;
    }
    
    /**
     * Converts a character offset to a position
     * @param offset Character offset
     * @returns Editor position
     */
    offsetToPos(offset: number): EditorPosition {
        let line = 0;
        let ch = 0;
        let currentOffset = 0;
        const lineCount = this.lineUtils.getLineCount();
        
        while (line < lineCount) {
            const lineLength = this.getLine(line).length;
            
            if (currentOffset + lineLength >= offset) {
                ch = offset - currentOffset;
                break;
            }
            
            currentOffset += lineLength + 1; // +1 for the newline
            line++;
        }
        
        return { line, ch };
    }
    
    /**
     * Converts a position to a character offset
     * @param pos Editor position
     * @returns Character offset
     */
    posToOffset(pos: EditorPosition): number {
        let offset = 0;
        
        for (let i = 0; i < pos.line; i++) {
            offset += this.getLine(i).length + 1; // +1 for the newline
        }
        
        offset += pos.ch;
        return offset;
    }
    
    /**
     * Gets the text in a range
     * @param from Start position
     * @param to End position
     * @returns Text in the range
     */
    getRange(from: EditorPosition, to: EditorPosition): string {
        const startOffset = this.posToOffset(from);
        const endOffset = this.posToOffset(to);
        return this.content.substring(startOffset, endOffset);
    }
    
    /**
     * Finds a word at a position
     * @param pos Position
     * @returns Range of the word, or null if not found
     */
    wordAt(pos: EditorPosition): EditorRange | null {
        if (pos.line < 0 || pos.line >= this.lineUtils.getLineCount()) {
            return null;
        }
        
        const line = this.getLine(pos.line);
        if (pos.ch < 0 || pos.ch > line.length) {
            return null;
        }
        
        // Find word boundaries
        const wordRegex = /\w+/g;
        let match;
        
        while ((match = wordRegex.exec(line)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            
            if (pos.ch >= start && pos.ch <= end) {
                return {
                    from: { line: pos.line, ch: start },
                    to: { line: pos.line, ch: end }
                };
            }
        }
        
        return null;
    }
}
