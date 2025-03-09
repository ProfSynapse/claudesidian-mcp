import { normalizePath } from 'obsidian';
import { IPathService } from './interfaces/IPathService';

/**
 * Service for path operations
 * Implements IPathService interface
 */
export class PathService implements IPathService {
    /**
     * Normalizes a file path according to Obsidian's rules
     * @param path Path to normalize
     * @returns Normalized path
     */
    normalizePath(path: string): string {
        // For folders, just normalize without adding .md
        if (path.endsWith('/') || !path.includes('.')) {
            return normalizePath(path.replace(/\/$/, ''));
        }
        // For files, ensure .md extension
        return normalizePath(path.endsWith('.md') ? path : `${path}.md`);
    }
    
    /**
     * Extracts the folder path from a full file path
     * @param path Full file path
     * @returns Folder path
     */
    getFolderPath(path: string): string {
        const parts = path.split('/');
        return parts.slice(0, -1).join('/');
    }
    
    /**
     * Ensures a path has a .md extension
     * @param path Path to check
     * @returns Path with .md extension
     */
    ensureMdExtension(path: string): string {
        return path.endsWith('.md') ? path : `${path}.md`;
    }
    
    /**
     * Checks if a path is valid
     * @param path Path to check
     * @returns True if the path is valid, false otherwise
     */
    isValidPath(path: string): boolean {
        // Basic validation - can be expanded
        return !!path && !path.includes('..') && !path.includes('\\');
    }
    
    /**
     * Sanitizes a path for use in the vault
     * @param path Path to sanitize
     * @param rootPath Root path for relative paths
     * @returns Sanitized path
     */
    sanitizePath(path: string, rootPath?: string): string {
        if (!path) return '';
        
        // Remove leading/trailing slashes and spaces
        let sanitized = path.trim().replace(/^\/+|\/+$/g, '');
        
        // Replace invalid characters
        sanitized = sanitized.replace(/[\\:*?"<>|]/g, '-');
        
        // Prepend root path if provided and path is not absolute
        if (rootPath && !this.isAbsolutePath(sanitized)) {
            sanitized = `${rootPath}/${sanitized}`;
        }
        
        return sanitized;
    }
    
    /**
     * Checks if a path is absolute
     * @param path Path to check
     * @returns True if the path is absolute, false otherwise
     */
    isAbsolutePath(path: string): boolean {
        return path.startsWith('/');
    }
    
    /**
     * Sanitizes a file name for use in the vault
     * @param name File name to sanitize
     * @returns Sanitized file name
     */
    sanitizeName(name: string): string {
        if (!name) return `note_${Date.now()}`;
        
        // Replace invalid characters
        return name.trim()
            .replace(/[\\/:*?"<>|]/g, '-')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');
    }
}
