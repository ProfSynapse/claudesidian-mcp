import { Notice, Setting } from 'obsidian';
import { BaseSettingsTab } from './BaseSettingsTab';
import { EmbeddingManager } from '../../database/services/embeddingManager';
import { EmbeddingService } from '../../database/services/EmbeddingService';
import { EmbeddingProviderRegistry } from '../../database/providers/registry/EmbeddingProviderRegistry';

/**
 * API Settings tab component
 * Handles API provider, model configuration, and usage limits
 */
export class ApiSettingsTab extends BaseSettingsTab {
    // Service managers
    protected embeddingManager: EmbeddingManager | null;
    protected embeddingService: EmbeddingService | null;
    
    // Track whether embeddings exist
    protected embeddingsExist: boolean = false;
    
    /**
     * Create a new API settings tab
     */
    constructor(
        settings: any, 
        settingsManager: any, 
        app: any,
        embeddingManager?: EmbeddingManager,
        embeddingService?: EmbeddingService
    ) {
        super(settings, settingsManager, app);
        this.embeddingManager = embeddingManager || null;
        this.embeddingService = embeddingService || null;
    }
    
    /**
     * Display the API settings tab
     */
    async display(containerEl: HTMLElement): Promise<void> {
        // Ensure providerSettings exists
        if (!this.settings.providerSettings) {
            this.settings.providerSettings = {};
        }
        
        // Check if embeddings exist
        if (this.embeddingService) {
            try {
                this.embeddingsExist = await this.embeddingService.hasExistingEmbeddings();
                console.log('Embeddings exist:', this.embeddingsExist);
            } catch (error) {
                console.error('Error checking for existing embeddings:', error);
                // Be conservative and assume embeddings exist on error
                this.embeddingsExist = true;
            }
        }
        
        // Add the embeddings toggle at the top (moved from MemorySettingsTab)
        new Setting(containerEl)
            .setName('Enable Embeddings')
            .setDesc('Enable or disable embeddings functionality. When disabled, semantic search and embedding creation will not be available.')
            .addToggle(toggle => toggle
                .setValue(this.settings.embeddingsEnabled)
                .onChange(async (value) => {
                    // Check if trying to enable embeddings without API key (except for Ollama)
                    const currentProvider = this.settings.apiProvider;
                    
                    // Ensure providerSettings exists
                    if (!this.settings.providerSettings) {
                        this.settings.providerSettings = {};
                    }
                    
                    const providerSettings = this.settings.providerSettings?.[currentProvider];
                    const provider = EmbeddingProviderRegistry.getProvider(currentProvider);
                    
                    if (value && provider?.requiresApiKey && (!providerSettings?.apiKey || providerSettings.apiKey.trim() === "")) {
                        // Show user feedback
                        new Notice(`API Key is required to enable embeddings. Please set your ${currentProvider} API key below.`, 4000);
                        
                        // Reset toggle to false
                        toggle.setValue(false);
                        
                        return; // Don't proceed with enabling
                    }
                    
                    this.settings.embeddingsEnabled = value;
                    await this.saveSettings();
                    
                    // Only update the EmbeddingService if we have a valid API key or are disabling
                    if (this.embeddingService) {
                        try {
                            await this.embeddingService.updateSettings(this.settings);
                        } catch (error) {
                            console.error('Error updating embedding service:', error);
                        }
                    }
                    
                    // Update plugin configuration
                    const plugin = (window as any).app.plugins.plugins['claudesidian-mcp'];
                    if (plugin && typeof plugin.reloadConfiguration === 'function') {
                        plugin.reloadConfiguration();
                    }
                    
                    // Refresh the display to update the info notice
                    containerEl.empty();
                    await this.display(containerEl);
                })
            );

        // Note about embedding creation (moved from MemorySettingsTab)
        const infoEl = containerEl.createEl('div', { cls: 'memory-info-notice' });
        if (this.settings.embeddingsEnabled) {
            infoEl.createEl('p', { text: 'Memory Manager is always enabled. You can control when embeddings are created in the Embedding tab under "Indexing Schedule".' });
            infoEl.createEl('p', { text: 'Set to "Only Manually" if you want to control exactly when embeddings are created.' });
        } else {
            infoEl.createEl('p', { 
                cls: 'embeddings-disabled-notice',
                text: 'Embeddings are currently disabled. Semantic search and embedding creation will not be available when using Claude desktop app.'
            });
        }
        
        containerEl.createEl('h3', { text: 'API Configuration' });
        
        // Status section
        const statusSection = containerEl.createDiv({ cls: 'api-status-section' });
        
        // Add a button to start embedding (initial indexing)
        const startEmbeddingContainer = statusSection.createDiv({ cls: 'start-embedding-container' });
        
        // Check if we already have embeddings before showing the button
        const hasEmbeddings = await this.checkHasEmbeddings();
        
        if (!hasEmbeddings) {
            startEmbeddingContainer.createEl('p', { 
                text: 'No embeddings found. You need to start generating embeddings for your vault content.',
                cls: 'notice-text'
            });
            
            const startButton = startEmbeddingContainer.createEl('button', {
                text: 'Start Initial Embedding',
                cls: 'mod-cta'
            });
            
            startButton.addEventListener('click', async () => {
                if (confirm('This will start indexing all your vault content. It may take a while and use API tokens. Continue?')) {
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
                            
                            // Redisplay to hide the button
                            containerEl.empty();
                            await this.display(containerEl);
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
            });
        } else {
            startEmbeddingContainer.createEl('p', {
                text: 'Embeddings detected. You can reindex content from the Usage tab.',
                cls: 'info-text'
            });
        }
        
        // Add dimension locking warning if this is first setup
        if (!this.embeddingsExist) {
            const infoContainer = containerEl.createDiv({ cls: 'dimension-info-container' });
            infoContainer.createEl('p', {
                text: '💡 IMPORTANT: Once you create embeddings, you cannot change dimensions without deleting all existing data. Choose your embedding model carefully.',
                cls: 'dimension-info-text'
            });
        }

        // API Provider dropdown
        const providerSetting = new Setting(containerEl)
            .setName('Embedding Provider')
            .setDesc('Select the API provider for generating embeddings');
            
        const dropdown = providerSetting.addDropdown(dropdown => {
            // Add all registered providers
            const providers = EmbeddingProviderRegistry.getProviders();
            providers.forEach(provider => {
                dropdown.addOption(provider.id, provider.name);
            });
            
            dropdown.setValue(this.settings.apiProvider)
                .onChange(async (value) => {
                    this.settings.apiProvider = value;
                    
                    // Ensure providerSettings exists
                    if (!this.settings.providerSettings) {
                        this.settings.providerSettings = {};
                    }
                    
                    // Initialize provider settings if not exists
                    if (!this.settings.providerSettings[value]) {
                        const provider = EmbeddingProviderRegistry.getProvider(value);
                        if (provider && provider.models.length > 0) {
                            this.settings.providerSettings[value] = {
                                apiKey: '',
                                model: provider.models[0].id,
                                dimensions: provider.models[0].dimensions
                            };
                        }
                    }
                    
                    await this.saveSettings();
                    // Trigger re-render to show provider-specific settings
                    containerEl.empty();
                    await this.display(containerEl);
                });
        });

        // Provider-specific settings
        const currentProvider = EmbeddingProviderRegistry.getProvider(this.settings.apiProvider);
        
        // Ensure providerSettings exists
        if (!this.settings.providerSettings) {
            this.settings.providerSettings = {};
        }
        
        const providerSettings = this.settings.providerSettings[this.settings.apiProvider] || {
            apiKey: '',
            model: currentProvider?.models[0]?.id || '',
            dimensions: currentProvider?.models[0]?.dimensions || 1536
        };
        
        if (currentProvider) {
            // API Key setting (not needed for Ollama)
            if (currentProvider.requiresApiKey) {
                new Setting(containerEl)
                    .setName(`${currentProvider.name} API Key`)
                    .setDesc(`Your ${currentProvider.name} API key for embeddings (securely stored in your vault)`)
                    .addText(text => {
                        text.inputEl.type = 'password';
                        return text
                            .setPlaceholder('Enter API key...')
                            .setValue(providerSettings.apiKey || '')
                            .onChange(async (value) => {
                                if (!this.settings.providerSettings[this.settings.apiProvider]) {
                                    this.settings.providerSettings[this.settings.apiProvider] = {
                                        apiKey: '',
                                        model: currentProvider.models[0]?.id || '',
                                        dimensions: currentProvider.models[0]?.dimensions || 1536
                                    };
                                }
                                this.settings.providerSettings[this.settings.apiProvider].apiKey = value;
                                await this.saveSettings();
                            
                            // If we just added a valid API key, auto-enable embeddings for better UX
                            if (value && value.trim() !== "" && !this.settings.embeddingsEnabled) {
                                this.settings.embeddingsEnabled = true;
                                await this.saveSettings();
                                
                                // Update the embedding service
                                if (this.embeddingService) {
                                    try {
                                        await this.embeddingService.updateSettings(this.settings);
                                        console.log('Embedding service updated with new API key and auto-enabled');
                                    } catch (error) {
                                        console.error('Error updating embedding service with new API key:', error);
                                    }
                                }
                                
                                // Show success notice to user
                                new Notice('API key saved successfully! Embeddings have been automatically enabled.', 3000);
                                
                                // Trigger a refresh of the parent settings to update the toggle
                                if (this.onSettingsChanged) {
                                    this.onSettingsChanged();
                                }
                            } else if (this.settings.embeddingsEnabled && this.embeddingService) {
                                // Embeddings were already enabled, just update the service
                                try {
                                    await this.embeddingService.updateSettings(this.settings);
                                    console.log('Embedding service updated with new API key');
                                    
                                    // Show success notice to user
                                    new Notice('API key saved successfully. Embeddings are now enabled!', 3000);
                                } catch (error) {
                                    console.error('Error updating embedding service with new API key:', error);
                                }
                            } else if (!value || value.trim() === "") {
                                // API key was removed, disable embeddings
                                if (this.settings.embeddingsEnabled) {
                                    this.settings.embeddingsEnabled = false;
                                    await this.saveSettings();
                                    new Notice('API key removed. Embeddings have been disabled.', 3000);
                                    
                                    // Trigger a refresh of the parent settings to update the toggle
                                    if (this.onSettingsChanged) {
                                        this.onSettingsChanged();
                                    }
                                }
                            }
                        });
                });
            } else if (this.settings.apiProvider === 'ollama') {
                // Ollama-specific settings and setup instructions
                containerEl.createEl('h4', { text: 'Ollama Setup Instructions' });
                
                const setupInstructions = containerEl.createDiv({ cls: 'ollama-setup-instructions' });
                setupInstructions.innerHTML = `
                    <div class="ollama-step">
                        <h5>Step 1: Install Ollama</h5>
                        <p><strong>Windows:</strong></p>
                        <ul>
                            <li>Visit <a href="https://ollama.com/download/windows" target="_blank">ollama.com/download/windows</a></li>
                            <li>Download and run <code>OllamaSetup.exe</code></li>
                            <li>Follow the installer (no admin rights required)</li>
                        </ul>
                        <p><strong>Mac/Linux:</strong> Follow instructions at <a href="https://ollama.com" target="_blank">ollama.com</a></p>
                    </div>
                    
                    <div class="ollama-step">
                        <h5>Step 2: Start Ollama Service</h5>
                        <p>Open Command Prompt/Terminal and run:</p>
                        <code>ollama serve</code>
                        <p><strong>Keep this window open</strong> - Ollama needs to run in the background</p>
                        <p><em>Note: If you get a "port already in use" error, Ollama may already be running as a service.</em></p>
                    </div>
                    
                    <div class="ollama-step">
                        <h5>Step 3: Download Embedding Model</h5>
                        <p>In a <strong>new</strong> terminal window, run:</p>
                        <ul>
                            <li><code>ollama pull nomic-embed-text</code> (Recommended - 274MB, 768 dims)</li>
                            <li><code>ollama pull mxbai-embed-large</code> (Large model - 669MB, 1024 dims)</li>
                            <li><code>ollama pull all-minilm</code> (Lightweight - 46MB, 384 dims)</li>
                        </ul>
                        <p>Wait for the download to complete (may take a few minutes)</p>
                    </div>
                    
                    <div class="ollama-step">
                        <h5>Step 4: Verify Setup</h5>
                        <p>Check installed models:</p>
                        <code>ollama list</code>
                        <p>You should see your embedding model listed. Then use the "Test Connection" button below.</p>
                    </div>
                    
                    <div class="ollama-step">
                        <h5>Troubleshooting</h5>
                        <ul>
                            <li><strong>Port 11434 already in use:</strong> Ollama may already be running. Check Task Manager (Windows) or Activity Monitor (Mac)</li>
                            <li><strong>Command not found:</strong> Restart your terminal or log out/in again</li>
                            <li><strong>Connection failed:</strong> Make sure <code>ollama serve</code> is running and showing "Listening on 127.0.0.1:11434"</li>
                        </ul>
                    </div>
                `;
                
                // Ollama URL setting
                new Setting(containerEl)
                    .setName('Ollama Server URL')
                    .setDesc('URL where your Ollama server is running (default: http://127.0.0.1:11434/)')
                    .addText(text => {
                        return text
                            .setPlaceholder('http://127.0.0.1:11434/')
                            .setValue(providerSettings.customSettings?.url || 'http://127.0.0.1:11434/')
                            .onChange(async (value) => {
                                if (!this.settings.providerSettings[this.settings.apiProvider]) {
                                    this.settings.providerSettings[this.settings.apiProvider] = {
                                        apiKey: '',
                                        model: currentProvider.models[0]?.id || '',
                                        dimensions: currentProvider.models[0]?.dimensions || 768,
                                        customSettings: {}
                                    };
                                }
                                if (!this.settings.providerSettings[this.settings.apiProvider].customSettings) {
                                    this.settings.providerSettings[this.settings.apiProvider].customSettings = {};
                                }
                                this.settings.providerSettings[this.settings.apiProvider].customSettings!.url = value || 'http://127.0.0.1:11434/';
                                await this.saveSettings();
                            });
                    });
                
                // Test connection button
                new Setting(containerEl)
                    .setName('Test Ollama Connection')
                    .setDesc('Verify that Ollama is running and accessible')
                    .addButton(button => {
                        button.setButtonText('Test Connection')
                            .onClick(async () => {
                                const ollamaUrl = providerSettings.customSettings?.url || 'http://127.0.0.1:11434/';
                                try {
                                    button.setButtonText('Testing...');
                                    button.setDisabled(true);
                                    
                                    const response = await fetch(`${ollamaUrl}api/tags`);
                                    if (response.ok) {
                                        const data = await response.json();
                                        const models = data.models || [];
                                        const embeddingModels = models.filter((m: any) => 
                                            m.name.includes('embed') || 
                                            m.name.includes('nomic') || 
                                            m.name.includes('mxbai') ||
                                            m.name.includes('all-minilm')
                                        );
                                        
                                        if (embeddingModels.length > 0) {
                                            new Notice(`✅ Ollama connected! Found ${embeddingModels.length} embedding model(s): ${embeddingModels.map((m: any) => m.name).join(', ')}`, 4000);
                                        } else {
                                            new Notice('⚠️ Ollama connected but no embedding models found. Please run: ollama pull nomic-embed-text', 5000);
                                        }
                                    } else {
                                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                                    }
                                } catch (error) {
                                    console.error('Ollama connection test failed:', error);
                                    new Notice(`❌ Failed to connect to Ollama: ${(error as Error).message || String(error)}. Make sure Ollama is running.`, 5000);
                                } finally {
                                    button.setButtonText('Test Connection');
                                    button.setDisabled(false);
                                }
                            });
                    });
            }
            
            // Organization ID for providers that support it (skip for OpenAI as we removed it)
            if (this.settings.apiProvider !== 'openai' && providerSettings.organization !== undefined) {
                new Setting(containerEl)
                    .setName('Organization ID (Optional)')
                    .setDesc(`Your ${currentProvider.name} organization ID if applicable`)
                    .addText(text => {
                        text.inputEl.type = 'password';
                        return text
                            .setPlaceholder('Enter organization ID...')
                            .setValue(providerSettings.organization || '')
                            .onChange(async (value) => {
                                if (this.settings.providerSettings[this.settings.apiProvider]) {
                                    this.settings.providerSettings[this.settings.apiProvider].organization = value || undefined;
                                    await this.saveSettings();
                                }
                            });
                    });
            }
        }
        
        // Model settings
        containerEl.createEl('h3', { text: 'Model Configuration' });
        
        if (currentProvider && providerSettings) {
            new Setting(containerEl)
                .setName('Embedding Model')
                .setDesc('Select the embedding model to use')
                .addDropdown(dropdown => {
                    // Add all available models for the current provider
                    currentProvider.models.forEach(model => {
                        const desc = `${model.name} (${model.dimensions} dims)`;
                        dropdown.addOption(model.id, desc);
                    });
                    
                    dropdown.setValue(providerSettings.model || currentProvider.models[0]?.id || '')
                        .onChange(async (value) => {
                            if (this.settings.providerSettings[this.settings.apiProvider]) {
                                this.settings.providerSettings[this.settings.apiProvider].model = value;
                                
                                // Update dimensions based on selected model
                                const selectedModel = currentProvider.models.find(m => m.id === value);
                                if (selectedModel) {
                                    this.settings.providerSettings[this.settings.apiProvider].dimensions = selectedModel.dimensions;
                                }
                                
                                await this.saveSettings();
                                
                                if (this.onSettingsChanged) {
                                    this.onSettingsChanged();
                                }
                            }
                        });
                });
            
            // Check for dimension mismatch and handle embedding reset if needed
            const selectedModel = currentProvider.models.find(m => m.id === providerSettings.model);
            const maxDimensions = selectedModel?.dimensions || 1536;
            
            // Add a warning if embeddings exist with different dimensions
            if (this.embeddingsExist && providerSettings.dimensions !== maxDimensions) {
                const warningContainer = containerEl.createDiv({ cls: 'dimension-warning-container' });
                
                const warningText = warningContainer.createEl('p', {
                    text: `⚠️ WARNING: Existing embeddings use ${providerSettings.dimensions} dimensions. ` +
                          `The selected model uses ${maxDimensions} dimensions. ` +
                          `You must delete ALL embeddings (files, workspaces, sessions, snapshots, and memory traces) to switch dimensions.`,
                    cls: 'dimension-warning-text'
                });
                
                const resetButton = warningContainer.createEl('button', {
                    text: 'Delete All Embeddings',
                    cls: 'mod-warning'
                });
                
                resetButton.addEventListener('click', async () => {
                    const confirmed = confirm(
                        'WARNING: This will delete ALL existing embeddings including:\n' +
                        '• File embeddings\n' +
                        '• Workspace data\n' +
                        '• Session memory\n' +
                        '• Snapshots\n' +
                        '• Memory traces\n\n' +
                        'You will need to regenerate ALL data after changing dimensions. ' +
                        'This operation cannot be undone. Continue?'
                    );
                    
                    if (confirmed) {
                        try {
                            new Notice('Deleting all embeddings...', 3000);
                            
                            const plugin = this.app.plugins.plugins['claudesidian-mcp'];
                            if (!plugin) {
                                throw new Error('Claudesidian plugin not found');
                            }
                            
                            const vectorStore = plugin.vectorStore;
                            if (!vectorStore) {
                                throw new Error('Vector store not found');
                            }
                            
                            const embeddingCollections = [
                                'file_embeddings', 
                                'memory_traces', 
                                'sessions',
                                'snapshots',
                                'workspaces'
                            ];
                            
                            for (const collectionName of embeddingCollections) {
                                if (await vectorStore.hasCollection(collectionName)) {
                                    await vectorStore.deleteCollection(collectionName);
                                }
                            }
                            
                            this.embeddingsExist = false;
                            new Notice('All embeddings deleted. You can now use the new model.', 4000);
                            
                            // Update dimensions to match the new model
                            if (this.settings.providerSettings[this.settings.apiProvider]) {
                                this.settings.providerSettings[this.settings.apiProvider].dimensions = maxDimensions;
                                await this.saveSettings();
                            }
                            
                            containerEl.empty();
                            await this.display(containerEl);
                        } catch (error) {
                            console.error('Error deleting embeddings:', error);
                            new Notice('Error deleting embeddings: ' + error, 5000);
                        }
                    }
                });
            }
        }
            
        // API Rate limit
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
     * Check if any embeddings exist in the system
     * Uses both the embeddingService and direct check of collections
     */
    private async checkHasEmbeddings(): Promise<boolean> {
        // First try using embeddingService if available
        if (this.embeddingService) {
            try {
                return await this.embeddingService.hasExistingEmbeddings();
            } catch (error) {
                console.error('Error checking for embeddings via service:', error);
            }
        }
        
        // If the service didn't work or isn't available, try a direct check
        try {
            const plugin = this.app.plugins.plugins['claudesidian-mcp'];
            if (plugin && plugin.vectorStore) {
                const collections = await plugin.vectorStore.listCollections();
                
                if (!collections || collections.length === 0) {
                    return false;
                }
                
                // Check for specific collections that would contain embeddings
                const embeddingCollections = [
                    'file_embeddings', 
                    'memory_traces', 
                    'sessions',
                    'snapshots',
                    'workspaces'
                ];
                
                const collectionExists = embeddingCollections.some(name => 
                    collections.includes(name)
                );
                
                if (!collectionExists) {
                    return false;
                }
                
                // Check if any matching collections have items
                for (const collectionName of embeddingCollections) {
                    if (collections.includes(collectionName)) {
                        try {
                            const count = await plugin.vectorStore.count(collectionName);
                            if (count > 0) {
                                return true;
                            }
                        } catch (countError) {
                            console.warn(`Error getting count for ${collectionName}:`, countError);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error checking for embeddings directly:', error);
        }
        
        return false;
    }
    
    // Optional callback for when settings change
    onSettingsChanged?: () => void;
}