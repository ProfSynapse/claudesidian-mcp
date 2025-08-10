import { Notice, ButtonComponent } from 'obsidian';
import { UsageStatsService } from '../../database/services/usage/UsageStatsService';
import { IVectorStore } from '../../database/interfaces/IVectorStore';
import { EmbeddingService } from '../../database/services/core/EmbeddingService';
import { CollectionCard } from './CollectionCard';

/**
 * Unified Component for managing collections in the memory settings
 * Shows each collection once with both Reindex and Delete buttons
 * Single Responsibility: Collection management UI
 */
export class CollectionManagementComponent {
    private containerEl: HTMLElement;
    private vectorStore: IVectorStore;
    private usageStatsService: UsageStatsService;
    private embeddingService: EmbeddingService;
    private settings: any;
    private collections: string[] = [];
    private collectionCards: CollectionCard[] = [];

    constructor(containerEl: HTMLElement, vectorStore: IVectorStore, usageStatsService: UsageStatsService, embeddingService: EmbeddingService, settings: any) {
        this.containerEl = containerEl;
        this.vectorStore = vectorStore;
        this.usageStatsService = usageStatsService;
        this.embeddingService = embeddingService;
        this.settings = settings;
    }

    /**
     * Display the collection management interface
     */
    async display(): Promise<void> {
        try {
            // Get available collections
            this.collections = await this.vectorStore.listCollections();
            // Collections loaded for management
            
            // Clear container
            this.containerEl.empty();
            
            // Create main header
            this.containerEl.createEl('h3', { text: 'Manage Collections' });
            
            // Create description
            this.containerEl.createEl('p', { 
                text: 'Reindex collections to update embeddings with your current model, or delete collections to free up space.',
                cls: 'collection-management-description' 
            });

            if (!this.collections || this.collections.length === 0) {
                this.containerEl.createEl('p', { 
                    text: 'No collections found. Collections will appear here as you use the plugin.',
                    cls: 'no-collections-notice' 
                });
                return;
            }

            // Create collections list
            this.displayCollectionsList();
            
            // Create bulk action buttons
            this.displayBulkActions();
            
        } catch (error) {
            console.error('Error displaying collection management:', error);
            this.containerEl.createEl('div', { 
                text: 'Error loading collections. Please refresh the page.',
                cls: 'collection-management-error'
            });
        }
    }

    /**
     * Display the list of collections with action buttons using CollectionCard components
     */
    private displayCollectionsList(): void {
        const collectionsContainer = this.containerEl.createDiv({ cls: 'collections-list' });
        
        // Clear existing cards
        this.collectionCards = [];
        
        // Create a CollectionCard for each collection
        this.collections.forEach(collection => {
            const card = new CollectionCard(
                collectionsContainer,
                collection,
                (button) => this.handleReindexCollection(collection, button),
                (button, cardEl) => this.handleDeleteCollection(collection, button, cardEl)
            );
            
            card.display();
            this.collectionCards.push(card);
        });
    }

    /**
     * Display bulk action buttons
     */
    private displayBulkActions(): void {
        const bulkActionsContainer = this.containerEl.createDiv({ cls: 'bulk-actions-container' });
        
        // Section header
        bulkActionsContainer.createEl('h4', { text: 'Bulk Actions' });
        
        // Buttons container - side by side
        const buttonsContainer = bulkActionsContainer.createDiv({ cls: 'bulk-buttons-row' });
        
        // Reindex all button
        const reindexAllButton = new ButtonComponent(buttonsContainer)
            .setButtonText('Reindex All Collections')
            .setClass('collection-action-button')
            .onClick(async () => {
                await this.handleReindexAllCollections(reindexAllButton);
            });
        reindexAllButton.buttonEl.addClass('collection-reindex-btn');
        
        // Delete all button
        const deleteAllButton = new ButtonComponent(buttonsContainer)
            .setButtonText('Purge All Collections')
            .setClass('collection-action-button')
            .onClick(async () => {
                await this.handlePurgeAllCollections(deleteAllButton);
            });
        deleteAllButton.buttonEl.addClass('collection-delete-btn');
    }

    /**
     * Handle reindexing a specific collection
     */
    private async handleReindexCollection(collection: string, button: ButtonComponent): Promise<void> {
        const confirmMsg = `🔄 REINDEX COLLECTION: "${collection}"

This will:
• Keep ALL original text and metadata
• Generate NEW embeddings with your current model
• Update embeddings in-place (no data loss)

Continue with reindexing?`;
        
        if (!confirm(confirmMsg)) {
            return;
        }
        
        try {
            button.setDisabled(true);
            button.setButtonText('Reindexing...');
            
            new Notice(`Starting reindex for collection: ${collection}`);
            
            if (collection === 'file_embeddings') {
                await this.reindexFileEmbeddings(button);
            } else {
                await this.reindexCollectionEmbeddings(collection, button);
            }
            
            new Notice(`Successfully reindexed collection: ${collection}`);
            await this.updateStatsAndNotify('reindex', collection);
            
        } catch (error) {
            console.error(`Error reindexing collection ${collection}:`, error);
            new Notice(`Error reindexing collection: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            button.setDisabled(false);
            button.setButtonText('Reindex');
        }
    }

    /**
     * Handle deleting a specific collection
     */
    private async handleDeleteCollection(collection: string, deleteButton: ButtonComponent, collectionRow: HTMLElement): Promise<void> {
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
            deleteButton.setDisabled(true);
            deleteButton.setButtonText('Deleting...');
            
            console.log(`🗑️ DELETING entire collection: ${collection}`);
            
            await this.vectorStore.deleteCollection(collection);
            
            new Notice(`Successfully deleted collection: ${collection}`);
            await this.updateStatsAndNotify('delete', collection);
            
            // Remove the row from UI
            collectionRow.remove();
            
            // Remove from our collections list
            this.collections = this.collections.filter(c => c !== collection);
            
            // If no collections left, refresh display
            if (this.collections.length === 0) {
                await this.display();
            }
        } catch (error) {
            console.error(`Error deleting collection ${collection}:`, error);
            new Notice(`Error deleting collection: ${error instanceof Error ? error.message : String(error)}`);
            
            deleteButton.setDisabled(false);
            deleteButton.setButtonText('Delete');
        }
    }

    /**
     * Handle reindexing all collections
     */
    private async handleReindexAllCollections(reindexAllButton: ButtonComponent): Promise<void> {
        const confirmMsg = `🔄 REINDEX ALL COLLECTIONS

This will reindex ALL collections with your current embedding model:
${this.collections.map(c => `• ${c}`).join('\n')}

This will:
• Keep ALL original text and metadata
• Generate NEW embeddings for all collections
• May take several minutes depending on data size

Continue with reindexing all collections?`;
        
        if (!confirm(confirmMsg)) {
            return;
        }
        
        try {
            reindexAllButton.setDisabled(true);
            
            let successCount = 0;
            let failureCount = 0;
            
            for (let i = 0; i < this.collections.length; i++) {
                const collection = this.collections[i];
                try {
                    reindexAllButton.setButtonText(`Reindexing... ${collection} (${i + 1}/${this.collections.length})`);
                    
                    if (collection === 'file_embeddings') {
                        await this.reindexFileEmbeddings(reindexAllButton);
                    } else {
                        await this.reindexCollectionEmbeddings(collection, reindexAllButton);
                    }
                    
                    successCount++;
                } catch (error) {
                    console.error(`Error reindexing collection ${collection}:`, error);
                    failureCount++;
                }
            }
            
            if (successCount > 0) {
                new Notice(`Successfully reindexed ${successCount} collections${failureCount > 0 ? ` (${failureCount} failed)` : ''}`);
            } else {
                new Notice(`Failed to reindex any collections`);
            }
            
            await this.updateStatsAndNotify('reindex-all', 'all');
            
        } catch (error) {
            console.error('Error reindexing all collections:', error);
            new Notice(`Error reindexing all collections: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            reindexAllButton.setDisabled(false);
            reindexAllButton.setButtonText('Reindex All Collections');
        }
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
            purgeButton.setDisabled(true);
            purgeButton.setButtonText('Purging...');
            
            let successCount = 0;
            let failureCount = 0;
            
            for (const collection of this.collections) {
                try {
                    await this.vectorStore.deleteCollection(collection);
                    successCount++;
                } catch (error) {
                    console.error(`Error deleting collection ${collection}:`, error);
                    failureCount++;
                }
            }
            
            if (successCount > 0) {
                new Notice(`Successfully deleted ${successCount} collections${failureCount > 0 ? ` (${failureCount} failed)` : ''}`);
            } else {
                new Notice(`Failed to delete any collections`);
            }
            
            await this.updateStatsAndNotify('purge-all', 'all');
            
            // Refresh the display
            this.collections = [];
            await this.display();
            
        } catch (error) {
            console.error('Error purging all collections:', error);
            new Notice(`Error purging all collections: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            purgeButton.setDisabled(false);
            purgeButton.setButtonText('Purge All Collections');
        }
    }

    /**
     * Reindex file embeddings using the chunking strategy from settings
     */
    private async reindexFileEmbeddings(button: ButtonComponent): Promise<void> {
        const app = (window as any).app;
        if (!app || !app.vault) {
            throw new Error('Obsidian app or vault not available');
        }
        
        const allFiles = app.vault.getMarkdownFiles();
        const filePaths = allFiles.map((file: any) => file.path);
        
        const progressCallback = (processed: number, total: number, currentFile?: string) => {
            const percentage = Math.round((processed / total) * 100);
            button.setButtonText(`Reindexing... ${percentage}%`);
        };
        
        await this.embeddingService.batchIndexFiles(filePaths, progressCallback);
    }

    /**
     * Reindex collection embeddings - preserves all data, only updates embeddings
     */
    private async reindexCollectionEmbeddings(collection: string, button: ButtonComponent): Promise<void> {
        button.setButtonText('Loading existing data...');
        
        // Use getAllItems to get all existing items for reindexing
        const existingItems = await this.vectorStore.getAllItems(collection);
        
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
                case 'snapshots':
                    message += 'Snapshots are created when you save workspace states through the Memory Manager.';
                    break;
                default:
                    message += 'Nothing to reindex.';
            }
            new Notice(message);
            return;
        }
        
        button.setButtonText('Generating new embeddings...');
        
        const updatedItems = [];
        for (let i = 0; i < existingItems.ids.length; i++) {
            const id = existingItems.ids[i];
            const document = existingItems.documents?.[i] || '';
            const metadata = existingItems.metadatas?.[i] || {};
            
            const newEmbedding = await this.embeddingService.getEmbedding(document);
            
            if (newEmbedding) {
                updatedItems.push({
                    id: id,
                    embedding: newEmbedding,
                    document: document,
                    metadata: metadata
                });
            }
            
            const progress = Math.round(((i + 1) / existingItems.ids.length) * 100);
            button.setButtonText(`Re-embedding... ${progress}%`);
        }
        
        if (updatedItems.length > 0) {
            button.setButtonText('Updating embeddings...');
            
            await this.vectorStore.updateItems(collection, {
                ids: updatedItems.map(item => item.id),
                embeddings: updatedItems.map(item => item.embedding),
                documents: updatedItems.map(item => item.document),
                metadatas: updatedItems.map(item => item.metadata)
            });
        }
    }

    /**
     * Update usage stats and notify other components
     */
    private async updateStatsAndNotify(action: string, collection: string): Promise<void> {
        try {
            await this.usageStatsService.refreshStats();
            
            const eventKey = action === 'delete' || action === 'purge-all' 
                ? 'claudesidian-collection-deleted' 
                : 'claudesidian-collection-reindexed';
            
            localStorage.setItem(eventKey, JSON.stringify({
                collection: collection,
                action: action,
                timestamp: Date.now()
            }));
            
            if (typeof StorageEvent === 'function' && typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new StorageEvent('storage', {
                    key: eventKey,
                    newValue: JSON.stringify({
                        collection: collection,
                        action: action,
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