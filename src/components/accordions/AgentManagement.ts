import { Accordion } from '../Accordion';
import { Settings } from '../../settings';
import { CustomPromptStorageService } from '../../database/services/CustomPromptStorageService';
import { CustomPrompt, LLMProviderSettings, DEFAULT_LLM_PROVIDER_SETTINGS } from '../../types';
import { Setting, Modal, App, ButtonComponent, ToggleComponent } from 'obsidian';
import { LLMProviderTab } from '../LLMProviderTab';
import { UnifiedTabs, UnifiedTabConfig } from '../UnifiedTabs';
import { Card, CardConfig } from '../Card';

/**
 * Agent Management accordion component
 * Controls custom prompt agents and LLM providers with tab interface
 */
export class AgentManagementAccordion extends Accordion {
    private settings: Settings;
    private customPromptStorage: CustomPromptStorageService;
    private app: App;
    
    // Tab system
    private unifiedTabs: UnifiedTabs | null = null;
    
    // Agent tab content
    private promptCardsContainer!: HTMLElement;
    private promptCards: Map<string, Card> = new Map();
    
    // LLM Provider tab
    private llmProviderTab: LLMProviderTab | null = null;
    
    /**
     * Create a new Agent Management accordion
     * @param containerEl Parent container element
     * @param settings Plugin settings
     * @param customPromptStorage Custom prompt storage service
     * @param app Obsidian app instance
     */
    constructor(
        containerEl: HTMLElement, 
        settings: Settings,
        customPromptStorage: CustomPromptStorageService,
        app: App
    ) {
        super(containerEl, 'Agent Management', false);
        
        this.settings = settings;
        this.customPromptStorage = customPromptStorage;
        this.app = app;
        
        this.initializeContent();
    }
    
    /**
     * Initialize the accordion content with tabs
     */
    private initializeContent(): void {
        this.contentEl.empty();
        
        // Ensure LLM provider settings exist, but preserve existing values
        if (!this.settings.settings.llmProviders) {
            this.settings.settings.llmProviders = DEFAULT_LLM_PROVIDER_SETTINGS;
        } else {
            // Merge with defaults to ensure all provider entries exist, but keep existing API keys
            const currentSettings = this.settings.settings.llmProviders;
            const mergedProviders = { ...DEFAULT_LLM_PROVIDER_SETTINGS.providers };
            
            // Preserve existing provider settings (especially API keys)
            Object.keys(currentSettings.providers || {}).forEach(providerId => {
                if (mergedProviders[providerId]) {
                    mergedProviders[providerId] = {
                        ...mergedProviders[providerId],
                        ...currentSettings.providers[providerId]
                    };
                }
            });
            
            this.settings.settings.llmProviders = {
                ...DEFAULT_LLM_PROVIDER_SETTINGS,
                ...currentSettings,
                providers: mergedProviders
            };
        }
        
        // Save settings after ensuring they're properly initialized
        this.settings.saveSettings();
        
        this.createTabStructure();
    }

    /**
     * Create the tab structure using the unified tabs component
     */
    private createTabStructure(): void {
        const tabConfigs: UnifiedTabConfig[] = [
            { key: 'agents', label: '🤖 Custom Agents' },
            { key: 'llm-providers', label: '🔑 LLM Providers' }
        ];
        
        this.unifiedTabs = new UnifiedTabs({
            containerEl: this.contentEl,
            tabs: tabConfigs,
            defaultTab: 'agents',
            onTabChange: (tabKey: string) => this.onTabChange(tabKey)
        });
        
        // Initialize tab content
        this.createAgentsTab();
        this.createLLMProvidersTab();
    }

    /**
     * Handle tab change events
     */
    private onTabChange(tabKey: string): void {
        // Any additional logic when tabs change can go here
        // For now, the TabContainer handles all the display logic
    }


    /**
     * Create the Custom Agents tab content
     */
    private createAgentsTab(): void {
        const contentEl = this.unifiedTabs?.getTabContent('agents');
        if (!contentEl) return;
        
        // Add Agent button
        const addButtonContainer = contentEl.createDiv('agent-management-add-button');
        new ButtonComponent(addButtonContainer)
            .setButtonText('Add Agent')
            .setCta()
            .onClick(() => this.openPromptModal());
        
        // Prompt cards container
        this.promptCardsContainer = contentEl.createDiv('agent-management-cards');
        this.refreshPromptCards();
    }

    /**
     * Create the LLM Providers tab content
     */
    private createLLMProvidersTab(): void {
        const contentEl = this.unifiedTabs?.getTabContent('llm-providers');
        if (!contentEl) return;
        
        this.llmProviderTab = new LLMProviderTab({
            containerEl: contentEl,
            settings: this.settings.settings.llmProviders!,
            app: this.app,
            onSettingsChange: async (llmProviderSettings: LLMProviderSettings) => {
                this.settings.settings.llmProviders = llmProviderSettings;
                await this.settings.saveSettings();
            }
        });
    }
    
    /**
     * Refresh the prompt cards display
     */
    private refreshPromptCards(): void {
        this.promptCardsContainer.empty();
        this.promptCards.clear();
        
        const prompts = this.customPromptStorage.getAllPrompts();
        
        if (prompts.length === 0) {
            this.promptCardsContainer.createDiv('agent-management-empty')
                .setText('No custom agents created yet. Click "Add Agent" to create your first one.');
            return;
        }
        
        prompts.forEach(prompt => this.createPromptCard(prompt));
    }
    
    /**
     * Create a card for a single prompt using the reusable Card component
     * @param prompt Custom prompt to display
     */
    private createPromptCard(prompt: CustomPrompt): void {
        const cardConfig: CardConfig = {
            title: prompt.name,
            description: prompt.description,
            isEnabled: prompt.isEnabled,
            showToggle: true, // Custom agents should have toggles
            onToggle: async (enabled: boolean) => {
                await this.customPromptStorage.togglePrompt(prompt.id);
            },
            onEdit: () => this.openPromptModal(prompt),
            onDelete: () => this.deletePrompt(prompt)
        };
        
        const card = new Card(this.promptCardsContainer, cardConfig);
        this.promptCards.set(prompt.id, card);
    }
    
    /**
     * Open the prompt modal for creating or editing
     * @param prompt Existing prompt to edit, or undefined for new prompt
     */
    private openPromptModal(prompt?: CustomPrompt): void {
        new PromptModal(this.app, prompt, async (result) => {
            if (prompt) {
                // Edit existing prompt
                await this.customPromptStorage.updatePrompt(prompt.id, result);
            } else {
                // Create new prompt - default to enabled
                await this.customPromptStorage.createPrompt({
                    ...result,
                    isEnabled: true
                });
            }
            this.refreshPromptCards();
        }).open();
    }
    
    /**
     * Delete a prompt with confirmation
     * @param prompt Prompt to delete
     */
    private async deletePrompt(prompt: CustomPrompt): Promise<void> {
        const confirmed = confirm(`Are you sure you want to delete the agent "${prompt.name}"? This action cannot be undone.`);
        if (confirmed) {
            await this.customPromptStorage.deletePrompt(prompt.id);
            this.refreshPromptCards();
        }
    }
}

/**
 * Modal for creating/editing custom prompts
 */
class PromptModal extends Modal {
    private prompt?: CustomPrompt;
    private onSave: (result: Omit<CustomPrompt, 'id' | 'isEnabled'>) => void;
    
    private nameInput!: HTMLInputElement;
    private descriptionInput!: HTMLInputElement;
    private promptTextarea!: HTMLTextAreaElement;
    
    constructor(app: App, prompt: CustomPrompt | undefined, onSave: (result: Omit<CustomPrompt, 'id' | 'isEnabled'>) => void) {
        super(app);
        this.prompt = prompt;
        this.onSave = onSave;
    }
    
    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h1', { text: this.prompt ? 'Edit Agent' : 'Create New Agent' });
        
        // Name field
        contentEl.createEl('h2', { text: 'Name' });
        this.nameInput = contentEl.createEl('input', { 
            type: 'text',
            cls: 'agent-modal-input'
        });
        this.nameInput.value = this.prompt?.name || '';
        this.nameInput.placeholder = 'e.g., Writing Assistant, Code Reviewer, Research Helper';
        
        // Description field
        contentEl.createEl('h2', { text: 'Description' });
        this.descriptionInput = contentEl.createEl('input', { 
            type: 'text',
            cls: 'agent-modal-input'
        });
        this.descriptionInput.value = this.prompt?.description || '';
        this.descriptionInput.placeholder = 'e.g., Expert at creative writing and editing';
        
        // Instructions field
        contentEl.createEl('h2', { text: 'Instructions' });
        this.promptTextarea = contentEl.createEl('textarea', {
            cls: 'agent-modal-textarea'
        });
        this.promptTextarea.value = this.prompt?.prompt || '';
        this.promptTextarea.placeholder = 'You are a professional writing assistant with expertise in creative writing, grammar, and style. Always provide constructive, actionable feedback to help improve the user\'s writing. Focus on clarity, flow, and engagement while maintaining the author\'s unique voice.';
        this.promptTextarea.rows = 6;
        
        // Buttons
        const buttonContainer = contentEl.createDiv('modal-button-container');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.marginTop = '20px';
        
        const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());
        
        const saveBtn = buttonContainer.createEl('button', { text: this.prompt ? 'Save' : 'Create', cls: 'mod-cta' });
        saveBtn.addEventListener('click', () => this.savePrompt());
        
        // Focus name input
        this.nameInput.focus();
    }
    
    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
    
    private savePrompt(): void {
        const name = this.nameInput.value.trim();
        const description = this.descriptionInput.value.trim();
        const prompt = this.promptTextarea.value.trim();
        
        // Validation
        if (!name) {
            this.nameInput.focus();
            return;
        }
        
        if (!description) {
            this.descriptionInput.focus();
            return;
        }
        
        if (!prompt) {
            this.promptTextarea.focus();
            return;
        }
        
        this.onSave({
            name,
            description,
            prompt
        });
        
        this.close();
    }
}