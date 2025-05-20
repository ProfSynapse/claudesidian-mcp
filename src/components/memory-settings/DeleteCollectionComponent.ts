import { Notice, Setting, ButtonComponent } from 'obsidian';
import { UsageStatsService, USAGE_EVENTS } from '../../database/services/UsageStatsService';
import { IVectorStore } from '../../database/interfaces/IVectorStore';

/**
 * Component for deleting collections in the memory settings
 * Provides UI for deleting embeddings by collection
 */
export class DeleteCollectionComponent {
    private containerEl: HTMLElement;
    private vectorStore: IVectorStore;
    private usageStatsService: UsageStatsService;
    private settings: any;
    private deleteButtons: Map<string, ButtonComponent> = new Map();
    private collections: string[] = [];

    /**
     * Create a new delete collection component
     * @param containerEl Container element
     * @param vectorStore Vector store instance
     * @param usageStatsService Usage stats service instance
     * @param settings Settings object
     */
    // Flag to prevent recursive refreshes
    private isRefreshing: boolean = false;
    // Track last refresh time to limit frequency
    private lastRefreshTime: number = 0;
    
    constructor(containerEl: HTMLElement, vectorStore: IVectorStore, usageStatsService: UsageStatsService, settings: any) {
        this.containerEl = containerEl;
        this.vectorStore = vectorStore;
        this.usageStatsService = usageStatsService;
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
        this.containerEl.createEl('h3', { text: 'Delete Collection' });
        
        // Container for description and refresh button
        const headerContainer = this.containerEl.createEl('div', { cls: 'delete-collection-header' });
        
        // Create description
        headerContainer.createEl('p', { 
            text: 'Delete a specific collection to free up space. This cannot be undone.', 
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
            
            // Create a delete button for this collection
            const deleteContainer = collectionRow.createEl('div', { cls: 'collection-actions' });
            const deleteButton = new ButtonComponent(deleteContainer)
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
                
            // Store the button for later reference
            this.deleteButtons.set(collection, deleteButton);
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
}