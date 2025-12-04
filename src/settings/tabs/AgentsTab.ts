/**
 * AgentsTab - Custom agents list and detail view
 *
 * Features:
 * - List view showing all custom agents with status badges
 * - Detail view for editing agent configuration
 * - Create/Edit/Delete agents
 * - Auto-save on all changes
 */

import { Notice } from 'obsidian';
import { SettingsRouter } from '../SettingsRouter';
import { BackButton } from '../components/BackButton';
import { CustomPrompt } from '../../types/mcp/CustomPromptTypes';
import { CustomPromptStorageService } from '../../agents/agentManager/services/CustomPromptStorageService';
import { CardManager, CardItem } from '../../components/CardManager';

export interface AgentsTabServices {
    customPromptStorage?: CustomPromptStorageService;
}

type AgentsView = 'list' | 'detail';

export class AgentsTab {
    private container: HTMLElement;
    private router: SettingsRouter;
    private services: AgentsTabServices;
    private agents: CustomPrompt[] = [];
    private currentAgent: Partial<CustomPrompt> | null = null;
    private currentView: AgentsView = 'list';
    private isNewAgent: boolean = false;

    // Auto-save debounce
    private saveTimeout?: ReturnType<typeof setTimeout>;

    // Card manager for list view
    private cardManager?: CardManager<CardItem>;

    constructor(
        container: HTMLElement,
        router: SettingsRouter,
        services: AgentsTabServices
    ) {
        this.container = container;
        this.router = router;
        this.services = services;

        this.loadAgents();
        this.render();
    }

    /**
     * Load agents from storage service
     */
    private loadAgents(): void {
        if (!this.services.customPromptStorage) return;
        this.agents = this.services.customPromptStorage.getAllPrompts();
    }

    /**
     * Main render method
     */
    render(): void {
        this.container.empty();

        const state = this.router.getState();

        // Check router state for navigation
        if (state.view === 'detail' && state.detailId) {
            this.currentView = 'detail';
            const agent = this.agents.find(a => a.id === state.detailId);
            if (agent) {
                this.currentAgent = { ...agent };
                this.isNewAgent = false;
                this.renderDetail();
                return;
            }
        }

        // Default to list view
        this.currentView = 'list';
        this.renderList();
    }

    /**
     * Render list view using CardManager
     */
    private renderList(): void {
        this.container.empty();

        // Header
        this.container.createEl('h3', { text: 'Custom Agents' });
        this.container.createEl('p', {
            text: 'Create specialized AI assistants with custom prompts',
            cls: 'setting-item-description'
        });

        // Check if service is available
        if (!this.services.customPromptStorage) {
            this.container.createEl('p', {
                text: 'Agent service is initializing...',
                cls: 'nexus-loading-message'
            });
            return;
        }

        // Convert agents to CardItem format
        const cardItems: CardItem[] = this.agents.map(agent => ({
            id: agent.id,
            name: agent.name,
            description: agent.description || 'No description',
            isEnabled: agent.isEnabled
        }));

        // Create card manager
        this.cardManager = new CardManager({
            containerEl: this.container,
            title: 'Custom Agents',
            addButtonText: '+ New Agent',
            emptyStateText: 'No custom agents yet. Create one to get started.',
            items: cardItems,
            showToggle: true,
            onAdd: () => this.createNewAgent(),
            onToggle: async (item, enabled) => {
                const agent = this.agents.find(a => a.id === item.id);
                if (agent && this.services.customPromptStorage) {
                    await this.services.customPromptStorage.updatePrompt(item.id, { isEnabled: enabled });
                    agent.isEnabled = enabled;
                }
            },
            onEdit: (item) => {
                this.router.showDetail(item.id);
            },
            onDelete: async (item) => {
                const confirmed = confirm(`Delete agent "${item.name}"? This cannot be undone.`);
                if (!confirmed) return;

                try {
                    if (this.services.customPromptStorage) {
                        await this.services.customPromptStorage.deletePrompt(item.id);
                        this.agents = this.agents.filter(a => a.id !== item.id);
                        this.cardManager?.updateItems(this.agents.map(a => ({
                            id: a.id,
                            name: a.name,
                            description: a.description || 'No description',
                            isEnabled: a.isEnabled
                        })));
                        new Notice('Agent deleted');
                    }
                } catch (error) {
                    console.error('[AgentsTab] Failed to delete agent:', error);
                    new Notice('Failed to delete agent');
                }
            }
        });
    }

    /**
     * Render detail view
     */
    private renderDetail(): void {
        this.container.empty();

        const agent = this.currentAgent;
        if (!agent) {
            this.router.back();
            return;
        }

        // Back button
        new BackButton(this.container, 'Back to Agents', () => {
            this.saveCurrentAgent();
            this.router.back();
        });

        // Form container with modern stacked layout
        const form = this.container.createDiv('nexus-modern-form');

        // Name field
        const nameField = form.createDiv('nexus-form-field');
        nameField.createEl('label', { text: 'Name', cls: 'nexus-form-label' });
        const nameInput = nameField.createEl('input', {
            type: 'text',
            placeholder: 'e.g., Code Reviewer',
            cls: 'nexus-form-input'
        });
        nameInput.value = agent.name || '';
        nameInput.addEventListener('input', (e) => {
            agent.name = (e.target as HTMLInputElement).value;
            this.debouncedSave();
        });

        // Description field
        const descField = form.createDiv('nexus-form-field');
        descField.createEl('label', { text: 'Description', cls: 'nexus-form-label' });
        const descHint = descField.createEl('span', {
            text: 'A brief description of what this agent does',
            cls: 'nexus-form-hint'
        });
        const descInput = descField.createEl('textarea', {
            placeholder: 'e.g., Reviews code for best practices and potential issues',
            cls: 'nexus-form-textarea'
        });
        descInput.rows = 2;
        descInput.value = agent.description || '';
        descInput.addEventListener('input', (e) => {
            agent.description = (e.target as HTMLTextAreaElement).value;
            this.debouncedSave();
        });

        // System Prompt field
        const promptField = form.createDiv('nexus-form-field');
        promptField.createEl('label', { text: 'System Prompt', cls: 'nexus-form-label' });
        promptField.createEl('span', {
            text: 'Instructions that define this agent\'s behavior and expertise',
            cls: 'nexus-form-hint'
        });
        const promptInput = promptField.createEl('textarea', {
            placeholder: 'You are an expert code reviewer. When reviewing code, focus on...',
            cls: 'nexus-form-textarea nexus-form-textarea-large'
        });
        promptInput.rows = 8;
        promptInput.value = agent.prompt || '';
        promptInput.addEventListener('input', (e) => {
            agent.prompt = (e.target as HTMLTextAreaElement).value;
            this.debouncedSave();
        });

        // Action buttons
        const actions = form.createDiv('nexus-form-actions');

        const saveBtn = actions.createEl('button', {
            text: 'Save',
            cls: 'mod-cta'
        });
        saveBtn.addEventListener('click', async () => {
            await this.saveCurrentAgent();
            new Notice('Agent saved');
        });

        if (!this.isNewAgent && agent.id) {
            const deleteBtn = actions.createEl('button', {
                text: 'Delete',
                cls: 'mod-warning'
            });
            deleteBtn.addEventListener('click', () => this.deleteCurrentAgent());
        }
    }

    /**
     * Create a new agent
     */
    private createNewAgent(): void {
        this.currentAgent = {
            name: '',
            description: '',
            prompt: '',
            isEnabled: true
        };
        this.isNewAgent = true;
        this.currentView = 'detail';
        this.renderDetail();
    }

    /**
     * Save the current agent
     */
    private async saveCurrentAgent(): Promise<void> {
        if (!this.currentAgent || !this.services.customPromptStorage) return;

        // Validate required fields
        if (!this.currentAgent.name?.trim()) {
            new Notice('Agent name is required');
            return;
        }

        try {
            if (this.isNewAgent) {
                // Create new agent
                const created = await this.services.customPromptStorage.createPrompt({
                    name: this.currentAgent.name,
                    description: this.currentAgent.description || '',
                    prompt: this.currentAgent.prompt || '',
                    isEnabled: this.currentAgent.isEnabled ?? true
                });
                this.agents.push(created);
                this.currentAgent = created;
                this.isNewAgent = false;
            } else if (this.currentAgent.id) {
                // Update existing agent
                await this.services.customPromptStorage.updatePrompt(
                    this.currentAgent.id,
                    {
                        name: this.currentAgent.name,
                        description: this.currentAgent.description,
                        prompt: this.currentAgent.prompt,
                        isEnabled: this.currentAgent.isEnabled
                    }
                );
                // Update local cache
                const index = this.agents.findIndex(a => a.id === this.currentAgent?.id);
                if (index >= 0) {
                    this.agents[index] = this.currentAgent as CustomPrompt;
                }
            }
        } catch (error) {
            console.error('[AgentsTab] Failed to save agent:', error);
            new Notice(`Failed to save agent: ${(error as Error).message}`);
        }
    }

    /**
     * Delete the current agent
     */
    private async deleteCurrentAgent(): Promise<void> {
        if (!this.currentAgent?.id || !this.services.customPromptStorage) return;

        const confirmed = confirm(`Delete agent "${this.currentAgent.name}"? This cannot be undone.`);
        if (!confirmed) return;

        try {
            await this.services.customPromptStorage.deletePrompt(this.currentAgent.id);
            this.agents = this.agents.filter(a => a.id !== this.currentAgent?.id);
            this.currentAgent = null;
            this.router.back();
            new Notice('Agent deleted');
        } catch (error) {
            console.error('[AgentsTab] Failed to delete agent:', error);
            new Notice('Failed to delete agent');
        }
    }

    /**
     * Debounced auto-save
     */
    private debouncedSave(): void {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        this.saveTimeout = setTimeout(() => {
            this.saveCurrentAgent();
        }, 500);
    }

    /**
     * Cleanup
     */
    destroy(): void {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
    }
}
