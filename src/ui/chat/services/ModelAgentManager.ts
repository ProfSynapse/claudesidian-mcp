/**
 * ModelAgentManager - Handles model and agent selection, loading, and state management
 * Refactored to use extracted utilities following SOLID principles
 */

import { ModelOption } from '../components/ModelSelector';
import { AgentOption } from '../components/AgentSelector';
import { WorkspaceContext } from '../../../database/types/workspace/WorkspaceTypes';
import { MessageEnhancement } from '../components/suggesters/base/SuggesterInterfaces';
import { SystemPromptBuilder } from './SystemPromptBuilder';
import { ContextNotesManager } from './ContextNotesManager';
import { ModelSelectionUtility } from '../utils/ModelSelectionUtility';
import { AgentConfigurationUtility } from '../utils/AgentConfigurationUtility';
import { WorkspaceIntegrationService } from './WorkspaceIntegrationService';

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
  private workspaceIntegration: WorkspaceIntegrationService;

  constructor(
    private app: any, // Obsidian App
    private events: ModelAgentManagerEvents,
    private conversationService?: any, // Optional ConversationService for persistence
    conversationId?: string
  ) {
    this.currentConversationId = conversationId || null;

    // Initialize services
    this.contextNotesManager = new ContextNotesManager();
    this.workspaceIntegration = new WorkspaceIntegrationService(app);
    this.systemPromptBuilder = new SystemPromptBuilder(
      this.workspaceIntegration.readNoteContent.bind(this.workspaceIntegration),
      this.workspaceIntegration.loadWorkspace.bind(this.workspaceIntegration)
    );
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
          await this.restoreFromConversationMetadata(conversation.metadata.chatSettings);
          return; // Successfully loaded from metadata
        }
      }

      // Fall back to plugin default if no metadata
      await this.initializeDefaultModel();
    } catch (error) {
      await this.initializeDefaultModel();
    }
  }

  /**
   * Restore settings from conversation metadata
   */
  private async restoreFromConversationMetadata(settings: any): Promise<void> {
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
      await this.restoreWorkspace(settings.workspaceId, settings.sessionId);
    }

    // Restore context notes
    if (settings.contextNotes && Array.isArray(settings.contextNotes)) {
      this.contextNotesManager.setNotes(settings.contextNotes);
    }
  }

  /**
   * Restore workspace from settings
   */
  private async restoreWorkspace(workspaceId: string, sessionId?: string): Promise<void> {
    this.selectedWorkspaceId = workspaceId;

    try {
      const plugin = this.app.plugins.plugins['claudesidian-mcp'];
      const workspaceService = await plugin?.getService('workspaceService');

      if (workspaceService) {
        const workspace = await workspaceService.getWorkspace(workspaceId);
        if (workspace?.context) {
          this.workspaceContext = workspace.context;

          // Bind session to workspace
          await this.workspaceIntegration.bindSessionToWorkspace(sessionId, workspaceId);
        }
      }
    } catch (error) {
      console.error('[ModelAgentManager] Failed to restore workspace:', error);
    }
  }

  /**
   * Initialize the selected model from plugin settings default
   * Also clears workspace, agent, and context notes for clean slate
   */
  private async initializeDefaultModel(): Promise<void> {
    try {
      const availableModels = await this.getAvailableModels();
      const defaultModel = await ModelSelectionUtility.findDefaultModelOption(this.app, availableModels);

      if (defaultModel) {
        this.selectedModel = defaultModel;
        this.events.onModelChanged(defaultModel);
      }

      // Clear all other state for new conversations
      this.selectedAgent = null;
      this.currentSystemPrompt = null;
      this.selectedWorkspaceId = null;
      this.workspaceContext = null;
      this.contextNotesManager.clear();

      // Notify listeners about the state reset
      this.events.onAgentChanged(null);
      this.events.onSystemPromptChanged(null);
    } catch (error) {
      console.error('[ModelAgentManager] Failed to initialize default model:', error);
    }
  }

  /**
   * Save current selections to conversation metadata
   */
  async saveToConversation(conversationId: string): Promise<void> {
    if (!this.conversationService) {
      return;
    }

    try {
      // Load existing metadata first to preserve sessionId
      const existingConversation = await this.conversationService.getConversation(conversationId);
      const existingSessionId = existingConversation?.metadata?.chatSettings?.sessionId;

      const metadata = {
        chatSettings: {
          providerId: this.selectedModel?.providerId,
          modelId: this.selectedModel?.modelId,
          agentId: this.selectedAgent?.id,
          workspaceId: this.selectedWorkspaceId,
          contextNotes: this.contextNotesManager.getNotes(),
          sessionId: existingSessionId // Preserve the session ID
        }
      };

      await this.conversationService.updateConversationMetadata(conversationId, metadata);
    } catch (error) {
      console.error('[ModelAgentManager] Failed to save to conversation:', error);
    }
  }

  /**
   * Get current selected model (sync - returns null if none selected)
   */
  getSelectedModel(): ModelOption | null {
    return this.selectedModel;
  }

  /**
   * Get current selected model or default (async - fetches default if none selected)
   */
  async getSelectedModelOrDefault(): Promise<ModelOption | null> {
    if (this.selectedModel) {
      return this.selectedModel;
    }

    // Get the default model
    const availableModels = await this.getAvailableModels();
    const defaultModel = await ModelSelectionUtility.findDefaultModelOption(this.app, availableModels);

    console.log('[ModelAgentManager] getSelectedModelOrDefault - returning default model:', defaultModel?.modelName);
    return defaultModel;
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
      await this.workspaceIntegration.bindSessionToWorkspace(sessionId, workspaceId);
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
   */
  setMessageEnhancement(enhancement: MessageEnhancement | null): void {
    this.messageEnhancement = enhancement;
  }

  /**
   * Get current message enhancement
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
   * Get available models from validated providers
   */
  async getAvailableModels(): Promise<ModelOption[]> {
    return await ModelSelectionUtility.getAvailableModels(this.app);
  }

  /**
   * Get available agents from agent manager
   */
  async getAvailableAgents(): Promise<AgentOption[]> {
    return await AgentConfigurationUtility.getAvailableAgents(this.app);
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
      return undefined;
    }
  }
}
