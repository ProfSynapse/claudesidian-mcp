import { TFile } from 'obsidian';
import { VaultManager } from './VaultManager';
import { SearchEngine, SearchResult } from './SearchEngine';
import { injectable } from 'inversify';
import type { BridgeMCPSettings } from '../settings';
import { DEFAULT_SETTINGS } from '../settings';
import { EventManager, EventTypes } from './EventManager';

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
    private settings: BridgeMCPSettings;
    private storage: Map<string, any> = new Map();
    private vaultManager: VaultManager;

    constructor(
        vaultManager: VaultManager,
        private searchEngine: SearchEngine,
        private eventManager: EventManager,
        settings?: BridgeMCPSettings
    ) {
        this.vaultManager = vaultManager;
        this.settings = settings || DEFAULT_SETTINGS;
        this.ensureDirectoriesExist();
    }

    private async ensureDirectoriesExist() {
        try {
            // Only create the root MCP directory
            await this.vaultManager.createFolder(this.settings.rootPath);
        } catch (error) {
            console.error('Error creating directory:', error);
        }
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
            // Ensure path doesn't include .md extension
            const basePath = memory.title.replace(/\.md$/, '');
            const notePath = `${this.settings.rootPath}/${basePath}`;
            
            // Prepare metadata
            const metadata: MemoryMetadata = {
                type: memory.type,
                categories: memory.categories,
                description: memory.description,
                tags: memory.tags,
                date: memory.date || new Date().toISOString()
            };

            // Create memory note
            const file = await this.vaultManager.createNote(
                `${notePath}.md`,
                memory.content,
                {
                    frontmatter: metadata,
                    createFolders: true
                }
            );

            this.eventManager.emit(EventTypes.MEMORY_CREATED, {
                type: memory.type,
                title: memory.title,
                path: file.path
            });

            // Update index with settings path
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
            const path = `${this.settings.rootPath}/${title}.md`;
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
                if (!file.path.startsWith(this.settings.memoryPath)) {
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
            const files = await this.vaultManager.listNotes(this.settings.memoryPath);
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
            const files = await this.vaultManager.listNotes(this.settings.memoryPath);
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
            // First read existing index content
            let indexContent = '';
            try {
                indexContent = await this.vaultManager.readNote(this.settings.indexPath) || '';
            } catch {
                // Index doesn't exist yet, that's ok
            }

            // Parse sections
            const sections = this.parseIndexSections(indexContent);
            
            // Add memory to appropriate section based on type
            const sectionTitle = this.getMemoryTypeSection(memory.type);
            if (!sections[sectionTitle]) {
                sections[sectionTitle] = [];
            }
            
            // Add new entry, avoiding duplicates
            const newEntry = `- [[${memory.title}]] - ${memory.description}`;
            if (!sections[sectionTitle].includes(newEntry)) {
                sections[sectionTitle].push(newEntry);
            }

            // Rebuild index content
            const newContent = this.formatIndexContent(sections);
            
            // Write back to index
            await this.vaultManager.createNote(
                this.settings.indexPath,
                newContent,
                { createFolders: true }
            );
        } catch (error) {
            console.error(`Error updating index: ${error.message}`);
        }
    }

    private parseIndexSections(content: string): Record<string, string[]> {
        const sections: Record<string, string[]> = {};
        let currentSection = '';
        
        content.split('\n').forEach(line => {
            if (line.startsWith('## ')) {
                currentSection = line.substring(3);
                sections[currentSection] = [];
            } else if (currentSection && line.trim().startsWith('-')) {
                sections[currentSection].push(line.trim());
            }
        });
        
        return sections;
    }

    private formatIndexContent(sections: Record<string, string[]>): string {
        const lines: string[] = ['# Memory Index\n'];
        
        // Sort sections in preferred order
        const orderedSections = [
            'Core Memories',
            'Episodic Memories',
            'Semantic Memories',
            'Procedural Memories',
            'Emotional Memories',
            'Contextual Memories'
        ];

        orderedSections.forEach(section => {
            if (sections[section] && sections[section].length > 0) {
                lines.push(`## ${section}`);
                // Sort entries alphabetically within each section
                sections[section].sort();
                lines.push(...sections[section]);
                lines.push(''); // Empty line between sections
            }
        });

        return lines.join('\n');
    }

    private getMemoryTypeSection(type: MemoryType): string {
        const sectionMap: Record<MemoryType, string> = {
            core: 'Core Memories',
            episodic: 'Episodic Memories',
            semantic: 'Semantic Memories',
            procedural: 'Procedural Memories',
            emotional: 'Emotional Memories',
            contextual: 'Contextual Memories'
        };
        
        return sectionMap[type] || 'Other Memories';
    }

    /**
     * Create a standardized error with context
     */
    private handleError(operation: string, error: any): Error {
        const message = error instanceof Error ? error.message : String(error);
        return new Error(`MemoryManager.${operation}: ${message}`);
    }
}