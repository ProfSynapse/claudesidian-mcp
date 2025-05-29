import { App, Notice, Setting, Plugin } from 'obsidian';
import { MemorySettings, DEFAULT_MEMORY_SETTINGS, ClaudesidianMCPPlugin } from '../types';
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

/**
 * Memory Manager settings tab component
 * Provides UI for configuring the Memory Manager
 */
export class MemorySettingsTab {
    private tabContainer!: HTMLElement;
    private contentContainer!: HTMLElement;
    private tabs: Record<string, HTMLElement> = {};
    private contents: Record<string, HTMLElement> = {};
    private settings: MemorySettings;
    private settingsManager: Settings;
    private app: App;
    private plugin: ClaudesidianMCPPlugin | null = null;
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
     * @param embeddingService EmbeddingService instance
     * @param searchService Search service instance
     * @param plugin Plugin instance for context
     */
    constructor(
        private containerEl: HTMLElement,
        settingsManager: Settings,
        app?: App,
        embeddingManager?: EmbeddingManager,
        vaultLibrarian?: VaultLibrarianAgent,
        embeddingService?: EmbeddingService,
        private searchService?: any,
        plugin?: ClaudesidianMCPPlugin
    ) {
        this.settingsManager = settingsManager;
        this.app = app || (vaultLibrarian?.app || (window as any).app);
        this.embeddingManager = embeddingManager || null;
        this.vaultLibrarian = vaultLibrarian || null;
        this.embeddingService = embeddingService || null;
        this.plugin = plugin || null;
        this.settings = this.settingsManager.settings.memory || { ...DEFAULT_MEMORY_SETTINGS };
        
        // Try to get searchService from the plugin if not provided
        if (!this.searchService && this.plugin) {
            if (this.plugin.services?.searchService) {
                this.searchService = this.plugin.services.searchService;
            } else if (this.plugin.searchService) {
                this.searchService = this.plugin.searchService;
            }
        } else if (!this.searchService) {
            // Fall back to global access if no plugin instance
            const globalPlugin = (window as any).app.plugins.plugins['claudesidian-mcp'];
            if (globalPlugin?.services?.searchService) {
                this.searchService = globalPlugin.services.searchService;
            } else if (globalPlugin?.searchService) {
                this.searchService = globalPlugin.searchService;
            }
        }
        
        // Initialize tab components
        this.apiSettingsTab = new ApiSettingsTab(
            this.settings, 
            this.settingsManager, 
            this.app,
            this.embeddingManager || undefined,
            this.embeddingService || undefined,
            this.plugin || undefined
        );
        this.embeddingSettingsTab = new EmbeddingSettingsTab(
            this.settings, 
            this.settingsManager, 
            this.app,
            this.plugin || undefined
        );
        this.usageSettingsTab = new UsageSettingsTab(
            this.settings, 
            this.settingsManager, 
            this.app, 
            this.embeddingManager || undefined,
            this.vaultLibrarian || undefined,
            this.plugin || undefined
        );
        this.usageStatsComponent = new UsageStatsComponent(
            this.settings, 
            this.settingsManager, 
            this.app, 
            this.embeddingManager || undefined,
            this.vaultLibrarian || undefined,
            this.searchService || undefined,
            this.embeddingService || undefined,
            this.plugin || undefined
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
        // Initialize VaultLibrarian search service if available
        if (this.vaultLibrarian && typeof this.vaultLibrarian.initializeSearchService === 'function') {
            console.log('Initializing VaultLibrarian search service in MemorySettingsTab');
            try {
                await this.vaultLibrarian.initializeSearchService();
            } catch (error) {
                console.warn('Error initializing VaultLibrarian search service:', error);
            }
        }
        
        // Clear the container first to avoid duplication
        this.containerEl.empty();
        
        const memorySection = this.containerEl.createEl('div', { cls: 'mcp-section memory-settings-container' });
        memorySection.createEl('h2', { text: 'Memory Manager Settings' });

        // Create tabs for organization
        this.tabContainer = memorySection.createDiv({ cls: 'memory-settings-tabs' });
        
        this.tabs = {
            api: this.tabContainer.createDiv({ cls: 'memory-tab', text: 'API' }),
            embedding: this.tabContainer.createDiv({ cls: 'memory-tab', text: 'Embedding' }),
            usage: this.tabContainer.createDiv({ cls: 'memory-tab', text: 'Usage' })
        };

        // Content containers for each tab
        this.contentContainer = memorySection.createDiv({ cls: 'memory-tab-content' });
        
        this.contents = {
            api: this.contentContainer.createDiv({ cls: 'memory-tab-pane' }),
            embedding: this.contentContainer.createDiv({ cls: 'memory-tab-pane' }),
            usage: this.contentContainer.createDiv({ cls: 'memory-tab-pane' })
        };

        // Setup tab switching logic
        Object.entries(this.tabs).forEach(([key, tab]) => {
            tab.addEventListener('click', () => {
                // Remove active class from all tabs and contents
                Object.values(this.tabs).forEach(t => t.removeClass('active'));
                Object.values(this.contents).forEach(c => c.removeClass('active'));
                
                // Add active class to clicked tab and corresponding content
                tab.addClass('active');
                this.contents[key as keyof typeof this.contents].addClass('active');
                
                // Save the active tab
                this.activeTabKey = key;
            });
        });

        // Render each tab's content using the specialized components
        this.apiSettingsTab.display(this.contents.api);
        this.embeddingSettingsTab.display(this.contents.embedding);
        this.usageSettingsTab.display(this.contents.usage);
        
        // Activate the previously active tab (or default to API)
        if (this.tabs[this.activeTabKey]) {
            this.tabs[this.activeTabKey].addClass('active');
            this.contents[this.activeTabKey].addClass('active');
        } else {
            // Fallback to API tab if the saved tab key is invalid
            this.tabs.api.addClass('active');
            this.contents.api.addClass('active');
            this.activeTabKey = 'api';
        }
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