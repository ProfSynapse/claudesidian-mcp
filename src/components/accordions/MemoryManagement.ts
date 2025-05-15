import { Setting, Notice } from 'obsidian';
import { Accordion } from '../Accordion';
import { Settings } from '../../settings';
import { MemoryManager } from '../../agents/memoryManager';
import { MemorySettingsTab } from '../MemorySettingsTab';
import { DEFAULT_MEMORY_SETTINGS } from '../../types';

/**
 * Memory Management accordion component
 * Controls enabling/disabling the memory manager and displays settings
 */
export class MemoryManagementAccordion extends Accordion {
    private settings: Settings;
    private memorySettingsContainer: HTMLElement;
    private memoryManager: MemoryManager | undefined;
    private memorySettingsTab: MemorySettingsTab | null = null;
    
    /**
     * Create a new Memory Management accordion
     * @param containerEl Parent container element
     * @param settings Plugin settings
     * @param memoryManager Memory manager instance (optional)
     */
    constructor(
        containerEl: HTMLElement, 
        settings: Settings,
        memoryManager?: MemoryManager
    ) {
        super(containerEl, 'Memory Management', false);
        this.settings = settings;
        this.memoryManager = memoryManager;
        
        const contentEl = this.getContentEl();
        
        // Add description
        contentEl.createEl('p', {
            text: 'Embedding-based semantic search for your vault. This feature lets you search your notes by meaning, not just keywords.'
        });
        
        // Add more detailed explanation
        const details = contentEl.createEl('div', { cls: 'memory-notice' });
        details.createEl('h4', { text: 'What is the Memory Manager?' });
        details.createEl('p', { text: 'The Memory Manager creates and manages vector embeddings of your vault content, enabling powerful semantic search capabilities.' });
        
        details.createEl('h4', { text: 'Key Features:' });
        const featureList = details.createEl('ul');
        featureList.createEl('li', { text: 'Semantic search across your vault based on meaning, not just keywords' });
        featureList.createEl('li', { text: 'Automatic indexing of new and modified content' });
        featureList.createEl('li', { text: 'Filtering by tags, paths, and frontmatter properties' });
        featureList.createEl('li', { text: 'Graph-aware search that utilizes your note connections' });
        
        details.createEl('h4', { text: 'How to Use:' });
        details.createEl('p', { text: 'Once enabled and configured, Claude can search your vault using the queryMemory mode of the MemoryManager agent. This allows Claude to find relevant content in your notes even without exact keyword matches.' });
        
        details.createEl('h4', { text: 'API Requirements:' });
        details.createEl('p', { text: 'The Memory Manager requires an embedding provider API. Currently supported: OpenAI (recommended) and local embedding (experimental).' });
        
        const apiNote = details.createEl('div', { cls: 'memory-notice' });
        apiNote.createEl('p', { text: 'Note: Using the Memory Manager with OpenAI will generate API costs based on your usage. You can set monthly token limits to control costs.' });
        
        // Container for memory settings
        this.memorySettingsContainer = contentEl.createEl('div', {
            cls: 'memory-settings-container'
        });
        
        // Always show the memory settings
        this.memorySettingsContainer.style.display = 'block';
        
        // Initialize memory settings tab if manager exists
        if (this.memoryManager) {
            this.initializeMemorySettingsTab();
        } else if (this.settings.settings.memory?.enabled) {
            // Show message if enabled but manager not initialized
            this.memorySettingsContainer.createEl('div', {
                cls: 'memory-notice',
                text: 'Memory Manager is enabled but not yet initialized. Please restart Obsidian.'
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
        if (!this.memoryManager) return;
        
        // Clear existing content
        this.memorySettingsContainer.empty();
        
        // Create memory settings tab
        this.memorySettingsTab = new MemorySettingsTab(
            this.memorySettingsContainer,
            this.settings,
            this.memoryManager
        );
        
        // Display settings
        this.memorySettingsTab.display();
    }
}