/**
 * Interface for path operations
 * Follows Single Responsibility Principle by focusing only on path operations
 */
export interface IPathService {
    /**
     * Normalizes a file path according to Obsidian's rules
     * @param path Path to normalize
     * @returns Normalized path
     */
    normalizePath(path: string): string;
    
    /**
     * Extracts the folder path from a full file path
     * @param path Full file path
     * @returns Folder path
     */
    getFolderPath(path: string): string;
    
    /**
     * Ensures a path has a .md extension
     * @param path Path to check
     * @returns Path with .md extension
     */
    ensureMdExtension(path: string): string;
    
    /**
     * Checks if a path is valid
     * @param path Path to check
     * @returns True if the path is valid, false otherwise
     */
    isValidPath(path: string): boolean;
    
    /**
     * Sanitizes a path for use in the vault
     * @param path Path to sanitize
     * @param rootPath Root path for relative paths
     * @returns Sanitized path
     */
    sanitizePath(path: string, rootPath?: string): string;
    
    /**
     * Checks if a path is absolute
     * @param path Path to check
     * @returns True if the path is absolute, false otherwise
     */
    isAbsolutePath(path: string): boolean;
    
    /**
     * Sanitizes a file name for use in the vault
     * @param name File name to sanitize
     * @returns Sanitized file name
     */
    sanitizeName(name: string): string;
}
