import { App, TFile } from 'obsidian';
import { IVaultManager } from '../tools/interfaces/ToolInterfaces';
import { INoteService, NoteOptions } from './interfaces/INoteService';
import { IFolderService } from './interfaces/IFolderService';
import { IPathService } from './interfaces/IPathService';

/**
 * Facade for vault operations
 * Implements IVaultManager interface
 * Delegates to specialized services
 */
export class VaultManagerFacade implements IVaultManager {
    private app: App;
    
    /**
     * Creates a new VaultManagerFacade
     * @param noteService Note service for note operations
     * @param folderService Folder service for folder operations
     * @param pathService Path service for path operations
     */
    constructor(
        private noteService: INoteService,
        private folderService: IFolderService,
        private pathService: IPathService,
        app: App
    ) {
        this.app = app;
    }
    
    /**
     * Gets the Obsidian app instance
     */
    getApp(): App {
        return this.app;
    }
    
    /**
     * Creates a new note in the vault
     * @param path Path to the note
     * @param content Content of the note
     * @param options Optional settings for note creation
     * @returns The created TFile
     */
    async createNote(path: string, content: string, options?: NoteOptions): Promise<TFile> {
        return this.noteService.createNote(path, content, options);
    }
    
    /**
     * Reads a note's content from the vault
     * @param path Path to the note
     * @returns The note content as a string
     */
    async readNote(path: string): Promise<string> {
        return this.noteService.readNote(path);
    }
    
    /**
     * Updates an existing note's content
     * @param path Path to the note
     * @param content New content for the note
     * @param options Optional settings for note update
     */
    async updateNote(path: string, content: string, options?: NoteOptions): Promise<void> {
        return this.noteService.updateNote(path, content, options);
    }
    
    /**
     * Deletes a note from the vault
     * @param path Path to the note
     */
    async deleteNote(path: string): Promise<void> {
        return this.noteService.deleteNote(path);
    }
    
    /**
     * Gets note metadata (frontmatter) using Obsidian's metadata cache for markdown files
     * @param path Path to the note
     * @returns The note's metadata or null if none exists
     */
    async getNoteMetadata(path: string): Promise<Record<string, any> | null> {
        try {
            // Get file by path
            const file = this.app.vault.getAbstractFileByPath(path);
            
            // Skip non-existent files or non-TFiles
            if (!file || !(file instanceof TFile)) {
                return null;
            }
            
            // For markdown files, use metadata cache
            if (file.extension === 'md') {
                const cache = this.app.metadataCache.getCache(file.path);
                if (cache?.frontmatter) {
                    // Filter out internal Obsidian properties
                    const { position, ...metadata } = cache.frontmatter;
                    return metadata;
                }
            }
            
            // For non-markdown files, return null
            return null;
        } catch (error) {
            console.error(`Error getting metadata for ${path}:`, error);
            return null;
        }
    }
    
    /**
     * Updates note metadata without changing content
     * @param path Path to the note
     * @param metadata New metadata for the note
     */
    async updateNoteMetadata(path: string, metadata: Record<string, any>): Promise<void> {
        return this.noteService.updateNoteMetadata(path, metadata);
    }
    
    /**
     * Gets a file reference by path
     * @param path Path to the file
     * @returns The TFile or null if not found
     */
    async getFile(path: string): Promise<TFile | null> {
        return this.noteService.getFile(path);
    }
    
    /**
     * Ensures a folder exists, creating it and any parent folders if necessary
     * @param path Path to the folder
     */
    async ensureFolder(path: string): Promise<void> {
        return this.folderService.ensureFolder(path);
    }
    
    /**
     * Creates a folder if it doesn't exist
     * @param path Path to the folder
     */
    async createFolder(path: string): Promise<void> {
        return this.folderService.createFolder(path);
    }
    
    /**
     * Checks if a folder exists
     * @param path Path to the folder
     * @returns True if the folder exists, false otherwise
     */
    async folderExists(path: string): Promise<boolean> {
        return this.folderService.folderExists(path);
    }
    
    /**
     * Refreshes the vault index
     */
    async refreshIndex(): Promise<void> {
        // Force metadata cache refresh
        await this.app.metadataCache.trigger('resolve');
        
        // Force file explorer refresh
        const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0]?.view;
        if (fileExplorer) {
            if (typeof (fileExplorer as any).refresh === 'function') {
                await (fileExplorer as any).refresh();
            }
            if (typeof (fileExplorer as any).requestRefresh === 'function') {
                await (fileExplorer as any).requestRefresh();
            }
        }
    }
    
    /**
     * Cleans up empty folders
     * @param path Path to start cleaning from
     */
    async cleanupEmptyFolders(path: string): Promise<void> {
        // Get the folder
        const folder = this.app.vault.getAbstractFileByPath(path);
        if (!folder || folder instanceof TFile) {
            return;
        }
        
        // Check if folder is empty
        const children = (folder as any).children;
        if (children && children.length === 0) {
            // Delete empty folder
            await this.app.vault.delete(folder);
        }
    }

    /**
     * Gets all unique tags across all notes in the vault
     * Uses Obsidian's metadata cache for efficiency
     * @returns A Set of all unique tags (without # prefix)
     */
    async getAllUniqueTags(): Promise<Set<string>> {
        return this.noteService.getAllUniqueTags();
    }
    
    /**
     * Gets statistics about tag usage across all notes
     * @returns A record mapping each tag to its usage count
     */
    async getTagStats(): Promise<Record<string, number>> {
        return this.noteService.getTagStats();
    }
    
    /**
     * Gets all unique metadata keys (frontmatter properties) used in any note
     * @returns A Set of all unique metadata property keys
     */
    async getAllMetadataKeys(): Promise<Set<string>> {
        return this.noteService.getAllMetadataKeys();
    }
}
