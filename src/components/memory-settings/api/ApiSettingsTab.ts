/**
 * ApiSettingsTab - Refactored following SOLID principles
 * Main orchestrator for API settings management
 */

import { Notice } from 'obsidian';
import { BaseSettingsTab } from '../BaseSettingsTab';
import { EmbeddingManager } from '../../../database/services/embeddingManager';
import { EmbeddingService } from '../../../database/services/EmbeddingService';

// Import specialized services
import { EmbeddingToggleRenderer } from './ui/EmbeddingToggleRenderer';
import { StatusSectionRenderer } from './ui/StatusSectionRenderer';
import { ProviderConfigRenderer } from './ui/ProviderConfigRenderer';
import { ModelConfigRenderer } from './ui/ModelConfigRenderer';
import { RateLimitRenderer } from './ui/RateLimitRenderer';
import { EmbeddingChecker } from './services/EmbeddingChecker';
import { SettingsValidator } from './services/SettingsValidator';
import { ApiConnectionTester } from './services/ApiConnectionTester';

/**
 * Refactored ApiSettingsTab following SOLID principles
 * Orchestrates specialized UI renderers and services
 */
export class ApiSettingsTab extends BaseSettingsTab {
    // Service managers
    protected embeddingManager: EmbeddingManager | null;
    protected embeddingService: EmbeddingService | null;
    
    // Track whether embeddings exist
    protected embeddingsExist = false;
    
    // Composed services following Dependency Injection principle
    private embeddingChecker: EmbeddingChecker;
    private settingsValidator: SettingsValidator;
    private apiConnectionTester: ApiConnectionTester;
    
    // UI renderers
    private embeddingToggleRenderer: EmbeddingToggleRenderer;
    private statusSectionRenderer: StatusSectionRenderer;
    private providerConfigRenderer: ProviderConfigRenderer;
    private modelConfigRenderer: ModelConfigRenderer;
    private rateLimitRenderer: RateLimitRenderer;

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
        
        // Initialize specialized services
        this.embeddingChecker = new EmbeddingChecker(app, embeddingService || null);
        this.settingsValidator = new SettingsValidator();
        this.apiConnectionTester = new ApiConnectionTester();
        
        // Initialize UI renderers
        this.embeddingToggleRenderer = new EmbeddingToggleRenderer(settings, this.settingsValidator);
        this.statusSectionRenderer = new StatusSectionRenderer(app, embeddingService || null, this.embeddingChecker);
        this.providerConfigRenderer = new ProviderConfigRenderer(settings, this.settingsValidator, this.apiConnectionTester);
        this.modelConfigRenderer = new ModelConfigRenderer(settings, this.settingsValidator, this.embeddingChecker);
        this.rateLimitRenderer = new RateLimitRenderer(settings);
    }

    /**
     * Display the API settings tab
     */
    async display(containerEl: HTMLElement): Promise<void> {
        // Initialize settings structure
        this.settingsValidator.ensureProviderSettings(this.settings);
        
        // Check embedding status
        this.embeddingsExist = await this.embeddingChecker.checkEmbeddingsExist();

        // 1. Render embedding toggle
        await this.embeddingToggleRenderer.render(containerEl, {
            embeddingService: this.embeddingService,
            onSettingsChanged: this.onSettingsChanged?.bind(this),
            onSaveSettings: this.saveSettings.bind(this)
        });

        // 2. Render status section
        await this.statusSectionRenderer.render(containerEl, {
            embeddingsExist: this.embeddingsExist,
            onSaveSettings: this.saveSettings.bind(this)
        });

        // 3. Render API configuration header
        containerEl.createEl('h3', { text: 'API Configuration' });

        // 4. Render provider configuration
        await this.providerConfigRenderer.render(containerEl, {
            embeddingsExist: this.embeddingsExist,
            embeddingService: this.embeddingService,
            onSettingsChanged: this.onSettingsChanged?.bind(this),
            onSaveSettings: this.saveSettings.bind(this),
            onRefreshDisplay: () => this.refreshDisplay(containerEl)
        });

        // 5. Render model configuration
        containerEl.createEl('h3', { text: 'Model Configuration' });
        await this.modelConfigRenderer.render(containerEl, {
            embeddingsExist: this.embeddingsExist,
            app: this.app,
            onSettingsChanged: this.onSettingsChanged?.bind(this),
            onSaveSettings: this.saveSettings.bind(this),
            onRefreshDisplay: () => this.refreshDisplay(containerEl)
        });

        // 6. Render rate limit settings
        await this.rateLimitRenderer.render(containerEl, {
            onSaveSettings: this.saveSettings.bind(this)
        });
    }

    /**
     * Refresh the display
     */
    private async refreshDisplay(containerEl: HTMLElement): Promise<void> {
        containerEl.empty();
        await this.display(containerEl);
    }

    /**
     * Get embedding existence status
     */
    getEmbeddingsExist(): boolean {
        return this.embeddingsExist;
    }

    /**
     * Update embedding existence status
     */
    setEmbeddingsExist(value: boolean): void {
        this.embeddingsExist = value;
    }

    // Optional callback for when settings change
    onSettingsChanged?: () => void;
}