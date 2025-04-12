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
 * Options for line-specific note reading
 */
export interface NoteLineOptions {
    /** First line to read (1-based) */
    startLine: number;
    /** Last line to read (1-based, optional) */
    endLine?: number;
    /** Whether to skip frontmatter (optional) */
    skipFrontmatter?: boolean;
}

/**
 * Interface for note operations
 * Follows Single Responsibility Principle by focusing only on note operations
 */
export interface INoteService {
    /**
     * Finds all notes with a specific tag
     * @param tag Tag to search for (with or without # prefix)
     * @returns Array of files that have the tag
     */
    findNotesByTag(tag: string): Promise<TFile[]>;

    /**
     * Finds all notes with a specific property value
     * @param key Property key to search for
     * @param value Optional property value to match
     * @returns Array of files that have the property (and value if specified)
     */
    findNotesByProperty(key: string, value?: any): Promise<TFile[]>;

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
     * Reads specific lines from a note
     * @param path Path to the note
     * @param options Line options specifying which lines to read
     * @returns The requested lines as a string
     */
    readNoteLines(path: string, options: NoteLineOptions): Promise<string>;
    
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
    
    /**
     * Gets all unique tags across all notes in the vault
     * Uses Obsidian's metadata cache for efficiency
     * @returns A Set of all unique tags (without # prefix)
     */
    getAllUniqueTags(): Promise<Set<string>>;
    
    /**
     * Gets statistics about tag usage across all notes
     * @returns A record mapping each tag to its usage count
     */
    getTagStats(): Promise<Record<string, number>>;
    
    /**
     * Gets all unique metadata keys (frontmatter properties) used in any note
     * @returns A Set of all unique metadata property keys
     */
    getAllMetadataKeys(): Promise<Set<string>>;
}
