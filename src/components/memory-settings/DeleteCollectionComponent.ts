import { Notice, Setting, ButtonComponent } from 'obsidian';
import { UsageStatsService, USAGE_EVENTS } from '../../database/services/UsageStatsService';
import { IVectorStore } from '../../database/interfaces/IVectorStore';
import { EmbeddingService } from '../../database/services/EmbeddingService';

/**
 * Component for managing collections in the memory settings
 * Provides UI for deleting and reindexing collections
 */
export class DeleteCollectionComponent {
    private containerEl: HTMLElement;
    private vectorStore: IVectorStore;
    private usageStatsService: UsageStatsService;
    private embeddingService: EmbeddingService;
    private settings: any;
    private deleteButtons: Map<string, ButtonComponent> = new Map();
    private reindexButtons: Map<string, ButtonComponent> = new Map();
    private collections: string[] = [];

    /**
     * Create a new delete collection component
     * @param containerEl Container element
     * @param vectorStore Vector store instance
     * @param usageStatsService Usage stats service instance
     * @param embeddingService Embedding service instance
     * @param settings Settings object
     */
    // Flag to prevent recursive refreshes
    private isRefreshing = false;
    // Track last refresh time to limit frequency
    private lastRefreshTime = 0;
    
    constructor(containerEl: HTMLElement, vectorStore: IVectorStore, usageStatsService: UsageStatsService, embeddingService: EmbeddingService, settings: any) {
        this.containerEl = containerEl;
        this.vectorStore = vectorStore;
        this.usageStatsService = usageStatsService;
        this.embeddingService = embeddingService;
        this.settings = settings;
        
        // Set up event listeners for collection updates - we're not using these to avoid cycles
        // Instead, we'll rely on explicit refresh calls from the parent component
    }

    /**
     * Refresh the collections list
     */
    async refresh(): Promise<void> {
        // Prevent recursive refreshes
        if (this.isRefreshing) {
            console.log('DeleteCollectionComponent: Already refreshing, skipping duplicate refresh');
            return;
        }
        
        // Add rate limiting for refreshes
        const minimumRefreshInterval = 3000; // 3 seconds
        const now = Date.now();
        
        if (this.lastRefreshTime && now - this.lastRefreshTime < minimumRefreshInterval) {
            console.log(`DeleteCollectionComponent: Refresh too frequent (${now - this.lastRefreshTime}ms < ${minimumRefreshInterval}ms), skipping`);
            return;
        }
        
        try {
            this.isRefreshing = true;
            this.lastRefreshTime = now;
            console.log('DeleteCollectionComponent: Refreshing collections list');
            
            // Get the current list of collections directly from the vector store
            // This is more reliable than going through the usage stats service
            this.collections = await this.vectorStore.listCollections();
            this.display();
        } catch (error) {
            console.error('Error refreshing collections:', error);
        } finally {
            this.isRefreshing = false;
        }
    }

    /**
     * Display the delete collection component
     */
    async display(): Promise<void> {
        // Clear the container first
        this.containerEl.empty();
        
        // Create section header
        this.containerEl.createEl('h3', { text: 'Manage Collections' });
        
        // Container for description and refresh button
        const headerContainer = this.containerEl.createEl('div', { cls: 'delete-collection-header' });
        
        // Create description
        headerContainer.createEl('p', { 
            text: 'Reindex collections with your current embedding model or delete collections to free up space.', 
            cls: 'delete-collection-description' 
        });
        
        // Add a refresh button at the top
        const refreshButton = headerContainer.createEl('button', {
            text: 'Refresh Collections',
            cls: 'refresh-collections-button mod-cta'
        });
        
        refreshButton.addEventListener('click', async () => {
            // Disable the button during refresh
            refreshButton.disabled = true;
            refreshButton.textContent = 'Refreshing...';
            
            try {
                // Force a refresh with 10 second timeout to prevent flooding
                if (this.lastRefreshTime && Date.now() - this.lastRefreshTime < 10000) {
                    new Notice('Please wait a few seconds before refreshing again');
                    return;
                }
                
                this.lastRefreshTime = Date.now();
                await this.usageStatsService.refreshStats();
                await this.refresh();
                new Notice('Collections refreshed successfully');
            } catch (error) {
                console.error('Error refreshing collections:', error);
                new Notice(`Error refreshing collections: ${error instanceof Error ? error.message : String(error)}`);
            } finally {
                // Re-enable the button
                setTimeout(() => {
                    refreshButton.disabled = false;
                    refreshButton.textContent = 'Refresh Collections';
                }, 2000); // Keep disabled for at least 2 seconds
            }
        });
        
        // If we don't have any collections, display a message
        if (!this.collections || this.collections.length === 0) {
            try {
                // Try to load collections first
                this.collections = await this.vectorStore.listCollections();
            } catch (error) {
                console.error('Error getting collections:', error);
            }
        }
        
        // Check again after attempting to load
        if (!this.collections || this.collections.length === 0) {
            this.containerEl.createEl('p', { 
                text: 'No collections found. Create embeddings first or refresh the collection list.',
                cls: 'no-collections-notice' 
            });
            
            // Add a refresh button
            const refreshButtonContainer = this.containerEl.createEl('div', { cls: 'refresh-button-container' });
            const refreshButton = refreshButtonContainer.createEl('button', {
                text: 'Refresh Collections',
                cls: 'mod-cta'
            });
            
            refreshButton.addEventListener('click', async () => {
                // Disable the button during refresh
                refreshButton.disabled = true;
                refreshButton.textContent = 'Refreshing...';
                
                try {
                    // Force a refresh with 10 second timeout to prevent flooding
                    if (this.lastRefreshTime && Date.now() - this.lastRefreshTime < 10000) {
                        new Notice('Please wait a few seconds before refreshing again');
                        return;
                    }
                    
                    this.lastRefreshTime = Date.now();
                    await this.usageStatsService.refreshStats();
                    await this.refresh();
                    new Notice('Collections refreshed successfully');
                } catch (error) {
                    console.error('Error refreshing collections:', error);
                    new Notice(`Error refreshing collections: ${error instanceof Error ? error.message : String(error)}`);
                } finally {
                    // Re-enable the button
                    setTimeout(() => {
                        refreshButton.disabled = false;
                        refreshButton.textContent = 'Refresh Collections';
                    }, 2000); // Keep disabled for at least 2 seconds
                }
            });
            
            return;
        }
        
        // Create a collection picker
        this.collections.forEach(collection => {
            const collectionRow = this.containerEl.createEl('div', { cls: 'collection-row' });
            
            const collectionName = collectionRow.createEl('span', { 
                text: collection,
                cls: 'collection-name'
            });
            
            // Create action buttons for this collection
            const actionsContainer = collectionRow.createEl('div', { cls: 'collection-actions' });
            
            // Create a reindex button for this collection
            const reindexButton = new ButtonComponent(actionsContainer)
                .setButtonText('Reindex')
                .setClass('collection-reindex-button')
                .onClick(async () => {
                    await this.handleReindexCollection(collection, reindexButton);
                });
            
            // Create a delete button for this collection
            const deleteButton = new ButtonComponent(actionsContainer)
                .setButtonText('Delete')
                .setClass('collection-delete-button')
                .onClick(async () => {
                    // Confirm deletion
                    const confirmMsg = `Are you sure you want to delete the "${collection}" collection? This cannot be undone.`;
                    
                    if (confirm(confirmMsg)) {
                        try {
                            // Disable the button during deletion
                            deleteButton.setDisabled(true);
                            deleteButton.setButtonText('Deleting...');
                            
                            // Delete the collection
                            await this.vectorStore.deleteCollection(collection);
                            
                            // Show a success message
                            new Notice(`Successfully deleted collection: ${collection}`);
                            
                            // Update usage stats immediately
                            try {
                                // First, update the usage stats service
                                await this.usageStatsService.refreshStats();
                                
                                // Then, set a flag in localStorage that our collection was deleted
                                // to notify other components
                                localStorage.setItem('claudesidian-collection-deleted', JSON.stringify({
                                    collection: collection,
                                    timestamp: Date.now()
                                }));
                                console.log(`Collection deleted and usage stats refreshed: ${collection}`);
                                
                                // Dispatch a storage event to ensure all components update
                                if (typeof StorageEvent === 'function' && typeof window.dispatchEvent === 'function') {
                                    window.dispatchEvent(new StorageEvent('storage', {
                                        key: 'claudesidian-collection-deleted',
                                        newValue: JSON.stringify({
                                            collection: collection,
                                            timestamp: Date.now()
                                        }),
                                        storageArea: localStorage
                                    }));
                                }
                            } catch (storageError) {
                                console.warn('Failed to update usage stats or set collection deletion marker:', storageError);
                            }
                            
                            // Remove the row
                            collectionRow.remove();
                            
                            // Remove from our collections list
                            this.collections = this.collections.filter(c => c !== collection);
                            
                            // If no collections left, refresh the whole component
                            if (this.collections.length === 0) {
                                this.refresh();
                            }
                        } catch (error) {
                            console.error(`Error deleting collection ${collection}:`, error);
                            new Notice(`Error deleting collection: ${error instanceof Error ? error.message : String(error)}`);
                            
                            // Re-enable the button
                            deleteButton.setDisabled(false);
                            deleteButton.setButtonText('Delete');
                        }
                    }
                });
                
            // Store the buttons for later reference
            this.deleteButtons.set(collection, deleteButton);
            this.reindexButtons.set(collection, reindexButton);
        });
        
        // Add a button to purge all collections
        const purgeContainer = this.containerEl.createEl('div', { cls: 'purge-all-container' });
        
        // Add warning text
        purgeContainer.createEl('p', { 
            text: 'Danger Zone: Delete all collections at once.',
            cls: 'danger-zone-text' 
        });
        
        // Add purge button
        const purgeButton = new ButtonComponent(purgeContainer)
            .setButtonText('Purge All Collections')
            .setClass('mod-warning')
            .onClick(async () => {
                // Confirm deletion
                const confirmMsg = `Are you sure you want to delete ALL collections? This cannot be undone and will require reindexing all your content.`;
                
                if (confirm(confirmMsg)) {
                    try {
                        // Disable the button during deletion
                        purgeButton.setDisabled(true);
                        purgeButton.setButtonText('Purging...');
                        
                        // Track success/failure
                        let successCount = 0;
                        let failureCount = 0;
                        
                        // Delete all collections
                        for (const collection of this.collections) {
                            try {
                                await this.vectorStore.deleteCollection(collection);
                                successCount++;
                            } catch (error) {
                                console.error(`Error deleting collection ${collection}:`, error);
                                failureCount++;
                            }
                        }
                        
                        // Show a success message
                        if (successCount > 0) {
                            new Notice(`Successfully deleted ${successCount} collections${failureCount > 0 ? ` (${failureCount} failed)` : ''}`);
                        } else {
                            new Notice(`Failed to delete any collections`);
                        }
                        
                        // Update usage stats immediately and communicate the change
                        try {
                            // First, update the usage stats service
                            await this.usageStatsService.refreshStats();
                            
                            // Then, set a flag in localStorage to notify other components
                            localStorage.setItem('claudesidian-collections-purged', JSON.stringify({
                                timestamp: Date.now(),
                                count: successCount
                            }));
                            console.log(`Collections purged and usage stats refreshed: ${successCount} collections`);
                            
                            // Dispatch a storage event to ensure all components update
                            if (typeof StorageEvent === 'function' && typeof window.dispatchEvent === 'function') {
                                window.dispatchEvent(new StorageEvent('storage', {
                                    key: 'claudesidian-collections-purged',
                                    newValue: JSON.stringify({
                                        timestamp: Date.now(),
                                        count: successCount
                                    }),
                                    storageArea: localStorage
                                }));
                            }
                        } catch (storageError) {
                            console.warn('Failed to update usage stats or set collections purged marker:', storageError);
                        }
                        
                        // Refresh the component
                        await this.refresh();
                    } catch (error) {
                        console.error('Error purging all collections:', error);
                        new Notice(`Error purging all collections: ${error instanceof Error ? error.message : String(error)}`);
                    } finally {
                        // Re-enable the button
                        purgeButton.setDisabled(false);
                        purgeButton.setButtonText('Purge All Collections');
                    }
                }
            });
    }
    
    /**
     * Handle reindexing a specific collection
     * @param collection Collection name to reindex
     * @param button Button component for UI feedback
     */
    private async handleReindexCollection(collection: string, button: ButtonComponent): Promise<void> {
        // Confirm reindexing
        const confirmMsg = `Are you sure you want to reindex the "${collection}" collection? This will refresh all embeddings for this collection.`;
        
        if (!confirm(confirmMsg)) {
            return;
        }
        
        try {
            // Disable the button during reindexing
            button.setDisabled(true);
            button.setButtonText('Reindexing...');
            
            // Show initial notice
            new Notice(`Starting reindex for collection: ${collection}`);
            
            // Handle different collection types differently
            if (collection === 'file_embeddings') {
                // Only file_embeddings should use the chunking strategy
                await this.reindexFileEmbeddings(button);
            } else {
                // Other collections (sessions, workspaces, memory_traces) should be handled as whole units
                await this.reindexMetadataCollection(collection, button);
            }
            
            // Show success message
            new Notice(`Successfully reindexed collection: ${collection}`);
            
            // Update usage stats
            try {
                await this.usageStatsService.refreshStats();
                
                // Set a flag in localStorage to notify other components
                localStorage.setItem('claudesidian-collection-reindexed', JSON.stringify({
                    collection: collection,
                    timestamp: Date.now()
                }));
                
                // Dispatch a storage event to ensure all components update
                if (typeof StorageEvent === 'function' && typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new StorageEvent('storage', {
                        key: 'claudesidian-collection-reindexed',
                        newValue: JSON.stringify({
                            collection: collection,
                            timestamp: Date.now()
                        }),
                        storageArea: localStorage
                    }));
                }
            } catch (statsError) {
                console.warn('Failed to update usage stats after reindexing:', statsError);
            }
            
        } catch (error) {
            console.error(`Error reindexing collection ${collection}:`, error);
            new Notice(`Error reindexing collection: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            // Re-enable the button
            button.setDisabled(false);
            button.setButtonText('Reindex');
        }
    }
    
    /**
     * Reindex file embeddings using the chunking strategy from settings
     */
    private async reindexFileEmbeddings(button: ButtonComponent): Promise<void> {
        // Get all markdown files in the vault
        const app = (window as any).app;
        if (!app || !app.vault) {
            throw new Error('Obsidian app or vault not available');
        }
        
        const allFiles = app.vault.getMarkdownFiles();
        const filePaths = allFiles.map((file: any) => file.path);
        
        // Create a progress callback
        const progressCallback = (processed: number, total: number, currentFile?: string) => {
            const percentage = Math.round((processed / total) * 100);
            button.setButtonText(`Reindexing... ${percentage}%`);
            
            if (currentFile) {
                console.log(`Reindexing file_embeddings: ${processed}/${total} - ${currentFile}`);
            }
        };
        
        // Use the embedding service to reindex the files with chunking
        await this.embeddingService.incrementalIndexFiles(filePaths, progressCallback);
    }
    
    /**
     * Reindex metadata collections (sessions, workspaces, memory_traces) without chunking
     */
    private async reindexMetadataCollection(collection: string, button: ButtonComponent): Promise<void> {
        button.setButtonText('Reindexing...');
        
        try {
            // Get the plugin instance to access collection-specific reindexing
            const plugin = (window as any).app.plugins.plugins['claudesidian-mcp'];
            if (!plugin) {
                throw new Error('Plugin not found');
            }
            
            console.log(`🔄 Starting reindex for collection: ${collection}`);
            
            // Step 1: Get existing data from the collection before clearing it
            button.setButtonText('Backing up data...');
            const existingItems = await this.vectorStore.getItems(collection, [], ['documents', 'metadatas']);
            console.log(`🔄 Found ${existingItems.ids?.length || 0} existing items in ${collection}`);
            
            if (!existingItems.ids || existingItems.ids.length === 0) {
                let message = `Collection "${collection}" is empty. `;
                switch (collection) {
                    case 'sessions':
                        message += 'Sessions are created automatically when you use the plugin with workspaces.';
                        break;
                    case 'workspaces':
                        message += 'Create workspaces through the Memory Manager to populate this collection.';
                        break;
                    case 'memory_traces':
                        message += 'Memory traces are created automatically as you work with files and use the plugin.';
                        break;
                    default:
                        message += 'Nothing to reindex.';
                }
                new Notice(message);
                return;
            }
            
            // Step 2: Clear the collection
            button.setButtonText('Clearing collection...');
            await this.vectorStore.deleteCollection(collection);
            
            // Step 3: Re-embed the existing data with current settings
            button.setButtonText('Re-embedding data...');
            console.log(`🔄 Re-embedding ${existingItems.ids.length} items for ${collection}`);
            
            const reembeddedItems = [];
            for (let i = 0; i < existingItems.ids.length; i++) {
                const id = existingItems.ids[i];
                const document = existingItems.documents?.[i] || '';
                const metadata = existingItems.metadatas?.[i] || {};
                
                // Get new embedding for the document text
                const embedding = await this.embeddingService.getEmbedding(document);
                
                if (embedding) {
                    reembeddedItems.push({
                        id: id,
                        embedding: embedding,
                        document: document,
                        metadata: metadata
                    });
                }
                
                // Update progress
                const progress = Math.round(((i + 1) / existingItems.ids.length) * 100);
                button.setButtonText(`Re-embedding... ${progress}%`);
            }
            
            // Step 4: Add the re-embedded items back to the collection
            if (reembeddedItems.length > 0) {
                button.setButtonText('Saving data...');
                await this.vectorStore.addItems(collection, {
                    ids: reembeddedItems.map(item => item.id),
                    embeddings: reembeddedItems.map(item => item.embedding),
                    documents: reembeddedItems.map(item => item.document),
                    metadatas: reembeddedItems.map(item => item.metadata)
                });
            }
            
            console.log(`🔄 Successfully reindexed ${reembeddedItems.length} items in ${collection}`);
            new Notice(`Successfully reindexed ${reembeddedItems.length} items in ${collection} collection.`);
            
        } catch (error) {
            console.error(`Error reindexing ${collection}:`, error);
            // If collection doesn't exist, that's fine
            if (error instanceof Error && error.message.includes('not found')) {
                new Notice(`Collection "${collection}" was already empty.`);
            } else {
                throw error;
            }
        }
    }
}