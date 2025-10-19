/**
 * ModelAgentManager - Handles model and agent selection, loading, and state management
 */

import { ModelOption } from '../components/ModelSelector';
import { AgentOption } from '../components/AgentSelector';
import { ProviderUtils } from '../utils/ProviderUtils';
import { WorkspaceContext } from '../../../database/types/workspace/WorkspaceTypes';
import { TFile } from 'obsidian';
import { MessageEnhancement } from '../components/suggesters/base/SuggesterInterfaces';
import { SystemPromptBuilder } from './SystemPromptBuilder';
import { AgentDiscoveryService } from '../../../services/agents/AgentDiscoveryService';
import { ContextNotesManager } from './ContextNotesManager';

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
  private contextNotesManager: ContextNotesManager;
  private currentConversationId: string | null = null;
  private messageEnhancement: MessageEnhancement | null = null;
  private systemPromptBuilder: SystemPromptBuilder;
  private agentDiscoveryService: AgentDiscoveryService | null = null;

  constructor(
    private app: any, // Obsidian App
    private events: ModelAgentManagerEvents,
    private conversationService?: any, // Optional ConversationService for persistence
    conversationId?: string
  ) {
    this.currentConversationId = conversationId || null;
    // Initialize services
    this.contextNotesManager = new ContextNotesManager();
    this.systemPromptBuilder = new SystemPromptBuilder(this.readNoteContent.bind(this));
    // AgentDiscoveryService will be initialized lazily when needed
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
              console.warn('[ModelAgentManager] Saved model not found, falling back to default');
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

                  // Bind session to workspace
                  await this.bindSessionToWorkspace(
                    settings.sessionId || conversation.metadata?.chatSettings?.sessionId,
                    settings.workspaceId
                  );
                }
              }
            } catch (error) {
              console.error('[ModelAgentManager] Failed to load workspace context:', error);
            }
          }

          // Restore context notes
          if (settings.contextNotes && Array.isArray(settings.contextNotes)) {
            this.contextNotesManager.setNotes(settings.contextNotes);
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
   * ✅ CRITICAL: Also clears workspace, agent, and context notes for clean slate
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

      // ✅ CRITICAL FIX: Clear all other state for new conversations
      // This prevents old conversation state from leaking into new conversations
      this.selectedAgent = null;
      this.currentSystemPrompt = null;
      this.selectedWorkspaceId = null;
      this.workspaceContext = null;
      this.contextNotesManager.clear();

      // Notify listeners about the state reset
      this.events.onAgentChanged(null);
      this.events.onSystemPromptChanged(null);
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
      // ⚠️ CRITICAL: Load existing metadata first to preserve sessionId
      const existingConversation = await this.conversationService.getConversation(conversationId);
      const existingSessionId = existingConversation?.metadata?.chatSettings?.sessionId;

      const metadata = {
        chatSettings: {
          providerId: this.selectedModel?.providerId,
          modelId: this.selectedModel?.modelId,
          agentId: this.selectedAgent?.id,
          workspaceId: this.selectedWorkspaceId,
          contextNotes: this.contextNotesManager.getNotes(),
          sessionId: existingSessionId // ✅ PRESERVE the session ID!
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

    // Get session ID from current conversation
    const sessionId = await this.getCurrentSessionId();

    if (sessionId) {
      await this.bindSessionToWorkspace(sessionId, workspaceId);
    }

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
    return this.contextNotesManager.getNotes();
  }

  /**
   * Set context notes
   */
  async setContextNotes(notes: string[]): Promise<void> {
    this.contextNotesManager.setNotes(notes);
    this.events.onSystemPromptChanged(await this.buildSystemPromptWithWorkspace());
  }

  /**
   * Add context note
   */
  async addContextNote(notePath: string): Promise<void> {
    if (this.contextNotesManager.addNote(notePath)) {
      this.events.onSystemPromptChanged(await this.buildSystemPromptWithWorkspace());
    }
  }

  /**
   * Remove context note by index
   */
  async removeContextNote(index: number): Promise<void> {
    if (this.contextNotesManager.removeNote(index)) {
      this.events.onSystemPromptChanged(await this.buildSystemPromptWithWorkspace());
    }
  }

  /**
   * Set message enhancement from suggesters
   * @param enhancement - Message enhancement data
   */
  setMessageEnhancement(enhancement: MessageEnhancement | null): void {
    this.messageEnhancement = enhancement;
  }

  /**
   * Get current message enhancement
   * @returns Message enhancement or null
   */
  getMessageEnhancement(): MessageEnhancement | null {
    return this.messageEnhancement;
  }

  /**
   * Clear message enhancement (call after message is sent)
   */
  clearMessageEnhancement(): void {
    this.messageEnhancement = null;
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
      // Get plugin instance to access LLMService
      const plugin = this.app.plugins.plugins['claudesidian-mcp'];
      if (!plugin) {
        return [];
      }

      // Get LLMService which has ModelDiscoveryService
      const llmService = await plugin.getService('llmService');
      if (!llmService) {
        return [];
      }

      // Allowed providers for chat view
      const allowedProviders = ['openai', 'openrouter', 'anthropic', 'google', 'ollama'];

      // Get all available models from ModelDiscoveryService (via LLMService)
      const allModels = await llmService.getAvailableModels();

      // Filter to allowed providers and convert to ModelOption format
      const models: ModelOption[] = allModels
        .filter((model: any) => allowedProviders.includes(model.provider))
        .map((model: any) => this.mapToModelOption(model));

      return models;
    } catch (error) {
      console.error('[ModelAgentManager] Failed to get available models:', error);
      return [];
    }
  }

  /**
   * Convert ModelWithProvider to ModelOption format
   */
  private mapToModelOption(model: any): ModelOption {
    return {
      providerId: model.provider,
      providerName: this.getProviderDisplayName(model.provider),
      modelId: model.id,
      modelName: model.name,
      contextWindow: model.contextWindow || 128000 // Default if not specified
    };
  }

  /**
   * Get available agents from agent manager
   */
  async getAvailableAgents(): Promise<AgentOption[]> {
    try {
      // Initialize AgentDiscoveryService if needed
      if (!this.agentDiscoveryService) {
        const plugin = this.app.plugins.plugins['claudesidian-mcp'];
        if (!plugin) {
          return [];
        }

        const customPromptStorageService = await plugin.getService('customPromptStorageService');
        if (!customPromptStorageService) {
          console.warn('[ModelAgentManager] CustomPromptStorageService not available');
          return [];
        }

        this.agentDiscoveryService = new AgentDiscoveryService(customPromptStorageService);
      }

      // Get enabled agents from discovery service
      const agents = await this.agentDiscoveryService.getEnabledAgents();

      // Convert to AgentOption format
      return agents.map(agent => this.mapToAgentOption(agent));
    } catch (error) {
      console.error('[ModelAgentManager] Failed to get available agents:', error);
      return [];
    }
  }

  /**
   * Convert AgentInfo to AgentOption format
   */
  private mapToAgentOption(agent: any): AgentOption {
    return {
      id: agent.id,
      name: agent.name || 'Unnamed Agent',
      description: agent.description || 'Custom agent prompt',
      systemPrompt: agent.prompt
    };
  }

  /**
   * Get message options for current selection (includes workspace context)
   */
  async getMessageOptions(): Promise<{
    provider?: string;
    model?: string;
    systemPrompt?: string;
    workspaceId?: string;
    sessionId?: string;
  }> {
    const sessionId = await this.getCurrentSessionId();

    return {
      provider: this.selectedModel?.providerId,
      model: this.selectedModel?.modelId,
      systemPrompt: await this.buildSystemPromptWithWorkspace() || undefined,
      workspaceId: this.selectedWorkspaceId || undefined,
      sessionId: sessionId
    };
  }

  /**
   * Build system prompt with workspace context
   */
  private async buildSystemPromptWithWorkspace(): Promise<string | null> {
    console.log('[ModelAgentManager] Building system prompt with enhancement:', this.messageEnhancement);

    const sessionId = await this.getCurrentSessionId();

    return await this.systemPromptBuilder.build({
      sessionId,
      workspaceId: this.selectedWorkspaceId || undefined,
      contextNotes: this.contextNotesManager.getNotes(),
      messageEnhancement: this.messageEnhancement,
      agentPrompt: this.currentSystemPrompt,
      workspaceContext: this.workspaceContext
    });
  }

  /**
   * Read note content from vault
   * Used by SystemPromptBuilder for file content injection
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

  /**
   * Bind a session to a workspace in SessionContextManager
   */
  private async bindSessionToWorkspace(sessionId: string | undefined, workspaceId: string): Promise<void> {
    if (!sessionId) {
      console.warn('[ModelAgentManager] No session ID available for workspace binding');
      return;
    }

    try {
      const plugin = this.app.plugins.plugins['claudesidian-mcp'];
      const sessionContextManager = await plugin.getService('sessionContextManager');

      if (sessionContextManager) {
        sessionContextManager.setWorkspaceContext(sessionId, {
          workspaceId: workspaceId,
          activeWorkspace: true
        });
      } else {
        console.warn('[ModelAgentManager] SessionContextManager not available');
      }
    } catch (error) {
      console.error('[ModelAgentManager] Failed to bind session to workspace:', error);
    }
  }

  /**
   * Get current session ID from conversation
   */
  private async getCurrentSessionId(): Promise<string | undefined> {
    if (!this.currentConversationId || !this.conversationService) {
      return undefined;
    }

    try {
      const conversation = await this.conversationService.getConversation(this.currentConversationId);
      return conversation?.metadata?.chatSettings?.sessionId;
    } catch (error) {
      console.error('[ModelAgentManager] Failed to get session ID:', error);
      return undefined;
    }
  }
}