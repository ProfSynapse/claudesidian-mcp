/**
 * ModelAgentManager - Handles model and agent selection, loading, and state management
 */

import { ModelOption } from '../components/ModelSelector';
import { AgentOption } from '../components/AgentSelector';
import { ProviderUtils } from '../utils/ProviderUtils';
import { WorkspaceContext } from '../../../database/types/workspace/WorkspaceTypes';
import { TFile } from 'obsidian';

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
  private contextNotes: string[] = [];

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
    try {
      // Try to load from conversation metadata first
      if (this.conversationService) {
        const conversation = await this.conversationService.getConversation(conversationId);

        if (conversation?.metadata?.chatSettings) {
          const settings = conversation.metadata.chatSettings;
          const availableModels = await this.getAvailableModels();
          const availableAgents = await this.getAvailableAgents();

          // Restore model
          if (settings.providerId && settings.modelId) {
            const model = availableModels.find(
              m => m.providerId === settings.providerId && m.modelId === settings.modelId
            );

            if (model) {
              this.selectedModel = model;
              this.events.onModelChanged(model);
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
            }
          }

          // Restore workspace
          if (settings.workspaceId) {
            this.selectedWorkspaceId = settings.workspaceId;

            // Load workspace context immediately
            try {
              const plugin = this.app.plugins.plugins['claudesidian-mcp'];
              const workspaceService = await plugin?.getService('workspaceService');

              if (workspaceService) {
                const workspace = await workspaceService.getWorkspace(settings.workspaceId);
                if (workspace?.context) {
                  this.workspaceContext = workspace.context;
                }
              }
            } catch (error) {
              console.error('[ModelAgentManager] Failed to load workspace context:', error);
            }
          }

          // Restore context notes
          if (settings.contextNotes && Array.isArray(settings.contextNotes)) {
            this.contextNotes = settings.contextNotes;
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
          workspaceId: this.selectedWorkspaceId,
          contextNotes: this.contextNotes
        }
      };

      await this.conversationService.updateConversationMetadata(conversationId, metadata);
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
  async getCurrentSystemPrompt(): Promise<string | null> {
    return await this.buildSystemPromptWithWorkspace();
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
  async handleAgentChange(agent: AgentOption | null): Promise<void> {
    this.selectedAgent = agent;
    this.currentSystemPrompt = agent?.systemPrompt || null;

    this.events.onAgentChanged(agent);
    this.events.onSystemPromptChanged(await this.buildSystemPromptWithWorkspace());
  }

  /**
   * Set workspace context
   */
  async setWorkspaceContext(workspaceId: string, context: WorkspaceContext): Promise<void> {
    this.selectedWorkspaceId = workspaceId;
    this.workspaceContext = context;
    this.events.onSystemPromptChanged(await this.buildSystemPromptWithWorkspace());
  }

  /**
   * Clear workspace context
   */
  async clearWorkspaceContext(): Promise<void> {
    this.selectedWorkspaceId = null;
    this.workspaceContext = null;
    this.events.onSystemPromptChanged(await this.buildSystemPromptWithWorkspace());
  }

  /**
   * Get context notes
   */
  getContextNotes(): string[] {
    return [...this.contextNotes];
  }

  /**
   * Set context notes
   */
  async setContextNotes(notes: string[]): Promise<void> {
    this.contextNotes = [...notes];
    this.events.onSystemPromptChanged(await this.buildSystemPromptWithWorkspace());
  }

  /**
   * Add context note
   */
  async addContextNote(notePath: string): Promise<void> {
    if (!this.contextNotes.includes(notePath)) {
      this.contextNotes.push(notePath);
      this.events.onSystemPromptChanged(await this.buildSystemPromptWithWorkspace());
    }
  }

  /**
   * Remove context note by index
   */
  async removeContextNote(index: number): Promise<void> {
    if (index >= 0 && index < this.contextNotes.length) {
      this.contextNotes.splice(index, 1);
      this.events.onSystemPromptChanged(await this.buildSystemPromptWithWorkspace());
    }
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

      // Allowed providers for chat view
      const allowedProviders = ['openai', 'openrouter', 'anthropic', 'google', 'ollama'];

      // Iterate through enabled providers with valid API keys
      Object.entries(providers).forEach(([providerId, config]: [string, any]) => {
        // Only include providers that are enabled and have API keys
        if (!config.enabled || !config.apiKey || !config.apiKey.trim()) {
          return;
        }

        // Filter to only allowed providers for chat view
        if (!allowedProviders.includes(providerId)) {
          return;
        }

        const providerName = this.getProviderDisplayName(providerId);

        // Special handling for Ollama - single user-configured model
        if (providerId === 'ollama') {
          const ollamaModel = config.ollamaModel;

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
  async getMessageOptions(): Promise<{
    provider?: string;
    model?: string;
    systemPrompt?: string;
  }> {
    return {
      provider: this.selectedModel?.providerId,
      model: this.selectedModel?.modelId,
      systemPrompt: await this.buildSystemPromptWithWorkspace() || undefined
    };
  }

  /**
   * Build system prompt with workspace context
   */
  private async buildSystemPromptWithWorkspace(): Promise<string | null> {
    let prompt = '';

    // 1. Context files section (if any context notes selected)
    if (this.contextNotes.length > 0) {
      prompt += '<files>\n';

      for (const notePath of this.contextNotes) {
        const xmlTag = this.normalizePathToXmlTag(notePath);
        const content = await this.readNoteContent(notePath);

        prompt += `<${xmlTag}>\n`;
        prompt += `${notePath}\n\n`;
        prompt += content || '[File content unavailable]';
        prompt += `\n</${xmlTag}>\n`;
      }

      prompt += '</files>\n\n';
    }

    // 2. Agent section (if agent selected)
    if (this.currentSystemPrompt) {
      prompt += '<agent>\n';
      prompt += this.currentSystemPrompt;
      prompt += '\n</agent>\n\n';
    }

    // 3. Workspace section (if workspace context loaded)
    if (this.workspaceContext) {
      prompt += '<workspace>\n';
      prompt += JSON.stringify(this.workspaceContext, null, 2);
      prompt += '\n</workspace>';
    }

    return prompt || null;
  }

  /**
   * Normalize file path to valid XML tag name
   * Example: "Notes/Style Guide.md" -> "Notes_Style_Guide"
   */
  private normalizePathToXmlTag(path: string): string {
    return path
      .replace(/\.md$/i, '')  // Remove .md extension
      .replace(/[^a-zA-Z0-9_]/g, '_')  // Replace non-alphanumeric with underscore
      .replace(/_{2,}/g, '_')  // Replace multiple underscores with single
      .replace(/^_|_$/g, '');  // Remove leading/trailing underscores
  }

  /**
   * Read note content from vault
   */
  private async readNoteContent(notePath: string): Promise<string> {
    try {
      const file = this.app.vault.getAbstractFileByPath(notePath);

      if (file instanceof TFile) {
        const content = await this.app.vault.read(file);
        return content;
      }

      console.warn('[ModelAgentManager] File not found:', notePath);
      return '[File not found]';
    } catch (error) {
      console.error('[ModelAgentManager] Error reading note:', notePath, error);
      return '[Error reading file]';
    }
  }


  /**
   * Get display name for provider with tool calling indicator
   */
  private getProviderDisplayName(providerId: string): string {
    return ProviderUtils.getProviderDisplayNameWithTools(providerId);
  }
}