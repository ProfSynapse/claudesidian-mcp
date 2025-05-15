/**
 * Edit operation type
 */
export enum EditOperationType {
  /**
   * Replace content in a note
   */
  REPLACE = 'replace',
  
  /**
   * Replace a specific line in a note
   */
  REPLACE_LINE = 'replaceLine',
  
  /**
   * Insert content into a note
   */
  INSERT = 'insert',
  
  /**
   * Delete content from a note
   */
  DELETE = 'delete',
  
  /**
   * Append content to a note
   */
  APPEND = 'append',
  
  /**
   * Prepend content to a note
   */
  PREPEND = 'prepend'
}

/**
 * Base edit operation
 */
export interface BaseEditOperation {
  /**
   * Type of edit operation
   */
  type: EditOperationType;
  
  /**
   * Path to the note
   */
  path: string;
}

/**
 * Replace operation
 */
export interface ReplaceOperation extends BaseEditOperation {
  type: EditOperationType.REPLACE;
  
  /**
   * Content to search for
   */
  search: string;
  
  /**
   * Content to replace with
   */
  replace: string;
  
  /**
   * Whether to replace all occurrences
   */
  replaceAll?: boolean;
}

/**
 * Insert operation
 */
export interface InsertOperation extends BaseEditOperation {
  type: EditOperationType.INSERT;
  
  /**
   * Content to insert
   */
  content: string;
  
  /**
   * Position to insert at (line number, 1-based)
   */
  position: number;
}

/**
 * Delete operation
 */
export interface DeleteOperation extends BaseEditOperation {
  type: EditOperationType.DELETE;
  
  /**
   * Start position (line number, 1-based)
   */
  startPosition: number;
  
  /**
   * End position (line number, 1-based, inclusive)
   */
  endPosition: number;
}

/**
 * Append operation
 */
export interface AppendOperation extends BaseEditOperation {
  type: EditOperationType.APPEND;
  
  /**
   * Content to append
   */
  content: string;
}

/**
 * Prepend operation
 */
export interface PrependOperation extends BaseEditOperation {
  type: EditOperationType.PREPEND;
  
  /**
   * Content to prepend
   */
  content: string;
}

/**
 * Replace line operation
 */
export interface ReplaceLineOperation extends BaseEditOperation {
  type: EditOperationType.REPLACE_LINE;
  
  /**
   * Line number to replace (1-based)
   */
  lineNumber: number;
  
  /**
   * New content for the line
   */
  newContent: string;
}

/**
 * Edit operation
 */
export type EditOperation = 
  | ReplaceOperation
  | ReplaceLineOperation
  | InsertOperation
  | DeleteOperation
  | AppendOperation
  | PrependOperation;

/**
 * Arguments for single edit
 */
export interface SingleEditArgs {
  /**
   * Edit operation
   */
  operation: EditOperation;
}

/**
 * Arguments for batch edit
 */
export interface BatchEditArgs {
  /**
   * Edit operations
   */
  operations: EditOperation[];
}

/**
 * Result of edit operation
 */
export interface EditResult {
  /**
   * Path to the note
   */
  path: string;
  
  /**
   * Whether the edit was successful
   */
  success: boolean;
  
  /**
   * Error message if edit failed
   */
  error?: string;
}

/**
 * Result of batch edit
 */
export interface BatchEditResult {
  /**
   * Results of individual edit operations
   */
  results: EditResult[];
  
  /**
   * Whether all edits were successful
   */
  success: boolean;
}