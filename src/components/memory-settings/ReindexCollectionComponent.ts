import { Notice, ButtonComponent } from 'obsidian';
import { UsageStatsService } from '../../database/services/UsageStatsService';
import { IVectorStore } from '../../database/interfaces/IVectorStore';
import { EmbeddingService } from '../../database/services/EmbeddingService';

/**
 * Component for reindexing collections in the memory settings
 * Provides UI for reindexing embeddings while preserving all original data
 * Single Responsibility: Only handles reindexing operations
 */
export class ReindexCollectionComponent {
    private containerEl: HTMLElement;
    private vectorStore: IVectorStore;
    private usageStatsService: UsageStatsService;
    private embeddingService: EmbeddingService;
    private settings: any;
    private reindexButtons: Map<string, ButtonComponent> = new Map();
    private collections: string[] = [];

    constructor(containerEl: HTMLElement, vectorStore: IVectorStore, usageStatsService: UsageStatsService, embeddingService: EmbeddingService, settings: any) {
        this.containerEl = containerEl;
        this.vectorStore = vectorStore;
        this.usageStatsService = usageStatsService;
        this.embeddingService = embeddingService;
        this.settings = settings;
    }

    /**
     * Set the collections to display reindex buttons for
     */
    setCollections(collections: string[]): void {
        this.collections = collections;
    }

    /**
     * Display reindex buttons for each collection
     */
    display(): void {
        // Clear previous buttons
        this.containerEl.empty();
        this.reindexButtons.clear();

        // Create section header
        this.containerEl.createEl('h4', { text: 'Reindex Collections' });
        
        // Create description
        this.containerEl.createEl('p', { 
            text: 'Reindex collections to update embeddings with your current embedding model while preserving all original data.',
            cls: 'reindex-collection-description' 
        });

        if (this.collections.length === 0) {
            this.containerEl.createEl('p', { 
                text: 'No collections found to reindex.',
                cls: 'no-collections-notice' 
            });
            return;
        }

        // Create reindex buttons for each collection
        this.collections.forEach(collection => {
            const collectionRow = this.containerEl.createEl('div', { cls: 'collection-row' });
            
            const collectionName = collectionRow.createEl('span', { 
                text: collection,
                cls: 'collection-name'
            });
            
            // Create reindex button
            const actionsContainer = collectionRow.createEl('div', { cls: 'collection-actions' });
            const reindexButton = new ButtonComponent(actionsContainer)
                .setButtonText('Reindex')
                .setClass('collection-reindex-button')
                .onClick(async () => {
                    await this.handleReindexCollection(collection, reindexButton);
                });
            
            // Add the mod-cta class separately
            reindexButton.buttonEl.addClass('mod-cta');
            
            this.reindexButtons.set(collection, reindexButton);
        });

        // Add reindex all button
        this.addReindexAllButton();
    }

    /**
     * Handle reindexing a specific collection
     */
    private async handleReindexCollection(collection: string, button: ButtonComponent): Promise<void> {
        // Confirm reindexing
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
            // Disable the button during reindexing
            button.setDisabled(true);
            button.setButtonText('Reindexing...');
            
            // Show initial notice
            new Notice(`Starting reindex for collection: ${collection}`);
            
            // Handle different collection types differently
            if (collection === 'file_embeddings') {
                // File embeddings use chunking strategy from settings
                await this.reindexFileEmbeddings(button);
            } else {
                // Other collections reindex in-place without chunking
                await this.reindexCollectionEmbeddings(collection, button);
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
        await this.embeddingService.batchIndexFiles(filePaths, progressCallback);
    }

    /**
     * Reindex collection embeddings - ONLY updates embeddings, preserves all original data and metadata
     */
    private async reindexCollectionEmbeddings(collection: string, button: ButtonComponent): Promise<void> {
        try {
            // Step 1: Get existing data from the collection (PRESERVE everything)
            button.setButtonText('Loading existing data...');
            const existingItems = await this.vectorStore.getItems(collection, [], ['documents', 'metadatas']);
            
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
            
            // Step 2: Generate NEW embeddings only (preserve all other data)
            button.setButtonText('Generating new embeddings...');
            
            const updatedItems = [];
            for (let i = 0; i < existingItems.ids.length; i++) {
                const id = existingItems.ids[i];
                const document = existingItems.documents?.[i] || '';
                const metadata = existingItems.metadatas?.[i] || {};
                
                // Generate new embedding for the document text with current settings
                const newEmbedding = await this.embeddingService.getEmbedding(document);
                
                if (newEmbedding) {
                    updatedItems.push({
                        id: id,
                        embedding: newEmbedding,
                        document: document,      // PRESERVE original document
                        metadata: metadata       // PRESERVE original metadata
                    });
                }
                
                // Update progress
                const progress = Math.round(((i + 1) / existingItems.ids.length) * 100);
                button.setButtonText(`Re-embedding... ${progress}%`);
            }
            
            // Step 3: Update items in-place (NO collection deletion, only embedding updates)
            if (updatedItems.length > 0) {
                button.setButtonText('Updating embeddings...');
                
                // Use updateItems instead of deleting and recreating
                await this.vectorStore.updateItems(collection, {
                    ids: updatedItems.map(item => item.id),
                    embeddings: updatedItems.map(item => item.embedding),
                    documents: updatedItems.map(item => item.document),
                    metadatas: updatedItems.map(item => item.metadata)
                });
            }
            
            console.log(`🔄 Successfully reindexed ${updatedItems.length} items in ${collection}`);
            new Notice(`Successfully reindexed ${updatedItems.length} items in ${collection} collection with new embeddings.`);
            
        } catch (error) {
            console.error(`Error reindexing ${collection}:`, error);
            throw error;
        }
    }

    /**
     * Add reindex all collections button
     */
    private addReindexAllButton(): void {
        const reindexAllContainer = this.containerEl.createEl('div', { cls: 'reindex-all-container' });
        
        reindexAllContainer.createEl('p', { 
            text: 'Reindex all collections at once with your current embedding model.',
            cls: 'reindex-all-text' 
        });
        
        const reindexAllButton = new ButtonComponent(reindexAllContainer)
            .setButtonText('Reindex All Collections')
            .setClass('mod-cta')
            .onClick(async () => {
                await this.handleReindexAllCollections(reindexAllButton);
            });
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
            // Disable the button during reindexing
            reindexAllButton.setDisabled(true);
            reindexAllButton.setButtonText('Reindexing All...');
            
            let successCount = 0;
            let failureCount = 0;
            
            // Reindex all collections
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
                    console.log(`🔄 Successfully reindexed collection: ${collection}`);
                } catch (error) {
                    console.error(`Error reindexing collection ${collection}:`, error);
                    failureCount++;
                }
            }
            
            // Show result message
            if (successCount > 0) {
                new Notice(`Successfully reindexed ${successCount} collections${failureCount > 0 ? ` (${failureCount} failed)` : ''}`);
            } else {
                new Notice(`Failed to reindex any collections`);
            }
            
            // Update usage stats and notify
            try {
                await this.usageStatsService.refreshStats();
                
                localStorage.setItem('claudesidian-all-collections-reindexed', JSON.stringify({
                    timestamp: Date.now(),
                    successCount,
                    failureCount
                }));
                
                if (typeof StorageEvent === 'function' && typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new StorageEvent('storage', {
                        key: 'claudesidian-all-collections-reindexed',
                        newValue: JSON.stringify({
                            timestamp: Date.now(),
                            successCount,
                            failureCount
                        }),
                        storageArea: localStorage
                    }));
                }
            } catch (statsError) {
                console.warn('Failed to update usage stats after reindexing all:', statsError);
            }
            
        } catch (error) {
            console.error('Error reindexing all collections:', error);
            new Notice(`Error reindexing all collections: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            // Re-enable the button
            reindexAllButton.setDisabled(false);
            reindexAllButton.setButtonText('Reindex All Collections');
        }
    }
}