/**
 * StorageInterface defines the common interface for storage operations
 * This allows the system to work with different storage backends
 * (e.g., Obsidian vault, Node.js filesystem)
 */
export interface StorageInterface {
    /**
     * Create a note/file with the given content
     */
    createNote(path: string, content: string, options?: { createFolders?: boolean }): Promise<any>;

    /**
     * Read a note/file's content
     */
    readNote(path: string): Promise<string>;

    /**
     * Delete a note/file
     */
    deleteNote(path: string): Promise<void>;

    /**
     * Ensure a folder exists, creating it if necessary
     */
    ensureFolder(path: string): Promise<void>;

    /**
     * Check if a folder exists
     */
    folderExists(path: string): Promise<boolean>;
}
