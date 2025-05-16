import { Setting, TextComponent, ToggleComponent, SliderComponent, DropdownComponent, ButtonComponent, Events, Notice } from 'obsidian';
import { MemorySettings, DEFAULT_MEMORY_SETTINGS } from '../types';
import { Settings } from '../settings';
import { VaultLibrarianAgent } from '../agents/vaultLibrarian/vaultLibrarian';
import { ProgressBar } from './ProgressBar';

/**
 * Memory Manager settings tab component
 * Provides UI for configuring the Memory Manager
 */
export class MemorySettingsTab {
    private tabContainer: HTMLElement;
    private contentContainer: HTMLElement;
    private tabs: Record<string, HTMLElement> = {};
    private contents: Record<string, HTMLElement> = {};
    private settings: MemorySettings;
    private settingsManager: Settings;
    private vaultLibrarian: VaultLibrarianAgent;

    /**
     * Create a new Memory Settings Tab
     * 
     * @param containerEl Container element to append to
     * @param settingsManager Settings manager instance
     * @param vaultLibrarian VaultLibrarian agent instance
     */
    constructor(
        private containerEl: HTMLElement,
        settingsManager: Settings,
        vaultLibrarian: VaultLibrarianAgent
    ) {
        this.settingsManager = settingsManager;
        this.vaultLibrarian = vaultLibrarian;
        this.settings = this.settingsManager.settings.memory || { ...DEFAULT_MEMORY_SETTINGS };
    }

    /**
     * Display the Memory Manager settings tab
     */
    display(): void {
        // Clear the container first to avoid duplication
        this.containerEl.empty();
        
        const memorySection = this.containerEl.createEl('div', { cls: 'mcp-section memory-settings-container' });
        memorySection.createEl('h2', { text: 'Memory Manager Settings' });

        // Note about embedding creation
        const infoEl = memorySection.createEl('div', { cls: 'memory-info-notice' });
        infoEl.createEl('p', { text: 'Memory Manager is always enabled. You can control when embeddings are created in the Embedding tab under "Indexing Schedule".' });
        infoEl.createEl('p', { text: 'Set to "Only Manually" if you want to control exactly when embeddings are created.' });

        // Create tabs for organization
        this.tabContainer = memorySection.createDiv({ cls: 'memory-settings-tabs' });
        
        this.tabs = {
            api: this.tabContainer.createDiv({ cls: 'memory-tab active', text: 'API' }),
            embedding: this.tabContainer.createDiv({ cls: 'memory-tab', text: 'Embedding' }),
            filters: this.tabContainer.createDiv({ cls: 'memory-tab', text: 'Filters' }),
            advanced: this.tabContainer.createDiv({ cls: 'memory-tab', text: 'Advanced' })
        };

        // Content containers for each tab
        this.contentContainer = memorySection.createDiv({ cls: 'memory-tab-content' });
        
        this.contents = {
            api: this.contentContainer.createDiv({ cls: 'memory-tab-pane active' }),
            embedding: this.contentContainer.createDiv({ cls: 'memory-tab-pane' }),
            filters: this.contentContainer.createDiv({ cls: 'memory-tab-pane' }),
            advanced: this.contentContainer.createDiv({ cls: 'memory-tab-pane' })
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

        // Fill the API tab content
        this.createApiSettings(this.contents.api);
        
        // Fill the Embedding tab content
        this.createEmbeddingSettings(this.contents.embedding);
        
        // Fill the Filters tab content
        this.createFilterSettings(this.contents.filters);
        
        // Fill the Advanced tab content
        this.createAdvancedSettings(this.contents.advanced);
        
        // Add Usage Statistics
        this.createUsageStats(memorySection);
    }

    /**
     * Create API settings section
     */
    private createApiSettings(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'API Configuration' });
        
        // API Provider dropdown
        new Setting(containerEl)
            .setName('Embedding Provider')
            .setDesc('Select the API provider for generating embeddings')
            .addDropdown(dropdown => dropdown
                .addOption('openai', 'OpenAI')
                .addOption('local', 'Local (Experimental)')
                .setValue(this.settings.apiProvider)
                .onChange(async (value: 'openai' | 'local') => {
                    this.settings.apiProvider = value;
                    await this.saveSettings();
                    // Refresh to show/hide provider-specific settings
                    this.display();
                })
            );

        // OpenAI Settings
        if (this.settings.apiProvider === 'openai') {
            new Setting(containerEl)
                .setName('OpenAI API Key')
                .setDesc('Your OpenAI API key for embeddings (securely stored in your vault)')
                .addText(text => {
                    text.inputEl.type = 'password';
                    return text
                        .setPlaceholder('sk-...')
                        .setValue(this.settings.openaiApiKey)
                        .onChange(async (value) => {
                            this.settings.openaiApiKey = value;
                            await this.saveSettings();
                        });
                });
            
            new Setting(containerEl)
                .setName('Organization ID (Optional)')
                .setDesc('Your OpenAI organization ID if applicable')
                .addText(text => {
                    text.inputEl.type = 'password';
                    return text
                        .setPlaceholder('org-...')
                        .setValue(this.settings.openaiOrganization || '')
                        .onChange(async (value) => {
                            this.settings.openaiOrganization = value || undefined;
                            await this.saveSettings();
                        });
                });
        }
        
        // Model settings
        containerEl.createEl('h3', { text: 'Model Configuration' });
        
        new Setting(containerEl)
            .setName('Embedding Model')
            .setDesc('Select the embedding model to use')
            .addDropdown(dropdown => dropdown
                .addOption('text-embedding-3-small', 'text-embedding-3-small (1536 dims, cheaper)')
                .addOption('text-embedding-3-large', 'text-embedding-3-large (3072 dims, more accurate)')
                .setValue(this.settings.embeddingModel)
                .onChange(async (value: 'text-embedding-3-small' | 'text-embedding-3-large') => {
                    this.settings.embeddingModel = value;
                    
                    // Update default dimensions based on model
                    if (value === 'text-embedding-3-small' && this.settings.dimensions > 1536) {
                        this.settings.dimensions = 1536;
                    } else if (value === 'text-embedding-3-large' && this.settings.dimensions === 1536) {
                        this.settings.dimensions = 3072;
                    }
                    
                    await this.saveSettings();
                    this.display();
                })
            );
        
        const maxDimensions = this.settings.embeddingModel === 'text-embedding-3-small' ? 1536 : 3072;
        
        new Setting(containerEl)
            .setName('Embedding Dimensions')
            .setDesc(`Dimension size for embeddings (max ${maxDimensions})`)
            .addSlider(slider => slider
                .setLimits(256, maxDimensions, 256)
                .setValue(this.settings.dimensions)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.dimensions = value;
                    await this.saveSettings();
                })
            );
            
        // Usage limits
        containerEl.createEl('h3', { text: 'Usage Limits' });
        
        new Setting(containerEl)
            .setName('Monthly Token Limit')
            .setDesc('Maximum tokens to process per month (1M ≈ $0.13 for small model)')
            .addText(text => text
                .setPlaceholder('1000000')
                .setValue(String(this.settings.maxTokensPerMonth))
                .onChange(async (value) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue) && numValue > 0) {
                        this.settings.maxTokensPerMonth = numValue;
                        await this.saveSettings();
                    }
                })
            );
            
        new Setting(containerEl)
            .setName('API Rate Limit')
            .setDesc('Maximum API requests per minute')
            .addSlider(slider => slider
                .setLimits(10, 1000, 10)
                .setValue(this.settings.apiRateLimitPerMinute)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.apiRateLimitPerMinute = value;
                    await this.saveSettings();
                })
            );
    }

    /**
     * Create embedding settings section
     */
    private createEmbeddingSettings(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'Content Chunking' });
        
        new Setting(containerEl)
            .setName('Chunking Strategy')
            .setDesc('How to divide your notes into chunks for embedding')
            .addDropdown(dropdown => dropdown
                .addOption('paragraph', 'By Paragraph (recommended)')
                .addOption('heading', 'By Heading')
                .addOption('fixed-size', 'Fixed Size')
                .addOption('sliding-window', 'Sliding Window')
                .setValue(this.settings.chunkStrategy)
                .onChange(async (value: any) => {
                    this.settings.chunkStrategy = value;
                    await this.saveSettings();
                })
            );
        
        new Setting(containerEl)
            .setName('Maximum Chunk Size')
            .setDesc('Maximum number of tokens per chunk (larger chunks provide more context but cost more)')
            .addSlider(slider => slider
                .setLimits(128, 8000, 128)
                .setValue(this.settings.chunkSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.chunkSize = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Chunk Overlap')
            .setDesc('Number of tokens to overlap between chunks (helps maintain context)')
            .addSlider(slider => slider
                .setLimits(0, 200, 10)
                .setValue(this.settings.chunkOverlap)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.chunkOverlap = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Include Frontmatter')
            .setDesc('Include frontmatter in generated embeddings')
            .addToggle(toggle => toggle
                .setValue(this.settings.includeFrontmatter)
                .onChange(async (value) => {
                    this.settings.includeFrontmatter = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Minimum Content Length')
            .setDesc('Minimum length (in characters) required to create a chunk')
            .addText(text => text
                .setPlaceholder('50')
                .setValue(String(this.settings.minContentLength))
                .onChange(async (value) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue) && numValue >= 0) {
                        this.settings.minContentLength = numValue;
                        await this.saveSettings();
                    }
                })
            );
            
        containerEl.createEl('h3', { text: 'Indexing Schedule' });
        
        new Setting(containerEl)
            .setName('When to Index')
            .setDesc('When should notes be indexed')
            .addDropdown(dropdown => dropdown
                .addOption('on-save', 'When Notes are Saved')
                .addOption('manual', 'Only Manually')
                // Future options to be implemented
                // .addOption('daily', 'Daily')
                // .addOption('weekly', 'Weekly')
                .setValue(this.settings.indexingSchedule)
                .onChange(async (value: any) => {
                    this.settings.indexingSchedule = value;
                    await this.saveSettings();
                })
            );
            
        containerEl.createEl('h3', { text: 'Performance' });
        
        new Setting(containerEl)
            .setName('Batch Size')
            .setDesc('Number of chunks to process at once during batch operations')
            .addSlider(slider => slider
                .setLimits(1, 50, 1)
                .setValue(this.settings.batchSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.batchSize = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Concurrent Requests')
            .setDesc('Number of concurrent API requests (higher values may cause rate limiting)')
            .addSlider(slider => slider
                .setLimits(1, 10, 1)
                .setValue(this.settings.concurrentRequests)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.concurrentRequests = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Processing Delay')
            .setDesc('Milliseconds to wait between batches (larger values reduce freezing but slow down indexing)')
            .addSlider(slider => slider
                .setLimits(0, 5000, 100)
                .setValue(this.settings.processingDelay || 1000)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.processingDelay = value;
                    await this.saveSettings();
                })
            );
    }

    /**
     * Create filter settings section
     */
    private createFilterSettings(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'Exclude Patterns' });
        
        const excludePatternsSetting = new Setting(containerEl)
            .setName('Exclude Patterns')
            .setDesc('Exclude files matching these patterns (glob format, one per line)');
            
        const excludeTextarea = excludePatternsSetting.controlEl.createEl('textarea', {
            cls: 'memory-settings-textarea',
            attr: {
                rows: '4'
            }
        });
        
        excludeTextarea.value = this.settings.excludePaths.join('\n');
        excludeTextarea.addEventListener('change', async () => {
            const patterns = excludeTextarea.value.split('\n')
                .map(p => p.trim())
                .filter(p => p.length > 0);
            
            this.settings.excludePaths = patterns;
            await this.saveSettings();
        });
        
        containerEl.createEl('h3', { text: 'Search Preferences' });
        
        new Setting(containerEl)
            .setName('Default Result Limit')
            .setDesc('Default number of results to return')
            .addSlider(slider => slider
                .setLimits(1, 50, 1)
                .setValue(this.settings.defaultResultLimit)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.defaultResultLimit = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Default Similarity Threshold')
            .setDesc('Minimum similarity score (0-1) for search results')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.05)
                .setValue(this.settings.defaultThreshold)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.defaultThreshold = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Enable Backlink Boost')
            .setDesc('Boost results from files with backlinks to/from high-scoring results')
            .addToggle(toggle => toggle
                .setValue(this.settings.backlinksEnabled)
                .onChange(async (value) => {
                    this.settings.backlinksEnabled = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Graph Boost Factor')
            .setDesc('How much to boost results based on connections (0-1)')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.05)
                .setValue(this.settings.graphBoostFactor)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.graphBoostFactor = value;
                    await this.saveSettings();
                })
            );
    }

    /**
     * Create advanced settings section
     */
    private createAdvancedSettings(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'Database Settings' });
        
        new Setting(containerEl)
            .setName('Database Path')
            .setDesc('Custom path for the database file (leave empty for default)')
            .addText(text => text
                .setPlaceholder('Default (.obsidian/plugins/claudesidian-mcp/memory-db)')
                .setValue(this.settings.dbStoragePath)
                .onChange(async (value) => {
                    this.settings.dbStoragePath = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Maximum Database Size')
            .setDesc('Maximum size of the database in MB')
            .addSlider(slider => slider
                .setLimits(100, 2000, 100)
                .setValue(this.settings.maxDbSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.maxDbSize = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Clean Orphaned Embeddings')
            .setDesc('Automatically clean up embeddings for deleted files')
            .addToggle(toggle => toggle
                .setValue(this.settings.autoCleanOrphaned)
                .onChange(async (value) => {
                    this.settings.autoCleanOrphaned = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Pruning Strategy')
            .setDesc('Strategy for removing embeddings when database is full')
            .addDropdown(dropdown => dropdown
                .addOption('oldest', 'Oldest Embeddings')
                .addOption('least-used', 'Least Used Embeddings')
                .addOption('manual', 'Manual Cleanup Only')
                .setValue(this.settings.pruningStrategy)
                .onChange(async (value: any) => {
                    this.settings.pruningStrategy = value;
                    await this.saveSettings();
                })
            );
    }

    /**
     * Create usage statistics section
     */
    private createUsageStats(containerEl: HTMLElement): void {
        const section = containerEl.createEl('div', { cls: 'memory-usage-stats' });
        
        section.createEl('h3', { text: 'Usage Statistics' });
        
        // Get current stats
        let usageStats = { 
            tokensThisMonth: 0,
            totalEmbeddings: 0,
            dbSizeMB: 0,
            lastIndexedDate: '',
            indexingInProgress: false
        };
        
        try {
            if (this.vaultLibrarian) {
                // Adapt VaultLibrarian method
                usageStats = this.vaultLibrarian.getUsageStats?.() || usageStats;
            }
        } catch (error) {
            console.error('Error getting usage stats:', error);
        }
        
        // Current month usage
        section.createEl('div', {
            text: `Tokens used this month: ${usageStats.tokensThisMonth.toLocaleString()} / ${this.settings.maxTokensPerMonth.toLocaleString()}`
        });
        
        // Token usage progress bar
        const percentUsed = Math.min(100, (usageStats.tokensThisMonth / this.settings.maxTokensPerMonth) * 100);
        const progressContainer = section.createDiv({ cls: 'memory-usage-progress' });
        const progressBar = progressContainer.createDiv({ cls: 'memory-usage-bar' });
        progressBar.style.width = `${percentUsed}%`;
        
        // Estimated cost
        const modelRate = this.settings.embeddingModel === 'text-embedding-3-small' ? 0.00013 : 0.00013;
        const estimatedCost = (usageStats.tokensThisMonth / 1000) * modelRate;
        
        section.createEl('div', {
            text: `Estimated cost this month: $${estimatedCost.toFixed(4)}`
        });
        
        // Database stats
        section.createEl('div', {
            text: `Total embeddings: ${usageStats.totalEmbeddings.toLocaleString()}`
        });
        
        section.createEl('div', {
            text: `Database size: ${(usageStats.dbSizeMB).toFixed(2)} MB / ${this.settings.maxDbSize} MB`
        });
        
        if (usageStats.lastIndexedDate) {
            section.createEl('div', {
                text: `Last indexed: ${new Date(usageStats.lastIndexedDate).toLocaleString()}`
            });
        }
        
        // Create indexing progress bar container
        const indexingProgressContainer = section.createDiv({ cls: 'memory-indexing-progress' });
        
        // Initialize progress bar
        new ProgressBar(indexingProgressContainer, this.vaultLibrarian.app);
        
        // Action buttons
        const actionsContainer = section.createDiv({ cls: 'memory-actions' });
        
        // Update Token Usage button
        const updateButton = actionsContainer.createEl('button', {
            text: 'Update Usage Counter',
            cls: 'mod-cta'
        });
        updateButton.addEventListener('click', async () => {
            if (this.vaultLibrarian) {
                const currentCount = usageStats.tokensThisMonth;
                const newCount = prompt('Enter new token count:', currentCount.toString());
                
                if (newCount !== null) {
                    const numValue = Number(newCount);
                    if (!isNaN(numValue) && numValue >= 0) {
                        await this.vaultLibrarian.updateUsageStats?.(numValue);
                        this.display();
                    } else {
                        new Notice('Please enter a valid number for token count');
                    }
                }
            }
        });
        
        // Reset Token Usage button
        const resetButton = actionsContainer.createEl('button', {
            text: 'Reset Usage Counter',
            cls: 'mod-warning'
        });
        resetButton.addEventListener('click', async () => {
            if (
                this.vaultLibrarian && 
                confirm('Are you sure you want to reset the usage counter?')
            ) {
                await this.vaultLibrarian.resetUsageStats?.();
                this.display();
            }
        });
        
        // Check if there's an incomplete indexing operation
        const currentOperationId = this.vaultLibrarian.getCurrentIndexingOperationId?.() || null;
        const hasIncompleteOperation = currentOperationId !== null && !usageStats.indexingInProgress;
        
        const reindexButton = actionsContainer.createEl('button', {
            text: usageStats.indexingInProgress ? 'Indexing in progress...' : 
                  hasIncompleteOperation ? 'Resume Indexing' : 'Reindex All Content',
            cls: 'mod-cta'
        });
        reindexButton.disabled = usageStats.indexingInProgress;
        
        // Create cancel button if indexing is in progress
        let cancelButton: HTMLElement | null = null;
        if (usageStats.indexingInProgress) {
            cancelButton = actionsContainer.createEl('button', {
                text: 'Cancel Indexing',
                cls: 'mod-warning'
            });
            
            cancelButton.addEventListener('click', () => {
                if (this.vaultLibrarian && confirm('Are you sure you want to cancel the indexing operation? You can resume it later.')) {
                    this.vaultLibrarian.cancelIndexing?.();
                    this.display();
                }
            });
        }
        
        reindexButton.addEventListener('click', async () => {
            if (!usageStats.indexingInProgress && this.vaultLibrarian) {
                // If we have an incomplete operation, ask to resume
                if (hasIncompleteOperation) {
                    if (confirm('Resume your previous indexing operation?')) {
                        reindexButton.disabled = true;
                        reindexButton.setText('Indexing in progress...');
                        
                        try {
                            await this.vaultLibrarian.reindexAll?.(currentOperationId);
                        } catch (error) {
                            console.error('Error resuming indexing:', error);
                        } finally {
                            this.display();
                        }
                    }
                } else {
                    // Otherwise start a new indexing operation
                    if (confirm('This will reindex all your vault content. It may take a while and use API tokens. Continue?')) {
                        reindexButton.disabled = true;
                        reindexButton.setText('Indexing in progress...');
                        
                        try {
                            await this.vaultLibrarian.reindexAll?.();
                        } catch (error) {
                            console.error('Error reindexing:', error);
                        } finally {
                            this.display();
                        }
                    }
                }
            }
        });
    }

    /**
     * Save settings
     */
    private async saveSettings(): Promise<void> {
        this.settingsManager.settings.memory = this.settings;
        await this.settingsManager.saveSettings();
        if (this.vaultLibrarian) {
            this.vaultLibrarian.updateSettings?.(this.settings);
        }
    }
}