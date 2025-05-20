import { Notice, Setting } from 'obsidian';
import { BaseSettingsTab } from './BaseSettingsTab';
import { EmbeddingManager } from '../../database/services/embeddingManager';
import { VaultLibrarianAgent } from '../../agents/vaultLibrarian/vaultLibrarian';
import { ProgressBar } from '../ProgressBar';
import { ChromaCollectionManager } from '../../database/providers/chroma/ChromaCollectionManager';

/**
 * Usage Settings Tab component
 * Handles usage limits and displays usage statistics
 */
export class UsageSettingsTab extends BaseSettingsTab {
    private embeddingManager: EmbeddingManager | null;
    private vaultLibrarian: VaultLibrarianAgent | null;
    private collectionManager: ChromaCollectionManager | null = null;
    
    /**
     * Create a new usage settings tab
     */
    constructor(
        settings: any, 
        settingsManager: any, 
        app: any,
        embeddingManager?: EmbeddingManager,
        vaultLibrarian?: VaultLibrarianAgent
    ) {
        super(settings, settingsManager, app);
        this.embeddingManager = embeddingManager || null;
        this.vaultLibrarian = vaultLibrarian || null;
        
        // Try to get ChromaCollectionManager from vector store
        if (this.embeddingManager) {
            try {
                const vectorStore = (this.embeddingManager as any).vectorStore;
                if (vectorStore) {
                    this.collectionManager = new ChromaCollectionManager(vectorStore);
                }
            } catch (error) {
                console.warn('Failed to create ChromaCollectionManager:', error);
            }
        }
    }
    
    /**
     * Display the usage settings tab
     */
    display(containerEl: HTMLElement): void {
        // Usage limits section
        containerEl.createEl('h3', { text: 'Usage Limits' });
        
        const tokenLimitSetting = new Setting(containerEl)
            .setName('Monthly Token Limit')
            .setDesc('Maximum tokens to process per month (1M ≈ $0.13 for small model)')
            .addText(text => text
                .setPlaceholder('1000000')
                .setValue(String(this.settings.maxTokensPerMonth))
                .onChange(async (value) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue) && numValue > 0) {
                        this.settings.maxTokensPerMonth = numValue;
                        await this.saveSettings();
                    }
                })
            );
            
        // Add update button directly next to the monthly token limit
        tokenLimitSetting.addButton(button => button
            .setButtonText('Update Usage Counter')
            .setCta()
            .onClick(async () => {
                // Get current token usage
                let tokensThisMonth = 0;
                if (this.embeddingManager && this.embeddingManager.getProvider()) {
                    const provider = this.embeddingManager.getProvider();
                    // Try to get current usage from provider
                    if (provider) {
                        tokensThisMonth = (provider as any).getTokensThisMonth?.() || 0;
                    }
                }
                
                const newCount = prompt('Enter new token count:', tokensThisMonth.toString());
                
                if (newCount !== null) {
                    const numValue = Number(newCount);
                    if (!isNaN(numValue) && numValue >= 0) {
                        await this.updateUsageStats(numValue);
                        if (this.onSettingsChanged) {
                            this.onSettingsChanged();
                        }
                    } else {
                        new Notice('Please enter a valid number for token count');
                    }
                }
            })
        );
            
        new Setting(containerEl)
            .setName('API Rate Limit')
            .setDesc('Maximum API requests per minute')
            .addSlider(slider => slider
                .setLimits(10, 1000, 10)
                .setValue(this.settings.apiRateLimitPerMinute)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.apiRateLimitPerMinute = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Database Size Limit')
            .setDesc('Maximum size of the embedding database in MB')
            .addText(text => text
                .setPlaceholder('1000')
                .setValue(String(this.settings.maxDbSize))
                .onChange(async (value) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue) && numValue > 0) {
                        this.settings.maxDbSize = numValue;
                        await this.saveSettings();
                    }
                })
            );
            
        // Usage statistics section
        this.displayUsageStats(containerEl);
    }
    
    /**
     * Display the usage statistics section
     */
    private async displayUsageStats(containerEl: HTMLElement): Promise<void> {
        const section = containerEl.createEl('div', { cls: 'memory-usage-stats' });
        
        section.createEl('h3', { text: 'Usage Statistics' });
        
        // Debug info for understanding the environment
        console.log('UsageSettingsTab displayUsageStats called');
        
        // Check for vector store in plugin instance
        try {
            const plugin = window.app.plugins.plugins['claudesidian-mcp'];
            console.log('Plugin found:', !!plugin);
            console.log('Vector store in plugin:', !!(plugin && plugin.vectorStore));
            console.log('Embedding service in plugin:', !!(plugin && plugin.embeddingService));
            if (plugin && plugin.vectorStore) {
                console.log('Vector store is initialized:', plugin.vectorStore.initialized);
                
                // Check if the plugin has settings configured for embeddings
                if (plugin.settings && plugin.settings.settings && plugin.settings.settings.memory) {
                    console.log('Embeddings enabled in settings:', plugin.settings.settings.memory.embeddingsEnabled);
                }
            }
        } catch (error) {
            console.error('Error checking plugin status:', error);
        }
        
        // Get current stats
        let usageStats: {
            tokensThisMonth: number;
            totalEmbeddings: number;
            dbSizeMB: number;
            lastIndexedDate: string;
            indexingInProgress: boolean;
            estimatedCost?: number;
            modelUsage?: {
                'text-embedding-3-small': number;
                'text-embedding-3-large': number;
            };
            collectionStats?: Array<{ name: string; count: number; color?: string }>;
        } = { 
            tokensThisMonth: 0,
            totalEmbeddings: 0,
            dbSizeMB: 0,
            lastIndexedDate: '',
            indexingInProgress: false,
            estimatedCost: 0,
            modelUsage: {
                'text-embedding-3-small': 0,
                'text-embedding-3-large': 0
            },
            collectionStats: []
        };
        
        try {
            // Get usage stats using our helper method
            usageStats = await this.getUsageStats();
            console.log('Got usage stats:', usageStats);
        } catch (error) {
            console.error('Error getting usage stats:', error instanceof Error ? error.message : String(error));
        }
        
        // Current month usage section
        const monthlySection = section.createEl('div', { cls: 'memory-usage-monthly' });
        monthlySection.createEl('h4', { text: 'Monthly Usage' });
        
        // Current month tokens
        monthlySection.createEl('div', {
            text: `Tokens used this month: ${usageStats.tokensThisMonth.toLocaleString()} / ${this.settings.maxTokensPerMonth.toLocaleString()}`
        });
        
        // Token usage progress bar
        const percentUsed = Math.min(100, (usageStats.tokensThisMonth / this.settings.maxTokensPerMonth) * 100);
        const progressContainer = monthlySection.createDiv({ cls: 'memory-usage-progress' });
        const progressBar = progressContainer.createDiv({ cls: 'memory-usage-bar' });
        progressBar.style.width = `${percentUsed}%`;
        
        // Estimated cost - use the cost from usage stats if available, otherwise calculate
        const estimatedCost = usageStats.estimatedCost || 
            ((usageStats.tokensThisMonth / 1000) * (this.settings.costPerThousandTokens?.[this.settings.embeddingModel] || 0.00013));
        
        monthlySection.createEl('div', {
            text: `Estimated cost this month: $${estimatedCost.toFixed(4)}`
        });
        
        // Display per-model token usage if available
        if (usageStats.modelUsage) {
            const modelUsageContainer = monthlySection.createDiv({ cls: 'memory-model-usage' });
            
            for (const model in usageStats.modelUsage) {
                const tokens = usageStats.modelUsage[model as 'text-embedding-3-small' | 'text-embedding-3-large'];
                if (tokens > 0) {
                    const costPerK = this.settings.costPerThousandTokens?.[model as 'text-embedding-3-small' | 'text-embedding-3-large'] || 0;
                    const modelCost = (tokens / 1000) * costPerK;
                    
                    modelUsageContainer.createEl('div', {
                        text: `${model}: ${tokens.toLocaleString()} tokens ($${modelCost.toFixed(4)})`
                    });
                }
            }
        }
        
        // Database stats section
        const dbSection = section.createEl('div', { cls: 'memory-database-stats' });
        dbSection.createEl('h4', { text: 'Embedding Database' });
        
        // Database overview
        dbSection.createEl('div', {
            text: `Total embeddings: ${usageStats.totalEmbeddings.toLocaleString()}`
        });
        
        dbSection.createEl('div', {
            text: `Database size: ${(usageStats.dbSizeMB).toFixed(2)} MB / ${this.settings.maxDbSize} MB`
        });
        
        if (usageStats.lastIndexedDate) {
            dbSection.createEl('div', {
                text: `Last indexed: ${new Date(usageStats.lastIndexedDate).toLocaleString()}`
            });
        }
        
        // Collection stats
        const collectionsSection = section.createEl('div', { cls: 'memory-collections-stats' });
        collectionsSection.createEl('h4', { text: 'Collection Embeddings' });
        
        if (usageStats.collectionStats && usageStats.collectionStats.length > 0) {
            // Total embeddings display
            const totalBar = collectionsSection.createDiv({ cls: 'collection-stats-total' });
            totalBar.createEl('div', { text: `Total embeddings: ${usageStats.totalEmbeddings.toLocaleString()}` });
            
            // Create colored bar visualization
            const barContainer = collectionsSection.createDiv({ cls: 'collection-bar-container' });
            
            // Define color palette if not present in collection stats
            const colors = [
                '#4285F4', '#EA4335', '#FBBC05', '#34A853', // Google colors
                '#3498DB', '#E74C3C', '#2ECC71', '#F39C12', // Flat UI colors
                '#9B59B6', '#1ABC9C', '#D35400', '#C0392B', // More colors
                '#8E44AD', '#16A085', '#27AE60', '#D35400', // Additional colors
                '#2980B9', '#E67E22', '#27AE60', '#2C3E50'  // Even more colors
            ];
            
            // Create segments for each collection
            usageStats.collectionStats.forEach((collection, index) => {
                const color = collection.color || colors[index % colors.length];
                const percentage = (collection.count / usageStats.totalEmbeddings) * 100;
                const segment = barContainer.createDiv({ cls: 'collection-bar-segment' });
                segment.style.width = `${percentage}%`;
                segment.style.backgroundColor = color;
                
                // Add tooltip
                segment.createDiv({
                    cls: 'collection-tooltip',
                    text: `${collection.name}: ${collection.count.toLocaleString()} embeddings (${percentage.toFixed(1)}%)`
                });
            });
            
            // Collection legend
            const legendContainer = collectionsSection.createDiv({ cls: 'collection-legend' });
            usageStats.collectionStats.forEach((collection, index) => {
                const color = collection.color || colors[index % colors.length];
                const legendItem = legendContainer.createDiv({ cls: 'legend-item' });
                const colorBox = legendItem.createDiv({ cls: 'legend-color' });
                colorBox.style.backgroundColor = color;
                legendItem.createEl('span', { text: `${collection.name}: ${collection.count.toLocaleString()}` });
            });
            
            // Also include the table view
            // Create a table for collection stats
            const table = collectionsSection.createEl('table', { cls: 'memory-collections-table' });
            const headerRow = table.createEl('tr');
            headerRow.createEl('th', { text: 'Collection' });
            headerRow.createEl('th', { text: 'Embeddings' });
            
            // Add a row for each collection
            for (const collection of usageStats.collectionStats) {
                const row = table.createEl('tr');
                row.createEl('td', { text: collection.name });
                row.createEl('td', { text: collection.count.toLocaleString() });
            }
        } else {
            // Display message when no collections found
            const noCollectionsMessage = collectionsSection.createDiv({ cls: 'memory-no-collections' });
            noCollectionsMessage.createEl('p', { 
                text: 'No collection statistics available.',
                cls: 'memory-notice'
            });
            
            const reasonsList = noCollectionsMessage.createEl('ul');
            reasonsList.createEl('li', { text: 'Vector store may not be properly initialized' });
            reasonsList.createEl('li', { text: 'No embeddings have been created yet' });
            reasonsList.createEl('li', { text: 'Embeddings may be disabled in settings' });
            
            // Add a refresh button
            const refreshButton = noCollectionsMessage.createEl('button', {
                text: 'Refresh Collection Data',
                cls: 'mod-cta'
            });
            
            refreshButton.addEventListener('click', async () => {
                try {
                    const plugin = window.app.plugins.plugins['claudesidian-mcp'];
                    if (plugin && plugin.vectorStore) {
                        console.log('Force refreshing vector store');
                        await plugin.vectorStore.refreshCollections();
                    }
                    
                    // Refresh the display
                    if (this.onSettingsChanged) {
                        this.onSettingsChanged();
                    }
                    
                    new Notice('Refreshed collection data');
                } catch (error) {
                    console.error('Error refreshing collection data:', error);
                    new Notice('Error refreshing collections: ' + (error instanceof Error ? error.message : String(error)));
                }
            });
        }
        
        // Create indexing progress bar container
        const indexingProgressContainer = section.createDiv({ cls: 'memory-indexing-progress' });
        
        // Initialize progress bar
        if (this.vaultLibrarian?.app) {
            new ProgressBar(indexingProgressContainer, this.vaultLibrarian.app);
        } else if (this.app) {
            // If we have direct access to the app, use that
            new ProgressBar(indexingProgressContainer, this.app);
        }
        
        // Action buttons
        const actionsContainer = section.createDiv({ cls: 'memory-actions' });
        
        // Reset Token Usage button
        const resetButton = actionsContainer.createEl('button', {
            text: 'Reset Usage Counter',
            cls: 'mod-warning'
        });
        resetButton.addEventListener('click', async () => {
            if (confirm('Are you sure you want to reset the usage counter?')) {
                await this.resetUsageStats();
                if (this.onSettingsChanged) {
                    this.onSettingsChanged();
                }
            }
        });
        
        // Get current operation ID (no longer supported)
        let currentOperationId: string | null = this.getCurrentIndexingOperationId();
        
        const hasIncompleteOperation = currentOperationId !== null && !usageStats.indexingInProgress;
        
        const reindexButton = actionsContainer.createEl('button', {
            text: usageStats.indexingInProgress ? 'Indexing in progress...' : 
                  hasIncompleteOperation ? 'Resume Indexing' : 'Reindex All Content',
            cls: 'mod-cta'
        });
        reindexButton.disabled = usageStats.indexingInProgress;
        
        // Create cancel button if indexing is in progress
        let cancelButton: HTMLElement | null = null;
        if (usageStats.indexingInProgress) {
            cancelButton = actionsContainer.createEl('button', {
                text: 'Cancel Indexing',
                cls: 'mod-warning'
            });
            
            cancelButton.addEventListener('click', async () => {
                const message = 'Are you sure you want to cancel the indexing operation? You can resume it later.';
                
                if (confirm(message)) {
                    await this.cancelIndexing();
                    if (this.onSettingsChanged) {
                        this.onSettingsChanged();
                    }
                }
            });
        }
        
        reindexButton.addEventListener('click', async () => {
            // Check if we can reindex (not already in progress)
            if (usageStats.indexingInProgress) {
                return;
            }
            
            // Handle incomplete operation
            if (hasIncompleteOperation) {
                if (confirm('Resume your previous indexing operation?')) {
                    reindexButton.disabled = true;
                    reindexButton.setText('Indexing in progress...');
                    
                    try {
                        // Resuming indexing is not supported anymore
                        new Notice('Resuming indexing operations is no longer supported');
                    } catch (error) {
                        console.error('Error resuming indexing:', error);
                    } finally {
                        if (this.onSettingsChanged) {
                            this.onSettingsChanged();
                        }
                    }
                }
            } else {
                // Start a new indexing operation
                if (confirm('This will reindex all your vault content. It may take a while and use API tokens. Continue?')) {
                    reindexButton.disabled = true;
                    reindexButton.setText('Indexing in progress...');
                    
                    try {
                        // Reindexing functionality has been moved to the plugin's vector store implementation
                        new Notice('Please use the ChromaDB interface to reindex content');
                    } catch (error) {
                        console.error('Error reindexing:', error);
                    } finally {
                        if (this.onSettingsChanged) {
                            this.onSettingsChanged();
                        }
                    }
                }
            }
        });
    }
    
    /**
     * Helper method to get usage stats
     */
    private async getUsageStats(): Promise<{
        tokensThisMonth: number;
        totalEmbeddings: number;
        dbSizeMB: number;
        lastIndexedDate: string;
        indexingInProgress: boolean;
        estimatedCost?: number;
        modelUsage?: {
            'text-embedding-3-small': number;
            'text-embedding-3-large': number;
        };
        collectionStats?: Array<{ name: string; count: number; color?: string }>;
    }> {
        console.log('getUsageStats called');
        
        const defaultStats = { 
            tokensThisMonth: 0,
            totalEmbeddings: 0,
            dbSizeMB: 0,
            lastIndexedDate: '',
            indexingInProgress: false,
            estimatedCost: 0,
            modelUsage: {
                'text-embedding-3-small': 0,
                'text-embedding-3-large': 0
            },
            collectionStats: [] as Array<{ name: string; count: number; color?: string }>
        };
        
        try {
            // Try to get from the embedding provider if available
            if (this.embeddingManager && this.embeddingManager.getProvider()) {
                const provider = this.embeddingManager.getProvider();
                if (provider) {
                    defaultStats.estimatedCost = (provider as any).getTotalCost?.() || defaultStats.estimatedCost;
                    defaultStats.modelUsage = (provider as any).getModelUsage?.() || defaultStats.modelUsage;
                }
            }
            
            // Get collection stats from different sources
            
            // First, try to use collection manager if available
            if (this.collectionManager) {
                try {
                    console.log('Using CollectionManager to get stats');
                    
                    // Initialize the collection manager if needed
                    await this.collectionManager.initialize();
                    
                    // Get list of collections
                    const collections = await this.collectionManager.listCollections();
                    console.log('Found collections via CollectionManager:', collections);
                    
                    defaultStats.collectionStats = [];
                    let totalEmbeddings = 0;
                    
                    // Define color palette
                    const colors = [
                        '#4285F4', '#EA4335', '#FBBC05', '#34A853', 
                        '#3498DB', '#E74C3C', '#2ECC71', '#F39C12',

                        '#9B59B6', '#1ABC9C', '#D35400', '#C0392B', 
                        '#8E44AD', '#16A085', '#27AE60', '#D35400', 
                        '#2980B9', '#E67E22', '#27AE60', '#2C3E50'
                    ];
                    
                    // Get count for each collection
                    for (let i = 0; i < collections.length; i++) {
                        const collection = collections[i];
                        try {
                            const count = await this.collectionManager.count(collection);
                            defaultStats.collectionStats.push({
                                name: collection,
                                count: count,
                                color: colors[i % colors.length]
                            });
                            totalEmbeddings += count;
                        } catch (error) {
                            console.warn(`Error getting count for collection ${collection}:`, error);
                            defaultStats.collectionStats.push({
                                name: collection,
                                count: 0,
                                color: colors[i % colors.length]
                            });
                        }
                    }
                    
                    // Update total embeddings count
                    defaultStats.totalEmbeddings = totalEmbeddings;
                } catch (error) {
                    console.warn('Error getting collection stats via CollectionManager:', error);
                }
            }
            
            // If no collections were found, try directly from the plugin's vector store
            if (defaultStats.collectionStats.length === 0) {
                try {
                    console.log('Trying to get stats directly from plugin vector store');
                    const plugin = window.app.plugins.plugins['claudesidian-mcp'];
                    
                    if (plugin && plugin.vectorStore) {
                        console.log('Found vector store in plugin');
                        const vectorStore = plugin.vectorStore;
                        
                        if (typeof vectorStore.listCollections === 'function' && 
                            typeof vectorStore.count === 'function' &&
                            vectorStore.initialized) {
                            
                            // Define color palette
                            const colors = [
                                '#4285F4', '#EA4335', '#FBBC05', '#34A853',
                                '#3498DB', '#E74C3C', '#2ECC71', '#F39C12',
                                '#9B59B6', '#1ABC9C', '#D35400', '#C0392B',
                                '#8E44AD', '#16A085', '#27AE60', '#D35400',
                                '#2980B9', '#E67E22', '#27AE60', '#2C3E50'
                            ];
                            
                            // Get collections and their counts
                            const collections = await vectorStore.listCollections();
                            console.log('Found collections via plugin vectorStore:', collections);
                            
                            defaultStats.collectionStats = [];
                            let totalEmbeddings = 0;
                            
                            // Get diagnostics for more detailed info if available
                            let diagnostics = null;
                            try {
                                if (typeof vectorStore.getDiagnostics === 'function') {
                                    diagnostics = await vectorStore.getDiagnostics();
                                    console.log('Vector store diagnostics:', diagnostics);
                                }
                            } catch (diagError) {
                                console.warn('Error getting vector store diagnostics:', diagError);
                            }
                            
                            // If diagnostics are available and have collection details, use them
                            if (diagnostics && diagnostics.collections && diagnostics.collections.length > 0) {
                                for (let i = 0; i < diagnostics.collections.length; i++) {
                                    const collection = diagnostics.collections[i];
                                    if (collection.name && collection.itemCount !== undefined) {
                                        defaultStats.collectionStats.push({
                                            name: collection.name,
                                            count: collection.itemCount,
                                            color: colors[i % colors.length]
                                        });
                                        totalEmbeddings += collection.itemCount;
                                    }
                                }
                            } else {
                                // Otherwise manually get counts for each collection
                                for (let i = 0; i < collections.length; i++) {
                                    const name = collections[i];
                                    try {
                                        const count = await vectorStore.count(name);
                                        defaultStats.collectionStats.push({
                                            name,
                                            count,
                                            color: colors[i % colors.length]
                                        });
                                        totalEmbeddings += count;
                                    } catch (countError) {
                                        console.warn(`Error getting count for collection ${name}:`, countError);
                                    }
                                }
                            }
                            
                            // Update total embeddings count
                            defaultStats.totalEmbeddings = totalEmbeddings;
                        }
                    }
                } catch (error) {
                    console.warn('Error getting collection stats from plugin vector store:', error);
                }
            }
            
            return defaultStats;
        } catch (error) {
            console.error('Error getting usage stats:', error);
            return defaultStats;
        }
    }
    
    /**
     * Helper method to update usage stats
     */
    private async updateUsageStats(tokenCount: number): Promise<void> {
        try {
            // Try to update through the embedding provider
            if (this.embeddingManager && this.embeddingManager.getProvider()) {
                const provider = this.embeddingManager.getProvider();
                if (provider && typeof (provider as any).updateUsageStats === 'function') {
                    await (provider as any).updateUsageStats(tokenCount);
                }
            }
        } catch (error) {
            console.error('Error updating usage stats:', error);
        }
    }
    
    /**
     * Helper method to reset usage stats
     */
    private async resetUsageStats(): Promise<void> {
        try {
            // Try to reset through the embedding provider
            if (this.embeddingManager && this.embeddingManager.getProvider()) {
                const provider = this.embeddingManager.getProvider();
                if (provider && typeof (provider as any).resetUsageStats === 'function') {
                    await (provider as any).resetUsageStats();
                }
            }
        } catch (error) {
            console.error('Error resetting usage stats:', error);
        }
    }
    
    /**
     * Get current indexing operation ID
     */
    private getCurrentIndexingOperationId(): string | null {
        return null; // No longer supported
    }
    
    /**
     * Cancel indexing operation
     */
    private async cancelIndexing(): Promise<void> {
        try {
            // No longer supported directly
            new Notice('Canceling indexing operation is no longer supported');
        } catch (error) {
            console.error('Error canceling indexing:', error);
        }
    }
    
    // Optional callback for when settings change
    onSettingsChanged?: () => void;
}