import { Notice, Setting } from 'obsidian';
import { BaseSettingsTab } from './BaseSettingsTab';
import { UsageStatsComponent } from './UsageStatsComponent';
import { UsageStatsService } from '../../database/services/UsageStatsService';
import { VaultLibrarianAgent } from '../../agents/vaultLibrarian/vaultLibrarian';
import { EmbeddingManager } from '../../database/services/embeddingManager';

/**
 * Usage Settings Tab component
 * Handles usage limits and displays usage statistics
 */
export class UsageSettingsTab extends BaseSettingsTab {
    private embeddingManager: EmbeddingManager | null;
    private vaultLibrarian: VaultLibrarianAgent | null;
    private usageStatsComponent: UsageStatsComponent | null = null;
    private usageStatsService: UsageStatsService | null = null;
    
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
        
        // Initialize the UsageStatsService
        this.initializeUsageStatsService();
    }
    
    /**
     * Initialize the UsageStatsService
     */
    private initializeUsageStatsService(): void {
        const plugin = (window as any).app.plugins.plugins['claudesidian-mcp'];
        if (!plugin) {
            console.warn('Plugin not found for UsageStatsService');
            return;
        }
        
        // First try to get the global service instance
        if (plugin.services?.usageStatsService) {
            this.usageStatsService = plugin.services.usageStatsService;
            console.log('UsageSettingsTab: Using global UsageStatsService from services');
            return;
        }
        
        if (plugin.usageStatsService) {
            this.usageStatsService = plugin.usageStatsService;
            console.log('UsageSettingsTab: Using global UsageStatsService from plugin');
            return;
        }
        
        // If we couldn't get the global instance, create a new one (this should rarely happen)
        console.warn('UsageSettingsTab: Global UsageStatsService not found, creating local instance (fallback)');
        
        // Get the embedding service
        const embeddingService = plugin.services?.embeddingService || plugin.embeddingService;
        
        // Get the vector store
        const vectorStore = plugin.vectorStore || plugin.services?.vectorStore;
        
        if (embeddingService && vectorStore) {
            this.usageStatsService = new UsageStatsService(
                embeddingService,
                vectorStore,
                this.settings,
                plugin.eventManager // Pass the global event manager
            );
        } else {
            console.warn('Missing dependencies for UsageStatsService', {
                embeddingService: !!embeddingService,
                vectorStore: !!vectorStore
            });
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
            
        new Setting(containerEl)
            .setName('Database Size Limit')
            .setDesc('Maximum size of the embedding database in MB')
            .addText((text: any) => text
                .setPlaceholder('1000')
                .setValue(String(this.settings.maxDbSize))
                .onChange(async (value: string) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue) && numValue > 0) {
                        this.settings.maxDbSize = numValue;
                        await this.saveSettings();
                    }
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
    }
    
    /**
     * Explicitly refreshes token usage statistics and updates the UI
     * This ensures the UI is updated properly after operations
     */
    private async refreshStats(): Promise<void> {
        console.log('UsageSettingsTab: Refreshing usage stats...');
        
        try {
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
        }
    }
    
    // Optional callback for when settings change
    onSettingsChanged?: () => void;
}