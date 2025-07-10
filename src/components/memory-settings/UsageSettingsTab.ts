import { Notice } from 'obsidian';
import { BaseSettingsTab } from './BaseSettingsTab';
import { UsageStatsComponent } from './UsageStatsComponent';
import { CollectionManagementComponent } from './CollectionManagementComponent';
import { UsageStatsService } from '../../database/services/UsageStatsService';
import { VaultLibrarianAgent } from '../../agents/vaultLibrarian/vaultLibrarian';
import { EmbeddingManager } from '../../database/services/embeddingManager';
import { EmbeddingService } from '../../database/services/EmbeddingService';
import { UsageTracker } from '../../services/UsageTracker';
import { UsageChart } from '../shared/UsageChart';

/**
 * Usage Settings Tab component
 * Handles usage limits, displays usage statistics, and manages collections
 */
export class UsageSettingsTab extends BaseSettingsTab {
    private embeddingManager: EmbeddingManager | null;
    private vaultLibrarian: VaultLibrarianAgent | null;
    private usageStatsComponent: UsageStatsComponent | null = null;
    private collectionManagementComponent: CollectionManagementComponent | null = null;
    private usageStatsService: UsageStatsService | null = null;
    private vectorStore: any = null;
    private embeddingService: EmbeddingService | null = null;
    private embeddingUsageTracker: UsageTracker | null = null;
    private usageChart: UsageChart | null = null;
    
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
        
        // Initialize the UsageStatsService and UsageTracker
        this.initializeUsageStatsService();
        this.initializeEmbeddingUsageTracker();
        
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
        
        // Initialize the embedding service
        this.embeddingService = plugin.services?.embeddingService || plugin.embeddingService;
        
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
            const embeddingService = this.embeddingService;
            
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
     * Initialize the embedding usage tracker
     */
    private initializeEmbeddingUsageTracker(): void {
        try {
            this.embeddingUsageTracker = new UsageTracker('embeddings', this.settings);
        } catch (error) {
            console.error('Failed to initialize embedding usage tracker:', error);
        }
    }
    
    /**
     * Display the usage settings tab
     */
    display(containerEl: HTMLElement): void {
        // Embedding budget section (cost-based tracking)
        this.addEmbeddingBudgetSection(containerEl);
            
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
            
        // Note: Old token-based usage stats replaced with cost-based budget tracking above
        
        // Collection Management Section
        const collectionManagementContainer = containerEl.createDiv({ cls: 'collection-management-container' });
        
        // Only display if we have required services
        if (this.vectorStore && this.usageStatsService && this.embeddingService) {
            
            // Create and display the unified CollectionManagementComponent
            this.collectionManagementComponent = new CollectionManagementComponent(
                collectionManagementContainer,
                this.vectorStore,
                this.usageStatsService!,
                this.embeddingService!,
                this.settings
            );
            
            this.collectionManagementComponent.display();
            
        } else {
            collectionManagementContainer.createEl('div', { 
                text: 'Collection management is not available. Vector store, usage stats service, or embedding service not initialized.',
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
            
            // Refresh collection management component
            if (this.collectionManagementComponent) {
                console.log('UsageSettingsTab: Refreshing collection management component');
                await this.collectionManagementComponent.display();
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
     * Add embedding budget section with cost tracking
     */
    private async addEmbeddingBudgetSection(containerEl: HTMLElement): Promise<void> {
        if (!this.embeddingUsageTracker) return;
        
        try {
            const budgetContainer = containerEl.createDiv({ cls: 'embedding-budget-section usage-settings-budget-container' });
            
            const usageData = await this.embeddingUsageTracker.getUsageData();
            const budgetStatus = await this.embeddingUsageTracker.getBudgetStatusAsync();
            
            this.usageChart = new UsageChart({
                containerEl: budgetContainer,
                title: '💰 Embedding Costs',
                usageData,
                budgetStatus,
                onResetMonthly: () => this.handleResetEmbeddingUsage(),
                onBudgetChange: (budget: number) => this.handleEmbeddingBudgetChange(budget)
            });
        } catch (error) {
            console.error('Failed to create embedding budget section:', error);
        }
    }
    
    /**
     * Handle embedding monthly usage reset
     */
    private async handleResetEmbeddingUsage(): Promise<void> {
        if (!this.embeddingUsageTracker) return;
        
        try {
            await this.embeddingUsageTracker.resetMonthlyUsage();
            
            // Refresh the chart
            if (this.usageChart) {
                const usageData = await this.embeddingUsageTracker.getUsageData();
                const budgetStatus = await this.embeddingUsageTracker.getBudgetStatusAsync();
                this.usageChart.update(usageData, budgetStatus);
            }
            
            new Notice('Monthly embedding usage reset successfully');
        } catch (error) {
            console.error('Error resetting monthly embedding usage:', error);
            new Notice('Failed to reset monthly usage');
        }
    }
    
    /**
     * Handle embedding budget change
     */
    private async handleEmbeddingBudgetChange(budget: number): Promise<void> {
        if (!this.embeddingUsageTracker) return;
        
        try {
            this.embeddingUsageTracker.setMonthlyBudget(budget);
            
            // Update settings object for persistence
            this.settings.monthlyBudget = budget;
            await this.saveSettings();
            
            // Refresh the chart
            if (this.usageChart) {
                const usageData = await this.embeddingUsageTracker.getUsageData();
                const budgetStatus = await this.embeddingUsageTracker.getBudgetStatusAsync();
                this.usageChart.update(usageData, budgetStatus);
            }
            
            if (budget > 0) {
                new Notice(`Monthly embedding budget set to $${budget.toFixed(2)}`);
            } else {
                new Notice('Monthly embedding budget disabled');
            }
        } catch (error) {
            console.error('Error setting embedding budget:', error);
            new Notice('Failed to set budget');
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