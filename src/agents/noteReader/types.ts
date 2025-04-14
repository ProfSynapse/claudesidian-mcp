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
  LINE = 'lineRead'
}

/**
 * Arguments for reading a note
 */
export interface ReadNoteArgs {
  /**
   * Path to the note
   */
  path: string;
}

/**
 * Arguments for batch reading notes
 */
export interface BatchReadArgs {
  /**
   * Paths to the notes
   */
  paths: string[];
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
}