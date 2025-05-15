import { App, TFile } from 'obsidian';

/**
 * Utility class for file path operations related to memory management
 * Centralizes logic for file inclusion/exclusion, pattern matching, etc.
 */
export class FilePathOperations {
    /**
     * Check if a file path is excluded by the settings
     * 
     * @param filePath File path to check
     * @param excludePaths Array of exclusion glob patterns
     * @returns Whether the file is excluded
     */
    static isFileExcluded(
        filePath: string,
        excludePaths: string[]
    ): boolean {
        // Check exclude patterns
        for (const pattern of excludePaths) {
            if (FilePathOperations.matchGlobPattern(filePath, pattern)) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Match a file path against a glob pattern
     * Basic implementation, would need a proper glob library for production use
     * 
     * @param filePath File path to check
     * @param pattern Glob pattern to match against
     * @returns Whether the file path matches the pattern
     */
    static matchGlobPattern(filePath: string, pattern: string): boolean {
        // Convert glob pattern to regex
        const regexPattern = pattern
            .replace(/\./g, '\\.')   // Escape dots
            .replace(/\*\*/g, '.*')  // ** matches any characters
            .replace(/\*/g, '[^/]*') // * matches any characters except /
            .replace(/\?/g, '[^/]'); // ? matches any single character except /
        
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(filePath);
    }
    
    /**
     * Check if a file is a markdown file
     * 
     * @param file File to check
     * @returns Whether the file is a markdown file
     */
    static isMarkdownFile(file: TFile): boolean {
        return file.extension === 'md';
    }
    
    /**
     * Get all markdown files from the vault that meet exclusion criteria
     * 
     * @param app Obsidian app instance
     * @param excludePaths Array of exclusion glob patterns
     * @returns Array of markdown files that match the criteria
     */
    static getEligibleMarkdownFiles(
        app: App,
        excludePaths: string[]
    ): TFile[] {
        const allMarkdownFiles = app.vault.getMarkdownFiles();
        
        return allMarkdownFiles.filter(file => 
            !FilePathOperations.isFileExcluded(file.path, excludePaths)
        );
    }
}