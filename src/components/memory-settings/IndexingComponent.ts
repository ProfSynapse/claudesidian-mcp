import { Notice } from 'obsidian';
import { ProgressBar } from '../ProgressBar';
import { UsageStatsService } from '../../database/services/usage/UsageStatsService';
import { EmbeddingProviderRegistry } from '../../database/providers/registry/EmbeddingProviderRegistry';

/**
 * Component for handling indexing operations
 * Focused solely on reindexing functionality
 */
export class IndexingComponent {
    private containerEl: HTMLElement;
    private usageStatsService: UsageStatsService;
    // Settings are stored and may be used in the future
    private readonly settings: any; // eslint-disable-line @typescript-eslint/no-unused-vars
    private app: any;
    private embeddingService: any;
    private plugin: any;
    
    /**
     * Create a new indexing component
     * @param containerEl Container element
     * @param usageStatsService Usage stats service
     * @param settings Settings
     * @param app Obsidian app
     * @param embeddingService Embedding service
     * @param plugin Plugin instance
     */
    constructor(
        containerEl: HTMLElement, 
        usageStatsService: UsageStatsService, 
        settings: any,
        app: any,
        embeddingService: any,
        plugin: any
    ) {
        this.containerEl = containerEl;
        this.usageStatsService = usageStatsService;
        this.settings = settings;
        this.app = app;
        this.embeddingService = embeddingService;
        this.plugin = plugin;
    }
    
    /**
     * Display the indexing component
     */
    async display(): Promise<void> {
        // Clear the container first
        this.containerEl.empty();
        
        // Create section header
        this.containerEl.createEl('h4', { text: 'Content Indexing' });
        
        // Create indexing progress bar container
        const indexingProgressContainer = this.containerEl.createDiv({ cls: 'memory-indexing-progress' });
        
        // Initialize progress bar
        if (this.app) {
            new ProgressBar(indexingProgressContainer, this.app);
        }
        
        // Action buttons
        const actionsContainer = this.containerEl.createDiv({ cls: 'memory-actions' });
        
        // Check if there's a resumable indexing operation
        let hasResumable = false;
        
        console.log('DEBUG: Checking for resumable indexing...');
        console.log('DEBUG: this.embeddingService:', !!this.embeddingService);
        console.log('DEBUG: this.plugin.services?.embeddingService:', !!this.plugin.services?.embeddingService);
        console.log('DEBUG: this.plugin.embeddingService:', !!this.plugin.embeddingService);
        
        try {
            if (this.embeddingService && typeof this.embeddingService.hasResumableIndexing === 'function') {
                console.log('DEBUG: Using this.embeddingService.hasResumableIndexing()');
                hasResumable = await this.embeddingService.hasResumableIndexing();
                console.log('DEBUG: hasResumable from this.embeddingService:', hasResumable);
            } else if (this.plugin.services?.embeddingService && typeof this.plugin.services.embeddingService.hasResumableIndexing === 'function') {
                console.log('DEBUG: Using this.plugin.services.embeddingService.hasResumableIndexing()');
                hasResumable = await this.plugin.services.embeddingService.hasResumableIndexing();
                console.log('DEBUG: hasResumable from this.plugin.services.embeddingService:', hasResumable);
            } else if (this.plugin.embeddingService && typeof this.plugin.embeddingService.hasResumableIndexing === 'function') {
                console.log('DEBUG: Using this.plugin.embeddingService.hasResumableIndexing()');
                hasResumable = await this.plugin.embeddingService.hasResumableIndexing();
                console.log('DEBUG: hasResumable from this.plugin.embeddingService:', hasResumable);
            } else {
                console.warn('DEBUG: No embedding service with hasResumableIndexing method found');
                // Let's try to check localStorage directly as a fallback
                const stateStr = localStorage.getItem('claudesidian-indexing-state');
                console.log('DEBUG: Direct localStorage check:', stateStr);
                if (stateStr) {
                    try {
                        const state = JSON.parse(stateStr);
                        console.log('DEBUG: Parsed state:', state);
                        hasResumable = state !== null && 
                                      (state.status === 'paused' || state.status === 'indexing') && 
                                      state.pendingFiles && state.pendingFiles.length > 0;
                        console.log('DEBUG: hasResumable from direct localStorage check:', hasResumable);
                    } catch (parseError) {
                        console.error('DEBUG: Error parsing localStorage state:', parseError);
                    }
                }
            }
        } catch (error) {
            console.error('DEBUG: Error checking for resumable indexing:', error);
        }
        
        console.log('DEBUG: Final hasResumable value:', hasResumable);
        
        // Show resume button if there's a resumable operation
        if (hasResumable) {
            const resumeButton = actionsContainer.createEl('button', {
                text: 'Resume Indexing',
                cls: 'mod-cta mod-warning'
            });
            
            resumeButton.addEventListener('click', async () => {
                await this.handleResumeOperation(resumeButton);
            });
            
            // Add some spacing
            actionsContainer.createEl('span', { text: ' ' });
        }
        
        // Reindex button
        const reindexButton = actionsContainer.createEl('button', {
            text: 'Reindex All Content',
            cls: hasResumable ? '' : 'mod-cta'
        });
        
        reindexButton.addEventListener('click', async () => {
            if (confirm('This will reindex all your vault content. It may take a while and use API tokens. Continue?')) {
                await this.handleReindexOperation(reindexButton);
            }
        });
    }
    
    /**
     * Refresh the component
     */
    async refresh(): Promise<void> {
        // Redisplay the component
        await this.display();
    }
    
    /**
     * Force a stats update for token usage data
     * @param embeddingService The embedding service to use
     */
    private async forceStatsUpdate(embeddingService: any): Promise<void> {
        try {
            console.log('Forcing token usage stats update...');
            
            if (embeddingService) {
                const provider = embeddingService.getProvider();
                if (provider) {
                    
                    // Directly access and log the token usage
                    if ((provider as any).modelUsage) {
                    } else {
                    }
                    
                    // Manually update localStorage to ensure data is saved
                    if (typeof localStorage !== 'undefined' && (provider as any).modelUsage) {
                        localStorage.setItem('claudesidian-tokens-used', JSON.stringify((provider as any).modelUsage));
                        console.log('Manually saved token usage to localStorage:', (provider as any).modelUsage);
                        
                        // Force storage event
                        if (typeof window !== 'undefined' && typeof StorageEvent === 'function') {
                            window.dispatchEvent(new StorageEvent('storage', {
                                key: 'claudesidian-tokens-used',
                                newValue: JSON.stringify((provider as any).modelUsage),
                                storageArea: localStorage
                            }));
                        }
                    }
                } else {
                    console.log('No provider available from embedding service');
                }
            } else {
                console.log('No embedding service available');
            }
        } catch (error) {
            console.error('Error forcing stats update:', error);
        }
    }

    /**
     * Handle reindexing operation
     * @param reindexButton Button element to update during operation
     */
    private async handleReindexOperation(reindexButton: HTMLElement): Promise<void> {
        // Disable the button during indexing
        reindexButton.setAttribute('disabled', 'true');
        reindexButton.textContent = 'Indexing in progress...';
        
        try {
            // Get embedding service
            const embeddingService = this.embeddingService || 
                                   this.plugin.services?.embeddingService || 
                                   this.plugin.embeddingService;
            
            if (!embeddingService) {
                throw new Error('Embedding service not available');
            }
            
            // Check if there's already a resumable reindex operation
            const hasResumable = await embeddingService.hasResumableIndexing();
            if (hasResumable) {
                const shouldResume = confirm('Found incomplete reindex operation. Resume from where you left off?');
                if (shouldResume) {
                    await this.handleResumeOperation(reindexButton as HTMLButtonElement);
                    return;
                } else {
                    // Clear old state and start fresh
                    if (embeddingService.stateManager) {
                        await embeddingService.stateManager.clearState();
                    }
                }
            }
            
            // Get all markdown files from the vault
            const files = this.app.vault.getMarkdownFiles();
            const filePaths = files.map((file: {path: string}) => file.path);
            
            new Notice(`Starting indexing of ${filePaths.length} files...`);
            
            // Check if embeddings are enabled
            if (!this.plugin.settings?.settings?.memory?.embeddingsEnabled) {
                // Instead of throwing an error, try to enable embeddings automatically
                try {
                    console.log('Embeddings were disabled, attempting to enable them for this operation...');
                    if (this.plugin.settings?.settings?.memory) {
                        this.plugin.settings.settings.memory.embeddingsEnabled = true;
                        await this.plugin.settings.saveSettings();
                        
                        // Update embedding service directly
                        if (this.embeddingService && typeof this.embeddingService.updateSettings === 'function') {
                            await this.embeddingService.updateSettings(this.plugin.settings.settings.memory);
                            console.log('Successfully enabled embeddings for this operation');
                        } else {
                            throw new Error('Embeddings service not available to update');
                        }
                    } else {
                        throw new Error('Memory settings not initialized');
                    }
                } catch (error) {
                    console.error('Failed to automatically enable embeddings:', error);
                    throw new Error('Embeddings are disabled in settings. Enable them in the API tab first.');
                }
            }
            
            // Check if the API key is present for providers that require it
            const memorySettings = this.plugin.settings?.settings?.memory;
            const providerConfig = EmbeddingProviderRegistry.getProvider(memorySettings?.apiProvider);
            const currentProvider = memorySettings?.providerSettings?.[memorySettings?.apiProvider];
            
            // Only check for API key if the provider requires it
            if (providerConfig?.requiresApiKey && !currentProvider?.apiKey) {
                throw new Error(`${memorySettings?.apiProvider || 'API'} key is required but not provided. Add your API key in the API tab.`);
            }
            
            // Initialize state tracking for resumable reindexing
            if (embeddingService.stateManager) {
                await embeddingService.stateManager.initializeIndexing(filePaths, 'reindex');
            }
            
            // Initialize progress bar immediately
            if ((window as any).mcpProgressHandlers && (window as any).mcpProgressHandlers.updateProgress) {
                (window as any).mcpProgressHandlers.updateProgress({
                    total: filePaths.length,
                    processed: 0,
                    remaining: filePaths.length,
                    operationId: 'batch-index'
                });
            }
            
            // Track progress with an update function that updates the progress bar
            const progressTracker = (current: number, total: number) => {
                // Update the progress bar using the global handler if available
                if ((window as any).mcpProgressHandlers && (window as any).mcpProgressHandlers.updateProgress) {
                    (window as any).mcpProgressHandlers.updateProgress({
                        total: total,
                        processed: current,
                        remaining: total - current,
                        operationId: 'batch-index'
                    });
                }
            };
            
            // Use resumable batch indexing instead of regular batch indexing
            if (embeddingService && typeof embeddingService.resumableBatchIndexFiles === 'function') {
                await embeddingService.resumableBatchIndexFiles(filePaths, progressTracker);
                
                // Force a stats update afterward to ensure the UI refreshes
                await this.forceStatsUpdate(embeddingService);
            }
            // Fallback to regular batch indexing if resumable not available
            else if (embeddingService && typeof embeddingService.batchIndexFiles === 'function') {
                await embeddingService.batchIndexFiles(filePaths, progressTracker);
                
                // Force a stats update afterward to ensure the UI refreshes
                await this.forceStatsUpdate(embeddingService);
            }
            else {
                throw new Error('Embedding service not available. Please restart Obsidian and try again.');
            }
            
            // Force vector store collection stats refresh
            try {
                const vectorStore = this.plugin.vectorStore || this.plugin.services?.vectorStore;
                if (vectorStore) {
                    console.log('Refreshing vector store collection stats');
                    
                    // Explicitly validate collections to ensure stats are accurate
                    const validationResult = await vectorStore.validateCollections();
                    console.log('Collection validation results:', validationResult);
                    
                    // Force direct collection stats re-reading
                    if (typeof (vectorStore as any).refreshCollections === 'function') {
                        await (vectorStore as any).refreshCollections();
                        console.log('Explicitly refreshed vector store collections');
                    }
                    
                    // Get fresh count of file embeddings
                    try {
                        const fileEmbeddingsCount = await vectorStore.count('file_embeddings');
                        console.log(`Current file_embeddings count: ${fileEmbeddingsCount}`);
                    } catch (countError) {
                        console.warn('Error getting file_embeddings count:', countError);
                    }
                }
            } catch (refreshError) {
                console.warn('Error refreshing vector store collections:', refreshError);
            }
            
            // Manually trigger usage stats update via the plugin's service
            if (this.plugin.services?.usageStatsService) {
                console.log('Refreshing via plugin UsageStatsService');
                await this.plugin.services.usageStatsService.refreshStats();
            }
            
            // Clear the state after successful completion
            if (embeddingService.stateManager) {
                await embeddingService.stateManager.clearState();
            }
            
            new Notice(`Completed indexing of ${filePaths.length} files`);
        } catch (error) {
            console.error('Error reindexing:', error);
            new Notice(`Error reindexing: ${error instanceof Error ? error.message : String(error)}`);
            
            // Mark as paused on error to allow resuming
            const embeddingService = this.embeddingService || 
                                   this.plugin.services?.embeddingService || 
                                   this.plugin.embeddingService;
            if (embeddingService?.stateManager) {
                await embeddingService.stateManager.pauseIndexing();
            }
        } finally {
            // Re-enable the button and reset its text
            reindexButton.removeAttribute('disabled');
            reindexButton.textContent = 'Reindex All Content';
            
            // Refresh the component to update button state (for resume button)
            await this.display();
            
            // Wait a moment to ensure all stats are updated
            setTimeout(async () => {
                try {
                    // Force collection data refresh first to ensure stats are up-to-date
                    const vectorStore = this.plugin.vectorStore || this.plugin.services?.vectorStore;
                    if (vectorStore) {
                        // Run explicit collection validation
                        await vectorStore.validateCollections();
                        
                        // Directly update collection information if possible
                        if (typeof (vectorStore as any).refreshCollections === 'function') {
                            await (vectorStore as any).refreshCollections();
                        }
                    }
                    
                    // Use the more aggressive complete refresh method which handles collection purging
                    console.log('Final stats refresh after reindexing - using forceCompleteRefresh');
                    
                    if (this.plugin.services?.usageStatsService) {
                        try {
                            // Check if the service has the forceCompleteRefresh method (it should from our changes)
                            if (typeof (this.plugin.services.usageStatsService as any).forceCompleteRefresh === 'function') {
                                await (this.plugin.services.usageStatsService as any).forceCompleteRefresh();
                                console.log('Successfully performed complete stats refresh');
                            } else {
                                // Fall back to regular refresh
                                await this.plugin.services.usageStatsService.refreshStats();
                            }
                        } catch (refreshError) {
                            console.warn('Error during complete stats refresh:', refreshError);
                            // Fall back to regular refresh
                            await this.plugin.services.usageStatsService.refreshStats();
                        }
                    } else if (this.usageStatsService) {
                        // Try with our own service instance
                        try {
                            if (typeof (this.usageStatsService as any).forceCompleteRefresh === 'function') {
                                await (this.usageStatsService as any).forceCompleteRefresh();
                            } else {
                                await this.usageStatsService.refreshStats();
                            }
                        } catch (refreshError) {
                            console.warn('Error refreshing stats:', refreshError);
                            await this.usageStatsService.refreshStats();
                        }
                    }
                    
                    // Force UI update to ensure collection percentages are updated
                    if (this.plugin.services?.eventManager?.emit) {
                        // Emit multiple events to ensure all UI components are updated
                        this.plugin.services.eventManager.emit('collection-stats-updated', {
                            timestamp: Date.now(),
                            source: 'reindex-operation'
                        });
                        
                        // Also emit a more general event that will trigger UI refreshes
                        this.plugin.services.eventManager.emit('embedding-stats-changed', {
                            timestamp: Date.now(),
                            source: 'reindex-operation',
                            collectionRefreshed: true
                        });
                    }
                    
                    // As a fail-safe, explicitly reload usage stats components if possible
                    try {
                        // Try to access any 'refresh' methods on UI components that display collection stats
                        const components = [
                            this.plugin.services?.collectionStatsComponent,
                            this.plugin.collectionStatsComponent,
                            this.plugin.services?.usageStatsComponent,
                            this.plugin.usageStatsComponent
                        ].filter(Boolean);
                        
                        for (const component of components) {
                            if (component && typeof component.refresh === 'function') {
                                console.log('Explicitly refreshing UI component:', component.constructor.name);
                                await component.refresh();
                            }
                        }
                    } catch (componentRefreshError) {
                        console.warn('Error refreshing UI components:', componentRefreshError);
                    }
                } catch (finalRefreshError) {
                    console.warn('Error during final stats refresh:', finalRefreshError);
                }
            }, 2000); // Increased timeout to ensure all operations complete
        }
    }
    
    /**
     * Handle resume indexing operation
     * @param resumeButton The resume button element
     */
    private async handleResumeOperation(resumeButton: HTMLButtonElement): Promise<void> {
        try {
            // Disable the button to prevent multiple clicks
            resumeButton.setAttribute('disabled', 'true');
            resumeButton.textContent = 'Resuming...';
            
            // Track progress with an update function that updates the progress bar
            const progressTracker = (current: number, total: number) => {
                // Update the progress bar using the global handler if available
                if ((window as any).mcpProgressHandlers && (window as any).mcpProgressHandlers.updateProgress) {
                    (window as any).mcpProgressHandlers.updateProgress({
                        total: total,
                        processed: current,
                        remaining: total - current,
                        operationId: 'batch-index'
                    });
                }
            };
            
            // Try to use embeddingService (direct injection preferred)
            if (this.embeddingService && typeof this.embeddingService.resumeIndexing === 'function') {
                await this.embeddingService.resumeIndexing(progressTracker);
                
                // Force a stats update afterward to ensure the UI refreshes
                await this.forceStatsUpdate(this.embeddingService);
            }
            // Fallback methods if direct injection isn't available
            else if (this.plugin.services?.embeddingService && 
                typeof this.plugin.services.embeddingService.resumeIndexing === 'function') {
                await this.plugin.services.embeddingService.resumeIndexing(progressTracker);
                
                // Force a stats update afterward to ensure the UI refreshes
                await this.forceStatsUpdate(this.plugin.services.embeddingService);
            }
            else if (this.plugin.embeddingService && 
                typeof this.plugin.embeddingService.resumeIndexing === 'function') {
                await this.plugin.embeddingService.resumeIndexing(progressTracker);
                
                // Force a stats update afterward to ensure the UI refreshes
                await this.forceStatsUpdate(this.plugin.embeddingService);
            }
            else {
                throw new Error('Embedding service not available for resuming indexing');
            }
            
            new Notice('Successfully resumed and completed indexing');
            
            // Refresh the component to update button state
            await this.display();
        } catch (error) {
            console.error('Error resuming indexing:', error);
            new Notice(`Error resuming indexing: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            // Re-enable the button and reset its text
            resumeButton.removeAttribute('disabled');
            resumeButton.textContent = 'Resume Indexing';
        }
    }
}