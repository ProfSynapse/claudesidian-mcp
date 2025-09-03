/**
 * ModelAgentManager - Handles model and agent selection, loading, and state management
 */

import { ModelOption } from '../components/ModelSelector';
import { AgentOption } from '../components/AgentSelector';
import { ProviderUtils } from '../utils/ProviderUtils';

export interface ModelAgentManagerEvents {
  onModelChanged: (model: ModelOption | null) => void;
  onAgentChanged: (agent: AgentOption | null) => void;
  onSystemPromptChanged: (systemPrompt: string | null) => void;
}

export class ModelAgentManager {
  private selectedModel: ModelOption | null = null;
  private selectedAgent: AgentOption | null = null;
  private currentSystemPrompt: string | null = null;

  constructor(
    private app: any, // Obsidian App
    private events: ModelAgentManagerEvents
  ) {}

  /**
   * Get current selected model
   */
  getSelectedModel(): ModelOption | null {
    return this.selectedModel;
  }

  /**
   * Get current selected agent
   */
  getSelectedAgent(): AgentOption | null {
    return this.selectedAgent;
  }

  /**
   * Get current system prompt
   */
  getCurrentSystemPrompt(): string | null {
    return this.currentSystemPrompt;
  }

  /**
   * Handle model selection change
   */
  handleModelChange(model: ModelOption | null): void {
    this.selectedModel = model;
    this.events.onModelChanged(model);
  }

  /**
   * Handle agent selection change
   */
  handleAgentChange(agent: AgentOption | null): void {
    this.selectedAgent = agent;
    this.currentSystemPrompt = agent?.systemPrompt || null;
    
    this.events.onAgentChanged(agent);
    this.events.onSystemPromptChanged(this.currentSystemPrompt);
  }

  /**
   * Get the configured default model from plugin settings
   */
  async getDefaultModel(): Promise<{ provider: string; model: string }> {
    try {
      const plugin = this.app.plugins.plugins['claudesidian-mcp'];
      if (!plugin) {
        throw new Error('Plugin not found');
      }

      const pluginData = await plugin.loadData();
      const defaultModel = pluginData?.llmProviders?.defaultModel;
      
      if (!defaultModel?.provider || !defaultModel?.model) {
        throw new Error('No default model configured in settings');
      }

      return defaultModel;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get available models from validated providers
   */
  async getAvailableModels(): Promise<ModelOption[]> {
    try {
      // Get plugin instance to access settings data
      const plugin = this.app.plugins.plugins['claudesidian-mcp'];
      if (!plugin) {
        return [];
      }

      // Load plugin data directly
      const pluginData = await plugin.loadData();
      if (!pluginData?.llmProviders?.providers) {
        return [];
      }

      const models: ModelOption[] = [];
      const providers = pluginData.llmProviders.providers;
      
      // Import ModelRegistry to get actual model specs
      const { ModelRegistry } = await import('../../../services/llm/adapters/ModelRegistry');
      
      // Iterate through enabled providers with valid API keys
      Object.entries(providers).forEach(([providerId, config]: [string, any]) => {
        // Only include providers that are enabled and have API keys
        if (!config.enabled || !config.apiKey || !config.apiKey.trim()) {
          return;
        }
        
        const providerName = this.getProviderDisplayName(providerId);
        
        // Get all available models for this provider from ModelRegistry
        const providerModels = ModelRegistry.getProviderModels(providerId);
        
        providerModels.forEach(modelSpec => {
          models.push({
            providerId,
            providerName,
            modelId: modelSpec.apiName,
            modelName: modelSpec.name,
            contextWindow: modelSpec.contextWindow
          });
        });
      });

      return models;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get available agents from agent manager
   */
  async getAvailableAgents(): Promise<AgentOption[]> {
    try {
      // Get plugin instance to access settings data
      const plugin = this.app.plugins.plugins['claudesidian-mcp'];
      if (!plugin) {
        return [];
      }

      // Load plugin data directly
      const pluginData = await plugin.loadData();
      const agentOptions: AgentOption[] = [];

      // Get custom prompts from plugin data - they are stored as an array, not object
      const customPrompts = pluginData?.customPrompts?.prompts || [];
      
      // Add custom prompt-based agents
      customPrompts.forEach((prompt: any) => {
        if (prompt.prompt && prompt.prompt.trim() && prompt.isEnabled !== false) {
          agentOptions.push({
            id: prompt.id,
            name: prompt.name || 'Unnamed Agent',
            description: prompt.description || 'Custom agent prompt',
            systemPrompt: prompt.prompt
          });
        }
      });

      return agentOptions;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get message options for current selection
   */
  getMessageOptions(): {
    provider?: string;
    model?: string;
    systemPrompt?: string;
  } {
    return {
      provider: this.selectedModel?.providerId,
      model: this.selectedModel?.modelId,
      systemPrompt: this.currentSystemPrompt || undefined
    };
  }

  /**
   * Get display name for provider with tool calling indicator
   */
  private getProviderDisplayName(providerId: string): string {
    return ProviderUtils.getProviderDisplayNameWithTools(providerId);
  }
}