import { App, Plugin, PluginSettingTab, Setting, Notice, ButtonComponent } from 'obsidian';
import { Settings } from '../settings';
// import { ConfigModal } from './ConfigModal';
import { 
    WhatIsClaudesidianAccordion, 
    SetupInstructionsAccordion,
    MemoryManagementAccordion,
    AgentManagementAccordion
} from './accordions';
import { UpdateManager } from '../utils/UpdateManager';
import { VaultLibrarianAgent } from '../agents/vaultLibrarian/vaultLibrarian';
import { MemoryManagerAgent } from '../agents/memoryManager/memoryManager';

// Import services
import { EmbeddingService } from '../database/services/EmbeddingService';
import { WorkspaceService } from '../database/services/WorkspaceService';
import { MemoryService } from '../database/services/MemoryService';
import { FileEmbeddingAccessService } from '../database/services/FileEmbeddingAccessService';
import { HnswSearchService } from '../database/services/hnsw/HnswSearchService';
import { EmbeddingManager } from '../database/services/embeddingManager';
import { IVectorStore } from '../database/interfaces/IVectorStore';
import { CustomPromptStorageService } from '../database/services/CustomPromptStorageService';

/**
 * Settings tab for the Claudesidian MCP plugin
 * Provides configuration options and agent explanations
 */
export class SettingsTab extends PluginSettingTab {
    private settings: Settings;
    private plugin: Plugin;

    // ChromaDB Services
    private embeddingService: EmbeddingService | undefined;
    private memoryService: MemoryService | undefined;
    private fileEmbeddingAccessService: FileEmbeddingAccessService | undefined;
    private hnswSearchService: HnswSearchService | undefined;
    private embeddingManager: EmbeddingManager | undefined;
    
    // Agent references
    private vaultLibrarian: VaultLibrarianAgent | undefined;
    private memoryManager: MemoryManagerAgent | undefined;
    
    /**
     * Create a new settings tab
     * @param app Obsidian app instance
     * @param plugin Plugin instance
     * @param settings Settings manager
     * @param services Service references
     * @param vaultLibrarian VaultLibrarian agent instance
     * @param memoryManager Memory Manager agent instance
     */
    constructor(
        app: App, 
        plugin: Plugin, 
        private settingsManager: Settings,
        services?: {
            embeddingService?: EmbeddingService,
            workspaceService?: WorkspaceService,
            memoryService?: MemoryService,
            vectorStore?: IVectorStore,
            fileEmbeddingAccessService?: FileEmbeddingAccessService,
            hnswSearchService?: HnswSearchService
        },
        vaultLibrarian?: VaultLibrarianAgent,
        memoryManager?: MemoryManagerAgent
    ) {
        super(app, plugin);
        this.settings = settingsManager;
        this.plugin = plugin;
        
        // Setup services
        if (services) {
            this.embeddingService = services.embeddingService;
            // Removed assignment to unused property: this.workspaceService = services.workspaceService;
            this.memoryService = services.memoryService;
            // Removed assignment to unused property: this.vectorStore = services.vectorStore;
            this.fileEmbeddingAccessService = services.fileEmbeddingAccessService;
            this.hnswSearchService = services.hnswSearchService;
            
            // Create embedding manager instance if we have app access
            if (window.app && !this.embeddingManager && services.embeddingService) {
                this.embeddingManager = new EmbeddingManager(window.app);
            }
        }
        
        // Store agent references
        this.vaultLibrarian = vaultLibrarian;
        this.memoryManager = memoryManager;
    }

    /**
     * Creates the update section in settings
     * Displays current version, last update info, and update button
     */
    private async createUpdateSection(containerEl: HTMLElement): Promise<void> {
        const updateSection = containerEl.createEl('div', { cls: 'mcp-section' });
        updateSection.createEl('h3', { text: 'Plugin Updates' });
        
        // Display current version
        updateSection.createEl('p', { 
            text: `Current version: ${this.plugin.manifest.version}` 
        });
        
        // Display available update notification if there's an update
        if (this.settings.settings.availableUpdateVersion) {
            const updateAlert = updateSection.createEl('div', { 
                cls: 'mcp-update-alert',
                attr: { style: 'background-color: var(--interactive-accent); color: var(--text-on-accent); padding: 10px; border-radius: 5px; margin: 10px 0;' }
            });
            updateAlert.createEl('strong', { text: '🎉 Update Available!' });
            updateAlert.createEl('br');
            updateAlert.createEl('span', { 
                text: `Version ${this.settings.settings.availableUpdateVersion} is ready to install.` 
            });
        }
        
        // Display last update info if available
        if (this.settings.settings.lastUpdateVersion && this.settings.settings.lastUpdateDate) {
            const lastUpdateDate = new Date(this.settings.settings.lastUpdateDate);
            const formattedDate = lastUpdateDate.toLocaleDateString() + ' ' + 
                                  lastUpdateDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            updateSection.createEl('p', {
                text: `Last updated: ${this.settings.settings.lastUpdateVersion} (${formattedDate})`
            });
        }
        
        // Display last check date if available
        if (this.settings.settings.lastUpdateCheckDate) {
            const lastCheckDate = new Date(this.settings.settings.lastUpdateCheckDate);
            const formattedCheckDate = lastCheckDate.toLocaleDateString() + ' ' + 
                                     lastCheckDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            updateSection.createEl('p', {
                text: `Last checked: ${formattedCheckDate}`,
                attr: { style: 'color: var(--text-muted); font-size: 0.9em;' }
            });
        }
        
        // Add update button
        new Setting(updateSection)
            .setName('Manual Update Check')
            .setDesc('Check for and install the latest version')
            .addButton((button: ButtonComponent) => {
                // Change button text based on whether an update is available
                const buttonText = this.settings.settings.availableUpdateVersion 
                    ? `Install v${this.settings.settings.availableUpdateVersion}` 
                    : 'Check for Updates';
                
                button.setButtonText(buttonText)
                    .onClick(async () => {
                        button.setDisabled(true);
                        try {
                            const updateManager = new UpdateManager(this.plugin);
                            const hasUpdate = await updateManager.checkForUpdate();
                            
                            // Update the check date and available version
                            this.settings.settings.lastUpdateCheckDate = new Date().toISOString();
                            
                            if (hasUpdate) {
                                // Get the latest version info
                                const release = await (updateManager as any).fetchLatestRelease();
                                const availableVersion = release.tag_name.replace('v', '');
                                this.settings.settings.availableUpdateVersion = availableVersion;
                                
                                await updateManager.updatePlugin();
                                
                                // Clear the available update after successful installation
                                this.settings.settings.availableUpdateVersion = undefined;
                                
                                // Refresh the settings display to show the updated version
                                this.display();
                            } else {
                                // Clear any stored available update version
                                this.settings.settings.availableUpdateVersion = undefined;
                                new Notice('You are already on the latest version!');
                            }
                            
                            await this.settings.saveSettings();
                            
                            // Refresh display to update UI
                            this.display();
                            
                        } catch (error) {
                            new Notice(`Update failed: ${(error as Error).message}`);
                        } finally {
                            button.setDisabled(false);
                        }
                    });
            });
    }


    /**
     * Add CSS styles for the settings tab (now implemented in styles.css)
     * @param containerEl Container element
     */
    private addStyles(): void {
        // Styles are now in the global styles.css file
    }
    
    /**
     * Display the settings tab
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // Update section first
        this.createUpdateSection(containerEl);

        // Memory Management accordion with services and agents
        // Create EmbeddingManager instance if we have memory manager but no embedding manager
        const embeddingManager = this.embeddingManager;
        if (this.memoryManager && !embeddingManager && window.app) {
            // The MemoryManagerAgent is not directly compatible with EmbeddingManager
            // We're not creating a real EmbeddingManager since it may require complex initialization
            console.log('Using memory manager without embedding manager');
        }
        
        new MemoryManagementAccordion(
            containerEl, 
            this.settingsManager,
            this.embeddingService,
            this.fileEmbeddingAccessService, // Now properly injected from services
            this.hnswSearchService, // Now properly injected from services
            this.memoryService,
            this.vaultLibrarian,
            embeddingManager
        );

        // Agent Management accordion
        const customPromptStorage = new CustomPromptStorageService(this.settingsManager);
        new AgentManagementAccordion(
            containerEl,
            this.settingsManager,
            customPromptStorage,
            this.app
        );

        // Setup Instructions accordion
        new SetupInstructionsAccordion(containerEl);

        // What is Claudesidian? accordion
        new WhatIsClaudesidianAccordion(containerEl);

        // Add CSS styles
        this.addStyles();
    }

}
