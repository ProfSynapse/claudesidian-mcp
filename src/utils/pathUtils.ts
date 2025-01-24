/**
 * Utilities for handling file paths safely
 */

/**
 * Determines if a path is within memory or reasoning folders
 */
export function isMemoryOrReasoningPath(path: string, rootPath: string): boolean {
    const memoryPath = `${rootPath}/memory`;
    const reasoningPath = `${rootPath}/reasoning`;
    return path.startsWith(memoryPath) || path.startsWith(reasoningPath);
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
 * @param useUnderscores Whether to replace spaces with underscores (true for memory/reasoning files)
 */
export function sanitizeName(name: string, useUnderscores: boolean = false): string {
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
 * @param rootPath The root path of the vault, used to determine if path is memory/reasoning
 * @returns A sanitized path safe for file system operations
 */
export function sanitizePath(path: string, rootPath?: string): string {
    // Handle empty or invalid input
    if (!path || typeof path !== 'string') {
        return '';
    }

    // Normalize path separators
    const normalizedPath = path.replace(/\\/g, '/');

    // Split path into parts
    const parts = normalizedPath.split('/');

    // Determine if this path is in memory/reasoning folders
    const useUnderscores = rootPath ? isMemoryOrReasoningPath(normalizedPath, rootPath) : false;

    // Sanitize each part while preserving structure
    const sanitizedParts = parts.map((part, index) => {
        // Skip empty parts, dots, and root indicators
        if (!part || part === '.' || part === '..' || 
            (index === 0 && isAbsolutePath(path))) {
            return part;
        }

        // Use underscores only for memory/reasoning paths
        return sanitizeName(part, useUnderscores);
    });

    // Reconstruct path
    return sanitizedParts.join('/');
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
