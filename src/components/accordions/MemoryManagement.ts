import { Setting, Notice, App } from 'obsidian';
import { Accordion } from '../Accordion';
import { Settings } from '../../settings';
import { VaultLibrarianAgent } from '../../agents/vaultLibrarian/vaultLibrarian';
import { MemoryManagerAgent } from '../../agents/memoryManager/memoryManager';
import { MemorySettingsTab } from '../MemorySettingsTab';
import { DEFAULT_MEMORY_SETTINGS } from '../../types';
import { IndexingService } from '../../database/services/indexingService';
import { EmbeddingManager } from '../../database/services/embeddingManager';
import { SearchService } from '../../database/services/searchService';

/**
 * Memory Management accordion component
 * Controls enabling/disabling the memory manager and displays settings
 */
export class MemoryManagementAccordion extends Accordion {
    private settings: Settings;
    private memorySettingsContainer: HTMLElement;
    
    // Direct services
    private indexingService: IndexingService | undefined;
    private embeddingManager: EmbeddingManager | undefined;
    private searchService: SearchService | undefined;
    
    // Agents (for backward compatibility)
    private vaultLibrarian: VaultLibrarianAgent | undefined;
    private memoryManager: MemoryManagerAgent | undefined;
    
    private memorySettingsTab: MemorySettingsTab | null = null;
    
    /**
     * Create a new Memory Management accordion
     * @param containerEl Parent container element
     * @param settings Plugin settings
     * @param indexingService IndexingService for file indexing operations
     * @param embeddingManager EmbeddingManager for embedding provider management
     * @param searchService SearchService for search operations
     * @param vaultLibrarian VaultLibrarian agent instance (optional, for backward compatibility)
     * @param memoryManager MemoryManager agent instance (optional)
     */
    constructor(
        containerEl: HTMLElement, 
        settings: Settings,
        indexingService?: IndexingService,
        embeddingManager?: EmbeddingManager,
        searchService?: SearchService,
        vaultLibrarian?: VaultLibrarianAgent,
        memoryManager?: MemoryManagerAgent
    ) {
        super(containerEl, 'Memory Management', false);
        this.settings = settings;
        this.indexingService = indexingService;
        this.embeddingManager = embeddingManager;
        this.searchService = searchService;
        this.vaultLibrarian = vaultLibrarian;
        this.memoryManager = memoryManager;
        
        const contentEl = this.getContentEl();
        
        // Add simple description
        contentEl.createEl('p', {
            text: 'Configure settings for the Memory Manager feature.'
        });
        
        // Container for memory settings
        this.memorySettingsContainer = contentEl.createEl('div', {
            cls: 'memory-settings-container'
        });
        
        // Memory settings are now visible by default via CSS
        
        // Initialize memory settings tab if services or agent exists
        const hasServices = this.indexingService && this.embeddingManager;
        const hasAgent = this.vaultLibrarian;
        
        if (hasServices || hasAgent) {
            this.initializeMemorySettingsTab();
        } else if (this.settings.settings.memory?.enabled) {
            // Show message if enabled but services not initialized
            this.memorySettingsContainer.createEl('div', {
                cls: 'memory-notice',
                text: 'Memory Manager is enabled but services are not yet initialized. Please restart Obsidian.'
            });
        } else {
            // Show message explaining how to enable memory manager
            this.memorySettingsContainer.createEl('div', {
                cls: 'memory-notice',
                text: 'Memory Manager configuration options will appear here once enabled. Use the toggle in the Memory Manager Settings above to enable this feature.'
            });
        }
    }
    
    /**
     * Initialize the memory settings tab
     */
    private initializeMemorySettingsTab(): void {
        // Clear existing content
        this.memorySettingsContainer.empty();
        
        // Check if we have services available (preferred) or need to fall back to agents
        const hasServices = this.indexingService && this.embeddingManager;
        const hasAgent = this.vaultLibrarian;
        
        if (!hasServices && !hasAgent) {
            // Show error message if neither services nor agents are available
            this.memorySettingsContainer.createEl('div', {
                cls: 'memory-notice error',
                text: 'Memory Manager services are not available. Please restart Obsidian.'
            });
            return;
        }
        
        // Create memory settings tab with services (preferred) or agents (fallback)
        this.memorySettingsTab = new MemorySettingsTab(
            this.memorySettingsContainer,
            this.settings,
            window.app,
            this.indexingService,
            this.embeddingManager,
            this.searchService,
            this.vaultLibrarian,
            this.memoryManager
        );
        
        // Display settings
        this.memorySettingsTab.display();
    }
}