import { Accordion } from '../Accordion';
import { Settings } from '../../settings';
import { CustomPromptStorageService } from "../../agents/agentManager/services/CustomPromptStorageService";
import { CustomPrompt, LLMProviderSettings, DEFAULT_LLM_PROVIDER_SETTINGS, ChatViewSettings } from '../../types';
import { Setting, Modal, App, ButtonComponent, ToggleComponent } from 'obsidian';
import { LLMProviderTab } from '../LLMProviderTab';
import { LLMUsageTab } from '../LLMUsageTab';
import { ChatViewTab } from './ChatViewTab';
import { UnifiedTabs, UnifiedTabConfig } from '../UnifiedTabs';
import { CardManager, CardManagerConfig } from '../CardManager';

/**
 * Agent Management accordion component
 * Controls custom prompt agents and LLM providers with tab interface
 */
export class AgentManagementAccordion extends Accordion {
    private settings: Settings;
    private customPromptStorage: CustomPromptStorageService;
    private app: App;
    private plugin: any;
    private pluginLifecycleManager?: any;
    
    // Tab system
    private unifiedTabs: UnifiedTabs | null = null;
    
    // Agent tab content
    private agentCardManager: CardManager<CustomPrompt> | null = null;
    
    // LLM Provider tab
    private llmProviderTab: LLMProviderTab | null = null;
    
    // LLM Usage tab
    private llmUsageTab: LLMUsageTab | null = null;
    
    // ChatView tab
    private chatViewTab: ChatViewTab | null = null;
    
    /**
     * Create a new Agent Management accordion
     * @param containerEl Parent container element
     * @param settings Plugin settings
     * @param customPromptStorage Custom prompt storage service
     * @param app Obsidian app instance
     * @param plugin Plugin instance for service access
     * @param pluginLifecycleManager Optional lifecycle manager for ChatView activation
     */
    constructor(
        containerEl: HTMLElement,
        settings: Settings,
        customPromptStorage: CustomPromptStorageService,
        app: App,
        plugin: any,
        pluginLifecycleManager?: any
    ) {
        super(containerEl, 'Agent Management', false);

        this.settings = settings;
        this.customPromptStorage = customPromptStorage;
        this.app = app;
        this.plugin = plugin;
        this.pluginLifecycleManager = pluginLifecycleManager;

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
        
        // Ensure ChatView settings exist with defaults
        if (!this.settings.settings.chatView) {
            this.settings.settings.chatView = {
                enabled: false,
                acknowledgedExperimental: false
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
            { key: 'llm-providers', label: '🔑 LLM Providers' },
            { key: 'llm-usage', label: '📊 LLM Usage' },
            { key: 'chatview', label: '💬 AI Chat (Experimental)' }
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
        this.createLLMUsageTab();
        this.createChatViewTab();
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
        
        const cardManagerConfig: CardManagerConfig<CustomPrompt> = {
            containerEl: contentEl,
            title: 'Custom Agents',
            addButtonText: 'Add Agent',
            emptyStateText: 'No custom agents created yet. Click "Add Agent" to create your first one.',
            items: this.customPromptStorage.getAllPrompts(),
            onAdd: () => this.openPromptModal(),
            onToggle: async (prompt: CustomPrompt, enabled: boolean) => {
                await this.customPromptStorage.togglePrompt(prompt.id);
            },
            onEdit: (prompt: CustomPrompt) => this.openPromptModal(prompt),
            onDelete: (prompt: CustomPrompt) => this.deletePrompt(prompt),
            showToggle: true
        };
        
        this.agentCardManager = new CardManager(cardManagerConfig);
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

                // Refresh LLMService to reinitialize adapters with new settings
                const llmService = await this.plugin.getService('llmService');
                if (llmService) {
                    llmService.updateSettings(llmProviderSettings);
                }
            }
        });
    }
    
    /**
     * Create the LLM Usage tab content
     */
    private createLLMUsageTab(): void {
        const contentEl = this.unifiedTabs?.getTabContent('llm-usage');
        if (!contentEl) return;
        
        this.llmUsageTab = new LLMUsageTab({
            containerEl: contentEl,
            app: this.app
        });
    }
    
    /**
     * Create the ChatView tab content
     */
    private createChatViewTab(): void {
        const contentEl = this.unifiedTabs?.getTabContent('chatview');
        if (!contentEl) return;
        
        this.chatViewTab = new ChatViewTab({
            containerEl: contentEl,
            settings: this.settings.settings.chatView!,
            app: this.app,
            onSettingsChange: async (chatViewSettings: ChatViewSettings) => {
                this.settings.settings.chatView = chatViewSettings;
                await this.settings.saveSettings();
            },
            onChatViewEnabled: async () => {
                // Register ChatView UI and auto-open on first enable
                if (this.pluginLifecycleManager) {
                    await this.pluginLifecycleManager.enableChatViewUI();
                }
            }
        });
    }
    
    /**
     * Refresh the agent cards display
     */
    private refreshAgentCards(): void {
        if (this.agentCardManager) {
            const prompts = this.customPromptStorage.getAllPrompts();
            this.agentCardManager.updateItems(prompts);
        }
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
            this.refreshAgentCards();
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
            this.refreshAgentCards();
        }
    }
    
    /**
     * Cleanup when accordion is unloaded
     */
    onunload(): void {
        if (this.llmUsageTab) {
            this.llmUsageTab.destroy();
            this.llmUsageTab = null;
        }
        if (this.chatViewTab) {
            this.chatViewTab.destroy();
            this.chatViewTab = null;
        }
        super.onunload();
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
        const buttonContainer = contentEl.createDiv('modal-button-container agent-management-button-container');
        
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