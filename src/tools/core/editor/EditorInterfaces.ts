/**
 * Interfaces for working with editor positions and ranges
 * Based on Obsidian's Editor API
 */

/**
 * Represents a position in an editor
 */
export interface EditorPosition {
    /**
     * Line number (0-based)
     */
    line: number;
    
    /**
     * Character offset within the line (0-based)
     */
    ch: number;
}

/**
 * Represents a range in an editor
 */
export interface EditorRange {
    /**
     * Start position
     */
    from: EditorPosition;
    
    /**
     * End position
     */
    to: EditorPosition;
}