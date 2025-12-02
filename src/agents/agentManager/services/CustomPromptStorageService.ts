import { CustomPrompt, CustomPromptsSettings, DEFAULT_CUSTOM_PROMPTS_SETTINGS } from '../../../types';
import { Settings } from '../../../settings';

/**
 * Service for managing custom prompt storage and persistence
 * Handles CRUD operations for custom prompts within plugin settings
 */
export class CustomPromptStorageService {
    private settings: Settings;

    constructor(settings: Settings) {
        this.settings = settings;
    }

    /**
     * Get all custom prompts
     * @returns Array of all custom prompts
     */
    getAllPrompts(): CustomPrompt[] {
        this.ensureCustomPromptsSettings();
        return this.settings.settings.customPrompts?.prompts || [];
    }

    /**
     * Get enabled custom prompts only
     * @returns Array of enabled custom prompts
     */
    getEnabledPrompts(): CustomPrompt[] {
        return this.getAllPrompts().filter(prompt => prompt.isEnabled);
    }

    /**
     * Get a specific prompt by name or ID (unified lookup)
     * Tries ID lookup first (more specific), then falls back to name lookup
     * @param identifier Prompt name or ID
     * @returns Custom prompt or undefined if not found
     */
    getPromptByNameOrId(identifier: string): CustomPrompt | undefined {
        const prompts = this.getAllPrompts();
        // Try ID lookup first (more specific)
        const byId = prompts.find(prompt => prompt.id === identifier);
        if (byId) {
            return byId;
        }
        // Fall back to name lookup
        return prompts.find(prompt => prompt.name === identifier);
    }

    /**
     * Find prompt by name (internal use for duplicate checking)
     */
    private findByName(name: string): CustomPrompt | undefined {
        return this.getAllPrompts().find(prompt => prompt.name === name);
    }

    /**
     * Create a new custom prompt
     * @param prompt Prompt data (without id - will be generated)
     * @returns Created prompt with generated ID
     * @throws Error if prompt name already exists
     */
    async createPrompt(promptData: Omit<CustomPrompt, 'id'>): Promise<CustomPrompt> {
        this.ensureCustomPromptsSettings();
        
        // Check for duplicate names
        if (this.findByName(promptData.name)) {
            throw new Error(`A prompt with the name "${promptData.name}" already exists`);
        }

        // Generate unique ID
        const id = this.generateId();
        
        // Create the new prompt
        const newPrompt: CustomPrompt = {
            id,
            ...promptData
        };

        // Add to prompts array
        this.settings.settings.customPrompts!.prompts.push(newPrompt);
        
        // Save settings
        await this.settings.saveSettings();
        
        return newPrompt;
    }

    /**
     * Update an existing custom prompt
     * @param id Prompt ID
     * @param updates Partial prompt data to update
     * @returns Updated prompt
     * @throws Error if prompt not found or name conflict
     */
    async updatePrompt(id: string, updates: Partial<Omit<CustomPrompt, 'id'>>): Promise<CustomPrompt> {
        this.ensureCustomPromptsSettings();
        
        const prompts = this.settings.settings.customPrompts!.prompts;
        const index = prompts.findIndex(prompt => prompt.id === id);
        
        if (index === -1) {
            throw new Error(`Prompt with ID "${id}" not found`);
        }

        // Check for name conflicts if name is being updated
        if (updates.name && updates.name !== prompts[index].name) {
            const existingPrompt = this.findByName(updates.name);
            if (existingPrompt && existingPrompt.id !== id) {
                throw new Error(`A prompt with the name "${updates.name}" already exists`);
            }
        }

        // Update the prompt
        prompts[index] = {
            ...prompts[index],
            ...updates
        };

        // Save settings
        await this.settings.saveSettings();
        
        return prompts[index];
    }

    /**
     * Delete a custom prompt
     * @param id Prompt ID
     * @returns True if deleted, false if not found
     */
    async deletePrompt(id: string): Promise<boolean> {
        this.ensureCustomPromptsSettings();
        
        const prompts = this.settings.settings.customPrompts!.prompts;
        const index = prompts.findIndex(prompt => prompt.id === id);
        
        if (index === -1) {
            return false;
        }

        // Remove the prompt
        prompts.splice(index, 1);
        
        // Save settings
        await this.settings.saveSettings();
        
        return true;
    }

    /**
     * Toggle enabled state of a prompt
     * @param id Prompt ID
     * @returns Updated prompt
     * @throws Error if prompt not found
     */
    async togglePrompt(id: string): Promise<CustomPrompt> {
        const prompt = this.getPromptByNameOrId(id);
        if (!prompt) {
            throw new Error(`Prompt "${id}" not found (searched by both name and ID)`);
        }

        return await this.updatePrompt(prompt.id, { isEnabled: !prompt.isEnabled });
    }

    /**
     * Check if custom prompts are enabled globally
     * @returns True if enabled
     */
    isEnabled(): boolean {
        this.ensureCustomPromptsSettings();
        return this.settings.settings.customPrompts?.enabled || false;
    }

    /**
     * Enable or disable custom prompts globally
     * @param enabled Whether to enable custom prompts
     */
    async setEnabled(enabled: boolean): Promise<void> {
        this.ensureCustomPromptsSettings();
        this.settings.settings.customPrompts!.enabled = enabled;
        await this.settings.saveSettings();
    }

    /**
     * Ensure custom prompts settings exist with defaults
     */
    private ensureCustomPromptsSettings(): void {
        if (!this.settings.settings.customPrompts) {
            this.settings.settings.customPrompts = { ...DEFAULT_CUSTOM_PROMPTS_SETTINGS };
        }
    }

    /**
     * Generate a unique ID for a prompt
     * @returns Unique string ID
     */
    private generateId(): string {
        return `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}