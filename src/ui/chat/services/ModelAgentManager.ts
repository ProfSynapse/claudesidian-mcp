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
    private events: ModelAgentManagerEvents,
    private conversationService?: any // Optional ConversationService for persistence
  ) {
    // Don't auto-initialize - will be called from ChatView after conversation loads
  }

  /**
   * Initialize from conversation metadata (if available), otherwise use plugin default
   */
  async initializeFromConversation(conversationId: string): Promise<void> {
    console.log('[ModelAgentManager] initializeFromConversation called:', conversationId);

    try {
      // Try to load from conversation metadata first
      if (this.conversationService) {
        const conversation = await this.conversationService.getConversation(conversationId);

        console.log('[ModelAgentManager] Loaded conversation:', {
          conversationId,
          hasMetadata: !!conversation?.metadata,
          hasChatSettings: !!conversation?.metadata?.chatSettings,
          chatSettings: conversation?.metadata?.chatSettings
        });

        if (conversation?.metadata?.chatSettings) {
          const settings = conversation.metadata.chatSettings;
          const availableModels = await this.getAvailableModels();
          const availableAgents = await this.getAvailableAgents();

          // Restore model
          if (settings.providerId && settings.modelId) {
            console.log('[ModelAgentManager] Looking for saved model:', {
              providerId: settings.providerId,
              modelId: settings.modelId,
              availableModelsCount: availableModels.length,
              availableModelIds: availableModels.map(m => `${m.providerId}:${m.modelId}`)
            });

            const model = availableModels.find(
              m => m.providerId === settings.providerId && m.modelId === settings.modelId
            );

            if (model) {
              this.selectedModel = model;
              this.events.onModelChanged(model);
              console.log('[ModelAgentManager] ✅ Restored model from conversation metadata:', model.modelName);
            } else {
              console.error('[ModelAgentManager] ❌ Saved model not found, falling back to default. Searched for:', {
                providerId: settings.providerId,
                modelId: settings.modelId
              });
              await this.initializeDefaultModel();
            }
          }

          // Restore agent
          if (settings.agentId) {
            const agent = availableAgents.find(a => a.id === settings.agentId);
            if (agent) {
              this.selectedAgent = agent;
              this.currentSystemPrompt = agent.systemPrompt || null;
              this.events.onAgentChanged(agent);
              console.log('[ModelAgentManager] Restored agent from conversation metadata:', agent.name);
            }
          }

          // Restore workspace
          if (settings.workspaceId) {
            this.selectedWorkspaceId = settings.workspaceId;
            // Note: Workspace context will be loaded by ChatView when needed
          }

          return; // Successfully loaded from metadata
        }
      }

      // Fall back to plugin default if no metadata
      await this.initializeDefaultModel();
    } catch (error) {
      console.error('[ModelAgentManager] Failed to initialize from conversation:', error);
      await this.initializeDefaultModel();
    }
  }

  /**
   * Initialize the selected model from plugin settings default
   */
  private async initializeDefaultModel(): Promise<void> {
    try {
      const defaultModelConfig = await this.getDefaultModel();
      const availableModels = await this.getAvailableModels();

      // Find the default model in available models
      const defaultModel = availableModels.find(
        m => m.providerId === defaultModelConfig.provider &&
             m.modelId === defaultModelConfig.model
      );

      if (defaultModel) {
        this.selectedModel = defaultModel;
        this.events.onModelChanged(defaultModel);
        console.log('[ModelAgentManager] Initialized with plugin default model:', defaultModel.modelName);
      }
    } catch (error) {
      console.warn('[ModelAgentManager] Failed to initialize default model:', error);
    }
  }

  /**
   * Save current selections to conversation metadata
   */
  async saveToConversation(conversationId: string): Promise<void> {
    if (!this.conversationService) {
      console.warn('[ModelAgentManager] Cannot save - ConversationService not available');
      return;
    }

    try {
      const metadata = {
        chatSettings: {
          providerId: this.selectedModel?.providerId,
          modelId: this.selectedModel?.modelId,
          agentId: this.selectedAgent?.id,
          workspaceId: this.selectedWorkspaceId
        }
      };

      await this.conversationService.updateConversationMetadata(conversationId, metadata);
      console.log('[ModelAgentManager] Saved chat settings to conversation:', conversationId);
    } catch (error) {
      console.error('[ModelAgentManager] Failed to save to conversation:', error);
    }
  }

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

        // Special handling for Ollama - single user-configured model
        if (providerId === 'ollama') {
          const ollamaModel = config.ollamaModel;
          console.log('[ModelAgentManager] Ollama config check:', {
            hasOllamaModel: !!ollamaModel,
            ollamaModel,
            configEnabled: config.enabled,
            configApiKey: config.apiKey
          });

          if (!ollamaModel || !ollamaModel.trim()) {
            console.warn('[ModelAgentManager] Ollama enabled but no model configured - skipping');
            return; // Skip if no model configured
          }

          const ollamaModelOption = {
            providerId: 'ollama',
            providerName,
            modelId: ollamaModel,
            modelName: ollamaModel,
            contextWindow: 128000 // Fixed reasonable default
          };

          console.log('[ModelAgentManager] Adding Ollama model to available models:', ollamaModelOption);
          models.push(ollamaModelOption);
          return;
        }

        // Standard provider handling - get models from ModelRegistry
        const providerModels = ModelRegistry.getProviderModels(providerId, pluginData.llmProviders);

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
    console.log('[ModelAgentManager] getMessageOptions called:', {
      selectedModel: this.selectedModel,
      providerId: this.selectedModel?.providerId,
      modelId: this.selectedModel?.modelId
    });

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