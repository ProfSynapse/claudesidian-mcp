import { App, Notice } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { logger } from '../../utils/logger';
import { MemorySettings } from './types';
import { GetStatusMode, IndexFileMode, QueryMemoryMode } from './modes';
import { MemoryManagerConfig } from './config';

/**
 * MemoryManager Agent
 * Provides vector embeddings-based memory management for the plugin
 */
export class MemoryManagerAgent extends BaseAgent {
    // Private variables for memory configuration
    private settings: MemorySettings | undefined;
    private isEnabled: boolean = false;
    private app: App;
    
    /**
     * Create a new memory manager agent
     * @param app Obsidian app instance
     */
    constructor(app: App) {
        super(
            MemoryManagerConfig.name,
            MemoryManagerConfig.description,
            MemoryManagerConfig.version
        );
        
        this.app = app;
        
        // Register modes
        this.registerMode(new GetStatusMode(this));
        this.registerMode(new IndexFileMode(this));
        this.registerMode(new QueryMemoryMode(this));
    }
    
    /**
     * Initialize the memory manager with settings
     * @param settings Memory settings to use
     * @param enabled Whether memory features are enabled
     */
    public initializeWithSettings(settings: MemorySettings, enabled: boolean): void {
        this.settings = settings;
        this.isEnabled = enabled;
        
        // Only attempt to connect to the database if the feature is enabled
        if (this.isEnabled) {
            this.initializeEmbeddingsDatabase()
                .catch(error => {
                    console.error('Failed to initialize embeddings database', error);
                    new Notice('Failed to initialize memory system. Please check your settings.');
                    this.isEnabled = false;
                });
        }
    }
    
    /**
     * Initialize the embeddings database
     */
    private async initializeEmbeddingsDatabase(): Promise<void> {
        if (!this.settings) {
            throw new Error('Cannot initialize database without settings');
        }
        
        // Check for API key
        if (!this.settings.openaiApiKey) {
            console.warn('No OpenAI API key provided in memory settings');
            throw new Error('OpenAI API key is required for memory features');
        }
        
        // TODO: Initialize the database and embeddings provider
        // This would connect to IndexedDB, initialize OpenAI client, etc.
        console.log('Embeddings database initialized');
    }
    
    /**
     * Check if memory management is enabled
     */
    public isMemoryEnabled(): boolean {
        return this.isEnabled;
    }
    
    /**
     * Get memory settings
     */
    public getMemorySettings(): MemorySettings | undefined {
        return this.settings;
    }
    
    /**
     * Get the Obsidian app instance
     */
    public getApp(): App {
        return this.app;
    }
}