import { CommonParameters } from '../../types';

/**
 * Arguments for creating a note
 */
export interface CreateNoteArgs extends CommonParameters {
  /**
   * Path to the note
   */
  path: string;
  
  /**
   * Content of the note
   */
  content: string;
  
  /**
   * Whether to overwrite if the note already exists
   */
  overwrite?: boolean;
}

/**
 * Result of creating a note
 */
export interface CreateNoteResult {
  /**
   * Path to the note
   */
  path: string;
  
  /**
   * Whether the note was created successfully
   */
  success: boolean;
  
  /**
   * Error message if creation failed
   */
  error?: string;
  
  /**
   * Whether the note already existed
   */
  existed?: boolean;
}

/**
 * Arguments for creating a folder
 */
export interface CreateFolderArgs extends CommonParameters {
  /**
   * Path to the folder
   */
  path: string;
}

/**
 * Result of creating a folder
 */
export interface CreateFolderResult {
  /**
   * Path to the folder
   */
  path: string;
  
  /**
   * Whether the folder was created successfully
   */
  success: boolean;
  
  /**
   * Error message if creation failed
   */
  error?: string;
  
  /**
   * Whether the folder already existed
   */
  existed?: boolean;
}

/**
 * Arguments for deleting a note
 */
export interface DeleteNoteArgs extends CommonParameters {
  /**
   * Path to the note
   */
  path: string;
}

/**
 * Result of deleting a note
 */
export interface DeleteNoteResult {
  /**
   * Path to the note
   */
  path: string;
  
  /**
   * Whether the note was deleted successfully
   */
  success: boolean;
  
  /**
   * Error message if deletion failed
   */
  error?: string;
}

/**
 * Arguments for deleting a folder
 */
export interface DeleteFolderArgs extends CommonParameters {
  /**
   * Path to the folder
   */
  path: string;
  
  /**
   * Whether to delete recursively
   */
  recursive?: boolean;
}

/**
 * Result of deleting a folder
 */
export interface DeleteFolderResult {
  /**
   * Path to the folder
   */
  path: string;
  
  /**
   * Whether the folder was deleted successfully
   */
  success: boolean;
  
  /**
   * Error message if deletion failed
   */
  error?: string;
}

/**
 * Arguments for moving a note
 */
export interface MoveNoteArgs extends CommonParameters {
  /**
   * Path to the note
   */
  path: string;
  
  /**
   * New path for the note
   */
  newPath: string;
  
  /**
   * Whether to overwrite if a note already exists at the new path
   */
  overwrite?: boolean;
}

/**
 * Result of moving a note
 */
export interface MoveNoteResult {
  /**
   * Original path of the note
   */
  path: string;
  
  /**
   * New path of the note
   */
  newPath: string;
  
  /**
   * Whether the note was moved successfully
   */
  success: boolean;
  
  /**
   * Error message if move failed
   */
  error?: string;
}

/**
 * Arguments for moving a folder
 */
export interface MoveFolderArgs extends CommonParameters {
  /**
   * Path to the folder
   */
  path: string;
  
  /**
   * New path for the folder
   */
  newPath: string;
  
  /**
   * Whether to overwrite if a folder already exists at the new path
   */
  overwrite?: boolean;
}

/**
 * Result of moving a folder
 */
export interface MoveFolderResult {
  /**
   * Original path of the folder
   */
  path: string;
  
  /**
   * New path of the folder
   */
  newPath: string;
  
  /**
   * Whether the folder was moved successfully
   */
  success: boolean;
  
  /**
   * Error message if move failed
   */
  error?: string;
}

/**
 * Arguments for duplicating a note
 */
export interface DuplicateNoteArgs extends CommonParameters {
  /**
   * Path to the source note to duplicate
   */
  sourcePath: string;
  
  /**
   * Path for the duplicate note
   */
  targetPath: string;
  
  /**
   * Whether to overwrite if a note already exists at the target path
   */
  overwrite?: boolean;
  
  /**
   * Whether to auto-increment the filename if target exists (e.g., "note copy.md", "note copy 2.md")
   * This takes precedence over overwrite when both are true
   */
  autoIncrement?: boolean;
}

/**
 * Result of duplicating a note
 */
export interface DuplicateNoteResult {
  /**
   * Original path of the source note
   */
  sourcePath: string;
  
  /**
   * Final path of the duplicated note
   */
  targetPath: string;
  
  /**
   * Whether the note was duplicated successfully
   */
  success: boolean;
  
  /**
   * Error message if duplication failed
   */
  error?: string;
  
  /**
   * Whether the target path was auto-incremented due to conflicts
   */
  wasAutoIncremented?: boolean;
  
  /**
   * Whether an existing file was overwritten
   */
  wasOverwritten?: boolean;
}