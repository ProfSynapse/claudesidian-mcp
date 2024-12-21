import { TFile } from 'obsidian';
import { VaultManager } from './VaultManager';
import { SearchEngine, SearchResult } from './SearchEngine';
import { injectable } from 'inversify';

export interface Memory {
    title: string;
    description: string;
    content: string;
    type: MemoryType;
    categories: string[];
    tags: string[];
    date: string;
}

export type MemoryType = 'core' | 'episodic' | 'semantic' | 'procedural' | 'emotional' | 'contextual';

interface MemoryMetadata {
    type: MemoryType;
    categories: string[];
    description: string;
    tags: string[];
    date: string;
}

interface MemoryFile extends TFile {
    metadata?: {
        type?: MemoryType;
        categories?: string[];
    };
}

/**
 * Manages memory creation, retrieval, and searching
 */
@injectable()
export class MemoryManager {
    private readonly memoryFolder = 'claudesidian/memory';
    private readonly indexFile = 'claudesidian/index.md';
    private storage: Map<string, any> = new Map();
    private vaultManager: VaultManager;

    constructor(
        vaultManager: VaultManager,
        private searchEngine: SearchEngine
    ) {
        this.vaultManager = vaultManager;
    }

    set(key: string, value: any): void {
        this.storage.set(key, value);
    }

    get(key: string): any | undefined {
        return this.storage.get(key);
    }

    delete(key: string): boolean {
        return this.storage.delete(key);
    }

    list(): string[] {
        return Array.from(this.storage.keys());
    }

    /**
     * Create a new memory note
     */
    async createMemory(memory: Memory): Promise<TFile> {
        try {
            // Prepare metadata
            const metadata: MemoryMetadata = {
                type: memory.type,
                categories: memory.categories,
                description: memory.description,
                tags: memory.tags,
                date: memory.date || new Date().toISOString()
            };

            // Create memory note
            const notePath = `${this.memoryFolder}/${memory.title}.md`;
            const file = await this.vaultManager.createNote(
                notePath,
                memory.content,
                {
                    frontmatter: metadata,
                    createFolders: true
                }
            );

            // Update index
            await this.updateIndex(memory);

            return file;
        } catch (error) {
            throw this.handleError('createMemory', error);
        }
    }

    /**
     * Get a memory by its title
     */
    async getMemory(title: string): Promise<Memory | null> {
        try {
            const path = `${this.memoryFolder}/${title}.md`;
            const content = await this.vaultManager.readNote(path);
            const metadata = await this.vaultManager.getNoteMetadata(path);

            if (!content || !metadata) {
                return null;
            }

            return {
                title,
                content,
                description: metadata.description,
                type: metadata.type,
                categories: metadata.categories,
                tags: metadata.tags,
                date: metadata.date
            };
        } catch (error) {
            console.error(`Error retrieving memory: ${error.message}`);
            return null;
        }
    }

    /**
     * Search through memories
     */
    async searchMemories(
        query: string, 
        options: { type?: MemoryType; category?: string; } = {}
    ): Promise<SearchResult[]> {
        try {
            const matches = await this.searchEngine.search(query, {
                threshold: 60,
                searchContent: true,
                limit: 10
            });

            // Filter for memory files and process them sequentially
            const results = [];
            for (const match of matches) {
                const file = match.item as MemoryFile;
                if (!file.path.startsWith(this.memoryFolder)) {
                    continue;
                }

                // Apply type/category filters if specified
                if (options.type || options.category) {
                    const metadata = await this.vaultManager.getNoteMetadata(file.path);
                    if (options.type && metadata?.type !== options.type) {
                        continue;
                    }
                    if (options.category && !metadata?.categories?.includes(options.category)) {
                        continue;
                    }
                }

                results.push({
                    file: match.item,
                    score: match.match?.score || 0,
                    matches: [match]
                });
            }

            return results;
        } catch (error) {
            throw this.handleError('searchMemories', error);
        }
    }

    /**
     * Get most recent memories
     */
    async getRecentMemories(limit: number = 10): Promise<Memory[]> {
        try {
            const files = await this.vaultManager.listNotes(this.memoryFolder);
            const memories: Memory[] = [];

            // Sort by ctime
            files.sort((a, b) => b.stat.ctime - a.stat.ctime);

            // Get limited number of most recent memories
            for (const file of files.slice(0, limit)) {
                const memory = await this.getMemory(file.basename);
                if (memory) {
                    memories.push(memory);
                }
            }

            return memories;
        } catch (error) {
            throw this.handleError('getRecentMemories', error);
        }
    }

    /**
     * Get memories by type
     */
    async getMemoriesByType(type: MemoryType): Promise<Memory[]> {
        try {
            const files = await this.vaultManager.listNotes(this.memoryFolder);
            const memories: Memory[] = [];

            for (const file of files) {
                const metadata = await this.vaultManager.getNoteMetadata(file.path);
                if (metadata?.type === type) {
                    const memory = await this.getMemory(file.basename);
                    if (memory) {
                        memories.push(memory);
                    }
                }
            }

            return memories;
        } catch (error) {
            throw this.handleError('getMemoriesByType', error);
        }
    }

    /**
     * Update the memory index
     */
    private async updateIndex(memory: Memory): Promise<void> {
        try {
            const indexEntry = `- [[${memory.title}]] - ${memory.description}\n`;
            
            await this.vaultManager.updateNote(
                this.indexFile,
                indexEntry,
                {
                    createFolders: true
                }
            );
        } catch (error) {
            console.error(`Error updating index: ${error.message}`);
            // Don't throw - index update failure shouldn't prevent memory creation
        }
    }

    /**
     * Create a standardized error with context
     */
    private handleError(operation: string, error: any): Error {
        const message = error instanceof Error ? error.message : String(error);
        return new Error(`MemoryManager.${operation}: ${message}`);
    }
}