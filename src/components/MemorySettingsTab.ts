import { App, Notice, Setting } from 'obsidian';
import { MemorySettings, DEFAULT_MEMORY_SETTINGS } from '../types';
import { Settings } from '../settings';
import { VaultLibrarianAgent } from '../agents/vaultLibrarian/vaultLibrarian';
import { EmbeddingManager } from '../database/services/embeddingManager';
import { EmbeddingService } from '../database/services/EmbeddingService';
import {
    ApiSettingsTab,
    EmbeddingSettingsTab, 
    UsageStatsComponent,
    UsageSettingsTab
} from './memory-settings';
import { UnifiedTabs, UnifiedTabConfig } from './UnifiedTabs';

/**
 * Memory Manager settings tab component
 * Provides UI for configuring the Memory Manager
 */
export class MemorySettingsTab {
    private unifiedTabs: UnifiedTabs | null = null;
    private settings: MemorySettings;
    private settingsManager: Settings;
    private app: App;
    private activeTabKey: string = 'api'; // Track the active tab
    
    // Component tabs
    private apiSettingsTab: ApiSettingsTab;
    private embeddingSettingsTab: EmbeddingSettingsTab;
    private usageSettingsTab: UsageSettingsTab;
    private usageStatsComponent: UsageStatsComponent;
    
    // Services (direct access to database functionality)
    private embeddingManager: EmbeddingManager | null = null;
    private embeddingService: EmbeddingService | null = null;
    
    // Agent for backward compatibility
    private vaultLibrarian: VaultLibrarianAgent | null = null;

    /**
     * Create a new Memory Settings Tab
     * 
     * @param containerEl Container element to append to
     * @param settingsManager Settings manager instance
     * @param app Obsidian app instance
     * @param embeddingManager EmbeddingManager for embedding provider management
     * @param vaultLibrarian VaultLibrarian agent instance (optional, for backward compatibility)
     */
    constructor(
        private containerEl: HTMLElement,
        settingsManager: Settings,
        app?: App,
        embeddingManager?: EmbeddingManager,
        vaultLibrarian?: VaultLibrarianAgent,
        embeddingService?: EmbeddingService,
        private searchService?: any
    ) {
        this.settingsManager = settingsManager;
        this.app = app || (vaultLibrarian?.app || (window as any).app);
        this.embeddingManager = embeddingManager || null;
        this.vaultLibrarian = vaultLibrarian || null;
        this.embeddingService = embeddingService || null;
        this.settings = this.settingsManager.settings.memory || { ...DEFAULT_MEMORY_SETTINGS };
        
        // Try to get searchService from the plugin if not provided
        if (!this.searchService) {
            const plugin = (window as any).app.plugins.plugins['claudesidian-mcp'];
            if (plugin?.services?.searchService) {
                this.searchService = plugin.services.searchService;
            } else if (plugin?.searchService) {
                this.searchService = plugin.searchService;
            }
        }
        
        // Initialize tab components
        this.apiSettingsTab = new ApiSettingsTab(
            this.settings, 
            this.settingsManager, 
            this.app,
            this.embeddingManager || undefined,
            this.embeddingService || undefined
        );
        this.embeddingSettingsTab = new EmbeddingSettingsTab(this.settings, this.settingsManager, this.app);
        this.usageSettingsTab = new UsageSettingsTab(
            this.settings, 
            this.settingsManager, 
            this.app, 
            this.embeddingManager || undefined,
            this.vaultLibrarian || undefined
        );
        this.usageStatsComponent = new UsageStatsComponent(
            this.settings, 
            this.settingsManager, 
            this.app, 
            this.embeddingManager || undefined,
            this.vaultLibrarian || undefined,
            this.searchService || undefined,
            this.embeddingService || undefined
        );
        
        // Register refresh callbacks
        this.apiSettingsTab.onSettingsChanged = () => this.display();
        this.embeddingSettingsTab.onSettingsChanged = () => this.display();
        this.usageSettingsTab.onSettingsChanged = () => this.display();
        this.usageStatsComponent.onSettingsChanged = () => this.display();
    }

    /**
     * Display the Memory Manager settings tab
     */
    async display(): Promise<void> {
        // Clear the container first to avoid duplication
        this.containerEl.empty();
        
        const memorySection = this.containerEl.createEl('div', { cls: 'mcp-section memory-settings-container' });
        memorySection.createEl('h2', { text: 'Memory Manager Settings' });

        // Create tabs using unified tabs component
        const tabConfigs: UnifiedTabConfig[] = [
            { key: 'api', label: 'API' },
            { key: 'embedding', label: 'Embedding' },
            { key: 'usage', label: 'Usage' }
        ];
        
        this.unifiedTabs = new UnifiedTabs({
            containerEl: memorySection,
            tabs: tabConfigs,
            defaultTab: this.activeTabKey,
            onTabChange: (tabKey: string) => {
                this.activeTabKey = tabKey;
            }
        });

        // Render each tab's content using the specialized components
        const apiContent = this.unifiedTabs.getTabContent('api');
        const embeddingContent = this.unifiedTabs.getTabContent('embedding');
        const usageContent = this.unifiedTabs.getTabContent('usage');
        
        if (apiContent) this.apiSettingsTab.display(apiContent);
        if (embeddingContent) this.embeddingSettingsTab.display(embeddingContent);
        if (usageContent) this.usageSettingsTab.display(usageContent);
        
        // The unified tabs component handles tab activation
    }

    /**
     * Save settings
     */
    private async saveSettings(): Promise<void> {
        this.settingsManager.settings.memory = this.settings;
        await this.settingsManager.saveSettings();
        
        // Update settings in services
        if (this.embeddingManager) {
            this.embeddingManager.updateSettings(this.settings);
        }
        
        // For backward compatibility
        if (this.vaultLibrarian) {
            this.vaultLibrarian.updateSettings?.(this.settings);
        }
        
        // Get plugin reference to trigger configuration reload
        const plugin = (window as any).app.plugins.plugins['claudesidian-mcp'];
        if (plugin && typeof plugin.reloadConfiguration === 'function') {
            plugin.reloadConfiguration();
        }
        
        // Update settings in all tab components
        this.apiSettingsTab.updateSettings(this.settings);
        this.embeddingSettingsTab.updateSettings(this.settings);
        this.usageSettingsTab.updateSettings(this.settings);
        this.usageStatsComponent.updateSettings(this.settings);
    }
}