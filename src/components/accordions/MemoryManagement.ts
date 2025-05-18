import { Setting, Notice, App } from 'obsidian';
import { Accordion } from '../Accordion';
import { Settings } from '../../settings';
import { VaultLibrarianAgent } from '../../agents/vaultLibrarian/vaultLibrarian';
import { MemoryManagerAgent } from '../../agents/memoryManager/memoryManager';
import { MemorySettingsTab } from '../MemorySettingsTab';
import { DEFAULT_MEMORY_SETTINGS } from '../../types';
import { EmbeddingService } from '../../database/services/EmbeddingService';
import { ChromaSearchService } from '../../database/services/ChromaSearchService';
import { MemoryService } from '../../database/services/MemoryService';
import { EmbeddingServiceAdapter } from '../../database/services/EmbeddingServiceAdapter';
import { SearchService } from '../../database/services/searchService';

/**
 * Memory Management accordion component
 * Controls enabling/disabling the memory manager and displays settings
 */
export class MemoryManagementAccordion extends Accordion {
    private settings: Settings;
    private memorySettingsContainer: HTMLElement;
    
    // ChromaDB Services
    private embeddingService: EmbeddingService | undefined;
    private chromaSearchService: ChromaSearchService | undefined;
    private memoryService: MemoryService | undefined;
    
    // Agents (for backward compatibility)
    private vaultLibrarian: VaultLibrarianAgent | undefined;
    private memoryManager: MemoryManagerAgent | undefined;
    
    private memorySettingsTab: MemorySettingsTab | null = null;
    
    /**
     * Create a new Memory Management accordion
     * @param containerEl Parent container element
     * @param settings Plugin settings
     * @param embeddingService EmbeddingService for generating and managing embeddings
     * @param chromaSearchService ChromaSearchService for search operations
     * @param memoryService MemoryService for memory traces and sessions
     * @param vaultLibrarian VaultLibrarian agent instance (optional, for backward compatibility)
     * @param memoryManager MemoryManager agent instance (optional)
     */
    constructor(
        containerEl: HTMLElement, 
        settings: Settings,
        embeddingService?: EmbeddingService,
        chromaSearchService?: ChromaSearchService,
        memoryService?: MemoryService,
        vaultLibrarian?: VaultLibrarianAgent,
        memoryManager?: MemoryManagerAgent
    ) {
        super(containerEl, 'Memory Management', false);
        this.settings = settings;
        this.embeddingService = embeddingService;
        this.chromaSearchService = chromaSearchService;
        this.memoryService = memoryService;
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
        const hasServices = this.embeddingService && this.chromaSearchService && this.memoryService;
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
        const hasServices = this.embeddingService && this.chromaSearchService && this.memoryService;
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
        // Use an adapter for EmbeddingService to make it compatible with IndexingService interface
        const indexingAdapter = this.embeddingService 
            ? new EmbeddingServiceAdapter(this.embeddingService, window.app)
            : undefined;
        
        // Create a proper SearchService instance if we have a ChromaSearchService
        const searchService = this.chromaSearchService && this.embeddingService && this.memoryService
            ? new SearchService(window.app, {
                app: window.app,
                services: {
                    searchService: this.chromaSearchService,
                    embeddingService: this.embeddingService,
                    memoryService: this.memoryService
                }
              } as any)
            : undefined;
            
        this.memorySettingsTab = new MemorySettingsTab(
            this.memorySettingsContainer,
            this.settings,
            window.app,
            indexingAdapter,
            undefined, // No direct equivalent for EmbeddingManager
            searchService,
            this.vaultLibrarian,
            this.memoryManager
        );
        
        // Display settings
        this.memorySettingsTab.display();
    }
}