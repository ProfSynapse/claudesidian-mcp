/**
 * ModelAgentManager - Handles model and agent selection, loading, and state management
 */

import { ModelOption } from '../components/ModelSelector';
import { AgentOption } from '../components/AgentSelector';
import { ProviderUtils } from '../utils/ProviderUtils';
import { WorkspaceContext } from '../../../database/types/workspace/WorkspaceTypes';

export interface ModelAgentManagerEvents {
  onModelChanged: (model: ModelOption | null) => void;
  onAgentChanged: (agent: AgentOption | null) => void;
  onSystemPromptChanged: (systemPrompt: string | null) => void;
}

export class ModelAgentManager {
  private selectedModel: ModelOption | null = null;
  private selectedAgent: AgentOption | null = null;
  private currentSystemPrompt: string | null = null;
  private selectedWorkspaceId: string | null = null;
  private workspaceContext: WorkspaceContext | null = null;

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
   * Get current system prompt (includes workspace context if set)
   */
  getCurrentSystemPrompt(): string | null {
    return this.buildSystemPromptWithWorkspace();
  }

  /**
   * Get selected workspace ID
   */
  getSelectedWorkspaceId(): string | null {
    return this.selectedWorkspaceId;
  }

  /**
   * Get workspace context
   */
  getWorkspaceContext(): WorkspaceContext | null {
    return this.workspaceContext;
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
    this.events.onSystemPromptChanged(this.buildSystemPromptWithWorkspace());
  }

  /**
   * Set workspace context
   */
  setWorkspaceContext(workspaceId: string, context: WorkspaceContext): void {
    this.selectedWorkspaceId = workspaceId;
    this.workspaceContext = context;
    this.events.onSystemPromptChanged(this.buildSystemPromptWithWorkspace());
  }

  /**
   * Clear workspace context
   */
  clearWorkspaceContext(): void {
    this.selectedWorkspaceId = null;
    this.workspaceContext = null;
    this.events.onSystemPromptChanged(this.buildSystemPromptWithWorkspace());
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
   * Get message options for current selection (includes workspace context)
   */
  getMessageOptions(): {
    provider?: string;
    model?: string;
    systemPrompt?: string;
  } {
    return {
      provider: this.selectedModel?.providerId,
      model: this.selectedModel?.modelId,
      systemPrompt: this.buildSystemPromptWithWorkspace() || undefined
    };
  }

  /**
   * Build system prompt with workspace context
   */
  private buildSystemPromptWithWorkspace(): string | null {
    let prompt = '';

    // Base agent prompt (if selected)
    if (this.currentSystemPrompt) {
      prompt += this.currentSystemPrompt;
    }

    // Workspace context (if selected)
    if (this.workspaceContext) {
      if (prompt) {
        prompt += '\n\n';
      }

      prompt += '# Workspace Context\n\n';

      if (this.workspaceContext.purpose) {
        prompt += `**Purpose:** ${this.workspaceContext.purpose}\n\n`;
      }

      if (this.workspaceContext.currentGoal) {
        prompt += `**Current Goal:** ${this.workspaceContext.currentGoal}\n\n`;
      }

      if (this.workspaceContext.preferences) {
        prompt += `**Preferences:**\n${this.workspaceContext.preferences}\n\n`;
      }

      if (this.workspaceContext.workflows && this.workspaceContext.workflows.length > 0) {
        prompt += `**Available Workflows:**\n`;
        this.workspaceContext.workflows.forEach((workflow: { name: string; when: string; steps: string[] }, index: number) => {
          prompt += `${index + 1}. **${workflow.name}** - ${workflow.when}\n`;
          if (workflow.steps && workflow.steps.length > 0) {
            prompt += `   Steps:\n`;
            workflow.steps.forEach((step: string, stepIndex: number) => {
              prompt += `   ${stepIndex + 1}. ${step}\n`;
            });
          }
          prompt += '\n';
        });
      }

      if (this.workspaceContext.keyFiles && this.workspaceContext.keyFiles.length > 0) {
        prompt += `**Key Reference Files:**\n`;
        this.workspaceContext.keyFiles.forEach((file: string) => {
          prompt += `- ${file}\n`;
        });
        prompt += '\n';
      }
    }

    return prompt || null;
  }

  /**
   * Get display name for provider with tool calling indicator
   */
  private getProviderDisplayName(providerId: string): string {
    return ProviderUtils.getProviderDisplayNameWithTools(providerId);
  }
}