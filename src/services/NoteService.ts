import { App, TFile, Vault, getAllTags } from 'obsidian';
import { INoteService, NoteLineOptions, NoteOptions } from './interfaces/INoteService';
import { IPathService } from './interfaces/IPathService';
import { LineUtils } from '../utils/LineUtils';
import * as yaml from 'yaml';

/**
 * Service for note operations
 * Implements INoteService interface
 */
export class NoteService implements INoteService {
    /**
     * Creates a new NoteService
     * @param vault Obsidian vault
     * @param pathService Path service for path operations
     */
    constructor(
        private vault: Vault,
        private pathService: IPathService,
        private app: App
    ) {}
    
    /**
     * Creates a new note in the vault
     * @param path Path to the note
     * @param content Content of the note
     * @param options Optional settings for note creation
     * @returns The created TFile
     */
    async createNote(path: string, content: string, options: NoteOptions = {}): Promise<TFile> {
        try {
            const normalizedPath = this.pathService.normalizePath(path);
            
            // Always ensure parent folders exist
            await this.ensureParentFolder(normalizedPath);

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
     * Reads a note's content from the vault
     * @param path Path to the note
     * @returns The note content as a string
     */
    async readNote(path: string): Promise<string> {
        try {
            const normalizedPath = this.pathService.normalizePath(path);
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
     * Reads specific lines from a note
     * @param path Path to the note
     * @param options Line options specifying which lines to read
     * @returns The requested lines as a string
     */
    async readNoteLines(path: string, options: NoteLineOptions): Promise<string> {
        try {
            // Get the full content first
            const content = await this.readNote(path);
            
            // Handle frontmatter skipping if requested
            if (options.skipFrontmatter) {
                const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
                
                if (frontmatterMatch) {
                    // There is frontmatter, calculate its line count
                    const frontmatter = frontmatterMatch[1];
                    const frontmatterLineCount = frontmatter.split('\n').length + 2; // +2 for the --- lines
                    
                    // Adjust line numbers to account for skipped frontmatter
                    const adjustedOptions = {
                        startLine: options.startLine + frontmatterLineCount,
                        endLine: options.endLine ? options.endLine + frontmatterLineCount : undefined
                    };
                    
                    // Use LineUtils to extract the lines
                    return LineUtils.getLines(content, adjustedOptions);
                }
            }
            
            // No frontmatter or not skipping it, use line options directly
            return LineUtils.getLines(content, options);
        } catch (error) {
            throw this.handleError('readNoteLines', error);
        }
    }
    
    /**
     * Updates an existing note's content
     * @param path Path to the note
     * @param content New content for the note
     * @param options Optional settings for note update
     */
    async updateNote(path: string, content: string, options: NoteOptions = {}): Promise<void> {
        try {
            const normalizedPath = this.pathService.normalizePath(path);
            
            // Check if file exists
            const exists = await this.fileExists(normalizedPath);
            if (!exists) {
                console.debug(`NoteService: File doesn't exist, creating instead: ${normalizedPath}`);
                await this.createNote(path, content, options);
                return;
            }
            
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
     * Deletes a note from the vault
     * @param path Path to the note
     */
    async deleteNote(path: string): Promise<void> {
        try {
            const normalizedPath = this.pathService.normalizePath(path);
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
     * Gets note metadata (frontmatter) using Obsidian's metadata cache
     * Handles both markdown and non-markdown files gracefully
     * @param path Path to the note
     * @returns The note's metadata or null if none exists
     */
    async getNoteMetadata(path: string): Promise<Record<string, any> | null> {
        try {
            const normalizedPath = this.pathService.normalizePath(path);
            const file = this.vault.getAbstractFileByPath(normalizedPath);

            // Skip non-existent files or non-TFiles
            if (!file || !(file instanceof TFile)) {
                return null;
            }

            // For markdown files, use metadata cache
            if (file.extension === 'md') {
                const cache = this.app.metadataCache.getCache(file.path);
                if (cache?.frontmatter) {
                    // Filter out internal Obsidian properties
                    const { position, ...metadata } = cache.frontmatter;
                    
                    // Add tags from both frontmatter and content
                    const allTags = getAllTags(cache);
                    if (allTags) {
                        metadata.tags = allTags.map(tag => 
                            tag.startsWith('#') ? tag.slice(1) : tag
                        );
                    }
                    
                    return metadata;
                }
            }

            // For non-markdown files or if cache doesn't have frontmatter,
            // return basic metadata
            return {
                extension: file.extension,
                basename: file.basename,
                ctime: file.stat.ctime,
                mtime: file.stat.mtime
            };
        } catch (error) {
            console.error(`Error getting metadata for ${path}:`, error);
            return null;
        }
    }

    /**
     * Finds all notes with a specific tag
     * @param tag Tag to search for (with or without # prefix)
     * @returns Array of files that have the tag
     */
    async findNotesByTag(tag: string): Promise<TFile[]> {
        // Normalize tag (with and without # prefix)
        const searchTag = tag.startsWith('#') ? tag : '#' + tag;
        const plainTag = tag.startsWith('#') ? tag.slice(1) : tag;
        
        const files = this.vault.getMarkdownFiles();
        const results: TFile[] = [];
        
        for (const file of files) {
            try {
                const cache = this.app.metadataCache.getCache(file.path);
                if (!cache) continue;
                
                // Get all tags (both frontmatter and inline)
                const tags = getAllTags(cache);
                if (!tags) continue;
                
                // Check for tag match (with or without # prefix)
                if (tags.includes(searchTag) || tags.includes(plainTag)) {
                    results.push(file);
                }
            } catch (error) {
                console.error(`Error checking tags for ${file.path}:`, error);
            }
        }
        
        return results;
    }

    /**
     * Finds all notes with a specific property value
     * @param key Property key to search for
     * @param value Optional property value to match
     * @returns Array of files that have the property (and value if specified)
     */
    async findNotesByProperty(key: string, value?: any): Promise<TFile[]> {
        const files = this.vault.getMarkdownFiles();
        const results: TFile[] = [];
        
        for (const file of files) {
            try {
                const cache = this.app.metadataCache.getCache(file.path);
                if (!cache?.frontmatter) continue;
                
                const propertyValue = cache.frontmatter[key];
                if (propertyValue !== undefined) {
                    const matches = value === undefined || propertyValue === value;
                    if (matches) {
                        results.push(file);
                    }
                }
            } catch (error) {
                console.error(`Error checking properties for ${file.path}:`, error);
            }
        }
        
        return results;
    }
    
    /**
     * Updates note metadata without changing content
     * @param path Path to the note
     * @param metadata New metadata for the note
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
     * Gets a file reference by path
     * @param path Path to the file
     * @returns The TFile or null if not found
     */
    async getFile(path: string): Promise<TFile | null> {
        return this.vault.getAbstractFileByPath(path) as TFile;
    }
    
    /**
     * Checks if a file exists
     * @param path Path to the file
     * @returns True if the file exists, false otherwise
     */
    private async fileExists(path: string): Promise<boolean> {
        try {
            const normalizedPath = this.pathService.normalizePath(path);
            return await this.vault.adapter.exists(normalizedPath);
        } catch (error) {
            console.error(`Error checking file existence: ${path}`, error);
            return false;
        }
    }
    
    /**
     * Ensures the parent folder exists for a file path
     * @param path Path to the file
     */
    private async ensureParentFolder(path: string): Promise<void> {
        const folderPath = this.pathService.getFolderPath(path);
        if (!folderPath) return;
        
        const exists = await this.vault.adapter.exists(folderPath);
        if (!exists) {
            await this.vault.createFolder(folderPath);
        }
    }
    
    /**
     * Adds YAML frontmatter to note content
     * @param content Note content
     * @param frontmatter Frontmatter to add
     * @returns Content with frontmatter
     */
    private addFrontmatter(content: string, frontmatter: Record<string, any>): string {
        const yamlStr = yaml.stringify(frontmatter);
        return `---\n${yamlStr}---\n\n${content}`;
    }
    
    /**
     * Creates a standardized error with context
     * @param operation Operation that failed
     * @param error Original error
     * @returns Standardized error
     */
    private handleError(operation: string, error: any): Error {
        const message = error instanceof Error ? error.message : String(error);
        return new Error(`NoteService.${operation}: ${message}`);
    }

    /**
     * Gets all unique tags across all notes in the vault
     * Uses Obsidian's metadata cache for efficiency
     * @returns A Set of all unique tags (without # prefix)
     */
    async getAllUniqueTags(): Promise<Set<string>> {
        const uniqueTags = new Set<string>();
        const files = this.vault.getMarkdownFiles();

        for (const file of files) {
            const cache = this.app.metadataCache.getCache(file.path);
            if (!cache) continue;

            const tags = getAllTags(cache);
            if (!tags) continue;

            // Add tags without # prefix
            tags.forEach(tag => 
                uniqueTags.add(tag.startsWith('#') ? tag.slice(1) : tag)
            );
        }

        return uniqueTags;
    }

    /**
     * Gets statistics about tag usage across all notes
     * @returns A record mapping each tag to its usage count
     */
    async getTagStats(): Promise<Record<string, number>> {
        const tagStats: Record<string, number> = {};
        const files = this.vault.getMarkdownFiles();

        for (const file of files) {
            const cache = this.app.metadataCache.getCache(file.path);
            if (!cache) continue;

            const tags = getAllTags(cache);
            if (!tags) continue;

            tags.forEach(tag => {
                // Normalize tag (remove # prefix)
                const normalizedTag = tag.startsWith('#') ? tag.slice(1) : tag;
                tagStats[normalizedTag] = (tagStats[normalizedTag] || 0) + 1;
            });
        }

        return tagStats;
    }

    /**
     * Gets all unique metadata keys (frontmatter properties) used in any note
     * @returns A Set of all unique metadata property keys
     */
    async getAllMetadataKeys(): Promise<Set<string>> {
        const uniqueKeys = new Set<string>();
        const files = this.vault.getMarkdownFiles();

        for (const file of files) {
            const cache = this.app.metadataCache.getCache(file.path);
            if (!cache?.frontmatter) continue;

            // Add all frontmatter keys except internal Obsidian properties
            Object.keys(cache.frontmatter)
                .filter(key => key !== 'position')
                .forEach(key => uniqueKeys.add(key));
        }

        return uniqueKeys;
    }
}
