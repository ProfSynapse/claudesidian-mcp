import { TFile } from 'obsidian';
import { VaultManager } from './VaultManager';
import { injectable } from 'inversify';
import type { BridgeMCPSettings } from '../settings';
import { DEFAULT_SETTINGS } from '../settings';
import { EventManager, EventTypes } from './EventManager';

// Remove SearchResult interface since it's no longer needed

export interface Memory {
    title: string;
    description: string;
    content: string;
    category: MemoryType;  // Changed from type to category
    tags: string[];
    relationships?: Array<{
        relation: string;
        hits: number;
    }>;
    createdAt: string;      // Add created timestamp
    modifiedAt?: string;    // Add modified timestamp
    lastViewedAt?: string;  // Add last viewed timestamp
    success?: boolean;  // Optional success flag for task-based memories
}

// Add values array for MemoryType
export const MemoryTypes = [
    'core',
    'episodic',
    'semantic',
    'procedural',
    'emotional',
    'contextual',
    'search'  // Add search type
] as const;

export type MemoryType = typeof MemoryTypes[number];

interface MemoryMetadata {
    category: MemoryType;  // Changed from type to category
    description: string;
    tags: string[];
    createdAt: string;      // Add created timestamp
    modifiedAt?: string;    // Add modified timestamp
    lastViewedAt?: string;  // Add last viewed timestamp
    hits: number;           // Add hits tracking
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
        private eventManager: EventManager,
        settings?: BridgeMCPSettings
    ) {
        this.vaultManager = vaultManager;
        this.settings = settings || DEFAULT_SETTINGS;
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

    private safeStringify(obj: any): string {
        const cache = new Set();
        return JSON.stringify(obj, (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (cache.has(value)) return '[Circular]';
                cache.add(value);
            }
            return value;
        });
    }

    /**
     * Create a new memory note
     */
    async createMemory(memory: Memory): Promise<TFile> {
        try {
            console.log('📝 Creating new memory:', this.safeStringify(memory));
            // Ensure memory folder exists
            const memoryFolder = `${this.settings.rootPath}/memories`;
            await this.vaultManager.createFolder(memoryFolder);
            
            // Create safe filename from title
            const safeTitle = memory.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_|_$/g, '');
            
            // Create memory note in the memory folder
            const file = await this.vaultManager.createNote(
                `${memoryFolder}/${safeTitle}`,  // Remove .md as it's handled by VaultManager
                memory.content,
                {
                    frontmatter: {
                        category: memory.category,
                        description: memory.description,
                        tags: memory.tags,
                        relationships: memory.relationships,
                        createdAt: memory.createdAt,
                        modifiedAt: memory.modifiedAt,
                        lastViewedAt: memory.lastViewedAt,
                        success: memory.success
                    },
                    createFolders: true
                }
            );

            this.eventManager.emit(EventTypes.MEMORY_CREATED, {
                type: memory.category,  // Changed from type to category
                title: memory.title,
                path: file.path
            });

            // Update index with settings path
            await this.updateIndex(memory);

            console.log('✅ Memory created:', this.safeStringify(memory));
            return file;
        } catch (error) {
            throw this.handleError('createMemory', error);
        }
    }

    /**
     * Update an existing memory
     */
    async updateMemory(memory: Memory): Promise<TFile> {
        try {
            const path = `${this.settings.rootPath}/${memory.title}.md`;
            const now = new Date().toISOString();
            const file = await this.vaultManager.createNote(
                path,
                memory.content,
                {
                    frontmatter: {
                        category: memory.category,  // Changed from type to category
                        description: memory.description,
                        tags: memory.tags,
                        relationships: memory.relationships,
                        createdAt: memory.createdAt,
                        modifiedAt: now,
                        lastViewedAt: memory.lastViewedAt,
                        success: memory.success
                    }
                }
            );

            this.eventManager.emit(EventTypes.MEMORY_UPDATED, {
                type: memory.category,  // Changed from type to category
                title: memory.title,
                path: file.path
            });

            return file;
        } catch (error) {
            throw this.handleError('updateMemory', error);
        }
    }

    /**
     * Delete a memory by title
     */
    async deleteMemory(title: string): Promise<void> {
        try {
            const path = `${this.settings.rootPath}/memories/${title}.md`;
            
            // Get memory type before deletion
            const metadata = await this.vaultManager.getNoteMetadata(path);
            const type = metadata?.type || 'episodic';
            
            await this.vaultManager.deleteNote(path);
            
            this.eventManager.emit(EventTypes.MEMORY_DELETED, {
                type,
                title,
                path
            });
        } catch (error) {
            throw this.handleError('deleteMemory', error);
        }
    }

    /**
     * Get a memory by its title
     */
    async getMemory(title: string): Promise<Memory | null> {
        try {
            const path = `${this.settings.rootPath}/memories/${title}.md`;
            const content = await this.vaultManager.readNote(path);
            const metadata = await this.vaultManager.getNoteMetadata(path);

            if (!content || !metadata) {
                return null;
            }

            // Increment hits counter
            const hits = (metadata?.hits || 0) + 1;
            await this.vaultManager.updateNoteMetadata(path, {
                ...metadata,
                hits,
                lastViewedAt: new Date().toISOString()
            });

            return {
                title,
                content,
                description: metadata.description,
                category: metadata.category,  // Changed from type to category
                tags: metadata.tags,
                relationships: metadata.relationships,
                createdAt: metadata.createdAt,
                modifiedAt: metadata.modifiedAt,
                lastViewedAt: metadata.lastViewedAt,
                success: metadata.success
            };
        } catch (error) {
            console.error(`Error retrieving memory: ${error.message}`);
            return null;
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
            const sectionTitle = this.getMemoryTypeSection(memory.category);  // Changed from type to category
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
            'Contextual Memories',
            'Search Results'  // Add search section
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
            contextual: 'Contextual Memories',
            search: 'Search Results'  // Add search section
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