import { Notice, Setting } from 'obsidian';
import { BaseSettingsTab } from './BaseSettingsTab';
import { DeleteCollectionComponent } from './DeleteCollectionComponent';
import { UsageStatsService } from '../../database/services/UsageStatsService';

/**
 * Advanced Settings tab component
 * Handles database settings and advanced configuration
 */
export class AdvancedSettingsTab extends BaseSettingsTab {
    private deleteCollectionComponent: DeleteCollectionComponent | null = null;
    private usageStatsService: UsageStatsService | null = null;
    private vectorStore: any = null;
    // Flag to prevent recursive refreshes
    private isRefreshing: boolean = false;
    // Storage event handler
    private storageEventHandler: (e: StorageEvent) => void;
    
    /**
     * Create a new advanced settings tab
     */
    constructor(
        settings: any, 
        settingsManager: any, 
        app: any
    ) {
        super(settings, settingsManager, app);
        
        // Initialize the required services
        this.initializeServices();
        
        // Set up storage event listener for collection deletion events
        this.storageEventHandler = (e: StorageEvent) => {
            if (e.key === 'claudesidian-collection-deleted' || e.key === 'claudesidian-collections-purged') {
                console.log(`AdvancedSettingsTab: Detected collection change via localStorage: ${e.key}`);
                // Use setTimeout to avoid immediate refresh that could cause cycles
                setTimeout(() => {
                    if (this.deleteCollectionComponent && !this.isRefreshing) {
                        this.refreshDeleteComponent();
                    }
                }, 500);
            }
        };
        
        if (typeof window !== 'undefined') {
            window.addEventListener('storage', this.storageEventHandler);
        }
    }
    
    /**
     * Initialize required services
     */
    private initializeServices(): void {
        const plugin = (window as any).app.plugins.plugins['claudesidian-mcp'];
        if (!plugin) {
            console.warn('Plugin not found for AdvancedSettingsTab');
            return;
        }
        
        // Get the vector store first, as it's needed for the DeleteCollectionComponent
        this.vectorStore = plugin.services?.vectorStore || plugin.vectorStore;
        
        // Get the UsageStatsService
        if (plugin.services?.usageStatsService) {
            this.usageStatsService = plugin.services.usageStatsService;
            console.log('AdvancedSettingsTab: Using global UsageStatsService from services');
        } else if (plugin.usageStatsService) {
            this.usageStatsService = plugin.usageStatsService;
            console.log('AdvancedSettingsTab: Using global UsageStatsService from plugin');
        } else {
            // If we couldn't get the global instance, create a new one (this should rarely happen)
            console.warn('AdvancedSettingsTab: Global UsageStatsService not found, creating local instance (fallback)');
            
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
     * Display the advanced settings tab
     */
    display(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'Database Settings' });
            
        new Setting(containerEl)
            .setName('Maximum Database Size')
            .setDesc('Maximum size of the database in MB')
            .addSlider(slider => slider
                .setLimits(100, 2000, 100)
                .setValue(this.settings.maxDbSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.maxDbSize = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Clean Orphaned Embeddings')
            .setDesc('Automatically clean up embeddings for deleted files')
            .addToggle(toggle => toggle
                .setValue(this.settings.autoCleanOrphaned)
                .onChange(async (value) => {
                    this.settings.autoCleanOrphaned = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Pruning Strategy')
            .setDesc('Strategy for removing embeddings when database is full')
            .addDropdown(dropdown => dropdown
                .addOption('oldest', 'Oldest Embeddings')
                .addOption('least-used', 'Least Used Embeddings')
                .addOption('manual', 'Manual Cleanup Only')
                .setValue(this.settings.pruningStrategy)
                .onChange(async (value: any) => {
                    this.settings.pruningStrategy = value;
                    await this.saveSettings();
                })
            );
            
        // Collection Management Section (moved from UsageSettingsTab)
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
     * Refreshes the delete collection component
     */
    private async refreshDeleteComponent(): Promise<void> {
        // Prevent recursive refreshes
        if (this.isRefreshing) {
            console.log('AdvancedSettingsTab: Already refreshing, skipping duplicate refresh');
            return;
        }
        
        try {
            this.isRefreshing = true;
            console.log('AdvancedSettingsTab: Refreshing delete collection component');
            
            // Refresh the delete collection component
            if (this.deleteCollectionComponent) {
                await this.deleteCollectionComponent.refresh();
            }
            
            // Trigger a refresh in any UsageStatsService instance to update other components
            if (this.usageStatsService) {
                await this.usageStatsService.refreshStats();
            }
            
            // Force localStorage events for other components
            try {
                const savedUsage = localStorage.getItem('claudesidian-tokens-used');
                if (savedUsage && typeof StorageEvent === 'function' && typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new StorageEvent('storage', {
                        key: 'claudesidian-tokens-used',
                        newValue: savedUsage,
                        storageArea: localStorage
                    }));
                    console.log('AdvancedSettingsTab: Dispatched storage event');
                }
            } catch (storageError) {
                console.warn('Failed to dispatch storage event:', storageError);
            }
        } catch (error) {
            console.error('Error refreshing delete component:', error);
        } finally {
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
}