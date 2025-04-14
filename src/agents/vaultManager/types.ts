import { TFile } from 'obsidian';

/**
 * Arguments for creating a note
 */
export interface CreateNoteArgs {
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
export interface CreateFolderArgs {
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
export interface DeleteNoteArgs {
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
export interface DeleteFolderArgs {
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
export interface MoveNoteArgs {
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
export interface MoveFolderArgs {
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