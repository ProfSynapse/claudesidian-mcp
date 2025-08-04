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
        this.initializeUsageStatsService().catch(error => {
            console.error('Failed to initialize UsageStatsService:', error);
        });
        this.initializeEmbeddingUsageTracker();
        
        // Set up storage event listener for collection deletion events
        this.storageEventHandler = (e: StorageEvent) => {
            if (e.key === 'claudesidian-collection-deleted' || e.key === 'claudesidian-collections-purged') {
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
    private async initializeUsageStatsService(): Promise<void> {
        const plugin = (window as any).app.plugins.plugins['claudesidian-mcp'];
        if (!plugin) {
            console.warn('Plugin not found for UsageStatsService');
            return;
        }
        
        // Wait for services to be available through lazy loading
        try {
            // Try to get the service asynchronously with a timeout
            this.usageStatsService = await plugin.getService('usageStatsService', 5000);
            if (this.usageStatsService) {
                // Also get other required services
                this.vectorStore = await plugin.getService('vectorStore', 5000);
                this.embeddingService = await plugin.getService('embeddingService', 5000);
                return;
            }
        } catch (error) {
            console.warn('Failed to get UsageStatsService from service manager:', error);
        }
        
        // Fallback to synchronous access
        this.vectorStore = plugin.services?.vectorStore || plugin.vectorStore;
        this.embeddingService = plugin.services?.embeddingService || plugin.embeddingService;
        
        // First try to get the global service instance
        if (plugin.services?.usageStatsService) {
            this.usageStatsService = plugin.services.usageStatsService;
        } else if (plugin.usageStatsService) {
            this.usageStatsService = plugin.usageStatsService;
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
        
        // Show loading state initially
        const loadingEl = collectionManagementContainer.createEl('div', { 
            text: 'Loading collection management...', 
            cls: 'collection-management-loading'
        });
        
        // Retry service initialization and display when ready
        this.retryServiceInitialization(collectionManagementContainer, loadingEl);
    }

    /**
     * Retry service initialization with exponential backoff
     */
    private async retryServiceInitialization(container: HTMLElement, loadingEl: HTMLElement): Promise<void> {
        const maxRetries = 5;
        let attempt = 0;
        
        while (attempt < maxRetries) {
            try {
                // Re-initialize services
                await this.initializeUsageStatsService();
                
                // Check if we now have all required services
                if (this.vectorStore && this.usageStatsService && this.embeddingService) {
                    // Remove loading message
                    loadingEl.remove();
                    
                    // Create and display the unified CollectionManagementComponent
                    this.collectionManagementComponent = new CollectionManagementComponent(
                        container,
                        this.vectorStore,
                        this.usageStatsService!,
                        this.embeddingService!,
                        this.settings
                    );
                    
                    this.collectionManagementComponent.display();
                    return; // Success!
                }
            } catch (error) {
                if (attempt === maxRetries - 1) {
                    console.warn(`Service initialization failed after ${maxRetries} attempts:`, error);
                }
            }
            
            attempt++;
            if (attempt < maxRetries) {
                // Exponential backoff: 500ms, 1s, 2s, 4s
                const delay = Math.min(500 * Math.pow(2, attempt - 1), 4000);
                await new Promise(resolve => setTimeout(resolve, delay));
                
                // Update loading message to show retry
                loadingEl.textContent = `Loading collection management... (attempt ${attempt + 1}/${maxRetries})`;
            }
        }
        
        // All retries failed, show error
        loadingEl.remove();
        container.createEl('div', { 
            text: 'Collection management is not available. Services failed to initialize after multiple attempts.',
            cls: 'collection-management-error'
        });
        
        // Add retry button
        const retryButton = container.createEl('button', {
            text: 'Retry',
            cls: 'mod-cta'
        });
        retryButton.onclick = () => {
            container.empty();
            const newLoadingEl = container.createEl('div', { 
                text: 'Loading collection management...', 
                cls: 'collection-management-loading'
            });
            this.retryServiceInitialization(container, newLoadingEl);
        };
    }
    
    
    /**
     * Explicitly refreshes token usage statistics and updates the UI
     * This ensures the UI is updated properly after operations
     */
    private async refreshStats(): Promise<void> {
        // Prevent recursive refreshes
        if (this.isRefreshing) {
            return;
        }
        
        try {
            this.isRefreshing = true;
            
            // First, try to get the most recent service instance in case it was updated
            await this.initializeUsageStatsService();
            
            // If we have the UsageStatsService, use it to refresh stats 
            if (this.usageStatsService) {
                const stats = await this.usageStatsService.refreshStats();
            } else {
                console.warn('UsageSettingsTab: No UsageStatsService available for refresh');
            }
            
            // If we have the UsageStatsComponent, use it to refresh the UI
            if (this.usageStatsComponent) {
                await this.usageStatsComponent.refresh();
            } else {
                console.warn('UsageSettingsTab: No UsageStatsComponent available for refresh');
            }
            
            // Refresh collection management component
            if (this.collectionManagementComponent) {
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