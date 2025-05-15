/**
 * Read mode for the Note Reader
 */
export enum ReadMode {
  /**
   * Read the entire note
   */
  FULL = 'read',
  
  /**
   * Read multiple notes at once
   */
  BATCH = 'batchRead',
  
  /**
   * Read specific lines from a note
   */
  LINE = 'lineRead',
  
  /**
   * Read the entire note with line numbers
   */
  FULL_WITH_LINE_NUMBERS = 'readWithLineNumbers',
  
  /**
   * Read multiple notes at once with line numbers
   */
  BATCH_WITH_LINE_NUMBERS = 'batchReadWithLineNumbers',
  
  /**
   * Read specific lines from a note with line numbers
   */
  LINE_WITH_LINE_NUMBERS = 'lineReadWithLineNumbers'
}

/**
 * Arguments for reading a note
 */
export interface ReadNoteArgs {
  /**
   * Path to the note
   */
  path: string;
  
  /**
   * Whether to include line numbers in the output
   */
  includeLineNumbers?: boolean;
}

/**
 * Arguments for batch reading notes
 */
export interface BatchReadArgs {
  /**
   * Paths to the notes
   */
  paths: string[];
  
  /**
   * Whether to include line numbers in the output
   */
  includeLineNumbers?: boolean;
}

/**
 * Arguments for reading specific lines from a note
 */
export interface ReadLineArgs {
  /**
   * Path to the note
   */
  path: string;
  
  /**
   * Start line (1-based)
   */
  startLine: number;
  
  /**
   * End line (1-based, inclusive)
   */
  endLine: number;
  
  /**
   * Whether to include line numbers in the output
   */
  includeLineNumbers?: boolean;
}

/**
 * Result of reading a note
 */
export interface ReadNoteResult {
  /**
   * Content of the note
   */
  content: string;
  
  /**
   * Path to the note
   */
  path: string;
  
  /**
   * Whether line numbers are included in the content
   */
  lineNumbersIncluded?: boolean;
}

/**
 * Result of batch reading notes
 */
export interface BatchReadResult {
  /**
   * Map of note paths to contents
   */
  notes: Record<string, string>;
  
  /**
   * Paths that couldn't be read
   */
  errors?: Record<string, string>;
  
  /**
   * Whether line numbers are included in the content
   */
  lineNumbersIncluded?: boolean;
}

/**
 * Result of reading specific lines from a note
 */
export interface ReadLineResult {
  /**
   * Lines from the note
   */
  lines: string[];
  
  /**
   * Path to the note
   */
  path: string;
  
  /**
   * Start line (1-based)
   */
  startLine: number;
  
  /**
   * End line (1-based, inclusive)
   */
  endLine: number;
  
  /**
   * Whether line numbers are included in the lines
   */
  lineNumbersIncluded?: boolean;
}