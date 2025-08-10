import { Notice, Setting } from 'obsidian';

/**
 * Location: src/components/memory-settings/sections/IndexingSection.ts
 * 
 * IndexingSection component handles embedding strategy configuration including:
 * - Automatic indexing strategy selection (idle vs startup mode)
 * - Idle time threshold configuration with validation
 * - Initial embedding button for new installations
 * - Embedding status detection and management
 * 
 * Used by: EmbeddingSettingsTab for embedding strategy section
 * Dependencies: Obsidian Notice/Setting
 */
export class IndexingSection {
    private currentErrorEl: HTMLElement | null = null;

    constructor(
        private settings: any,
        private saveSettings: () => Promise<void>,
        private app: any,
        private hasEmbeddings: boolean,
        private onSettingsChanged?: () => void
    ) {}

    /**
     * Renders the indexing strategy configuration section
     */
    async display(containerEl: HTMLElement): Promise<void> {
        // Show initial embedding button if no embeddings exist
        if (!this.hasEmbeddings) {
            await this.renderInitialEmbeddingSection(containerEl);
        } else {
            await this.renderEmbeddingStatus(containerEl);
        }

        // Embedding strategy dropdown
        await this.renderEmbeddingStrategy(containerEl);
        
        // Idle threshold settings (conditional on strategy)
        if (this.settings.embeddingStrategy === 'idle') {
            await this.renderIdleTimeSettings(containerEl);
        }
    }

    /**
     * Renders the initial embedding setup section
     */
    private async renderInitialEmbeddingSection(containerEl: HTMLElement): Promise<void> {
        const startEmbeddingContainer = containerEl.createDiv({ cls: 'start-embedding-container' });
        
        startEmbeddingContainer.createEl('p', { 
            text: 'No embeddings found. You need to start generating embeddings for your vault content.',
            cls: 'notice-text'
        });
        
        const startButton = startEmbeddingContainer.createEl('button', {
            text: 'Start Initial Embedding',
            cls: 'mod-cta'
        });
        
        startButton.addEventListener('click', async () => {
            await this.handleInitialEmbedding(startButton);
        });
    }

    /**
     * Renders the embedding status for existing installations
     */
    private async renderEmbeddingStatus(containerEl: HTMLElement): Promise<void> {
        const statusContainer = containerEl.createDiv({ cls: 'start-embedding-container' });
        
        statusContainer.createEl('p', {
            text: 'Embeddings detected. You can reindex content from the Usage tab.',
            cls: 'info-text'
        });
    }

    /**
     * Renders the embedding strategy selection
     */
    private async renderEmbeddingStrategy(containerEl: HTMLElement): Promise<void> {
        new Setting(containerEl)
            .setName('Automatic Indexing')
            .setDesc('Controls when new or modified notes are automatically indexed and embedded for search')
            .addDropdown(dropdown => dropdown
                .addOption('idle', 'Idle Mode - Index when Obsidian is inactive')
                .addOption('startup', 'Startup Mode - Queue changes, process in background after restart')
                .setValue(this.settings.embeddingStrategy || 'idle')
                .onChange(async (value) => {
                    this.settings.embeddingStrategy = value as 'idle' | 'startup';
                    await this.saveSettings();
                    
                    // Update FileEventManager with new strategy immediately
                    try {
                        const plugin = this.app.plugins.plugins['claudesidian-mcp'];
                        if (plugin && typeof plugin.reloadConfiguration === 'function') {
                            plugin.reloadConfiguration();
                        }
                    } catch (error) {
                        console.error('[IndexingSection] Error updating embedding strategy:', error);
                    }
                    
                    // Trigger re-render to show/hide idle threshold settings
                    if (this.onSettingsChanged) {
                        this.onSettingsChanged();
                    }
                })
            );
    }

    /**
     * Renders idle time threshold settings with validation
     */
    private async renderIdleTimeSettings(containerEl: HTMLElement): Promise<void> {
        const idleTimeSetting = new Setting(containerEl)
            .setName('Idle Time Threshold')
            .setDesc('How long to wait (in seconds) after the last change before embedding (minimum: 5 seconds)');
        
        let idleTimeInput: HTMLInputElement;
        
        idleTimeSetting
            .addText(text => {
                idleTimeInput = text.inputEl;
                text
                    .setPlaceholder('60')
                    .setValue(String(this.settings.idleTimeThreshold ? this.settings.idleTimeThreshold / 1000 : 60)) // Convert from ms to seconds
                    .onChange(async (value) => {
                        await this.handleIdleTimeChange(value, idleTimeInput, idleTimeSetting);
                    });
            })
            .addExtraButton(button => {
                button
                    .setIcon('reset')
                    .setTooltip('Reset to default (60 seconds)')
                    .onClick(async () => {
                        this.settings.idleTimeThreshold = 60000;
                        idleTimeInput.value = '60';
                        await this.saveSettings();
                        if (this.onSettingsChanged) {
                            this.onSettingsChanged();
                        }
                    });
            });
    }

    /**
     * Handles the initial embedding process
     */
    private async handleInitialEmbedding(startButton: HTMLButtonElement): Promise<void> {
        const confirmed = confirm('This will start indexing all your vault content. It may take a while and use API tokens. Continue?');
        if (!confirmed) {
            return;
        }

        startButton.disabled = true;
        startButton.textContent = 'Indexing in progress...';
        
        try {
            const plugin = this.app.plugins.plugins['claudesidian-mcp'];
            if (!plugin) {
                throw new Error('Plugin not found');
            }
            
            // Use embedding service for indexing (not search service)
            const embeddingService = plugin.embeddingService || plugin.services?.embeddingService;
            
            if (embeddingService && typeof embeddingService.batchIndexFiles === 'function') {
                // Get all markdown files from the vault
                const files = plugin.app.vault.getMarkdownFiles();
                const filePaths = files.map((file: {path: string}) => file.path);
                
                new Notice(`Starting indexing of ${filePaths.length} files...`, 3000);
                
                // Start the indexing process
                await embeddingService.batchIndexFiles(filePaths);
                
                const successNotice = new Notice(`Successfully indexed ${filePaths.length} files`);
                // Auto-hide after 5 seconds
                setTimeout(() => {
                    try {
                        successNotice.hide();
                    } catch (e) {
                        // Ignore if already hidden
                    }
                }, 5000);
                
                // Trigger parent refresh to hide the button
                if (this.onSettingsChanged) {
                    this.onSettingsChanged();
                }
            } else {
                throw new Error('Embedding service not available or batchIndexFiles method not found');
            }
        } catch (error) {
            console.error('Error indexing content:', error);
            new Notice(`Error indexing: ${error instanceof Error ? error.message : String(error)}`, 5000);
            startButton.disabled = false;
            startButton.textContent = 'Start Initial Embedding';
        }
    }

    /**
     * Handles idle time threshold changes with validation
     */
    private async handleIdleTimeChange(
        value: string, 
        idleTimeInput: HTMLInputElement, 
        idleTimeSetting: Setting
    ): Promise<void> {
        const numValue = Number(value);
        
        // Clear previous error styling and message
        idleTimeInput.style.borderColor = '';
        if (this.currentErrorEl) {
            this.currentErrorEl.remove();
            this.currentErrorEl = null;
        }
        
        if (value.trim() === '') {
            // Empty value, show error
            idleTimeInput.style.borderColor = 'var(--text-error)';
            this.currentErrorEl = idleTimeSetting.settingEl.createDiv({
                text: 'Idle time is required',
                cls: 'setting-error'
            });
            return;
        }
        
        if (isNaN(numValue)) {
            // Invalid number, show error
            idleTimeInput.style.borderColor = 'var(--text-error)';
            this.currentErrorEl = idleTimeSetting.settingEl.createDiv({
                text: 'Please enter a valid number',
                cls: 'setting-error'
            });
            return;
        }
        
        if (numValue < 5) {
            // Below minimum, show error
            idleTimeInput.style.borderColor = 'var(--text-error)';
            this.currentErrorEl = idleTimeSetting.settingEl.createDiv({
                text: 'Minimum idle time is 5 seconds',
                cls: 'setting-error'
            });
            return;
        }
        
        if (numValue > 3600) {
            // Above reasonable maximum (1 hour), show warning
            idleTimeInput.style.borderColor = 'var(--text-warning)';
            this.currentErrorEl = idleTimeSetting.settingEl.createDiv({
                text: 'Warning: Very long idle times may delay embedding',
                cls: 'setting-warning'
            });
        }
        
        // Valid value, save it
        this.settings.idleTimeThreshold = numValue * 1000; // Convert to ms for storage
        await this.saveSettings();
        
        // Show success feedback briefly
        idleTimeInput.style.borderColor = 'var(--text-success)';
        setTimeout(() => {
            idleTimeInput.style.borderColor = '';
        }, 1000);
    }
}