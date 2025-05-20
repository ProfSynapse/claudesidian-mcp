import { Notice } from 'obsidian';
import { ProgressBar } from '../ProgressBar';
import { UsageStatsService } from '../../database/services/UsageStatsService';

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
        
        // Reindex button
        const reindexButton = actionsContainer.createEl('button', {
            text: 'Reindex All Content',
            cls: 'mod-cta'
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
                    console.log('Provider found:', provider.constructor.name);
                    
                    // Directly access and log the token usage
                    if ((provider as any).modelUsage) {
                        console.log('Current model usage:', (provider as any).modelUsage);
                    } else {
                        console.log('Provider has no modelUsage property');
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
            // Get all markdown files from the vault
            const files = this.app.vault.getMarkdownFiles();
            const filePaths = files.map((file: {path: string}) => file.path);
            
            new Notice(`Starting indexing of ${filePaths.length} files...`);
            
            // Check if embeddings are enabled
            if (!this.plugin.settings?.settings?.memory?.embeddingsEnabled) {
                throw new Error('Embeddings are disabled in settings. Enable them in the API tab first.');
            }
            
            // Track progress with an update function that updates the progress bar
            const progressTracker = (current: number, total: number) => {
                // Update the progress bar using the global handler if available
                if ((window as any).mcpProgressHandlers && (window as any).mcpProgressHandlers.updateProgress) {
                    (window as any).mcpProgressHandlers.updateProgress({
                        total: total,
                        processed: current,
                        remaining: total - current
                    });
                }
            };
            
            // Try to use embeddingService (direct injection preferred)
            if (this.embeddingService && typeof this.embeddingService.batchIndexFiles === 'function') {
                await this.embeddingService.batchIndexFiles(filePaths, progressTracker);
                
                // Force a stats update afterward to ensure the UI refreshes
                await this.forceStatsUpdate(this.embeddingService);
            }
            // Fallback methods if direct injection isn't available
            else if (this.plugin.services?.embeddingService && 
                typeof this.plugin.services.embeddingService.batchIndexFiles === 'function') {
                await this.plugin.services.embeddingService.batchIndexFiles(filePaths, progressTracker);
                
                // Force a stats update afterward to ensure the UI refreshes
                await this.forceStatsUpdate(this.plugin.services.embeddingService);
            }
            else if (this.plugin.embeddingService && 
                typeof this.plugin.embeddingService.batchIndexFiles === 'function') {
                await this.plugin.embeddingService.batchIndexFiles(filePaths, progressTracker);
                
                // Force a stats update afterward to ensure the UI refreshes
                await this.forceStatsUpdate(this.plugin.embeddingService);
            }
            else {
                throw new Error('Embedding service not available. Please restart Obsidian and try again.');
            }
            
            // Manually trigger usage stats update via the plugin's service
            if (this.plugin.services?.usageStatsService) {
                console.log('Refreshing via plugin UsageStatsService');
                await this.plugin.services.usageStatsService.refreshStats();
            }
            
            new Notice(`Completed indexing of ${filePaths.length} files`);
        } catch (error) {
            console.error('Error reindexing:', error);
            new Notice(`Error reindexing: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            // Re-enable the button and reset its text
            reindexButton.removeAttribute('disabled');
            reindexButton.textContent = 'Reindex All Content';
            
            // Wait a moment to ensure all stats are updated
            setTimeout(async () => {
                // Force refresh the stats using both methods for redundancy
                await this.usageStatsService.refreshStats();
                
                if (this.plugin.services?.usageStatsService) {
                    await this.plugin.services.usageStatsService.refreshStats();
                }
            }, 1000);
        }
    }
}