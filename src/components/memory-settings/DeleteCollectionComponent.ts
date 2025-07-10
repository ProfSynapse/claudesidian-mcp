import { Notice, ButtonComponent } from 'obsidian';
import { UsageStatsService } from '../../database/services/UsageStatsService';
import { IVectorStore } from '../../database/interfaces/IVectorStore';

/**
 * Component for deleting collections in the memory settings
 * Single Responsibility: Only handles deletion operations
 */
export class DeleteCollectionComponent {
    private containerEl: HTMLElement;
    private vectorStore: IVectorStore;
    private usageStatsService: UsageStatsService;
    private settings: any;
    private deleteButtons: Map<string, ButtonComponent> = new Map();
    private collections: string[] = [];

    constructor(containerEl: HTMLElement, vectorStore: IVectorStore, usageStatsService: UsageStatsService, settings: any) {
        this.containerEl = containerEl;
        this.vectorStore = vectorStore;
        this.usageStatsService = usageStatsService;
        this.settings = settings;
    }

    /**
     * Set the collections to display delete buttons for
     */
    setCollections(collections: string[]): void {
        this.collections = collections;
    }

    /**
     * Display delete buttons for each collection
     */
    display(): void {
        // Clear previous buttons
        this.containerEl.empty();
        this.deleteButtons.clear();

        // Create section header
        this.containerEl.createEl('h4', { text: 'Delete Collections' });
        
        // Create description
        this.containerEl.createEl('p', { 
            text: 'Permanently delete collections to free up space. This removes ALL data and cannot be undone.',
            cls: 'delete-collection-description' 
        });

        if (this.collections.length === 0) {
            this.containerEl.createEl('p', { 
                text: 'No collections found to delete.',
                cls: 'no-collections-notice' 
            });
            return;
        }

        // Create delete buttons for each collection
        this.collections.forEach(collection => {
            const collectionRow = this.containerEl.createEl('div', { cls: 'collection-row' });
            
            const collectionName = collectionRow.createEl('span', { 
                text: collection,
                cls: 'collection-name'
            });
            
            // Create delete button
            const actionsContainer = collectionRow.createEl('div', { cls: 'collection-actions' });
            const deleteButton = new ButtonComponent(actionsContainer)
                .setButtonText('Delete')
                .setClass('collection-delete-button')
                .onClick(async () => {
                    await this.handleDeleteCollection(collection, deleteButton, collectionRow);
                });
            
            // Add the mod-warning class separately
            deleteButton.buttonEl.addClass('mod-warning');
            
            this.deleteButtons.set(collection, deleteButton);
        });

        // Add purge all button
        this.addPurgeAllButton();
    }

    /**
     * Handle deleting a specific collection
     */
    private async handleDeleteCollection(collection: string, deleteButton: ButtonComponent, collectionRow: HTMLElement): Promise<void> {
        // Confirm deletion with clear warning
        const confirmMsg = `⚠️ DELETE COLLECTION: "${collection}"

This will PERMANENTLY DELETE ALL DATA including:
• All text content and documents  
• All metadata and settings
• All embeddings and vectors

This action CANNOT be undone!

Are you absolutely sure you want to delete this collection?`;
        
        if (!confirm(confirmMsg)) {
            return;
        }
        
        try {
            // Disable the button during deletion
            deleteButton.setDisabled(true);
            deleteButton.setButtonText('Deleting...');
            
            console.log(`🗑️ DELETING entire collection: ${collection}`);
            
            // TODO: Create backup before deletion (future enhancement)
            // const backup = await this.createCollectionBackup(collection);
            
            // Delete the entire collection (all data)
            await this.vectorStore.deleteCollection(collection);
            
            console.log(`🗑️ Successfully deleted collection: ${collection}`);
            
            // Show success message
            new Notice(`Successfully deleted collection: ${collection}`);
            
            // Update usage stats and notify other components
            await this.updateStatsAndNotify(collection);
            
            // Remove the row from UI
            collectionRow.remove();
            
            // Remove from our collections list
            this.collections = this.collections.filter(c => c !== collection);
            
            // If no collections left, refresh display
            if (this.collections.length === 0) {
                this.display();
            }
        } catch (error) {
            console.error(`Error deleting collection ${collection}:`, error);
            new Notice(`Error deleting collection: ${error instanceof Error ? error.message : String(error)}`);
            
            // Re-enable the button
            deleteButton.setDisabled(false);
            deleteButton.setButtonText('Delete');
        }
    }

    /**
     * Add purge all collections button
     */
    private addPurgeAllButton(): void {
        const purgeContainer = this.containerEl.createEl('div', { cls: 'purge-all-container' });
        
        purgeContainer.createEl('p', { 
            text: 'Danger Zone: Delete all collections at once.',
            cls: 'danger-zone-text' 
        });
        
        const purgeButton = new ButtonComponent(purgeContainer)
            .setButtonText('Purge All Collections')
            .setClass('mod-warning')
            .onClick(async () => {
                await this.handlePurgeAllCollections(purgeButton);
            });
    }

    /**
     * Handle purging all collections
     */
    private async handlePurgeAllCollections(purgeButton: ButtonComponent): Promise<void> {
        const confirmMsg = `⚠️ PURGE ALL COLLECTIONS

This will PERMANENTLY DELETE ALL DATA from ALL collections:
${this.collections.map(c => `• ${c}`).join('\n')}

This action CANNOT be undone and will require reindexing all your content!

Are you absolutely sure you want to delete ALL collections?`;
        
        if (!confirm(confirmMsg)) {
            return;
        }
        
        try {
            // Disable the button during deletion
            purgeButton.setDisabled(true);
            purgeButton.setButtonText('Purging...');
            
            let successCount = 0;
            let failureCount = 0;
            
            // Delete all collections
            for (const collection of this.collections) {
                try {
                    await this.vectorStore.deleteCollection(collection);
                    successCount++;
                    console.log(`🗑️ Successfully deleted collection: ${collection}`);
                } catch (error) {
                    console.error(`Error deleting collection ${collection}:`, error);
                    failureCount++;
                }
            }
            
            // Show result message
            if (successCount > 0) {
                new Notice(`Successfully deleted ${successCount} collections${failureCount > 0 ? ` (${failureCount} failed)` : ''}`);
            } else {
                new Notice(`Failed to delete any collections`);
            }
            
            // Update usage stats and notify
            await this.updateStatsAndNotify('all-collections-purged');
            
            // Refresh the display
            this.collections = [];
            this.display();
            
        } catch (error) {
            console.error('Error purging all collections:', error);
            new Notice(`Error purging all collections: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            // Re-enable the button
            purgeButton.setDisabled(false);
            purgeButton.setButtonText('Purge All Collections');
        }
    }

    /**
     * Update usage stats and notify other components
     */
    private async updateStatsAndNotify(collection: string): Promise<void> {
        try {
            // Update the usage stats service
            await this.usageStatsService.refreshStats();
            
            // Set a flag in localStorage to notify other components
            localStorage.setItem('claudesidian-collection-deleted', JSON.stringify({
                collection: collection,
                timestamp: Date.now()
            }));
            
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
        } catch (error) {
            console.warn('Failed to update usage stats or notify components:', error);
        }
    }
}