import { Notice, Setting } from 'obsidian';
import { BaseSettingsTab } from './BaseSettingsTab';
import { UsageStatsComponent } from './UsageStatsComponent';
import { DeleteCollectionComponent } from './DeleteCollectionComponent';
import { UsageStatsService } from '../../database/services/UsageStatsService';
import { VaultLibrarianAgent } from '../../agents/vaultLibrarian/vaultLibrarian';
import { EmbeddingManager } from '../../database/services/embeddingManager';

/**
 * Usage Settings Tab component
 * Handles usage limits, displays usage statistics, and manages collections
 */
export class UsageSettingsTab extends BaseSettingsTab {
    private embeddingManager: EmbeddingManager | null;
    private vaultLibrarian: VaultLibrarianAgent | null;
    private usageStatsComponent: UsageStatsComponent | null = null;
    private deleteCollectionComponent: DeleteCollectionComponent | null = null;
    private usageStatsService: UsageStatsService | null = null;
    private vectorStore: any = null;
    
    /**
     * Create a new usage settings tab
     */
    // Flag to prevent recursive refreshes
    private isRefreshing = false;
    // Storage event handler
    private storageEventHandler: (e: StorageEvent) => void;
    
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
        
        // Initialize the UsageStatsService
        this.initializeUsageStatsService();
        
        // Set up storage event listener for collection deletion events
        this.storageEventHandler = (e: StorageEvent) => {
            if (e.key === 'claudesidian-collection-deleted' || e.key === 'claudesidian-collections-purged') {
                console.log(`UsageSettingsTab: Detected collection change via localStorage: ${e.key}`);
                // Use setTimeout to avoid immediate refresh that could cause cycles
                setTimeout(() => {
                    if (!this.isRefreshing) {
                        this.refreshStats();
                    }
                }, 500);
            }
        };
        
        if (typeof window !== 'undefined') {
            window.addEventListener('storage', this.storageEventHandler);
        }
    }
    
    /**
     * Initialize the UsageStatsService and VectorStore
     */
    private initializeUsageStatsService(): void {
        const plugin = (window as any).app.plugins.plugins['claudesidian-mcp'];
        if (!plugin) {
            console.warn('Plugin not found for UsageStatsService');
            return;
        }
        
        // Get the vector store first, as it's needed for both the UsageStatsService and DeleteCollectionComponent
        this.vectorStore = plugin.services?.vectorStore || plugin.vectorStore;
        
        // First try to get the global service instance
        if (plugin.services?.usageStatsService) {
            this.usageStatsService = plugin.services.usageStatsService;
            console.log('UsageSettingsTab: Using global UsageStatsService from services');
        } else if (plugin.usageStatsService) {
            this.usageStatsService = plugin.usageStatsService;
            console.log('UsageSettingsTab: Using global UsageStatsService from plugin');
        } else {
            // If we couldn't get the global instance, create a new one (this should rarely happen)
            console.warn('UsageSettingsTab: Global UsageStatsService not found, creating local instance (fallback)');
            
            // Get the embedding service
            const embeddingService = plugin.services?.embeddingService || plugin.embeddingService;
            
            if (embeddingService && this.vectorStore) {
                this.usageStatsService = new UsageStatsService(
                    embeddingService,
                    this.vectorStore,
                    this.settings,
                    plugin.eventManager // Pass the global event manager
                );
            } else {
                console.warn('Missing dependencies for UsageStatsService', {
                    embeddingService: !!embeddingService,
                    vectorStore: !!this.vectorStore
                });
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
            .setDesc('Maximum tokens to process per month (1M ≈ $0.02 for small model)')
            .addText(text => text
                .setPlaceholder('1000000')
                .setValue(String(this.settings.maxTokensPerMonth))
                .onChange(async (value: string) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue) && numValue > 0) {
                        this.settings.maxTokensPerMonth = numValue;
                        await this.saveSettings();
                    }
                })
            );
            
        // Add update button directly next to the monthly token limit
        tokenLimitSetting.addButton((button: any) => button
            .setButtonText('Update Usage Counter')
            .setCta()
            .onClick(async () => {
                // Get current token usage
                let tokensThisMonth = 0;
                if (this.usageStatsService) {
                    const stats = await this.usageStatsService.getUsageStats();
                    tokensThisMonth = stats.tokensThisMonth;
                } else if (this.embeddingManager && this.embeddingManager.getProvider()) {
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
                        if (this.usageStatsService) {
                            await this.usageStatsService.updateUsageStats(numValue);
                        } else if (this.embeddingManager && this.embeddingManager.getProvider()) {
                            const provider = this.embeddingManager.getProvider();
                            if (provider && typeof (provider as any).updateUsageStats === 'function') {
                                await (provider as any).updateUsageStats(numValue);
                            }
                        }
                        this.refreshStats();
                    } else {
                        new Notice('Please enter a valid number for token count');
                    }
                }
            })
        );
            
        new Setting(containerEl)
            .setName('API Rate Limit')
            .setDesc('Maximum API requests per minute')
            .addSlider((slider: any) => slider
                .setLimits(10, 1000, 10)
                .setValue(this.settings.apiRateLimitPerMinute)
                .setDynamicTooltip()
                .onChange(async (value: number) => {
                    this.settings.apiRateLimitPerMinute = value;
                    await this.saveSettings();
                })
            );
            
        // Ensure cost per thousand tokens is set with the correct values
        if (!this.settings.costPerThousandTokens) {
            this.settings.costPerThousandTokens = {
                'text-embedding-3-small': 0.00002, // $0.02 per million
                'text-embedding-3-large': 0.00013  // $0.13 per million
            };
            this.saveSettings();
        } else {
            // Update the values to ensure they're correct
            this.settings.costPerThousandTokens['text-embedding-3-small'] = 0.00002;
            this.settings.costPerThousandTokens['text-embedding-3-large'] = 0.00013;
            this.saveSettings();
        }
            
        // Usage statistics section
        // Create a container for the usage stats component
        const usageStatsContainer = containerEl.createDiv({ cls: 'usage-stats-container' });
        
        // Create and display the UsageStatsComponent
        if (!this.usageStatsComponent) {
            // Get necessary dependencies for the component
            const plugin = (window as any).app.plugins.plugins['claudesidian-mcp'];
            const embeddingService = plugin?.services?.embeddingService || plugin?.embeddingService;
            const searchService = plugin?.services?.searchService || plugin?.searchService || 
                (this.vaultLibrarian && (this.vaultLibrarian as any).searchService);
            
            this.usageStatsComponent = new UsageStatsComponent(
                this.settings,
                this.settingsManager,
                this.app,
                this.embeddingManager || undefined,
                this.vaultLibrarian || undefined,
                searchService,
                embeddingService
            );
            
            // Set up callback for when settings change
            this.usageStatsComponent.onSettingsChanged = () => {
                this.refreshStats();
            };
        }
        
        this.usageStatsComponent.display(usageStatsContainer);
        
        // Collection Management Section (moved from EmbeddingSettingsTab)
        const collectionManagementContainer = containerEl.createDiv({ cls: 'collection-management-container' });
        
        // Only display if we have a vector store and usage stats service
        if (this.vectorStore && this.usageStatsService) {
            // Create and display the DeleteCollectionComponent
            if (!this.deleteCollectionComponent) {
                this.deleteCollectionComponent = new DeleteCollectionComponent(
                    collectionManagementContainer,
                    this.vectorStore,
                    this.usageStatsService,
                    this.settings
                );
            } else {
                // If already created, just set the container and refresh
                this.deleteCollectionComponent = new DeleteCollectionComponent(
                    collectionManagementContainer,
                    this.vectorStore,
                    this.usageStatsService,
                    this.settings
                );
            }
            
            // Initialize the component with collections
            this.deleteCollectionComponent.refresh();
        } else {
            collectionManagementContainer.createEl('div', { 
                text: 'Collection management is not available. Vector store or usage stats service not initialized.',
                cls: 'collection-management-error'
            });
        }
    }
    
    /**
     * Explicitly refreshes token usage statistics and updates the UI
     * This ensures the UI is updated properly after operations
     */
    private async refreshStats(): Promise<void> {
        // Prevent recursive refreshes
        if (this.isRefreshing) {
            console.log('UsageSettingsTab: Already refreshing, skipping duplicate refresh');
            return;
        }
        
        console.log('UsageSettingsTab: Refreshing usage stats...');
        
        try {
            this.isRefreshing = true;
            
            // First, try to get the most recent service instance in case it was updated
            this.initializeUsageStatsService();
            
            // If we have the UsageStatsService, use it to refresh stats 
            if (this.usageStatsService) {
                console.log('UsageSettingsTab: Refreshing via UsageStatsService');
                const stats = await this.usageStatsService.refreshStats();
                console.log('UsageSettingsTab: Stats refreshed:', stats);
            } else {
                console.warn('UsageSettingsTab: No UsageStatsService available for refresh');
            }
            
            // If we have the UsageStatsComponent, use it to refresh the UI
            if (this.usageStatsComponent) {
                console.log('UsageSettingsTab: Refreshing UsageStatsComponent');
                await this.usageStatsComponent.refresh();
            } else {
                console.warn('UsageSettingsTab: No UsageStatsComponent available for refresh');
            }
            
            // Refresh the DeleteCollectionComponent
            if (this.deleteCollectionComponent) {
                console.log('UsageSettingsTab: Refreshing DeleteCollectionComponent');
                await this.deleteCollectionComponent.refresh();
            }
            
            // Force localStorage events for other components
            try {
                const savedUsage = localStorage.getItem('claudesidian-tokens-used');
                if (savedUsage) {
                    // Dispatch a storage event to ensure all components update
                    if (typeof StorageEvent === 'function' && typeof window.dispatchEvent === 'function') {
                        window.dispatchEvent(new StorageEvent('storage', {
                            key: 'claudesidian-tokens-used',
                            newValue: savedUsage,
                            storageArea: localStorage
                        }));
                        console.log('UsageSettingsTab: Dispatched storage event');
                    } else {
                        console.log('StorageEvent not supported in this browser, skipping dispatch');
                    }
                }
            } catch (storageError) {
                console.warn('Failed to dispatch storage event:', storageError);
            }
            
            // If we have the onSettingsChanged callback, call it
            if (this.onSettingsChanged) {
                this.onSettingsChanged();
            }
        } catch (error) {
            console.error('Error refreshing stats:', error);
        } finally {
            // Reset the refreshing flag
            this.isRefreshing = false;
        }
    }
    
    /**
     * Clean up event listeners when component is unloaded
     */
    onUnload(): void {
        // Remove storage event listener
        if (typeof window !== 'undefined' && this.storageEventHandler) {
            window.removeEventListener('storage', this.storageEventHandler);
        }
    }
    
    // Optional callback for when settings change
    onSettingsChanged?: () => void;
}