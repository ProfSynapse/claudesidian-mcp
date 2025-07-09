import { Accordion } from '../Accordion';
import { Settings } from '../../settings';
import { VaultLibrarianAgent } from '../../agents/vaultLibrarian/vaultLibrarian';
import { MemorySettingsTab } from '../MemorySettingsTab';
import { EmbeddingService } from '../../database/services/EmbeddingService';
import { FileEmbeddingAccessService } from '../../database/services/FileEmbeddingAccessService';
import { HnswSearchService } from '../../database/services/hnsw/HnswSearchService';
import { MemoryService } from '../../database/services/MemoryService';
import { EmbeddingManager } from '../../database/services/embeddingManager';

/**
 * Memory Management accordion component
 * Controls enabling/disabling the memory manager and displays settings
 */
export class MemoryManagementAccordion extends Accordion {
    private settings: Settings;
    private memorySettingsContainer: HTMLElement;
    
    // ChromaDB Services
    private embeddingService: EmbeddingService | undefined;
    private fileEmbeddingAccessService: FileEmbeddingAccessService | undefined;
    private hnswSearchService: HnswSearchService | undefined;
    private memoryService: MemoryService | undefined;
    private embeddingManager: EmbeddingManager | undefined;
    
    // Agent (for backward compatibility)
    private vaultLibrarian: VaultLibrarianAgent | undefined;
    
    private memorySettingsTab: MemorySettingsTab | null = null;
    
    /**
     * Create a new Memory Management accordion
     * @param containerEl Parent container element
     * @param settings Plugin settings
     * @param embeddingService EmbeddingService for generating and managing embeddings
     * @param fileEmbeddingAccessService FileEmbeddingAccessService for file embedding access
     * @param hnswSearchService HnswSearchService for search operations
     * @param memoryService MemoryService for memory traces and sessions
     * @param vaultLibrarian VaultLibrarian agent instance (optional, for backward compatibility)
     * @param embeddingManager EmbeddingManager for managing embedding providers (optional)
     */
    constructor(
        containerEl: HTMLElement, 
        settings: Settings,
        embeddingService?: EmbeddingService,
        fileEmbeddingAccessService?: FileEmbeddingAccessService,
        hnswSearchService?: HnswSearchService,
        memoryService?: MemoryService,
        vaultLibrarian?: VaultLibrarianAgent,
        embeddingManager?: EmbeddingManager
    ) {
        super(containerEl, 'Memory Management', false);
        this.settings = settings;
        this.embeddingService = embeddingService;
        this.fileEmbeddingAccessService = fileEmbeddingAccessService;
        this.hnswSearchService = hnswSearchService;
        this.memoryService = memoryService;
        this.vaultLibrarian = vaultLibrarian;
        this.embeddingManager = embeddingManager;
        
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
        const hasServices = this.embeddingService && this.fileEmbeddingAccessService && this.hnswSearchService && this.memoryService;
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
        const hasServices = this.embeddingService && this.fileEmbeddingAccessService && this.hnswSearchService && this.memoryService;
        const hasAgent = this.vaultLibrarian;
        
        if (!hasServices && !hasAgent) {
            // Show error message if neither services nor agents are available
            this.memorySettingsContainer.createEl('div', {
                cls: 'memory-notice error',
                text: 'Memory Manager services are not available. Please restart Obsidian.'
            });
            return;
        }
        
        // Initialize the MemorySettingsTab with our services and agent
        this.memorySettingsTab = new MemorySettingsTab(
            this.memorySettingsContainer,
            this.settings,
            (window as any).app,
            this.embeddingManager,
            this.vaultLibrarian,
            this.embeddingService,
            this.hnswSearchService
        );
        
        // Display settings
        this.memorySettingsTab.display();
    }
}