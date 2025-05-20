import { Notice } from 'obsidian';
import { BaseSettingsTab } from './BaseSettingsTab';
import { ProgressBar } from '../ProgressBar';
import { VaultLibrarianAgent } from '../../agents/vaultLibrarian/vaultLibrarian';
import { EmbeddingManager } from '../../database/services/embeddingManager';

/**
 * Type definition for model cost map
 */
type ModelCostMap = {
    'text-embedding-3-small': number;
    'text-embedding-3-large': number;
    [key: string]: number; // Allow indexing with string keys
};

/**
 * Usage Statistics Component
 * Displays and manages usage statistics for memory and embeddings
 */
export class UsageStatsComponent extends BaseSettingsTab {
    private vaultLibrarian: VaultLibrarianAgent | null;
    private embeddingManager: EmbeddingManager | null;
    private searchService: any; // Search service reference
    
    // Type-safe access to costPerThousandTokens in settings
    private get costPerThousandTokens(): ModelCostMap {
        return (this.settings.costPerThousandTokens || {}) as ModelCostMap;
    }
    
    /**
     * Create a new usage stats component
     */
    constructor(
        settings: any, 
        settingsManager: any, 
        app: any, 
        embeddingManager?: EmbeddingManager,
        vaultLibrarian?: VaultLibrarianAgent,
        searchService?: any
    ) {
        super(settings, settingsManager, app);
        this.embeddingManager = embeddingManager || null;
        this.vaultLibrarian = vaultLibrarian || null;
        this.searchService = searchService || null;
        
        // Try to get search service from different sources if not directly provided
        if (!this.searchService) {
            // Try from vault librarian if available
            if (vaultLibrarian && (vaultLibrarian as any).searchService) {
                this.searchService = (vaultLibrarian as any).searchService;
            }
            // Try from the plugin
            else if (window.app.plugins.plugins['claudesidian-mcp']?.services?.searchService) {
                this.searchService = window.app.plugins.plugins['claudesidian-mcp'].services.searchService;
            }
            else if (window.app.plugins.plugins['claudesidian-mcp']?.searchService) {
                this.searchService = window.app.plugins.plugins['claudesidian-mcp'].searchService;
            }
        }
    }
    
    /**
     * Display the usage statistics
     */
    async display(containerEl: HTMLElement): Promise<void> {
        const section = containerEl.createEl('div', { cls: 'memory-usage-stats' });
        
        section.createEl('h3', { text: 'Usage Statistics' });
        
        // Get current stats
        let usageStats: {
            tokensThisMonth: number;
            totalEmbeddings: number;
            dbSizeMB: number;
            lastIndexedDate: string;
            indexingInProgress: boolean;
            estimatedCost?: number;
            modelUsage?: ModelCostMap;
            collectionStats?: Array<{
                name: string;
                count: number;
                color: string;
            }>;
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
            } as ModelCostMap,
            collectionStats: []
        };
        
        try {
            // Get usage stats using our helper method
            usageStats = await this.getUsageStats();
            
            // Update token usage stats if provider is available
            if (this.embeddingManager && this.embeddingManager.getProvider()) {
                this.updateUsageStats(usageStats.tokensThisMonth).catch(err => 
                    console.error('Error updating usage stats:', err)
                );
            }
        } catch (error) {
            console.error('Error getting usage stats:', error instanceof Error ? error.message : String(error));
        }
        
        // Current month usage
        section.createEl('div', {
            text: `Tokens used this month: ${usageStats.tokensThisMonth.toLocaleString()} / ${this.settings.maxTokensPerMonth.toLocaleString()}`
        });
        
        // Token usage progress bar
        const percentUsed = Math.min(100, (usageStats.tokensThisMonth / this.settings.maxTokensPerMonth) * 100);
        const progressContainer = section.createDiv({ cls: 'memory-usage-progress' });
        const progressBar = progressContainer.createDiv({ cls: 'memory-usage-bar' });
        progressBar.style.width = `${percentUsed}%`;
        
        // Collection embedding stats
        const collectionSection = section.createDiv({ cls: 'memory-collections-section' });
        collectionSection.createEl('h4', { text: 'Embeddings by Collection' });
            
        if (usageStats.collectionStats && usageStats.collectionStats.length > 0) {
            // Create collection stats container
            const collectionStatsContainer = collectionSection.createDiv({ cls: 'collection-stats-container' });
            
            // Total embeddings display
            collectionStatsContainer.createDiv({ 
                cls: 'collection-stats-total',
                text: `Total embeddings: ${usageStats.totalEmbeddings.toLocaleString()}`
            });
            
            // Create stacked bar for visualization
            const barContainer = collectionStatsContainer.createDiv({ cls: 'collection-bar-container' });
            
            // Create segments for each collection
            usageStats.collectionStats.forEach((collection: {name: string; count: number; color: string}) => {
                const percentage = (collection.count / usageStats.totalEmbeddings) * 100;
                const segment = barContainer.createDiv({ cls: 'collection-bar-segment' });
                segment.style.width = `${percentage}%`;
                segment.style.backgroundColor = collection.color;
                
                // Add tooltip
                segment.createDiv({
                    cls: 'collection-tooltip',
                    text: `${collection.name}: ${collection.count.toLocaleString()} embeddings (${percentage.toFixed(1)}%)`
                });
            });
            
            // Collection legend with counts - more compact display
            const legendContainer = collectionStatsContainer.createDiv({ cls: 'collection-legend-compact' });
            const legendHeader = legendContainer.createDiv({ cls: 'legend-header' });
            legendHeader.createEl('span', { text: 'Collection breakdown:' });
            
            // Create a flex container for the color indicators and names
            const legendItemsContainer = legendContainer.createDiv({ cls: 'legend-items-container' });
            usageStats.collectionStats.forEach((collection: {name: string; count: number; color: string}) => {
                const legendItem = legendItemsContainer.createDiv({ cls: 'legend-item-compact' });
                const colorBox = legendItem.createDiv({ cls: 'legend-color' });
                colorBox.style.backgroundColor = collection.color;
                const percentage = (collection.count / usageStats.totalEmbeddings) * 100;
                legendItem.createEl('span', { 
                    text: `${collection.name} (${percentage.toFixed(1)}%)` 
                });
            });
        } else {
            // Display message when no collections or vector store isn't initialized
            const noCollectionsMessage = collectionSection.createDiv({ cls: 'memory-no-collections' });
            noCollectionsMessage.createEl('p', { 
                text: 'No collections found. This might be because:',
                cls: 'memory-notice'
            });
            
            const reasonsList = noCollectionsMessage.createEl('ul');
            reasonsList.createEl('li', { text: 'The vector store is not yet initialized' });
            reasonsList.createEl('li', { text: 'No files have been embedded yet' });
            reasonsList.createEl('li', { text: 'There might be an issue connecting to the embedding database' });
            
            // Add a button to check the vector store status
            const checkButton = noCollectionsMessage.createEl('button', {
                text: 'Refresh Collection Data',
                cls: 'mod-cta'
            });
            
            checkButton.addEventListener('click', async () => {
                try {
                    // Try to force refresh the stats
                    await this.getCollectionStats();
                    if (this.onSettingsChanged) {
                        this.onSettingsChanged();
                    }
                } catch (error) {
                    console.error('Error refreshing collection data:', error);
                }
            });
        }
        
        // Estimated cost - use the cost from usage stats if available, otherwise calculate
        // Default to text-embedding-3-small cost (0.00002) if not defined
        const estimatedCost = usageStats.estimatedCost || 
            ((usageStats.tokensThisMonth / 1000) * 
             (this.costPerThousandTokens[this.settings.embeddingModel] || 0.00002));
        
        section.createEl('div', {
            text: `Estimated cost this month: $${estimatedCost.toFixed(4)}`
        });
        
        // Display per-model token usage if available
        if (usageStats.modelUsage) {
            const modelUsageContainer = section.createDiv({ cls: 'memory-model-usage' });
            section.createEl('h4', { text: 'Token Usage by Model' });
            
            for (const model in usageStats.modelUsage) {
                // Use type assertion for known model keys
                const modelKey = model as 'text-embedding-3-small' | 'text-embedding-3-large';
                const tokens = usageStats.modelUsage[modelKey];
                if (tokens > 0) {
                    // Use our type-safe getter for costPerThousandTokens
                    const costPerK = this.costPerThousandTokens[modelKey] || 0;
                    const modelCost = (tokens / 1000) * costPerK;
                    
                    modelUsageContainer.createEl('div', {
                        text: `${model}: ${tokens.toLocaleString()} tokens ($${modelCost.toFixed(4)})`
                    });
                }
            }
        }
        
        // Database stats - moved to collection visualization section
        
        section.createEl('div', {
            text: `Database size: ${(usageStats.dbSizeMB).toFixed(2)} MB / ${this.settings.maxDbSize} MB`
        });
        
        if (usageStats.lastIndexedDate) {
            section.createEl('div', {
                text: `Last indexed: ${new Date(usageStats.lastIndexedDate).toLocaleString()}`
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
                        // Get all markdown files from the vault
                        const files = this.app.vault.getMarkdownFiles();
                        const filePaths = files.map((file: {path: string}) => file.path);
                        
                        new Notice(`Starting indexing of ${filePaths.length} files...`);
                        
                        const plugin = window.app.plugins.plugins['claudesidian-mcp'];
                        if (!plugin) {
                            throw new Error('Plugin not found');
                        }
                        
                        if (!plugin.settings?.settings?.memory?.embeddingsEnabled) {
                            throw new Error('Embeddings are disabled in settings. Enable them in the API tab first.');
                        }
                        
                        // Track progress with an update function
                        const progressTracker = (current: number, total: number) => {
                            const percent = Math.round((current / total) * 100);
                            reindexButton.setText(`Indexing: ${percent}% (${current}/${total})`);
                        };
                        
                        // 1. Try using directly stored ChromaSearchService first
                        if (this.searchService && typeof this.searchService.batchIndexFiles === 'function') {
                            new Notice(`Started indexing ${filePaths.length} files...`);
                            await this.searchService.batchIndexFiles(filePaths, progressTracker);
                        } 
                        // 2. Try plugin.services.searchService
                        else if (plugin.services?.searchService && typeof plugin.services.searchService.batchIndexFiles === 'function') {
                            new Notice(`Started indexing ${filePaths.length} files...`);
                            await plugin.services.searchService.batchIndexFiles(filePaths, progressTracker);
                        }
                        // 3. Try direct plugin.searchService 
                        else if (plugin.searchService && typeof plugin.searchService.batchIndexFiles === 'function') {
                            new Notice(`Started indexing ${filePaths.length} files...`);
                            await plugin.searchService.batchIndexFiles(filePaths, progressTracker);
                        } 
                        else {
                            throw new Error('Search service not available to handle embedding. Please restart Obsidian and try again.');
                        }
                    } catch (error) {
                        console.error('Error reindexing:', error);
                        new Notice(`Error reindexing: ${error instanceof Error ? error.message : String(error)}`);
                    } finally {
                        // Re-enable the button and reset its text
                        reindexButton.disabled = false;
                        reindexButton.setText('Reindex All Content');
                        
                        // Refresh the UI to show updated stats
                        if (this.onSettingsChanged) {
                            this.onSettingsChanged();
                        }
                        
                        // Force refresh collection stats
                        this.getCollectionStats().catch(err => 
                            console.error('Error refreshing collection stats after indexing:', err)
                        );
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
        modelUsage?: ModelCostMap;
        collectionStats?: Array<{
            name: string;
            count: number;
            color: string;
        }>;
    }> {
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
            } as ModelCostMap,
            collectionStats: []
        };
        
        try {
            // Try to get from the embedding provider if available
            if (this.embeddingManager && this.embeddingManager.getProvider()) {
                const provider = this.embeddingManager.getProvider();
                if (provider) {
                    // Get total cost if the method exists
                    if (typeof (provider as any).getTotalCost === 'function') {
                        defaultStats.estimatedCost = (provider as any).getTotalCost() || defaultStats.estimatedCost;
                    }
                    
                    // Get model usage if the method exists
                    if (typeof (provider as any).getModelUsage === 'function') {
                        defaultStats.modelUsage = (provider as any).getModelUsage() || defaultStats.modelUsage;
                    }
                    
                    // Get total tokens for the month if the method exists
                    if (typeof (provider as any).getTokensThisMonth === 'function') {
                        defaultStats.tokensThisMonth = (provider as any).getTokensThisMonth() || defaultStats.tokensThisMonth;
                    } else {
                        // Fallback to calculating from model usage
                        defaultStats.tokensThisMonth = Object.values(defaultStats.modelUsage).reduce((sum, count) => sum + count, 0);
                    }
                    
                    console.log('Loaded token usage stats from provider:', {
                        tokensThisMonth: defaultStats.tokensThisMonth,
                        estimatedCost: defaultStats.estimatedCost,
                        modelUsage: defaultStats.modelUsage
                    });
                }
            } else {
                // Try to load from localStorage directly if provider is not available
                try {
                    if (typeof localStorage !== 'undefined') {
                        const savedUsage = localStorage.getItem('claudesidian-tokens-used');
                        if (savedUsage) {
                            const parsedUsage = JSON.parse(savedUsage);
                            if (typeof parsedUsage === 'object' && parsedUsage !== null) {
                                defaultStats.modelUsage = {
                                    'text-embedding-3-small': parsedUsage['text-embedding-3-small'] || 0,
                                    'text-embedding-3-large': parsedUsage['text-embedding-3-large'] || 0
                                };
                                
                                // Calculate total tokens from model usage
                                defaultStats.tokensThisMonth = Object.values(defaultStats.modelUsage).reduce((sum, count) => sum + count, 0);
                                
                                // Calculate estimated cost based on model usage and configured costs
                                defaultStats.estimatedCost = 0;
                                for (const model in defaultStats.modelUsage) {
                                    // Ensure type safety for model keys
                                    const modelKey = model as 'text-embedding-3-small' | 'text-embedding-3-large';
                                    const tokens = defaultStats.modelUsage[modelKey];
                                    // Use our type-safe getter for costPerThousandTokens
                                    const costPerThousand = this.costPerThousandTokens[modelKey] || 0;
                                    defaultStats.estimatedCost += (tokens / 1000) * costPerThousand;
                                }
                                
                                console.log('Loaded token usage stats from localStorage:', {
                                    tokensThisMonth: defaultStats.tokensThisMonth,
                                    estimatedCost: defaultStats.estimatedCost,
                                    modelUsage: defaultStats.modelUsage
                                });
                            }
                        }
                    }
                } catch (localStorageError) {
                    console.warn('Failed to load token usage from localStorage:', localStorageError);
                }
            }
            
            // Get collection statistics if VaultLibrarian is available
            if (this.vaultLibrarian) {
                try {
                    console.log('Getting collection stats from VaultLibrarian');
                    const stats = await this.getCollectionStats();
                    console.log('Got collection stats:', stats);
                    
                    if (stats && stats.length > 0) {
                        defaultStats.collectionStats = stats as any;
                        defaultStats.totalEmbeddings = stats.reduce((sum, stat) => sum + stat.count, 0);
                        console.log('Updated stats with collection data, total embeddings:', defaultStats.totalEmbeddings);
                    } else {
                        console.log('No collection stats found or empty array returned');
                    }
                } catch (error) {
                    console.error('Error getting collection stats:', error);
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
    
    /**
     * Get statistics for each collection
     * @returns Array of collection statistics
     */
    private async getCollectionStats(): Promise<Array<{name: string; count: number; color: string}>> {
        console.log('Getting collection statistics');
        
        // Prepare result array
        const result: Array<{name: string; count: number; color: string}> = [];
        
        // Prepare color palette
        const colors = [
            '#4285F4', '#EA4335', '#FBBC05', '#34A853', // Google colors
            '#3498DB', '#E74C3C', '#2ECC71', '#F39C12', // Flat UI colors
            '#9B59B6', '#1ABC9C', '#D35400', '#C0392B', // More colors
            '#8E44AD', '#16A085', '#27AE60', '#D35400', // Additional colors
            '#2980B9', '#E67E22', '#27AE60', '#2C3E50'  // Even more colors
        ];
        
        // Step 1: Try using the VaultLibrarian if available
        if (this.vaultLibrarian) {
            try {
                console.log('Attempting to use VaultLibrarian for collection stats');
                
                // Force initialization of search service and vector store
                if (typeof this.vaultLibrarian.initializeSearchService === 'function') {
                    console.log('Initializing search service in VaultLibrarian');
                    await this.vaultLibrarian.initializeSearchService();
                }
                
                // Get the search service from the vault librarian
                const searchService = (this.vaultLibrarian as any).searchService;
                if (searchService && searchService.vectorStore) {
                    console.log('Found search service with vector store in VaultLibrarian');
                    
                    const vectorStore = searchService.vectorStore;
                    const collections = await vectorStore.listCollections();
                    console.log('Found collections:', collections);
                    
                    // Try to get diagnostics for counts
                    try {
                        const diagnostics = await vectorStore.getDiagnostics();
                        console.log('Got diagnostics:', diagnostics);
                        
                        if (diagnostics && diagnostics.collections && diagnostics.collections.length > 0) {
                            diagnostics.collections.forEach((collection: any, index: number) => {
                                if (collection.name && collection.itemCount !== undefined) {
                                    result.push({
                                        name: collection.name,
                                        count: collection.itemCount,
                                        color: colors[index % colors.length]
                                    });
                                }
                            });
                            
                            if (result.length > 0) {
                                result.sort((a, b) => b.count - a.count);
                                console.log('Got collection stats from diagnostics:', result);
                                return result;
                            }
                        }
                    } catch (diagError) {
                        console.warn('Error getting diagnostics, falling back to count:', diagError);
                    }
                    
                    // Fallback to manual count if diagnostics didn't work
                    for (let i = 0; i < collections.length; i++) {
                        const name = collections[i];
                        try {
                            const count = await vectorStore.count(name);
                            result.push({
                                name,
                                count,
                                color: colors[i % colors.length]
                            });
                        } catch (countError) {
                            console.error(`Error getting count for collection ${name}:`, countError);
                        }
                    }
                    
                    if (result.length > 0) {
                        result.sort((a, b) => b.count - a.count);
                        console.log('Got collection stats from counts:', result);
                        return result;
                    }
                }
            } catch (vaultLibrarianError) {
                console.warn('Error using VaultLibrarian for collection stats:', vaultLibrarianError);
            }
        }
        
        // Step 2: Try getting the vector store directly from the plugin
        try {
            console.log('Attempting to get vector store directly from plugin');
            const plugin = window.app.plugins.plugins['claudesidian-mcp'];
            
            if (plugin && plugin.vectorStore) {
                console.log('Found vector store in plugin');
                
                const vectorStore = plugin.vectorStore;
                const collections = await vectorStore.listCollections();
                console.log('Found collections:', collections);
                
                // First try diagnostics
                try {
                    if (typeof vectorStore.getDiagnostics === 'function') {
                        const diagnostics = await vectorStore.getDiagnostics();
                        if (diagnostics && diagnostics.collections && diagnostics.collections.length > 0) {
                            diagnostics.collections.forEach((collection: any, index: number) => {
                                if (collection.name && collection.itemCount !== undefined) {
                                    result.push({
                                        name: collection.name,
                                        count: collection.itemCount,
                                        color: colors[index % colors.length]
                                    });
                                }
                            });
                            
                            if (result.length > 0) {
                                result.sort((a, b) => b.count - a.count);
                                console.log('Got collection stats from plugin diagnostics:', result);
                                return result;
                            }
                        }
                    }
                } catch (diagError) {
                    console.warn('Error getting vector store diagnostics:', diagError);
                }
                
                // Then try counts
                for (let i = 0; i < collections.length; i++) {
                    const name = collections[i];
                    try {
                        const count = await vectorStore.count(name);
                        result.push({
                            name,
                            count,
                            color: colors[i % colors.length]
                        });
                    } catch (countError) {
                        console.error(`Error getting count for collection ${name}:`, countError);
                    }
                }
                
                if (result.length > 0) {
                    result.sort((a, b) => b.count - a.count);
                    console.log('Got collection stats from plugin vector store counts:', result);
                    return result;
                }
            }
        } catch (pluginError) {
            console.warn('Error getting vector store from plugin:', pluginError);
        }
        
        // Step 3: If all else failed, try any service references we have
        if (this.searchService) {
            try {
                console.log('Attempting to use search service directly');
                const vectorStore = this.searchService.vectorStore;
                
                if (vectorStore) {
                    const collections = await vectorStore.listCollections();
                    
                    for (let i = 0; i < collections.length; i++) {
                        const name = collections[i];
                        try {
                            const count = await vectorStore.count(name);
                            result.push({
                                name,
                                count,
                                color: colors[i % colors.length]
                            });
                        } catch (error) {
                            console.error(`Error getting count for collection ${name}:`, error);
                        }
                    }
                    
                    if (result.length > 0) {
                        result.sort((a, b) => b.count - a.count);
                        console.log('Got collection stats from direct search service:', result);
                        return result;
                    }
                } else {
                    console.warn('No vector store found in search service');
                }
            } catch (searchServiceError) {
                console.warn('Error using search service for collection stats:', searchServiceError);
            }
        }
        
        // If we get here, we couldn't get any collection stats
        console.warn('Failed to get collection statistics from any source');
        return result;
    }
}
