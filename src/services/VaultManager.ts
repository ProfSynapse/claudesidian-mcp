import { App, TFile, TFolder, Vault, normalizePath, View } from 'obsidian';
import * as yaml from 'yaml';

/**
 * Options for note creation/modification
 */
export interface NoteOptions {
    /** YAML frontmatter for the note */
    frontmatter?: Record<string, any>;
    /** Whether to ensure parent folders exist */
    createFolders?: boolean;
}

/**
 * Manages all interactions with the Obsidian vault
 * Provides a clean interface for file operations
 */
export class VaultManager {
    private vault: Vault;
    private app: App;

    constructor(app: App) {
        this.app = app;
        this.vault = app.vault;
    }

    getApp(): App {
        return this.app;
    }

    async getFile(path: string): Promise<TFile | null> {
        return this.vault.getAbstractFileByPath(path) as TFile;
    }

    /**
     * Creates a new note in the vault
     */
    async createNote(
        path: string, 
        content: string, 
        options: NoteOptions = {}
    ): Promise<TFile> {
        try {
            const normalizedPath = this.normalizePath(path);
            
            // Ensure parent folders exist if requested
            if (options.createFolders) {
                await this.ensureFolder(this.getFolderPath(normalizedPath));
            }

            // Check if file exists and generate unique name if needed
            let finalPath = normalizedPath;
            let counter = 1;
            while (await this.vault.adapter.exists(finalPath)) {
                const pathWithoutExt = normalizedPath.replace('.md', '');
                finalPath = `${pathWithoutExt}-${counter}.md`;
                counter++;
            }

            // Add frontmatter if provided
            const fullContent = options.frontmatter 
                ? this.addFrontmatter(content, options.frontmatter)
                : content;

            // Create the note
            const file = await this.vault.create(finalPath, fullContent);
            return file;
        } catch (error) {
            throw this.handleError('createNote', error);
        }
    }

    /**
     * Updates an existing note's content
     */
    async updateNote(
        path: string, 
        content: string, 
        options: NoteOptions = {}
    ): Promise<void> {
        try {
            const normalizedPath = this.normalizePath(path);
            const file = this.vault.getAbstractFileByPath(normalizedPath);

            if (!file || !(file instanceof TFile)) {
                throw new Error(`No note found at path: ${normalizedPath}`);
            }

            const fullContent = options.frontmatter 
                ? this.addFrontmatter(content, options.frontmatter)
                : content;

            await this.vault.modify(file, fullContent);
        } catch (error) {
            throw this.handleError('updateNote', error);
        }
    }

    /**
     * Updates note metadata without changing content
     */
    async updateNoteMetadata(path: string, metadata: Record<string, any>): Promise<void> {
        try {
            const content = await this.readNote(path);
            const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
            
            let newContent;
            if (frontmatterMatch) {
                // Update existing frontmatter
                newContent = `---\n${yaml.stringify(metadata)}---\n${frontmatterMatch[2]}`;
            } else {
                // Add new frontmatter
                newContent = `---\n${yaml.stringify(metadata)}---\n\n${content}`;
            }

            const file = this.vault.getAbstractFileByPath(path) as TFile;
            if (!file) {
                throw new Error(`No note found at path: ${path}`);
            }

            await this.vault.modify(file, newContent);
        } catch (error) {
            throw this.handleError('updateNoteMetadata', error);
        }
    }

    /**
     * Reads a note's content from the vault
     */
    async readNote(path: string): Promise<string> {
        try {
            const normalizedPath = this.normalizePath(path);
            const file = this.vault.getAbstractFileByPath(normalizedPath);

            if (!file || !(file instanceof TFile)) {
                throw new Error(`No note found at path: ${normalizedPath}`);
            }

            return await this.vault.read(file);
        } catch (error) {
            throw this.handleError('readNote', error);
        }
    }

    /**
     * Deletes a note from the vault
     */
    async deleteNote(path: string): Promise<void> {
        try {
            const normalizedPath = this.normalizePath(path);
            const file = this.vault.getAbstractFileByPath(normalizedPath);

            if (!file || !(file instanceof TFile)) {
                throw new Error(`No note found at path: ${normalizedPath}`);
            }

            await this.vault.delete(file);
        } catch (error) {
            throw this.handleError('deleteNote', error);
        }
    }

    /**
     * Ensures a folder exists, creating it and any parent folders if necessary
     */
    async ensureFolder(path: string, retries = 3): Promise<void> {
        const normalizedPath = this.normalizePath(path);
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
                    if (this.app.workspace.layoutReady) {
                        await this.refreshVault();
                    }
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }

            // Create folder if it doesn't exist or isn't properly recognized
            await this.vault.createFolder(normalizedPath);
            
            // Wait for folder to be recognized
            for (let i = 0; i < retries; i++) {
                const folder = this.vault.getAbstractFileByPath(normalizedPath);
                if (folder instanceof TFolder) {
                    return;
                }
                if (this.app.workspace.layoutReady) {
                    await this.refreshVault();
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
     * Lists all notes in a folder
     */
    async listNotes(folderPath: string = '/'): Promise<TFile[]> {
        try {
            const normalizedPath = this.normalizePath(folderPath);
            const file = this.vault.getAbstractFileByPath(normalizedPath);

            if (!file) {
                throw new Error(`Path not found: ${normalizedPath}`);
            }

            if (file instanceof TFile) {
                return [file]; // Return the file itself if path points to a file
            }

            if (!(file instanceof TFolder)) {
                throw new Error(`Path is neither a file nor folder: ${normalizedPath}`);
            }

            return file.children
                .filter(file => file instanceof TFile && file.extension === 'md')
                .map(file => file as TFile);
        } catch (error) {
            throw this.handleError('listNotes', error);
        }
    }

    /**
     * Gets note metadata (only available for markdown files)
     */
    async getNoteMetadata(path: string): Promise<Record<string, any> | null> {
        try {
            const content = await this.readNote(path);
            const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
            
            if (frontmatterMatch && frontmatterMatch[1]) {
                try {
                    // Assuming yaml is available from your imports
                    return yaml.parse(frontmatterMatch[1]);
                } catch {
                    return null;
                }
            }
            return null;
        } catch (error) {
            throw this.handleError('getNoteMetadata', error);
        }
    }

    /**
     * Creates a folder if it doesn't exist
     */
    private async waitForFolder(path: string, retries = 5, delay = 300): Promise<TFolder | null> {
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

                // Only refresh if Obsidian is fully loaded
                if (this.app.workspace.layoutReady) {
                    await this.refreshVault();
                }
            } catch (e) {
                console.log(`Error checking folder: ${e}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        return null;
    }

    async createFolder(path: string): Promise<void> {
        try {
            const cleanPath = path.replace(/\.md$/, '').replace(/\/$/, '');
            const normalizedPath = normalizePath(cleanPath);
            
            // First check if folder exists in filesystem
            const exists = await this.vault.adapter.exists(normalizedPath);
            if (!exists) {
                await this.vault.createFolder(normalizedPath);
                console.log(`Created folder: ${normalizedPath}`);

                // Safely try to refresh UI without throwing errors
                if (this.app.workspace.layoutReady) {
                    try {
                        const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0]?.view as FileExplorerView;
                        if (fileExplorer?.refresh) {
                            await fileExplorer.refresh();
                        }
                    } catch (e) {
                        // Ignore refresh errors - they're not critical
                        console.debug('Could not refresh file explorer:', e);
                    }
                }
            }
        } catch (error) {
            console.error(`Failed to create folder ${path}:`, error);
            // Don't throw the error - just log it and continue
        }
    }

    async renameFolder(oldPath: string, newPath: string): Promise<void> {
        const folder = this.vault.getAbstractFileByPath(oldPath);
        if (folder) {
            await this.vault.rename(folder, newPath);
        }
    }

    async ensureSubFolder(parentPath: string, folderName: string): Promise<string> {
        const fullPath = `${parentPath}/${folderName}`;
        await this.ensureFolder(fullPath);
        return fullPath;
    }

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
                if (file instanceof TFile) {
                    const newFilePath = normalizePath(file.path.replace(oldPath, newPath));
                    console.log(`Moving ${file.path} to ${newFilePath}`);
                    await this.vault.rename(file, newFilePath);
                }
            }
        } catch (error) {
            console.error(`Error moving contents from ${oldPath} to ${newPath}:`, error);
        }
    }

    async cleanupEmptyFolders(path: string): Promise<void> {
        try {
            const folder = this.vault.getAbstractFileByPath(path);
            if (folder instanceof TFolder) {
                const files = await this.listNotes(path);
                if (files.length === 0) {
                    await this.vault.delete(folder);
                }
            }
        } catch (error) {
            console.error(`Error cleaning up folder ${path}:`, error);
        }
    }

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

    // Helper Methods

    /**
     * Creates a standardized error with context
     */
    private handleError(operation: string, error: any): Error {
        const message = error instanceof Error ? error.message : String(error);
        return new Error(`VaultManager.${operation}: ${message}`);
    }

    /**
     * Normalizes a file path according to Obsidian's rules
     */
    private normalizePath(path: string): string {
        // For folders, just normalize without adding .md
        if (path.endsWith('/') || !path.includes('.')) {
            return normalizePath(path.replace(/\/$/, ''));
        }
        // For files, ensure .md extension
        return normalizePath(path.endsWith('.md') ? path : `${path}.md`);
    }

    /**
     * Extracts the folder path from a full file path
     */
    private getFolderPath(path: string): string {
        const parts = path.split('/');
        return parts.slice(0, -1).join('/');
    }

    /**
     * Adds YAML frontmatter to note content
     */
    private addFrontmatter(content: string, frontmatter: Record<string, any>): string {
        const yamlStr = yaml.stringify(frontmatter);
        return `---\n${yamlStr}---\n\n${content}`;
    }

    private async refreshVault(): Promise<void> {
        // During startup, don't trigger UI events
        if (!this.app.workspace.layoutReady) {
            return;
        }
        
        // Only trigger file-explorer:refresh, avoid file-menu
        this.app.workspace.trigger('file-explorer:refresh');
    }

    private async refreshVaultView(): Promise<void> {
        try {
            // Only refresh if workspace is ready
            if (!this.app.workspace.layoutReady) {
                return;
            }

            // Get file explorer
            const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0]?.view;
            if (fileExplorer && typeof (fileExplorer as any).reload === 'function') {
                await (fileExplorer as any).reload();
                if (typeof (fileExplorer as any).requestRefresh === 'function') {
                    await (fileExplorer as any).requestRefresh();
                }
            }
        } catch (e) {
            console.log('Error refreshing vault view:', e);
        }
    }

    async fileExists(path: string): Promise<boolean> {
        try {
            const normalizedPath = this.normalizePath(path);
            return await this.vault.adapter.exists(normalizedPath);
        } catch (error) {
            console.error(`Error checking file existence: ${path}`, error);
            return false;
        }
    }
}

// Add this interface near the top of the file
interface FileExplorerView extends View {
    refresh?: () => Promise<void>;
}
