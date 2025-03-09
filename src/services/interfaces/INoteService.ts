import { TFile } from 'obsidian';

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
 * Interface for note operations
 * Follows Single Responsibility Principle by focusing only on note operations
 */
export interface INoteService {
    /**
     * Creates a new note in the vault
     * @param path Path to the note
     * @param content Content of the note
     * @param options Optional settings for note creation
     * @returns The created TFile
     */
    createNote(path: string, content: string, options?: NoteOptions): Promise<TFile>;
    
    /**
     * Reads a note's content from the vault
     * @param path Path to the note
     * @returns The note content as a string
     */
    readNote(path: string): Promise<string>;
    
    /**
     * Updates an existing note's content
     * @param path Path to the note
     * @param content New content for the note
     * @param options Optional settings for note update
     */
    updateNote(path: string, content: string, options?: NoteOptions): Promise<void>;
    
    /**
     * Deletes a note from the vault
     * @param path Path to the note
     */
    deleteNote(path: string): Promise<void>;
    
    /**
     * Gets note metadata (frontmatter)
     * @param path Path to the note
     * @returns The note's metadata or null if none exists
     */
    getNoteMetadata(path: string): Promise<Record<string, any> | null>;
    
    /**
     * Updates note metadata without changing content
     * @param path Path to the note
     * @param metadata New metadata for the note
     */
    updateNoteMetadata(path: string, metadata: Record<string, any>): Promise<void>;
    
    /**
     * Gets a file reference by path
     * @param path Path to the file
     * @returns The TFile or null if not found
     */
    getFile(path: string): Promise<TFile | null>;
}
