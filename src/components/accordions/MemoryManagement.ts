import { Accordion } from '../Accordion';
import { Setting } from 'obsidian';
import { DEFAULT_MEMORY_SETTINGS } from '../../agents/memoryManager/types';

export class MemoryManagementAccordion {
    constructor(container: HTMLElement, saveSettings: () => Promise<void>, settings: any) {
        const accordion = new Accordion(container, 'Memory Management', false);
        const content = accordion.getContentEl();
        this.createContent(content, saveSettings, settings);
    }

    private createContent(content: HTMLElement, saveSettings: () => Promise<void>, settings: any): void {
        // Memory introduction
        const introSection = content.createEl('div', { cls: 'mcp-section' });
        introSection.createEl('h4', { text: 'Memory Management System' });
        introSection.createEl('p', {
            text: 'Enable Claude to remember information across conversations by using vector embeddings to store and retrieve knowledge from your vault.'
        });
        
        // Memory settings
        const settingsSection = content.createEl('div', { cls: 'mcp-section' });
        settingsSection.createEl('h4', { text: 'Memory Settings' });

        // Enable memory feature
        new Setting(settingsSection)
            .setName('Enable Memory')
            .setDesc('Allow Claude to store and retrieve information from your vault')
            .addToggle(toggle => toggle
                .setValue(settings.memoryEnabled || false)
                .onChange(async (value) => {
                    settings.memoryEnabled = value;
                    await saveSettings();
                })
            );

        // API Key setting
        new Setting(settingsSection)
            .setName('OpenAI API Key')
            .setDesc('Required for generating embeddings. Your key is stored locally.')
            .addText(text => text
                .setPlaceholder('sk-...')
                .setValue(settings.memorySettings?.openaiApiKey || '')
                .onChange(async (value) => {
                    if (!settings.memorySettings) {
                        settings.memorySettings = {...DEFAULT_MEMORY_SETTINGS};
                    }
                    settings.memorySettings.openaiApiKey = value;
                    await saveSettings();
                })
            );

        // Organization ID (optional)
        new Setting(settingsSection)
            .setName('OpenAI Organization ID')
            .setDesc('Optional: If you belong to multiple organizations')
            .addText(text => text
                .setPlaceholder('org-...')
                .setValue(settings.memorySettings?.openaiOrganization || '')
                .onChange(async (value) => {
                    if (!settings.memorySettings) {
                        settings.memorySettings = {...DEFAULT_MEMORY_SETTINGS};
                    }
                    settings.memorySettings.openaiOrganization = value || undefined;
                    await saveSettings();
                })
            );

        // Embedding model
        new Setting(settingsSection)
            .setName('Embedding Model')
            .setDesc('Model used to create embeddings')
            .addDropdown(dropdown => dropdown
                .addOption('text-embedding-3-small', 'text-embedding-3-small (recommended)')
                .addOption('text-embedding-3-large', 'text-embedding-3-large (higher quality)')
                .addOption('text-embedding-ada-002', 'text-embedding-ada-002 (legacy)')
                .setValue(settings.memorySettings?.embeddingModel || DEFAULT_MEMORY_SETTINGS.embeddingModel)
                .onChange(async (value) => {
                    if (!settings.memorySettings) {
                        settings.memorySettings = {...DEFAULT_MEMORY_SETTINGS};
                    }
                    settings.memorySettings.embeddingModel = value;
                    await saveSettings();
                })
            );

        // Auto-indexing
        new Setting(settingsSection)
            .setName('Auto-Index Notes')
            .setDesc('Automatically create embeddings for new and modified notes')
            .addToggle(toggle => toggle
                .setValue(settings.memorySettings?.autoIndexNotes ?? DEFAULT_MEMORY_SETTINGS.autoIndexNotes)
                .onChange(async (value) => {
                    if (!settings.memorySettings) {
                        settings.memorySettings = {...DEFAULT_MEMORY_SETTINGS};
                    }
                    settings.memorySettings.autoIndexNotes = value;
                    await saveSettings();
                })
            );

        // Excluded folders
        new Setting(settingsSection)
            .setName('Excluded Folders')
            .setDesc('Comma-separated list of folders to exclude from indexing')
            .addText(text => text
                .setPlaceholder('node_modules,.git,.obsidian')
                .setValue(settings.memorySettings?.excludeFolders?.join(',') || DEFAULT_MEMORY_SETTINGS.excludeFolders.join(','))
                .onChange(async (value) => {
                    if (!settings.memorySettings) {
                        settings.memorySettings = {...DEFAULT_MEMORY_SETTINGS};
                    }
                    settings.memorySettings.excludeFolders = value.split(',').map(folder => folder.trim()).filter(Boolean);
                    await saveSettings();
                })
            );

        // Chunk size
        new Setting(settingsSection)
            .setName('Chunk Size')
            .setDesc('Size of text chunks for embeddings (in characters)')
            .addSlider(slider => slider
                .setLimits(100, 2000, 100)
                .setValue(settings.memorySettings?.chunkSize || DEFAULT_MEMORY_SETTINGS.chunkSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    if (!settings.memorySettings) {
                        settings.memorySettings = {...DEFAULT_MEMORY_SETTINGS};
                    }
                    settings.memorySettings.chunkSize = value;
                    await saveSettings();
                })
            );

        // Chunk overlap
        new Setting(settingsSection)
            .setName('Chunk Overlap')
            .setDesc('Overlap between chunks to maintain context (in characters)')
            .addSlider(slider => slider
                .setLimits(0, 500, 10)
                .setValue(settings.memorySettings?.chunkOverlap || DEFAULT_MEMORY_SETTINGS.chunkOverlap)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    if (!settings.memorySettings) {
                        settings.memorySettings = {...DEFAULT_MEMORY_SETTINGS};
                    }
                    settings.memorySettings.chunkOverlap = value;
                    await saveSettings();
                })
            );

        // Storage limit
        new Setting(settingsSection)
            .setName('Storage Limit')
            .setDesc('Maximum storage size for embeddings (in MB)')
            .addSlider(slider => slider
                .setLimits(10, 1000, 10)
                .setValue(settings.memorySettings?.maxStorageSize || DEFAULT_MEMORY_SETTINGS.maxStorageSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    if (!settings.memorySettings) {
                        settings.memorySettings = {...DEFAULT_MEMORY_SETTINGS};
                    }
                    settings.memorySettings.maxStorageSize = value;
                    await saveSettings();
                })
            );

        // Usage hints
        const usageSection = content.createEl('div', { cls: 'mcp-section' });
        usageSection.createEl('h4', { text: 'Using Memory' });
        
        const usageHints = usageSection.createEl('ul');
        usageHints.createEl('li', { 
            text: 'Ask Claude to "remember this for later" to store important information'
        });
        usageHints.createEl('li', { 
            text: 'Use "/index" to manually trigger indexing of your vault'
        });
        usageHints.createEl('li', { 
            text: 'Ask questions about previously stored information'
        });
        usageHints.createEl('li', { 
            text: 'Use "/status" to check memory system statistics'
        });
    }
}