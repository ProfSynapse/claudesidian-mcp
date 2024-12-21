import { App, TFile, TFolder, Vault, normalizePath } from 'obsidian';
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

            // Add frontmatter if provided
            const fullContent = options.frontmatter 
                ? this.addFrontmatter(content, options.frontmatter)
                : content;

            // Create the note
            const file = await this.vault.create(normalizedPath, fullContent);
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
     * Ensures a folder exists, creating it and any parent folders if necessary
     */
    async ensureFolder(path: string): Promise<void> {
        try {
            const normalizedPath = this.normalizePath(path);
            const folder = this.vault.getAbstractFileByPath(normalizedPath);

            if (!folder) {
                await this.vault.createFolder(normalizedPath);
            } else if (!(folder instanceof TFolder)) {
                throw new Error(`Path exists but is not a folder: ${normalizedPath}`);
            }
        } catch (error) {
            throw this.handleError('ensureFolder', error);
        }
    }

    /**
     * Lists all notes in a folder
     */
    async listNotes(folderPath: string = '/'): Promise<TFile[]> {
        try {
            const normalizedPath = this.normalizePath(folderPath);
            const folder = this.vault.getAbstractFileByPath(normalizedPath);

            if (!folder || !(folder instanceof TFolder)) {
                throw new Error(`No folder found at path: ${normalizedPath}`);
            }

            return folder.children
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
}