/**
 * Interface for specifying a range of lines
 * Uses 1-based line numbering for more intuitive API
 */
export interface LineRange {
    /** First line to read (1-based) */
    startLine: number;
    /** Last line to read (1-based, optional) */
    endLine?: number;
}

/**
 * Utility class for line-based operations on text content
 * Provides functionality to extract specific lines from text content
 * This is shared by NoteService and TemporaryEditor for consistent line handling
 */
export class LineUtils {
    /** Array of lines from the content */
    private lines: string[];
    
    /**
     * Creates a new LineUtils instance
     * @param content Text content to work with
     */
    constructor(content: string) {
        this.lines = content.split('\n');
    }
    
    /**
     * Static helper to get lines from content in a single call
     * @param content Text content to extract lines from
     * @param range Line range specification (1-based)
     * @returns The extracted lines as a string
     */
    static getLines(content: string, range: LineRange): string {
        const utils = new LineUtils(content);
        return utils.getLinesInRange(range);
    }

    /**
     * Gets the total number of lines in the content
     * @returns Line count
     */
    getLineCount(): number {
        return this.lines.length;
    }

    /**
     * Gets a specific line by number
     * @param lineNum Line number (0-based)
     * @returns The line text
     */
    getLine(lineNum: number): string {
        if (lineNum < 0 || lineNum >= this.lines.length) {
            throw new Error(`Invalid line number: ${lineNum}`);
        }
        return this.lines[lineNum];
    }

    /**
     * Extracts a range of lines from the content
     * @param range Line range specification (1-based)
     * @returns The extracted lines as a string
     */
    getLinesInRange(range: LineRange): string {
        // Convert to 0-based for internal use
        const start = range.startLine - 1;
        const end = range.endLine ? range.endLine - 1 : start;
        
        // Validate range
        if (start < 0 || start >= this.lines.length) {
            throw new Error(`Invalid start line: ${range.startLine}. Valid range is 1-${this.lines.length}`);
        }
        if (end < start || end >= this.lines.length) {
            throw new Error(`Invalid end line: ${range.endLine}. Valid range is ${range.startLine}-${this.lines.length}`);
        }
            
        // Extract and join the requested lines
        return this.lines.slice(start, end + 1).join('\n');
    }
}
