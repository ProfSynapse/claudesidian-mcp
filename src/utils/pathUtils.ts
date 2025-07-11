/**
 * Utilities for handling file paths safely
 */

/**
 * Basic path normalization - removes leading slash for Obsidian compatibility
 * @param path Path to normalize
 * @returns Normalized path without leading slash
 */
export function normalizePath(path: string): string {
    return path.startsWith('/') ? path.slice(1) : path;
}

/**
 * Determines if a path should be treated as absolute
 */
export function isAbsolutePath(path: string): boolean {
    // Check for absolute path patterns
    return path.startsWith('/') || /^[A-Z]:\\/i.test(path) || path.startsWith('\\\\');
}

/**
 * Sanitizes a filename or folder name
 * @param name The name to sanitize
 * @param useUnderscores Whether to replace spaces with underscores
 */
export function sanitizeName(name: string, useUnderscores = false): string {
    if (!name || typeof name !== 'string') {
        return '_unnamed_';
    }

    let sanitized = name
        // Replace characters invalid in Windows paths
        .replace(/[<>:"\\|?*]/g, '_')
        // Remove leading/trailing periods and spaces
        .replace(/^[\s.]+|[\s.]+$/g, '');

    if (useUnderscores) {
        sanitized = sanitized
            // Replace multiple spaces/underscores with single underscore
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_');
    }

    // Ensure name isn't empty after sanitization
    return sanitized || '_unnamed_';
}

/**
 * Sanitizes a file path by replacing invalid characters with safe alternatives
 * @param path The file path to sanitize
 * @param preserveLeadingSlash Whether to preserve a leading slash if present
 * @returns A sanitized path safe for file system operations
 */
export function sanitizePath(path: string, preserveLeadingSlash = false): string {
    // Handle empty or invalid input
    if (!path || typeof path !== 'string') {
        return '';
    }

    // Detect if path had a leading slash
    const hadLeadingSlash = path.startsWith('/');

    // Normalize path separators
    const normalizedPath = path.replace(/\\/g, '/');

    // Split path into parts
    const parts = normalizedPath.split('/');

    // Sanitize each part while preserving structure
    const sanitizedParts = parts.map((part, index) => {
        // Skip empty parts, dots, and root indicators
        if (!part || part === '.' || part === '..' || 
            (index === 0 && isAbsolutePath(path))) {
            return part;
        }

        return sanitizeName(part, false);
    });

    // Reconstruct path
    let result = sanitizedParts.join('/');
    
    // Handle leading slash consistently
    if (hadLeadingSlash && preserveLeadingSlash) {
        // Ensure path starts with exactly one slash
        result = '/' + result.replace(/^\/+/, '');
    } else {
        // Remove any leading slashes
        result = result.replace(/^\/+/, '');
    }

    return result;
}

/**
 * Ensures a path has a .md extension
 * @param path The file path to check
 * @returns Path with .md extension
 */
export function ensureMdExtension(path: string): string {
    if (!path.toLowerCase().endsWith('.md')) {
        return path + '.md';
    }
    return path;
}

/**
 * Operation types for path normalization
 */
export type OperationType = 'NOTE' | 'DIRECTORY' | 'GENERIC';

/**
 * Smart path normalization that handles missing file extensions
 * Only adds .md extension for note operations when no extension is present
 * @param path The file path to normalize
 * @param preserveLeadingSlash Whether to preserve a leading slash if present
 * @param operationType Type of operation to determine extension handling
 * @returns Normalized path with appropriate extension handling
 */
export function smartNormalizePath(
    path: string, 
    preserveLeadingSlash = false, 
    operationType: OperationType = 'GENERIC'
): string {
    if (!path || typeof path !== 'string') {
        return '';
    }

    // First apply standard path sanitization
    const sanitizedPath = sanitizePath(path, preserveLeadingSlash);
    
    // Only add .md extension for note operations when no extension is present
    if (operationType === 'NOTE' && 
        sanitizedPath && 
        !sanitizedPath.endsWith('/') && 
        !hasFileExtension(sanitizedPath)) {
        return sanitizedPath + '.md';
    }
    
    return sanitizedPath;
}

/**
 * Checks if a path has any file extension
 * @param path The path to check
 * @returns True if path has an extension, false otherwise
 */
function hasFileExtension(path: string): boolean {
    const lastSlashIndex = path.lastIndexOf('/');
    const lastDotIndex = path.lastIndexOf('.');
    
    // Extension must come after the last slash (if any) and not be the first character of filename
    return lastDotIndex > lastSlashIndex && lastDotIndex > lastSlashIndex + 1;
}

// Removed isLikelyFolder function - no longer needed with explicit operation types

/**
 * Gets the parent folder path from a file path
 * @param path The file path
 * @returns The parent folder path
 */
export function getFolderPath(path: string): string {
    const parts = path.split('/');
    return parts.slice(0, -1).join('/');
}

/**
 * Validates a file path for basic safety
 * @param path The file path to validate
 * @returns True if path is valid, false otherwise
 */
export function isValidPath(path: string): boolean {
    if (!path || typeof path !== 'string') {
        return false;
    }

    // Check for absolute paths or directory traversal
    if (path.startsWith('/') || path.includes('..')) {
        return false;
    }

    // Check for invalid characters
    const invalidChars = /[<>:"\\|?*\x00-\x1F]/;
    if (invalidChars.test(path)) {
        return false;
    }

    return true;
}
