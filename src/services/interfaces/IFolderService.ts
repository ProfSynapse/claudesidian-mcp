import { TFolder } from 'obsidian';

/**
 * Interface for folder operations
 * Follows Single Responsibility Principle by focusing only on folder operations
 */
export interface IFolderService {
    /**
     * Creates a folder if it doesn't exist
     * @param path Path to the folder
     */
    createFolder(path: string): Promise<void>;
    
    /**
     * Ensures a folder exists, creating it and any parent folders if necessary
     * @param path Path to the folder
     */
    ensureFolder(path: string): Promise<void>;
    
    /**
     * Checks if a folder exists
     * @param path Path to the folder
     * @returns True if the folder exists, false otherwise
     */
    folderExists(path: string): Promise<boolean>;
    
    /**
     * Renames a folder
     * @param oldPath Current path of the folder
     * @param newPath New path for the folder
     */
    renameFolder(oldPath: string, newPath: string): Promise<void>;
    
    /**
     * Creates a subfolder within a parent folder
     * @param parentPath Path to the parent folder
     * @param folderName Name of the subfolder
     * @returns The full path to the created subfolder
     */
    ensureSubFolder(parentPath: string, folderName: string): Promise<string>;
    
    /**
     * Moves contents from one folder to another
     * @param oldPath Source folder path
     * @param newPath Destination folder path
     */
    moveContents(oldPath: string, newPath: string): Promise<void>;
    
    /**
     * Deletes empty folders
     * @param path Path to the folder to check and potentially delete
     */
    cleanupEmptyFolders(path: string): Promise<void>;
    
    /**
     * Waits for a folder to be recognized by Obsidian
     * @param path Path to the folder
     * @param retries Number of retries
     * @param delay Delay between retries in milliseconds
     * @returns The TFolder object or null if not found
     */
    waitForFolder(path: string, retries?: number, delay?: number): Promise<TFolder | null>;
}
