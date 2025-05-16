import { Setting, App, TextComponent, ToggleComponent, SliderComponent, DropdownComponent, ButtonComponent, Events, Notice } from 'obsidian';
import { MemorySettings, DEFAULT_MEMORY_SETTINGS } from '../types';
import { Settings } from '../settings';
import { VaultLibrarianAgent } from '../agents/vaultLibrarian/vaultLibrarian';
import { MemoryManagerAgent } from '../agents/memoryManager/memoryManager';
import { ProgressBar } from './ProgressBar';
import { IndexingService } from '../database/services/indexingService';
import { EmbeddingManager } from '../database/services/embeddingManager';
import { SearchService } from '../database/services/searchService';

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
    private app: App;
    
    // Services (direct access to database functionality)
    private indexingService: IndexingService | null = null;
    private embeddingManager: EmbeddingManager | null = null;
    private searchService: SearchService | null = null;
    
    // Agents (for backward compatibility and specific MCP operations)
    private vaultLibrarian: VaultLibrarianAgent | null = null;
    private memoryManager: MemoryManagerAgent | null = null;

    /**
     * Create a new Memory Settings Tab
     * 
     * @param containerEl Container element to append to
     * @param settingsManager Settings manager instance
     * @param app Obsidian app instance
     * @param indexingService IndexingService for file indexing operations
     * @param embeddingManager EmbeddingManager for embedding provider management
     * @param searchService SearchService instance
     * @param vaultLibrarian VaultLibrarian agent instance (optional, for backward compatibility)
     * @param memoryManager Optional MemoryManager agent instance
     */
    constructor(
        private containerEl: HTMLElement,
        settingsManager: Settings,
        app?: App,
        indexingService?: IndexingService,
        embeddingManager?: EmbeddingManager,
        searchService?: SearchService,
        vaultLibrarian?: VaultLibrarianAgent,
        memoryManager?: MemoryManagerAgent
    ) {
        this.settingsManager = settingsManager;
        this.app = app || (vaultLibrarian?.app || window.app);
        this.indexingService = indexingService || null;
        this.embeddingManager = embeddingManager || null;
        this.searchService = searchService || null;
        this.vaultLibrarian = vaultLibrarian || null;
        this.memoryManager = memoryManager || null;
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

        // Fill the API tab content
        this.createApiSettings(this.contents.api);
        
        // Fill the Embedding tab content
        this.createEmbeddingSettings(this.contents.embedding);
        
        // Fill the Filters tab content
        this.createFilterSettings(this.contents.filters);
        
        // Fill the Advanced tab content
        this.createAdvancedSettings(this.contents.advanced);
        
        // Fill the Sessions tab content if memory manager is available
        this.createSessionsSettings(this.contents.sessions);
        
        // Add Usage Statistics
        this.createUsageStats(memorySection);
        
        // Add disabled class to the embedding settings container if embeddings are disabled
        if (!this.settings.embeddingsEnabled) {
            this.contentContainer.addClass('embeddings-disabled');
        }
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
     * Create sessions/states settings section
     */
    private createSessionsSettings(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'Session Management' });
        
        // If memory manager isn't available, show a message
        if (!this.memoryManager) {
            containerEl.createEl('p', { 
                text: 'Memory manager is not initialized. Sessions management will be available after restarting Obsidian.',
                cls: 'warning-text'
            });
            return;
        }
        
        // Session settings
        new Setting(containerEl)
            .setName('Auto-Create Sessions')
            .setDesc('Automatically create sessions when needed for tracking context')
            .addToggle(toggle => toggle
                .setValue(this.settings.autoCreateSessions !== false) // Default to true
                .onChange(async (value) => {
                    this.settings.autoCreateSessions = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Session Naming')
            .setDesc('How to name automatically created sessions')
            .addDropdown(dropdown => dropdown
                .addOption('timestamp', 'Timestamp Only')
                .addOption('workspace', 'Workspace + Timestamp')
                .addOption('content', 'Content Based (if available)')
                .setValue(this.settings.sessionNaming || 'workspace')
                .onChange(async (value: any) => {
                    this.settings.sessionNaming = value;
                    await this.saveSettings();
                })
            );
        
        // State settings
        containerEl.createEl('h3', { text: 'State Management' });
        
        new Setting(containerEl)
            .setName('Auto-Checkpoint')
            .setDesc('Automatically create checkpoints at regular intervals')
            .addToggle(toggle => toggle
                .setValue(this.settings.autoCheckpoint || false)
                .onChange(async (value) => {
                    this.settings.autoCheckpoint = value;
                    await this.saveSettings();
                })
            );
            
        if (this.settings.autoCheckpoint) {
            new Setting(containerEl)
                .setName('Checkpoint Interval')
                .setDesc('Minutes between auto-checkpoints (0 = after each operation)')
                .addSlider(slider => slider
                    .setLimits(0, 60, 5)
                    .setValue(this.settings.checkpointInterval || 30)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.settings.checkpointInterval = value;
                        await this.saveSettings();
                    })
                );
        }
            
        new Setting(containerEl)
            .setName('Maximum States')
            .setDesc('Maximum number of states to keep per workspace')
            .addSlider(slider => slider
                .setLimits(1, 50, 1)
                .setValue(this.settings.maxStates || 10)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.maxStates = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('State Pruning Strategy')
            .setDesc('How to determine which states to remove when the limit is reached')
            .addDropdown(dropdown => dropdown
                .addOption('oldest', 'Oldest States')
                .addOption('least-important', 'Least Important States')
                .addOption('manual', 'Manual Cleanup Only')
                .setValue(this.settings.statePruningStrategy || 'oldest')
                .onChange(async (value: any) => {
                    this.settings.statePruningStrategy = value;
                    await this.saveSettings();
                })
            );
            
        // Current sessions summary
        containerEl.createEl('h3', { text: 'Active Sessions' });
        
        // Add a container for session list
        const sessionsContainer = containerEl.createEl('div', { cls: 'memory-sessions-list' });
        
        // Add a refresh button for session list
        const refreshButton = containerEl.createEl('button', {
            text: 'Refresh Sessions',
            cls: 'mod-cta',
            attr: { style: 'margin-top: 10px;' }
        });
        
        // Function to refresh session list
        const refreshSessions = async () => {
            sessionsContainer.empty();
            sessionsContainer.createEl('p', { text: 'Loading sessions...' });
            
            try {
                const workspaces = this.vaultLibrarian ? await this.vaultLibrarian.getWorkspaces?.() : [];
                if (!workspaces || workspaces.length === 0) {
                    sessionsContainer.empty();
                    sessionsContainer.createEl('p', { text: 'No workspaces found.' });
                    return;
                }
                
                sessionsContainer.empty();
                let foundSessions = false;
                
                for (const workspace of workspaces) {
                    // Only show workspaces that have active sessions
                    const activeSessions = await this.memoryManager?.executeMode('listSessions', {
                        workspaceContext: { workspaceId: workspace.id },
                        activeOnly: true
                    });
                    
                    if (activeSessions?.success && activeSessions.data?.sessions?.length > 0) {
                        foundSessions = true;
                        const sessions = activeSessions.data.sessions;
                        
                        // Create a workspace section
                        const workspaceSection = sessionsContainer.createEl('div', { cls: 'memory-workspace-item' });
                        workspaceSection.createEl('h4', { text: workspace.name });
                        
                        // Create session list
                        const sessionList = workspaceSection.createEl('ul', { cls: 'memory-session-list' });
                        
                        sessions.forEach((session: any) => {
                            const sessionItem = sessionList.createEl('li', { cls: 'memory-session-item' });
                            
                            const startTime = new Date(session.startTime).toLocaleString();
                            
                            sessionItem.createEl('div', {
                                text: `${session.name} (started ${startTime})`,
                                cls: 'memory-session-name'
                            });
                            
                            // Add a button to end this session
                            const endButton = sessionItem.createEl('button', {
                                text: 'End Session',
                                cls: 'mod-warning memory-session-end'
                            });
                            
                            endButton.addEventListener('click', async () => {
                                if (confirm(`Are you sure you want to end the session "${session.name}"?`)) {
                                    try {
                                        await this.memoryManager?.executeMode('editSession', {
                                            workspaceContext: { workspaceId: workspace.id },
                                            sessionId: session.id,
                                            isActive: false
                                        });
                                        
                                        new Notice(`Session "${session.name}" ended`);
                                        refreshSessions();
                                    } catch (error) {
                                        console.error('Error ending session:', error);
                                        new Notice(`Failed to end session: ${error.message}`);
                                    }
                                }
                            });
                        });
                    }
                }
                
                if (!foundSessions) {
                    sessionsContainer.createEl('p', { text: 'No active sessions found.' });
                }
            } catch (error) {
                console.error('Error loading sessions:', error);
                sessionsContainer.empty();
                sessionsContainer.createEl('p', { text: `Error loading sessions: ${error.message}` });
            }
        };
        
        // Add click handler for refresh button
        refreshButton.addEventListener('click', refreshSessions);
        
        // Initial refresh
        refreshSessions();
    }

    /**
     * Create usage statistics section
     */
    private createUsageStats(containerEl: HTMLElement): void {
        const section = containerEl.createEl('div', { cls: 'memory-usage-stats' });
        
        section.createEl('h3', { text: 'Usage Statistics' });
        
        // Get current stats
        let usageStats: {
            tokensThisMonth: number;
            totalEmbeddings: number;
            dbSizeMB: number;
            lastIndexedDate: string;
            indexingInProgress: boolean;
            estimatedCost?: number;
            modelUsage?: {
                'text-embedding-3-small': number;
                'text-embedding-3-large': number;
            };
        } = { 
            tokensThisMonth: 0,
            totalEmbeddings: 0,
            dbSizeMB: 0,
            lastIndexedDate: '',
            indexingInProgress: false,
            estimatedCost: 0,
            modelUsage: {
                'text-embedding-3-small': 0,
                'text-embedding-3-large': 0
            }
        };
        
        try {
            // Try to get usage stats from indexingService first (preferred)
            if (this.indexingService) {
                usageStats = this.indexingService.getUsageStats() || usageStats;
                
                // Get cost and model usage from embeddingManager if available
                if (this.embeddingManager && this.embeddingManager.getProvider()) {
                    const provider = this.embeddingManager.getProvider();
                    if (provider) {
                        usageStats.estimatedCost = (provider as any).getTotalCost?.() || usageStats.estimatedCost;
                        usageStats.modelUsage = (provider as any).getModelUsage?.() || usageStats.modelUsage;
                    }
                }
            } 
            // Fall back to VaultLibrarian if indexingService isn't available
            else if (this.vaultLibrarian) {
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
        
        // Estimated cost - use the cost from usage stats if available, otherwise calculate
        const estimatedCost = usageStats.estimatedCost || 
            ((usageStats.tokensThisMonth / 1000) * (this.settings.costPerThousandTokens?.[this.settings.embeddingModel] || 0.00013));
        
        section.createEl('div', {
            text: `Estimated cost this month: $${estimatedCost.toFixed(4)}`
        });
        
        // Display per-model token usage if available
        if (usageStats.modelUsage) {
            const modelUsageContainer = section.createDiv({ cls: 'memory-model-usage' });
            section.createEl('h4', { text: 'Token Usage by Model' });
            
            for (const model in usageStats.modelUsage) {
                const tokens = usageStats.modelUsage[model as 'text-embedding-3-small' | 'text-embedding-3-large'];
                if (tokens > 0) {
                    const costPerK = this.settings.costPerThousandTokens?.[model as 'text-embedding-3-small' | 'text-embedding-3-large'] || 0;
                    const modelCost = (tokens / 1000) * costPerK;
                    
                    modelUsageContainer.createEl('div', {
                        text: `${model}: ${tokens.toLocaleString()} tokens ($${modelCost.toFixed(4)})`
                    });
                }
            }
        }
        
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
        if (this.vaultLibrarian?.app) {
            new ProgressBar(indexingProgressContainer, this.vaultLibrarian.app);
        } else if (this.app) {
            // If we have direct access to the app, use that
            new ProgressBar(indexingProgressContainer, this.app);
        }
        
        // Action buttons
        const actionsContainer = section.createDiv({ cls: 'memory-actions' });
        
        // Update Token Usage button
        const updateButton = actionsContainer.createEl('button', {
            text: 'Update Usage Counter',
            cls: 'mod-cta'
        });
        updateButton.addEventListener('click', async () => {
            const currentCount = usageStats.tokensThisMonth;
            const newCount = prompt('Enter new token count:', currentCount.toString());
            
            if (newCount !== null) {
                const numValue = Number(newCount);
                if (!isNaN(numValue) && numValue >= 0) {
                    if (this.indexingService) {
                        await this.indexingService.updateUsageStats(numValue);
                    } else if (this.vaultLibrarian) {
                        await this.vaultLibrarian.updateUsageStats?.(numValue);
                    }
                    this.display();
                } else {
                    new Notice('Please enter a valid number for token count');
                }
            }
        });
        
        // Reset Token Usage button
        const resetButton = actionsContainer.createEl('button', {
            text: 'Reset Usage Counter',
            cls: 'mod-warning'
        });
        resetButton.addEventListener('click', async () => {
            if (confirm('Are you sure you want to reset the usage counter?')) {
                if (this.indexingService) {
                    await this.indexingService.resetUsageStats();
                } else if (this.vaultLibrarian) {
                    await this.vaultLibrarian.resetUsageStats?.();
                }
                this.display();
            }
        });
        
        // Get current operation ID from indexingService or fallback to vaultLibrarian
        let currentOperationId: string | null = null;
        if (this.indexingService) {
            currentOperationId = this.indexingService.getCurrentIndexingOperationId() || null;
        } else if (this.vaultLibrarian) {
            currentOperationId = this.vaultLibrarian.getCurrentIndexingOperationId?.() || null;
        }
        
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
                const message = 'Are you sure you want to cancel the indexing operation? You can resume it later.';
                
                if (confirm(message)) {
                    if (this.indexingService) {
                        this.indexingService.cancelIndexing();
                    } else if (this.vaultLibrarian) {
                        this.vaultLibrarian.cancelIndexing?.();
                    }
                    this.display();
                }
            });
        }
        
        reindexButton.addEventListener('click', async () => {
            // Check if we can reindex (not already in progress)
            if (usageStats.indexingInProgress) {
                return;
            }
            
            // Determine which service to use
            const canUseIndexingService = !!this.indexingService;
            const canUseVaultLibrarian = !!this.vaultLibrarian;
            
            if (!canUseIndexingService && !canUseVaultLibrarian) {
                new Notice('No indexing service available');
                return;
            }
            
            // Handle incomplete operation
            if (hasIncompleteOperation) {
                if (confirm('Resume your previous indexing operation?')) {
                    reindexButton.disabled = true;
                    reindexButton.setText('Indexing in progress...');
                    
                    try {
                        if (canUseIndexingService && this.indexingService && currentOperationId) {
                            await this.indexingService.reindexAll(currentOperationId);
                        } else if (canUseVaultLibrarian && this.vaultLibrarian && currentOperationId) {
                            await this.vaultLibrarian.reindexAll?.(currentOperationId);
                        }
                    } catch (error) {
                        console.error('Error resuming indexing:', error);
                    } finally {
                        this.display();
                    }
                }
            } else {
                // Start a new indexing operation
                if (confirm('This will reindex all your vault content. It may take a while and use API tokens. Continue?')) {
                    reindexButton.disabled = true;
                    reindexButton.setText('Indexing in progress...');
                    
                    try {
                        if (canUseIndexingService && this.indexingService) {
                            await this.indexingService.reindexAll();
                        } else if (canUseVaultLibrarian && this.vaultLibrarian) {
                            await this.vaultLibrarian.reindexAll?.();
                        }
                    } catch (error) {
                        console.error('Error reindexing:', error);
                    } finally {
                        this.display();
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
        
        // Update settings in services
        if (this.embeddingManager) {
            this.embeddingManager.updateSettings(this.settings);
        }
        
        // For backward compatibility
        if (this.vaultLibrarian) {
            this.vaultLibrarian.updateSettings?.(this.settings);
        }
    }
}