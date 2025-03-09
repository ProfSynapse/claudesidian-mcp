import { TFolder, Vault, normalizePath } from 'obsidian';
import { IFolderService } from './interfaces/IFolderService';
import { IPathService } from './interfaces/IPathService';

/**
 * Service for folder operations
 * Implements IFolderService interface
 */
export class FolderService implements IFolderService {
    /**
     * Creates a new FolderService
     * @param vault Obsidian vault
     * @param pathService Path service for path operations
     */
    constructor(
        private vault: Vault,
        private pathService: IPathService
    ) {}
    
    /**
     * Creates a folder if it doesn't exist
     * @param path Path to the folder
     */
    async createFolder(path: string): Promise<void> {
        try {
            const cleanPath = path.replace(/\.md$/, '').replace(/\/$/, '');
            const normalizedPath = normalizePath(cleanPath);
            
            // First check if folder exists in filesystem
            const exists = await this.vault.adapter.exists(normalizedPath);
            if (!exists) {
                // Ensure parent folders exist first
                const parentPath = this.pathService.getFolderPath(normalizedPath);
                if (parentPath && parentPath !== normalizedPath) {
                    await this.createFolder(parentPath);
                }
                
                try {
                    await this.vault.createFolder(normalizedPath);
                    console.log(`Created folder: ${normalizedPath}`);
                } catch (e) {
                    // Check if folder was created by another process
                    if (!await this.vault.adapter.exists(normalizedPath)) {
                        throw e;
                    }
                }
            }
        } catch (error) {
            console.error(`Failed to create folder ${path}:`, error);
            // Don't throw the error - just log it and continue
        }
    }
    
    /**
     * Ensures a folder exists, creating it and any parent folders if necessary
     * @param path Path to the folder
     */
    async ensureFolder(path: string, retries = 3): Promise<void> {
        if (!path || path === '/') return; // Skip empty paths
        
        const normalizedPath = this.pathService.normalizePath(path);
        
        try {
            // First check if folder exists in filesystem
            const exists = await this.vault.adapter.exists(normalizedPath);
            if (exists) {
                // Wait for Obsidian to recognize it
                for (let i = 0; i < retries; i++) {
                    const folder = this.vault.getAbstractFileByPath(normalizedPath);
                    if (folder instanceof TFolder) {
                        return; // Folder exists and is recognized
                    }
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }

            // Ensure parent folder exists first (recursive)
            const parentPath = this.pathService.getFolderPath(normalizedPath);
            if (parentPath && parentPath !== normalizedPath) {
                await this.ensureFolder(parentPath);
            }

            // Create folder if it doesn't exist or isn't properly recognized
            try {
                await this.vault.createFolder(normalizedPath);
                console.debug(`Created folder: ${normalizedPath}`);
            } catch (e) {
                // Folder might have been created by another process
                if (!await this.vault.adapter.exists(normalizedPath)) {
                    throw e; // Re-throw if folder still doesn't exist
                }
            }
            
            // Wait for folder to be recognized
            for (let i = 0; i < retries; i++) {
                const folder = this.vault.getAbstractFileByPath(normalizedPath);
                if (folder instanceof TFolder) {
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            // Don't throw an error if the folder exists in filesystem
            // This prevents race conditions during initialization
            if (await this.vault.adapter.exists(normalizedPath)) {
                console.log(`Folder exists but not yet recognized: ${normalizedPath}`);
                return;
            }

            throw new Error(`Failed to create/verify folder: ${normalizedPath}`);
        } catch (error) {
            // Log error but don't throw if folder exists
            if (await this.vault.adapter.exists(normalizedPath)) {
                console.warn(`ensureFolder warning: ${error.message}`);
                return;
            }
            throw this.handleError('ensureFolder', error);
        }
    }
    
    /**
     * Checks if a folder exists
     * @param path Path to the folder
     * @returns True if the folder exists, false otherwise
     */
    async folderExists(path: string): Promise<boolean> {
        try {
            const cleanPath = path.replace(/\.md$/, '').replace(/\/$/, '');
            const normalizedPath = normalizePath(cleanPath);
            return await this.vault.adapter.exists(normalizedPath);
        } catch (error) {
            console.error(`Error checking folder existence: ${path}`, error);
            return false;
        }
    }
    
    /**
     * Renames a folder
     * @param oldPath Current path of the folder
     * @param newPath New path for the folder
     */
    async renameFolder(oldPath: string, newPath: string): Promise<void> {
        const folder = this.vault.getAbstractFileByPath(oldPath);
        if (folder) {
            await this.vault.rename(folder, newPath);
        }
    }
    
    /**
     * Creates a subfolder within a parent folder
     * @param parentPath Path to the parent folder
     * @param folderName Name of the subfolder
     * @returns The full path to the created subfolder
     */
    async ensureSubFolder(parentPath: string, folderName: string): Promise<string> {
        const fullPath = `${parentPath}/${folderName}`;
        await this.ensureFolder(fullPath);
        return fullPath;
    }
    
    /**
     * Moves contents from one folder to another
     * @param oldPath Source folder path
     * @param newPath Destination folder path
     */
    async moveContents(oldPath: string, newPath: string): Promise<void> {
        try {
            const oldExists = await this.folderExists(oldPath);
            if (!oldExists) {
                console.log(`Source folder ${oldPath} doesn't exist, skipping migration`);
                return;
            }

            // Create new folder if it doesn't exist
            await this.createFolder(newPath);

            // Get the folder and its contents
            const oldFolder = this.vault.getAbstractFileByPath(oldPath);
            if (!(oldFolder instanceof TFolder)) {
                console.log(`Source path ${oldPath} is not a folder`);
                return;
            }

            // Move each file
            for (const file of oldFolder.children) {
                const newFilePath = normalizePath(file.path.replace(oldPath, newPath));
                console.log(`Moving ${file.path} to ${newFilePath}`);
                await this.vault.rename(file, newFilePath);
            }
        } catch (error) {
            console.error(`Error moving contents from ${oldPath} to ${newPath}:`, error);
        }
    }
    
    /**
     * Deletes empty folders
     * @param path Path to the folder to check and potentially delete
     */
    async cleanupEmptyFolders(path: string): Promise<void> {
        try {
            const folder = this.vault.getAbstractFileByPath(path);
            if (folder instanceof TFolder) {
                if (folder.children.length === 0) {
                    await this.vault.delete(folder);
                }
            }
        } catch (error) {
            console.error(`Error cleaning up folder ${path}:`, error);
        }
    }
    
    /**
     * Waits for a folder to be recognized by Obsidian
     * @param path Path to the folder
     * @param retries Number of retries
     * @param delay Delay between retries in milliseconds
     * @returns The TFolder object or null if not found
     */
    async waitForFolder(path: string, retries = 5, delay = 300): Promise<TFolder | null> {
        for (let i = 0; i < retries; i++) {
            try {
                // Check if folder exists in filesystem
                const exists = await this.vault.adapter.exists(path);
                if (!exists) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // Check if Obsidian recognizes it
                const folder = this.vault.getAbstractFileByPath(path);
                if (folder instanceof TFolder) {
                    return folder;
                }
            } catch (e) {
                console.log(`Error checking folder: ${e}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        return null;
    }
    
    /**
     * Creates a standardized error with context
     * @param operation Operation that failed
     * @param error Original error
     * @returns Standardized error
     */
    private handleError(operation: string, error: any): Error {
        const message = error instanceof Error ? error.message : String(error);
        return new Error(`FolderService.${operation}: ${message}`);
    }
}
