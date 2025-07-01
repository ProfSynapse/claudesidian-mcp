import { Accordion } from '../Accordion';
import { Settings } from '../../settings';
import { CustomPromptStorageService } from '../../database/services/CustomPromptStorageService';
import { CustomPrompt, LLMProviderSettings, DEFAULT_LLM_PROVIDER_SETTINGS } from '../../types';
import { Setting, Modal, App, ButtonComponent, ToggleComponent } from 'obsidian';
import { LLMProviderTab } from '../LLMProviderTab';

/**
 * Agent Management accordion component
 * Controls custom prompt agents and LLM providers with tab interface
 */
export class AgentManagementAccordion extends Accordion {
    private settings: Settings;
    private customPromptStorage: CustomPromptStorageService;
    private app: App;
    
    // Tab system
    private tabContainer!: HTMLElement;
    private contentContainer!: HTMLElement;
    private tabs: Record<string, HTMLElement> = {};
    private contents: Record<string, HTMLElement> = {};
    private activeTabKey: string = 'agents'; // Default to agents tab
    
    // Agent tab content
    private promptCardsContainer!: HTMLElement;
    
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
        
        // Ensure LLM provider settings exist
        if (!this.settings.settings.llmProviders) {
            this.settings.settings.llmProviders = DEFAULT_LLM_PROVIDER_SETTINGS;
        }
        
        this.createTabStructure();
        this.createAgentsTab();
        this.createLLMProvidersTab();
        this.switchToTab(this.activeTabKey);
    }

    /**
     * Create the tab structure
     */
    private createTabStructure(): void {
        // Tab navigation
        this.tabContainer = this.contentEl.createDiv('agent-management-tabs');
        
        // Create tab buttons
        this.createTabButton('agents', '🤖 Custom Agents');
        this.createTabButton('llm-providers', '🔑 LLM Providers');
        
        // Content container
        this.contentContainer = this.contentEl.createDiv('agent-management-content');
    }

    /**
     * Create a tab button
     */
    private createTabButton(tabKey: string, label: string): void {
        const tabEl = this.tabContainer.createEl('button', {
            cls: 'agent-management-tab',
            text: label
        });
        
        tabEl.addEventListener('click', () => this.switchToTab(tabKey));
        this.tabs[tabKey] = tabEl;
    }

    /**
     * Switch to a specific tab
     */
    private switchToTab(tabKey: string): void {
        this.activeTabKey = tabKey;
        
        // Update tab buttons
        Object.entries(this.tabs).forEach(([key, tabEl]) => {
            tabEl.toggleClass('active', key === tabKey);
        });
        
        // Update content visibility
        Object.entries(this.contents).forEach(([key, contentEl]) => {
            contentEl.style.display = key === tabKey ? 'block' : 'none';
        });
    }

    /**
     * Create the Custom Agents tab content
     */
    private createAgentsTab(): void {
        const contentEl = this.contentContainer.createDiv('agents-tab-content');
        this.contents['agents'] = contentEl;
        
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
        const contentEl = this.contentContainer.createDiv('llm-providers-tab-content');
        this.contents['llm-providers'] = contentEl;
        
        this.llmProviderTab = new LLMProviderTab({
            containerEl: contentEl,
            settings: this.settings.settings.llmProviders!,
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
        
        const prompts = this.customPromptStorage.getAllPrompts();
        
        if (prompts.length === 0) {
            this.promptCardsContainer.createDiv('agent-management-empty')
                .setText('No custom agents created yet. Click "Add Agent" to create your first one.');
            return;
        }
        
        prompts.forEach(prompt => this.createPromptCard(prompt));
    }
    
    /**
     * Create a card for a single prompt
     * @param prompt Custom prompt to display
     */
    private createPromptCard(prompt: CustomPrompt): void {
        const cardEl = this.promptCardsContainer.createDiv('agent-management-card');
        
        // Header with name and toggle
        const headerEl = cardEl.createDiv('agent-management-card-header');
        const titleEl = headerEl.createDiv('agent-management-card-title');
        titleEl.setText(prompt.name);
        
        const actionsEl = headerEl.createDiv('agent-management-card-actions');
        
        // Toggle switch using Obsidian's ToggleComponent
        const toggleContainer = actionsEl.createDiv('agent-management-toggle');
        new ToggleComponent(toggleContainer)
            .setValue(prompt.isEnabled)
            .onChange(async (value) => {
                await this.customPromptStorage.togglePrompt(prompt.id);
            });
        
        // Edit button
        const editBtn = actionsEl.createEl('button', { 
            cls: 'clickable-icon agent-management-edit-btn',
            attr: { 'aria-label': 'Edit agent' }
        });
        editBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-edit"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
        editBtn.addEventListener('click', () => this.openPromptModal(prompt));
        
        // Delete button
        const deleteBtn = actionsEl.createEl('button', { 
            cls: 'clickable-icon agent-management-delete-btn',
            attr: { 'aria-label': 'Delete agent' }
        });
        deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash"><polyline points="3,6 5,6 21,6"></polyline><path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path></svg>`;
        deleteBtn.addEventListener('click', () => this.deletePrompt(prompt));
        
        // Description
        const descEl = cardEl.createDiv('agent-management-card-description');
        descEl.setText(prompt.description);
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