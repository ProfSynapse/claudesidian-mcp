import { TFile } from 'obsidian';
import { VaultManager } from './VaultManager';
import { injectable } from 'inversify';
import type { MCPSettings } from '../settings';
import { DEFAULT_SETTINGS } from '../settings';
import { EventManager, EventTypes } from './EventManager';
import { ProceduralPattern, ProceduralStep } from '../types';
import { IndexManager } from './IndexManager';

export interface Memory {
    title: string;
    description: string;
    content: string;
    category: MemoryType;
    tags: string[];
    relationships?: Array<{
        relation: string;
        hits: number;
    }>;
    createdAt: string;
    modifiedAt?: string;
    lastViewedAt?: string;
    success?: boolean;
    pattern?: ProceduralPattern;
    metadata?: {
        accessCount?: number;
        lastAccessed?: number;
        importance?: number;
    };
}

export const MemoryTypes = [
    'Core',
    'Episodic',
    'Semantic',
    'Procedural',
    'Emotional',
    'Contextual',
    'Search'
] as const;

export type MemoryType = typeof MemoryTypes[number];

interface MemoryMetadata {
    category: MemoryType;
    description: string;
    tags: string[];
    createdAt: string;
    modifiedAt?: string;
    lastViewedAt?: string;
    hits: number;
    pattern?: ProceduralPattern;
}

interface MemoryFile extends TFile {
    metadata?: {
        type?: MemoryType;
        categories?: string[];
    };
}

@injectable()
export class MemoryManager {
    private settings: MCPSettings;
    private memoryCache: Map<string, Memory> = new Map();
    private vaultManager: VaultManager;
    private folderInitialized: boolean = false;
    private indexReviewed: boolean = false;
    private readonly RETRY_DELAYS = {
        SHORT: 100,  // Reduced from 500ms
        LONG: 200    // Reduced from 1000ms
    };

    private ensureIndexReviewed(): void {
        if (!this.indexReviewed) {
            throw new Error('reviewIndex must be the first action. Please review the memory index before proceeding.');
        }
    }

    public setIndexReviewed(): void {
        this.indexReviewed = true;
    }

    constructor(
        vaultManager: VaultManager,
        private eventManager: EventManager,
        private indexManager: IndexManager,
        settings?: MCPSettings
    ) {
        this.vaultManager = vaultManager;
        this.settings = settings || DEFAULT_SETTINGS;
    }

    private getMemoryFolderPath(): string {
        return `${this.settings.rootPath}/memory`;
    }

    private getMemoryPath(title: string): string {
        return `${this.getMemoryFolderPath()}/${title}.md`;
    }

    private getIndexPath(): string {
        return `${this.settings.rootPath}/index.md`;
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

    async createProceduralMemory(title: string, description: string, pattern: ProceduralPattern): Promise<Memory> {
        try {
            const memory: Memory = {
                title,
                description,
                content: JSON.stringify(pattern, null, 2),
                category: 'Procedural',
                tags: ['Procedural', 'pattern'],
                createdAt: new Date().toISOString(),
                success: pattern.success,
                pattern,
                metadata: {
                    accessCount: 0,
                    lastAccessed: Date.now(),
                    importance: 0
                }
            };

            await this.createMemory(memory);
            return memory;
        } catch (error) {
            throw this.handleError('createProceduralMemory', error);
        }
    }

    async updatePatternStats(title: string, success: boolean): Promise<void> {
        try {
            const memory = await this.getMemory(title);
            if (!memory?.pattern) return;

            const now = new Date().toISOString();
            memory.pattern.success = success;
            memory.pattern.usageCount++;
            memory.pattern.lastUsed = now;

            memory.content = JSON.stringify(memory.pattern, null, 2);
            memory.success = success;
            memory.modifiedAt = now;

            await this.updateMemory(memory);
        } catch (error) {
            throw this.handleError('updatePatternStats', error);
        }
    }

    private async ensureMemoryFolder(): Promise<void> {
        if (this.folderInitialized) return;
        
        const memoryFolder = this.getMemoryFolderPath();
        const exists = await this.vaultManager.folderExists(memoryFolder);
        
        if (!exists) {
            await this.vaultManager.createFolder(memoryFolder);
            await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAYS.SHORT));
        }
        
        this.folderInitialized = true;
    }

    async createMemory(memory: Memory, retries = 3): Promise<TFile> {
        this.ensureIndexReviewed();
        try {
            console.log('📝 Creating new memory:', memory.title);
            await this.ensureMemoryFolder();
            
            const safeTitle = memory.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_|_$/g, '');
            
            const path = this.getMemoryPath(safeTitle);
            
            // Format memory content for storage
            const formattedContent = this.formatMemoryContent(memory);
            
            // Create note with retries
            let file: TFile | null = null;
            for (let i = 0; i < retries; i++) {
                try {
                    file = await this.vaultManager.createNote(
                        path,
                        formattedContent.content,
                        {
                            frontmatter: formattedContent.frontmatter,
                            createFolders: true
                        }
                    );
                    break;
                } catch (error) {
                    console.warn(`Attempt ${i + 1} to create note failed:`, error);
                    if (i === retries - 1) throw error;
                    await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAYS.LONG));
                }
            }

            if (!file) throw new Error('Failed to create memory note after retries');
            
            // Cache the memory
            this.memoryCache.set(safeTitle, memory);

            // Update index first
            await this.updateIndex(memory);

            // Then emit event for other subscribers
            this.eventManager.emit(EventTypes.MEMORY_CREATED, {
                type: memory.category,
                title: memory.title,
                path: file.path,
                memoryType: memory.category === 'Search' ? undefined : memory.category,
                metadata: memory.metadata
            });

            return file;
        } catch (error) {
            throw this.handleError('createMemory', error);
        }
    }

    async updateMemory(memory: Memory): Promise<TFile> {
        this.ensureIndexReviewed();
        try {
            const path = this.getMemoryPath(memory.title);
            const now = new Date().toISOString();
            memory.modifiedAt = now;

            // Format memory content using the new structure
            const formattedContent = this.formatMemoryContent(memory);
            
            const file = await this.vaultManager.createNote(
                path,
                formattedContent.content,
                { frontmatter: formattedContent.frontmatter }
            );

            // Update cache
            this.memoryCache.set(memory.title, memory);

            // Update index first
            await this.updateIndex(memory);

            // Then emit event for other subscribers
            this.eventManager.emit(EventTypes.MEMORY_UPDATED, {
                type: memory.category,
                title: memory.title,
                path: file.path,
                memoryType: memory.category === 'Search' ? undefined : memory.category,
                timestamp: Date.now(),
                metadata: memory.metadata
            });

            return file;
        } catch (error) {
            throw this.handleError('updateMemory', error);
        }
    }

    private async updateIndex(memory: Memory): Promise<void> {
        // Create structured entry for index
        await this.indexManager.addToIndex({
            title: memory.title,
            description: memory.description,
            section: memory.category,
            type: memory.category,
            timestamp: Date.now(),
            tags: memory.tags,
            relationships: memory.relationships?.map(r => r.relation),
            context: memory.content
        });

        // Also emit event for other subscribers
        this.eventManager.emit(EventTypes.MEMORY_CREATED, {
            type: 'memory:created',
            title: memory.title,
            path: this.getMemoryPath(memory.title),
            description: memory.description,
            tags: memory.tags,
            relationships: memory.relationships?.map(r => r.relation),
            timestamp: Date.now(),
            context: memory.content,
            memoryType: memory.category === 'Search' ? undefined : memory.category,
            metadata: memory.metadata
        });
    }

    async trackMemoryAccess(title: string): Promise<void> {
        this.ensureIndexReviewed();
        // Check cache first
        let memory = this.memoryCache.get(title);
        if (!memory) {
            memory = await this.getMemory(title);
            if (!memory) return;
        }

        const now = new Date().toISOString();
        const accessCount = (memory.metadata?.accessCount || 0) + 1;
        
        // Update memory with new access info
        const updatedMemory = {
            ...memory,
            lastViewedAt: now,
            metadata: {
                ...memory.metadata,
                accessCount,
                lastAccessed: Date.now(),
                importance: Math.min(100, (memory.metadata?.importance || 0) + 1) // Increase importance with use
            }
        };

        // Update cache immediately
        this.memoryCache.set(title, updatedMemory);

        // Emit event before file update for faster UI response
        this.eventManager.emit(EventTypes.MEMORY_ACCESSED, {
            type: 'memory_accessed',
            title,
            path: this.getMemoryPath(title),
            timestamp: Date.now(),
            accessCount,
            description: memory.description,
            metadata: updatedMemory.metadata
        });

        // Update file asynchronously
        await this.updateMemory(updatedMemory);
    }

    private handleError(operation: string, error: any): Error {
        const message = error instanceof Error ? error.message : String(error);
        return new Error(`MemoryManager.${operation}: ${message}`);
    }

    async getMemoriesByType(type: MemoryType): Promise<Memory[]> {
        this.ensureIndexReviewed();
        try {
            const files = await this.vaultManager.listNotes(this.getMemoryFolderPath());
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

    private formatMemoryContent(memory: Memory): { content: string; frontmatter: any } {
        // Store all structured data in frontmatter
        const frontmatter = {
            category: memory.category,
            description: memory.description,
            tags: memory.tags,
            relationships: memory.relationships,
            createdAt: memory.createdAt,
            modifiedAt: memory.modifiedAt,
            lastViewedAt: memory.lastViewedAt,
            success: memory.success,
            pattern: memory.pattern,
            metadata: memory.metadata
        };

        // Create human-readable content
        const content = [
            `# ${memory.title}`,
            '',
            memory.description,
            '',
            '## Relationships',
            ...(memory.relationships?.map(r => `- ${r.relation} (${r.hits} hits)`) || []),
            '',
            memory.pattern ? '## Pattern' : '',
            memory.pattern ? '```json\n' + JSON.stringify(memory.pattern, null, 2) + '\n```' : ''
        ].filter(Boolean).join('\n');

        return { content, frontmatter };
    }

    async getMemory(title: string): Promise<Memory | undefined> {
        if (title === 'memory_traversal_guide') {
            return this.memoryCache.get(title);
        }
        this.ensureIndexReviewed();
        try {
            // Check cache first
            const cached = this.memoryCache.get(title);
            if (cached) {
                return cached;
            }

            const path = this.getMemoryPath(title);
            const metadata = await this.vaultManager.getNoteMetadata(path);
            
            if (!metadata) return undefined;

            // Only read content if needed
            const content = await this.vaultManager.readNote(path);
            if (!content) return undefined;

            const memory: Memory = {
                title,
                content,
                description: metadata.description,
                category: metadata.category,
                tags: metadata.tags,
                relationships: metadata.relationships,
                createdAt: metadata.createdAt,
                modifiedAt: metadata.modifiedAt,
                lastViewedAt: metadata.lastViewedAt,
                success: metadata.success,
                pattern: metadata.pattern,
                metadata: {
                    ...metadata.metadata,
                    accessCount: metadata.metadata?.accessCount || 0,
                    lastAccessed: metadata.metadata?.lastAccessed || Date.now(),
                    importance: metadata.metadata?.importance || 0
                }
            };

            // Cache the memory
            this.memoryCache.set(title, memory);
            return memory;
        } catch (error) {
            console.error(`Error retrieving memory: ${error.message}`);
            return undefined;
        }
    }

    // Clear cache when plugin is disabled
    clearCache(): void {
        this.memoryCache.clear();
        this.folderInitialized = false;
    }
}
