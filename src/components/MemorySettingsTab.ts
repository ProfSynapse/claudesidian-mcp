import { App, Setting } from 'obsidian';
import { MemorySettings, DEFAULT_MEMORY_SETTINGS } from '../types';
import { Settings } from '../settings';
import { VaultLibrarianAgent } from '../agents/vaultLibrarian/vaultLibrarian';
import { MemoryManagerAgent } from '../agents/memoryManager/memoryManager';
import { EmbeddingManager } from '../database/services/embeddingManager';
import {
    ApiSettingsTab,
    EmbeddingSettingsTab, 
    FilterSettingsTab,
    AdvancedSettingsTab,
    SessionsSettingsTab,
    UsageStatsComponent
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
    
    // Component tabs
    private apiSettingsTab: ApiSettingsTab;
    private embeddingSettingsTab: EmbeddingSettingsTab;
    private filterSettingsTab: FilterSettingsTab;
    private advancedSettingsTab: AdvancedSettingsTab;
    private sessionsSettingsTab: SessionsSettingsTab;
    private usageStatsComponent: UsageStatsComponent;
    
    // Services (direct access to database functionality)
    private embeddingManager: EmbeddingManager | null = null;
    
    // Agents (for backward compatibility and specific MCP operations)
    private vaultLibrarian: VaultLibrarianAgent | null = null;
    private memoryManager: MemoryManagerAgent | null = null;

    /**
     * Create a new Memory Settings Tab
     * 
     * @param containerEl Container element to append to
     * @param settingsManager Settings manager instance
     * @param app Obsidian app instance
     * @param embeddingManager EmbeddingManager for embedding provider management
     * @param vaultLibrarian VaultLibrarian agent instance (optional, for backward compatibility)
     * @param memoryManager Optional MemoryManager agent instance
     */
    constructor(
        private containerEl: HTMLElement,
        settingsManager: Settings,
        app?: App,
        embeddingManager?: EmbeddingManager,
        vaultLibrarian?: VaultLibrarianAgent,
        memoryManager?: MemoryManagerAgent
    ) {
        this.settingsManager = settingsManager;
        this.app = app || (vaultLibrarian?.app || window.app);
        this.embeddingManager = embeddingManager || null;
        this.vaultLibrarian = vaultLibrarian || null;
        this.memoryManager = memoryManager || null;
        this.settings = this.settingsManager.settings.memory || { ...DEFAULT_MEMORY_SETTINGS };
        
        // Initialize tab components
        this.apiSettingsTab = new ApiSettingsTab(this.settings, this.settingsManager, this.app);
        this.embeddingSettingsTab = new EmbeddingSettingsTab(this.settings, this.settingsManager, this.app);
        this.filterSettingsTab = new FilterSettingsTab(this.settings, this.settingsManager, this.app);
        this.advancedSettingsTab = new AdvancedSettingsTab(this.settings, this.settingsManager, this.app);
        this.sessionsSettingsTab = new SessionsSettingsTab(
            this.settings, 
            this.settingsManager, 
            this.app, 
            this.memoryManager || undefined
        );
        this.usageStatsComponent = new UsageStatsComponent(
            this.settings, 
            this.settingsManager, 
            this.app, 
            this.embeddingManager || undefined,
            this.vaultLibrarian || undefined
        );
        
        // Register refresh callbacks
        this.apiSettingsTab.onSettingsChanged = () => this.display();
        this.embeddingSettingsTab.onSettingsChanged = () => this.display();
        this.sessionsSettingsTab.onSettingsChanged = () => this.display();
        this.usageStatsComponent.onSettingsChanged = () => this.display();
    }

    /**
     * Display the Memory Manager settings tab
     */
    display(): void {
        // Clear the container first to avoid duplication
        this.containerEl.empty();
        
        const memorySection = this.containerEl.createEl('div', { cls: 'mcp-section memory-settings-container' });
        memorySection.createEl('h2', { text: 'Memory Manager Settings' });

        // Add the embeddings toggle at the top level
        new Setting(memorySection)
            .setName('Enable Embeddings')
            .setDesc('Enable or disable embeddings functionality. When disabled, semantic search and embedding creation will not be available.')
            .addToggle(toggle => toggle
                .setValue(this.settings.embeddingsEnabled)
                .onChange(async (value) => {
                    this.settings.embeddingsEnabled = value;
                    await this.saveSettings();
                    
                    // Refresh UI to reflect the new state
                    this.display();
                })
            );

        // Note about embedding creation
        const infoEl = memorySection.createEl('div', { cls: 'memory-info-notice' });
        if (this.settings.embeddingsEnabled) {
            infoEl.createEl('p', { text: 'Memory Manager is always enabled. You can control when embeddings are created in the Embedding tab under "Indexing Schedule".' });
            infoEl.createEl('p', { text: 'Set to "Only Manually" if you want to control exactly when embeddings are created.' });
        } else {
            infoEl.createEl('p', { 
                cls: 'embeddings-disabled-notice',
                text: 'Embeddings are currently disabled. Semantic search and embedding creation will not be available when using Claude desktop app.'
            });
        }

        // Create tabs for organization
        this.tabContainer = memorySection.createDiv({ cls: 'memory-settings-tabs' });
        
        this.tabs = {
            api: this.tabContainer.createDiv({ cls: 'memory-tab active', text: 'API' }),
            embedding: this.tabContainer.createDiv({ cls: 'memory-tab', text: 'Embedding' }),
            filters: this.tabContainer.createDiv({ cls: 'memory-tab', text: 'Filters' }),
            advanced: this.tabContainer.createDiv({ cls: 'memory-tab', text: 'Advanced' }),
            sessions: this.tabContainer.createDiv({ cls: 'memory-tab', text: 'Sessions' })
        };

        // Content containers for each tab
        this.contentContainer = memorySection.createDiv({ cls: 'memory-tab-content' });
        
        this.contents = {
            api: this.contentContainer.createDiv({ cls: 'memory-tab-pane active' }),
            embedding: this.contentContainer.createDiv({ cls: 'memory-tab-pane' }),
            filters: this.contentContainer.createDiv({ cls: 'memory-tab-pane' }),
            advanced: this.contentContainer.createDiv({ cls: 'memory-tab-pane' }),
            sessions: this.contentContainer.createDiv({ cls: 'memory-tab-pane' })
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
            });
        });

        // Render each tab's content using the specialized components
        this.apiSettingsTab.display(this.contents.api);
        this.embeddingSettingsTab.display(this.contents.embedding);
        this.filterSettingsTab.display(this.contents.filters);
        this.advancedSettingsTab.display(this.contents.advanced);
        this.sessionsSettingsTab.display(this.contents.sessions);
        
        // Add Usage Statistics
        this.usageStatsComponent.display(memorySection);
        
        // Add disabled class to the embedding settings container if embeddings are disabled
        if (!this.settings.embeddingsEnabled) {
            this.contentContainer.addClass('embeddings-disabled');
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
        
        // Get plugin reference to trigger embedding strategy update
        const plugin = window.app.plugins.plugins['claudesidian-mcp'];
        if (plugin && typeof plugin.initializeEmbeddingStrategy === 'function') {
            plugin.initializeEmbeddingStrategy();
        }
        
        // Update settings in all tab components
        this.apiSettingsTab.updateSettings(this.settings);
        this.embeddingSettingsTab.updateSettings(this.settings);
        this.filterSettingsTab.updateSettings(this.settings);
        this.advancedSettingsTab.updateSettings(this.settings);
        this.sessionsSettingsTab.updateSettings(this.settings);
        this.usageStatsComponent.updateSettings(this.settings);
    }
}