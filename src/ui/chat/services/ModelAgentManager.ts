/**
 * ModelAgentManager - Handles model and agent selection, loading, and state management
 */

import { ModelOption } from '../components/ModelSelector';
import { AgentOption } from '../components/AgentSelector';
import { ProviderUtils } from '../utils/ProviderUtils';
import { WorkspaceContext } from '../../../database/types/workspace/WorkspaceTypes';
import { TFile } from 'obsidian';
import { MessageEnhancement } from '../components/suggesters/base/SuggesterInterfaces';

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
  private currentConversationId: string | null = null;
  private messageEnhancement: MessageEnhancement | null = null;

  constructor(
    private app: any, // Obsidian App
    private events: ModelAgentManagerEvents,
    private conversationService?: any, // Optional ConversationService for persistence
    conversationId?: string
  ) {
    this.currentConversationId = conversationId || null;
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
      this.contextNotes = [];

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
          contextNotes: this.contextNotes,
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
    let prompt = '';

    console.log('[ModelAgentManager] Building system prompt with enhancement:', this.messageEnhancement);

    // 0. Session and workspace context for tool calls (CRITICAL - must be first!)
    const sessionId = await this.getCurrentSessionId();
    if (sessionId || this.selectedWorkspaceId) {
      prompt += '<session_context>\n';
      prompt += 'IMPORTANT: When using tools, you must include these values in your tool call parameters:\n\n';

      if (sessionId) {
        prompt += `- sessionId: "${sessionId}"\n`;
      }

      if (this.selectedWorkspaceId) {
        prompt += `- workspaceId: "${this.selectedWorkspaceId}"\n`;
      }

      prompt += '\nInclude these in the "context" parameter of your tool calls, like this:\n';
      prompt += '{\n';
      prompt += '  "context": {\n';
      if (sessionId) {
        prompt += `    "sessionId": "${sessionId}",\n`;
      }
      if (this.selectedWorkspaceId) {
        prompt += `    "workspaceId": "${this.selectedWorkspaceId}"\n`;
      }
      prompt += '  },\n';
      prompt += '  ... other parameters ...\n';
      prompt += '}\n';
      prompt += '</session_context>\n\n';
    }

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

    // 1b. Enhancement: Additional notes from [[suggester]]
    if (this.messageEnhancement && this.messageEnhancement.notes.length > 0) {
      console.log('[ModelAgentManager] Injecting notes from [[suggester]]:', this.messageEnhancement.notes.length);
      if (this.contextNotes.length === 0) {
        // Start files section if not already started
        prompt += '<files>\n';
      }

      for (const note of this.messageEnhancement.notes) {
        const xmlTag = this.normalizePathToXmlTag(note.path);
        prompt += `<${xmlTag}>\n`;
        prompt += `${note.path}\n\n`;
        prompt += this.escapeXmlContent(note.content);
        prompt += `\n</${xmlTag}>\n`;
      }

      if (this.contextNotes.length === 0) {
        prompt += '</files>\n\n';
      }
    } else if (this.contextNotes.length > 0) {
      // Close files section if it was opened earlier
    }

    // 1c. Enhancement: Tool hints from /suggester
    if (this.messageEnhancement && this.messageEnhancement.tools.length > 0) {
      console.log('[ModelAgentManager] Injecting tool hints from /suggester:', this.messageEnhancement.tools.length);
      prompt += '<tool_hints>\n';
      prompt += 'The user has requested to use the following tools:\n\n';

      for (const tool of this.messageEnhancement.tools) {
        console.log('[ModelAgentManager] - Tool hint:', tool.name);
        prompt += `Tool: ${tool.name}\n`;
        prompt += `Description: ${tool.schema.description}\n`;
        prompt += 'Please prioritize using this tool when applicable.\n\n';
      }

      prompt += '</tool_hints>\n\n';
    }

    // 1d. Enhancement: Custom agents from @suggester
    if (this.messageEnhancement && this.messageEnhancement.agents.length > 0) {
      console.log('[ModelAgentManager] Injecting custom agents from @suggester:', this.messageEnhancement.agents.length);
      prompt += '<custom_agents>\n';
      prompt += 'The user has mentioned the following custom agents. Apply their personalities and instructions:\n\n';

      for (const agent of this.messageEnhancement.agents) {
        console.log('[ModelAgentManager] - Agent:', agent.name);
        prompt += `<agent name="${this.escapeXmlAttribute(agent.name)}">\n`;
        prompt += this.escapeXmlContent(agent.prompt);
        prompt += `\n</agent>\n\n`;
      }

      prompt += '</custom_agents>\n\n';
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
   * Escape XML content to prevent injection attacks
   * @param content - Content to escape
   * @returns Escaped content
   */
  private escapeXmlContent(content: string): string {
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Escape XML attribute value
   * @param value - Attribute value to escape
   * @returns Escaped value
   */
  private escapeXmlAttribute(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
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