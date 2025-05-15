/**
 * Memory settings interface
 * Contains configuration for memory management and embedding providers
 */
export interface MemorySettings {
    // OpenAI API settings
    openaiApiKey: string;
    openaiOrganization?: string;
    
    // Embedding model settings
    embeddingModel: string;
    dimensions: number;
    
    // Rate limiting settings
    apiRateLimitPerMinute: number;
    maxTokensPerMonth: number;
    
    // Storage settings
    storageLocation: string;
    maxStorageSize: number; // in MB
    
    // Indexing settings
    autoIndexNotes: boolean;
    excludeFolders: string[];
    chunkSize: number;
    chunkOverlap: number;
}

/**
 * Default memory settings
 */
export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
    openaiApiKey: '',
    openaiOrganization: undefined,
    embeddingModel: 'text-embedding-3-small',
    dimensions: 1536,
    apiRateLimitPerMinute: 60,
    maxTokensPerMonth: 1000000,
    storageLocation: 'default',
    maxStorageSize: 100, // 100 MB
    autoIndexNotes: true,
    excludeFolders: ['node_modules', '.git', '.obsidian'],
    chunkSize: 1000,
    chunkOverlap: 100
};

/**
 * Memory item interface
 * Represents a single memory item in the database
 */
export interface MemoryItem {
    id: string;
    path: string;
    text: string;
    embedding: number[];
    metadata: MemoryItemMetadata;
    createdAt: number;
    updatedAt: number;
}

/**
 * Memory item metadata interface
 * Contains additional information about the memory item
 */
export interface MemoryItemMetadata {
    title: string;
    tags: string[];
    properties: Record<string, any>;
    type: 'note' | 'chunk' | 'custom';
    tokenCount: number;
    sourceChunk?: {
        start: number;
        end: number;
        noteId: string;
    };
}

/**
 * Memory query interface
 * Used for querying the memory database
 */
export interface MemoryQuery {
    text: string;
    limit?: number;
    threshold?: number;
    filters?: MemoryQueryFilters;
}

/**
 * Memory query filters interface
 * Used for filtering query results
 */
export interface MemoryQueryFilters {
    paths?: string[];
    tags?: string[];
    properties?: Record<string, any>;
    types?: ('note' | 'chunk' | 'custom')[];
    dateRange?: {
        start?: number;
        end?: number;
    };
}

/**
 * Memory query result interface
 * Represents a single result from a memory query
 */
export interface MemoryQueryResult {
    item: MemoryItem;
    score: number;
}

/**
 * Memory usage statistics interface
 * Contains usage statistics for the memory system
 */
export interface MemoryUsageStats {
    itemCount: number;
    totalTokens: number;
    storageUsed: number; // in bytes
    lastIndexed: number;
    monthlyApiUsage: {
        tokens: number;
        requests: number;
        lastReset: number;
    };
}
