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
        
        // Add simple description
        contentEl.createEl('p', {
            text: 'Configure settings for the Memory Manager feature.'
        });
        
        // Container for memory settings
        this.memorySettingsContainer = contentEl.createEl('div', {
            cls: 'memory-settings-container'
        });
        
        // Memory settings are now visible by default via CSS
        
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