import { BaseSettingsTab } from './BaseSettingsTab';
import { UsageStatsService, USAGE_EVENTS } from '../../database/services/UsageStatsService';
import { TokenUsageComponent } from './TokenUsageComponent';
import { CollectionStatsComponent } from './CollectionStatsComponent';
import { IndexingComponent } from './IndexingComponent';
import { VaultLibrarianAgent } from '../../agents/vaultLibrarian/vaultLibrarian';
import { EmbeddingManager } from '../../database/services/embeddingManager';
import { EmbeddingService } from '../../database/services/EmbeddingService';
import { ClaudesidianMCPPlugin } from '../../types';

/**
 * Usage Statistics Component
 * Serves as a container and coordinator for specialized sub-components
 * that handle specific aspects of usage statistics
 */
export class UsageStatsComponent extends BaseSettingsTab {
    // These are kept for compatibility with other components
    private readonly vaultLibrarian: VaultLibrarianAgent | null; // eslint-disable-line @typescript-eslint/no-unused-vars
    private readonly embeddingManager: EmbeddingManager | null; // eslint-disable-line @typescript-eslint/no-unused-vars
    private searchService: any;
    private embeddingService: EmbeddingService | null;
    private usageStatsService: UsageStatsService;
    
    // The container element where the component is displayed
    private containerEl!: HTMLElement; // ! operator to tell TypeScript it will be initialized before use
    
    // Sub-components
    private tokenUsageComponent: TokenUsageComponent | null = null;
    private collectionStatsComponent: CollectionStatsComponent | null = null;
    private indexingComponent: IndexingComponent | null = null;
    
    /**
     * Create a new usage stats component
     */
    constructor(
        settings: any, 
        settingsManager: any, 
        app: any, 
        embeddingManager?: EmbeddingManager,
        vaultLibrarian?: VaultLibrarianAgent,
        searchService?: any,
        embeddingService?: EmbeddingService,
        plugin?: ClaudesidianMCPPlugin
    ) {
        super(settings, settingsManager, app, plugin);
        this.embeddingManager = embeddingManager || null;
        this.vaultLibrarian = vaultLibrarian || null;
        this.searchService = searchService || null;
        this.embeddingService = embeddingService || null;
        
        // Try to get embedding service if not provided
        if (!this.embeddingService) {
            const plugin = this.plugin || (window as any).app.plugins.plugins[this.pluginContext?.pluginId || 'claudesidian-mcp'];
            if (plugin?.services?.embeddingService) {
                this.embeddingService = plugin.services.embeddingService;
            } else if (plugin?.embeddingService) {
                this.embeddingService = plugin.embeddingService;
            }
        }
        
        // Try to get search service from different sources if not directly provided
        if (!this.searchService) {
            // Try from vault librarian if available
            if (vaultLibrarian && (vaultLibrarian as any).searchService) {
                this.searchService = (vaultLibrarian as any).searchService;
            }
            // Try from the plugin
            else if ((window as any).app.plugins.plugins['claudesidian-mcp']?.services?.searchService) {
                this.searchService = (window as any).app.plugins.plugins['claudesidian-mcp'].services.searchService;
            }
            else if ((window as any).app.plugins.plugins['claudesidian-mcp']?.searchService) {
                this.searchService = (window as any).app.plugins.plugins['claudesidian-mcp'].searchService;
            }
        }
        
        // Get the global usage stats service instance
        const pluginObj = (window as any).app.plugins.plugins['claudesidian-mcp'];
        
        // Use the global service if available, otherwise fall back to creating a new one
        if (pluginObj?.services?.usageStatsService) {
            this.usageStatsService = pluginObj.services.usageStatsService;
            console.log('Using global UsageStatsService instance');
        } else if (pluginObj?.usageStatsService) {
            this.usageStatsService = pluginObj.usageStatsService;
            console.log('Using global UsageStatsService instance from plugin');
        } else {
            // Fallback to local service creation (should rarely happen)
            const vectorStore = pluginObj?.vectorStore || (this.searchService?.vectorStore);
            
            if (!vectorStore) {
                console.warn('Vector store not available for UsageStatsService');
            }
            
            this.usageStatsService = new UsageStatsService(
                this.embeddingService?.getProvider() || null,
                vectorStore,
                this.settings,
                pluginObj?.eventManager // Pass the plugin's event manager if available
            );
            console.warn('Created new local UsageStatsService instance (fallback)');
        }
    }
    
    /**
     * Display the usage statistics
     */
    async display(containerEl: HTMLElement): Promise<void> {
        // Store the container element for reference
        this.containerEl = containerEl;
        
        const section = containerEl.createEl('div', { cls: 'memory-usage-stats' });
        
        section.createEl('h3', { text: 'Usage Statistics' });
        
        // Create sub-component containers
        const tokenUsageContainer = section.createDiv({ cls: 'memory-token-usage' });
        const collectionStatsContainer = section.createDiv({ cls: 'memory-collection-stats' });
        const indexingContainer = section.createDiv({ cls: 'memory-indexing' });
        
        // Initialize sub-components 
        this.tokenUsageComponent = new TokenUsageComponent(
            tokenUsageContainer,
            this.usageStatsService,
            this.settings
        );
        
        this.collectionStatsComponent = new CollectionStatsComponent(
            collectionStatsContainer,
            this.usageStatsService,
            this.settings
        );
        
        const plugin = (window as any).app.plugins.plugins['claudesidian-mcp'];
        
        this.indexingComponent = new IndexingComponent(
            indexingContainer,
            this.usageStatsService,
            this.settings,
            this.app,
            // Use non-null assertion since we check in the constructor
            this.embeddingService!, // We already verified this in the constructor
            plugin
        );
        
        // Display all sub-components
        await this.tokenUsageComponent.display();
        await this.collectionStatsComponent.display();
        await this.indexingComponent.display();
        
        // Initially fetch all stats and force refresh the UI
        await this.usageStatsService.refreshStats();
        
        // Explicitly update all components
        if (this.tokenUsageComponent) {
            await this.tokenUsageComponent.refresh();
        }
        
        if (this.collectionStatsComponent) {
            await this.collectionStatsComponent.refresh();
        }
        
        // Register for system events
        const pluginInstance = (window as any).app.plugins.plugins['claudesidian-mcp'];
        if (pluginInstance?.eventManager) {
            pluginInstance.eventManager.on('embedding-created', async () => {
                console.log('Embedding created event received, refreshing stats');
                await this.refresh();
            });
            
            pluginInstance.eventManager.on('batch-embedding-completed', async () => {
                console.log('Batch embedding completed event received, refreshing stats');
                await this.refresh();
            });
            
            pluginInstance.eventManager.on('collection-stats-updated', async () => {
                console.log('Collection stats updated event received, refreshing stats');
                await this.refresh();
            });
        }
        
        // Also listen for the special collections purged event from UsageStatsService
        if (this.usageStatsService) {
            this.usageStatsService.on(USAGE_EVENTS.COLLECTIONS_PURGED, async () => {
                console.log('Collections purged event received, forcing complete refresh');
                // Explicitly request a new set of stats by setting all components to null
                this.tokenUsageComponent = null;
                this.collectionStatsComponent = null;
                this.indexingComponent = null;
                
                // Force a complete redisplay of all components
                await this.display(this.containerEl);
            });
        }
    }
    
    // Optional callback for when settings change
    onSettingsChanged?: () => void;
    
    /**
     * Refresh all stats when requested
     */
    async refresh(): Promise<void> {
        await this.usageStatsService.refreshStats();
    }
}