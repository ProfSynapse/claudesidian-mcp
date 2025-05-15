import { App, Events, Notice } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { schema } from './config';
import { VectorStore, createVectorStore } from './db/memory-db';
import { OpenAIEmbeddingProvider } from './providers/openai-provider';
import { BaseEmbeddingProvider, DummyEmbeddingProvider } from './providers/embeddings-provider';
import { 
    DatabaseOperations,
    FileEventOperations,
    IndexingOperations,
    QueryOperations,
    UsageStatsOperations
} from './utils';
import { 
    QueryMemoryMode, 
    IndexFileMode, 
    GetStatusMode, 
    BatchIndexMode, 
    BatchQueryMode 
} from './modes';
import { 
    MemorySettings, 
    MemoryQueryParams, 
    MemoryQueryResult,
    MemoryUsageStats
} from '../../types';

/**
 * Memory Manager Agent
 * Provides embedding-based semantic search capabilities for the vault
 */
export class MemoryManager extends BaseAgent {
    // Database connection
    private db: VectorStore | null = null;
    
    // Embedding provider
    private provider: BaseEmbeddingProvider | null = null;
    
    // Track ongoing operations
    private indexingInProgress: boolean = false;
    private lastIndexed: Date | null = null;
    
    // Usage statistics
    private usageStats: MemoryUsageStats = {
        tokensThisMonth: 0,
        totalEmbeddings: 0,
        dbSizeMB: 0,
        lastIndexedDate: '',
        indexingInProgress: false
    };
    
    // Settings
    private settings: MemorySettings;
    
    // App instance
    private app: App;
    
    // Events instance
    private events: Events;
    
    constructor(app: App, events: Events) {
        super(
            'memoryManager',
            'Memory Manager for semantic search and retrieval',
            '1.0.0'
        );
        
        this.app = app;
        this.events = events;
        
        // Register modes
        this.registerModes();
        
        // Initialize with default settings
        // These will be updated when plugin settings are loaded
        this.settings = {
            enabled: false,
            apiProvider: 'openai',
            openaiApiKey: '',
            embeddingModel: 'text-embedding-3-small',
            dimensions: 1536,
            maxTokensPerMonth: 1000000,
            apiRateLimitPerMinute: 500,
            chunkStrategy: 'paragraph',
            chunkSize: 512,
            chunkOverlap: 50,
            includeFrontmatter: true,
            excludePaths: ['.obsidian/**/*', 'node_modules/**/*'],
            minContentLength: 50,
            indexingSchedule: 'on-save',
            batchSize: 10,
            concurrentRequests: 3,
            dbStoragePath: '',
            autoCleanOrphaned: true,
            maxDbSize: 500,
            pruningStrategy: 'least-used',
            defaultResultLimit: 10,
            includeNeighbors: true,
            graphBoostFactor: 0.3,
            backlinksEnabled: true,
            backlinksWeight: 0.5,
            useFilters: true,
            defaultThreshold: 0.7
        };
    }
    
    /**
     * Register modes for the Memory Manager agent
     */
    private registerModes(): void {
        // Register all available modes
        this.registerMode(new QueryMemoryMode(this));
        this.registerMode(new IndexFileMode(this));
        this.registerMode(new GetStatusMode(this));
        this.registerMode(new BatchIndexMode(this));
        this.registerMode(new BatchQueryMode(this));
    }
    
    /**
     * Initialize the Memory Manager
     * Sets up the database and embedding provider
     */
    async initialize(): Promise<void> {
        // Skip initialization if not enabled
        if (!this.settings.enabled) {
            return;
        }
        
        try {
            // Initialize the database
            this.db = await createVectorStore('indexeddb', {
                dbName: 'claudesidian-memory',
                storeName: 'embeddings',
                version: 1
            });
            
            // Explicitly initialize the database before using it
            await this.db.initialize();
            
            // Get database stats
            await DatabaseOperations.updateDatabaseStats(this.db, this.usageStats);
            
            // Initialize the embedding provider
            this.initializeProvider();
            
            // Subscribe to file modifications if 'on-save' indexing is enabled
            if (this.settings.indexingSchedule === 'on-save') {
                FileEventOperations.registerFileEvents(
                    this.app, 
                    this.settings, 
                    this.db, 
                    this.provider, 
                    this.usageStats, 
                    this.indexingInProgress
                );
            }
            
            // Load usage statistics from localStorage
            UsageStatsOperations.loadUsageStats(this.usageStats);
            
            // Schedule cleanup if needed, with error handling
            if (this.settings.autoCleanOrphaned) {
                setTimeout(async () => {
                    try {
                        await this.cleanOrphanedEmbeddings();
                    } catch (cleanupError) {
                        console.error('Error during scheduled orphaned embeddings cleanup:', cleanupError);
                        // Don't allow this error to affect plugin operation
                    }
                }, 5000);
            }
        } catch (error) {
            console.error('Failed to initialize Memory Manager:', error);
            new Notice('Failed to initialize Memory Manager');
        }
    }
    
    /**
     * Initialize the Memory Manager with specific settings
     * This is a custom method not in the base class
     */
    async initializeWithSettings(settings: MemorySettings): Promise<void> {
        this.settings = settings;
        await this.initialize();
    }
    
    /**
     * Initialize the embedding provider based on settings
     */
    private initializeProvider(): void {
        if (this.settings.apiProvider === 'openai' && this.settings.openaiApiKey) {
            this.provider = new OpenAIEmbeddingProvider(this.settings);
        } else {
            // Use a dummy provider for testing/development or if API key is not provided
            this.provider = new DummyEmbeddingProvider(this.settings.dimensions);
        }
    }
    
    /**
     * Query the memory database for semantically similar content
     */
    async query(params: MemoryQueryParams): Promise<MemoryQueryResult> {
        return QueryOperations.query(this.db, this.provider, params, this.settings);
    }
    
    /**
     * Index a file from the vault
     * 
     * @param filePath Path to the file to index
     * @param force Whether to force re-indexing even if the file hasn't changed
     */
    async indexFile(filePath: string, force: boolean = false): Promise<{
        success: boolean;
        chunks?: number;
        error?: string;
        filePath: string;
    }> {
        return IndexingOperations.indexFile(
            this.app,
            this.db,
            this.provider,
            filePath,
            this.settings,
            this.usageStats,
            force
        );
    }
    
    /**
     * Delete all embeddings for a file
     */
    async deleteEmbeddingsForFile(filePath: string): Promise<void> {
        await DatabaseOperations.deleteEmbeddingsForFile(this.db, filePath);
    }
    
    /**
     * Clean up orphaned embeddings (files that no longer exist)
     */
    async cleanOrphanedEmbeddings(): Promise<void> {
        await DatabaseOperations.cleanOrphanedEmbeddings(
            this.app, 
            this.db, 
            this.usageStats
        );
    }
    
    /**
     * Reset monthly token counter
     */
    async resetUsageStats(): Promise<void> {
        UsageStatsOperations.resetUsageStats(this.usageStats);
    }
    
    /**
     * Get usage statistics
     */
    getUsageStats(): MemoryUsageStats {
        return {
            ...this.usageStats,
            indexingInProgress: this.indexingInProgress
        };
    }
    
    /**
     * Reindex all files in the vault
     */
    async reindexAll(): Promise<{
        success: boolean;
        processed: number;
        failed: number;
        error?: string;
    }> {
        if (this.indexingInProgress) {
            return {
                success: false,
                processed: 0,
                failed: 0,
                error: 'Indexing is already in progress'
            };
        }
        
        this.indexingInProgress = true;
        this.usageStats.indexingInProgress = true;
        
        try {
            return await IndexingOperations.reindexAll(
                this.app,
                this.db,
                this.provider,
                this.settings,
                this.usageStats,
                this.events
            );
        } finally {
            this.indexingInProgress = false;
            this.usageStats.indexingInProgress = false;
        }
    }
    
    /**
     * Update settings
     */
    updateSettings(settings: MemorySettings): void {
        const wasEnabled = this.settings.enabled;
        const newEnabled = settings.enabled;
        
        // Update settings
        this.settings = settings;
        
        // Handle enable/disable state changes
        if (!wasEnabled && newEnabled) {
            // Was disabled, now enabled - initialize
            this.initializeWithSettings(settings);
        } else if (wasEnabled && !newEnabled) {
            // Was enabled, now disabled - clean up
            if (this.db) {
                this.db.close();
                this.db = null;
            }
            this.provider = null;
        } else if (wasEnabled && newEnabled) {
            // Still enabled, but settings might have changed
            
            // Update provider if API settings changed
            if (
                this.settings.apiProvider !== settings.apiProvider ||
                this.settings.openaiApiKey !== settings.openaiApiKey ||
                this.settings.embeddingModel !== settings.embeddingModel ||
                this.settings.dimensions !== settings.dimensions
            ) {
                this.initializeProvider();
            }
            
            // Update event listeners if indexing schedule changed
            if (this.settings.indexingSchedule !== settings.indexingSchedule) {
                // Register new listeners if needed
                if (settings.indexingSchedule === 'on-save') {
                    FileEventOperations.registerFileEvents(
                        this.app, 
                        this.settings, 
                        this.db, 
                        this.provider, 
                        this.usageStats, 
                        this.indexingInProgress
                    );
                }
            }
        }
    }
    
    /**
     * Get name of the agent
     */
    getName(): string {
        return 'memoryManager';
    }
    
    /**
     * Get icon for the agent
     */
    getIcon(): string {
        return 'brain';
    }
    
    /**
     * Clean up resources when the plugin is disabled
     */
    onunload(): void {
        if (this.db) {
            this.db.close();
        }
    }
}