/**
 * ChatView - Main Obsidian sidebar view for native chatbot
 * 
 * Extends ItemView to integrate with Obsidian's workspace system.
 * Contains conversation list, message display, and input components.
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import { ConversationList } from './components/ConversationList';
import { MessageDisplay } from './components/MessageDisplay';
import { ChatInput } from './components/ChatInput';
import { ModelSelector, ModelOption } from './components/ModelSelector';
import { AgentSelector, AgentOption } from './components/AgentSelector';
import { ContextProgressBar, ContextUsage } from './components/ContextProgressBar';
import { ChatService } from '../../services/chat/ChatService';
import { ConversationData } from '../../types/chat/ChatTypes';

export const CHAT_VIEW_TYPE = 'claudesidian-chat';

export class ChatView extends ItemView {
  private chatService: ChatService;
  private conversationList!: ConversationList;
  private messageDisplay!: MessageDisplay;
  private chatInput!: ChatInput;
  private modelSelector!: ModelSelector;
  private agentSelector!: AgentSelector;
  private contextProgressBar!: ContextProgressBar;
  
  private currentConversation: ConversationData | null = null;
  private isLoading = false;
  private sidebarVisible = false;
  
  // Model and agent state
  private selectedModel: ModelOption | null = null;
  private selectedAgent: AgentOption | null = null;
  private currentSystemPrompt: string | null = null;

  constructor(leaf: WorkspaceLeaf, chatService: ChatService) {
    super(leaf);
    this.chatService = chatService;
  }

  getViewType(): string {
    return CHAT_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'AI Chat';
  }

  getIcon(): string {
    return 'message-square';
  }

  async onOpen(): Promise<void> {
    console.log('[ChatView] Opening chat view');
    
    // Initialize the chat service if not already done
    if (!this.chatService) {
      console.error('[ChatView] ChatService not available');
      return;
    }

    // Initialize ChatService to load MCP tools
    try {
      await this.chatService.initialize();
      console.log('[ChatView] ChatService initialized successfully');
    } catch (error) {
      console.error('[ChatView] Failed to initialize ChatService:', error);
    }

    this.createChatInterface();
    await this.loadConversations();
  }

  async onClose(): Promise<void> {
    console.log('[ChatView] Closing chat view');
    this.cleanup();
  }

  /**
   * Create the main chat interface layout
   */
  private createChatInterface(): void {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('chat-view-container');

    // Create main layout
    const chatLayout = container.createDiv('chat-layout');
    
    // Main chat area (always visible)
    const mainContainer = chatLayout.createDiv('chat-main');
    
    // Chat header with hamburger menu
    const chatHeader = mainContainer.createDiv('chat-header');
    
    // Hamburger menu button
    const hamburgerButton = chatHeader.createEl('button', { 
      cls: 'chat-hamburger-button'
    });
    hamburgerButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg>';
    hamburgerButton.setAttribute('aria-label', 'Toggle conversations');
    hamburgerButton.addEventListener('click', () => this.toggleConversationList());
    
    // Chat title
    const chatTitle = chatHeader.createDiv('chat-title');
    chatTitle.textContent = 'AI Chat';
    
    const messageContainer = mainContainer.createDiv('message-display-container');
    
    // Model and Agent selectors above input (side by side)
    const selectorsContainer = mainContainer.createDiv('chat-selectors-container');
    const modelSelectorContainer = selectorsContainer.createDiv('selector-item');
    const agentSelectorContainer = selectorsContainer.createDiv('selector-item');
    
    const inputContainer = mainContainer.createDiv('chat-input-container');
    
    // Context progress bar at bottom
    const contextContainer = mainContainer.createDiv('chat-context-container');
    
    // Backdrop for closing sidebar on mobile
    const backdrop = chatLayout.createDiv('chat-backdrop');
    backdrop.addEventListener('click', () => this.toggleConversationList());
    
    // Sliding sidebar: Conversation list
    const sidebarContainer = chatLayout.createDiv('chat-sidebar');
    sidebarContainer.addClass('chat-sidebar-hidden'); // Start hidden
    
    const sidebarHeader = sidebarContainer.createDiv('chat-sidebar-header');
    sidebarHeader.createEl('h3', { text: 'Conversations' });
    
    const newChatButton = sidebarHeader.createEl('button', { 
      cls: 'chat-new-button',
      text: '+ New Chat'
    });
    newChatButton.addEventListener('click', () => this.createNewConversation());

    const conversationListContainer = sidebarContainer.createDiv('conversation-list-container');

    // Initialize components
    this.conversationList = new ConversationList(
      conversationListContainer,
      (conversation) => this.selectConversation(conversation),
      (conversationId) => this.deleteConversation(conversationId)
    );

    this.messageDisplay = new MessageDisplay(
      messageContainer,
      (messageId) => this.handleRetryMessage(messageId),
      (messageId, newContent) => this.handleEditMessage(messageId, newContent)
    );

    this.chatInput = new ChatInput(
      inputContainer,
      (message) => this.sendMessage(message),
      () => this.isLoading
    );

    // Initialize model selector
    this.modelSelector = new ModelSelector(
      modelSelectorContainer,
      (model) => this.handleModelChange(model),
      () => this.getAvailableModels()
    );

    // Initialize agent selector  
    this.agentSelector = new AgentSelector(
      agentSelectorContainer,
      (agent) => this.handleAgentChange(agent),
      () => this.getAvailableAgents()
    );

    // Initialize context progress bar
    this.contextProgressBar = new ContextProgressBar(
      contextContainer,
      () => this.getContextUsage()
    );

    // Show welcome state
    this.showWelcomeState();
  }

  /**
   * Load conversations from the chat service
   */
  private async loadConversations(): Promise<void> {
    try {
      const conversations = await this.chatService.listConversations({ limit: 50 });
      this.conversationList.setConversations(conversations);
      
      // Auto-select the most recent conversation
      if (conversations.length > 0) {
        await this.selectConversation(conversations[0]);
      }
    } catch (error) {
      console.error('[ChatView] Failed to load conversations:', error);
      this.showError('Failed to load conversations');
    }
  }

  /**
   * Select and display a conversation
   */
  private async selectConversation(conversation: ConversationData): Promise<void> {
    try {
      this.currentConversation = conversation;
      this.conversationList.setActiveConversation(conversation.id);
      
      // Load full conversation data
      const fullConversation = await this.chatService.getConversation(conversation.id);
      if (fullConversation) {
        this.messageDisplay.setConversation(fullConversation);
        this.showChatState();
        
        // Update context progress bar
        await this.updateContextProgress();
      }
    } catch (error) {
      console.error('[ChatView] Failed to select conversation:', error);
      this.showError('Failed to load conversation');
    }
  }

  /**
   * Create a new conversation
   */
  private async createNewConversation(): Promise<void> {
    // Prompt user for conversation title
    const title = await this.promptForConversationTitle();
    if (!title) return; // User cancelled
    
    try {
      const result = await this.chatService.createConversation(title);
      
      if (result.success && result.conversationId) {
        // Reload conversations and select the new one
        await this.loadConversations();
        const conversation = await this.chatService.getConversation(result.conversationId);
        if (conversation) {
          await this.selectConversation(conversation);
        }
      } else {
        this.showError(result.error || 'Failed to create conversation');
      }
    } catch (error) {
      console.error('[ChatView] Failed to create conversation:', error);
      this.showError('Failed to create conversation');
    }
  }

  /**
   * Send a message in the current conversation
   */
  private async sendMessage(message: string): Promise<void> {
    if (!this.currentConversation) {
      // Create new conversation with this message
      await this.createNewConversationWithMessage(message);
      return;
    }

    try {
      this.isLoading = true;
      this.chatInput.setLoading(true);

      // Send message via chat service with model and agent info
      // Don't add to display immediately - let the conversation reload handle it
      console.log('[ChatView] Sending message with model:', {
        provider: this.selectedModel?.providerId,
        model: this.selectedModel?.modelId,
        hasSystemPrompt: !!this.currentSystemPrompt
      });
      
      // 1. Add user message immediately and show it
      const userMessage = {
        id: `msg_${Date.now()}_user`,
        role: 'user' as const,
        content: message,
        timestamp: Date.now()
      };
      
      // Add user message to current conversation and display
      this.currentConversation.messages.push(userMessage);
      this.messageDisplay.setConversation(this.currentConversation);
      
      // 2. Create placeholder AI message with loading animation
      const aiMessageId = `msg_${Date.now()}_ai`;
      const placeholderAiMessage = {
        id: aiMessageId,
        role: 'assistant' as const,
        content: '',
        timestamp: Date.now(),
        isLoading: true
      };
      
      // Add placeholder AI message and show loading
      this.currentConversation.messages.push(placeholderAiMessage);
      this.messageDisplay.setConversation(this.currentConversation);
      this.showAILoadingState(aiMessageId);

      // 3. Stream AI response
      try {
        // First add the user message to repository
        await this.chatService.addMessage({
          conversationId: this.currentConversation.id,
          role: 'user',
          content: message
        });

        let finalAIMessageId = '';
        let streamedContent = '';

        // Stream the AI response
        for await (const chunk of this.chatService.generateResponseStreaming(
          this.currentConversation.id,
          message,
          this.currentConversation,
          {
            provider: this.selectedModel?.providerId,
            model: this.selectedModel?.modelId,
            systemPrompt: this.currentSystemPrompt || undefined,
            messageId: aiMessageId // Pass the placeholder messageId for UI consistency
          }
        )) {
          
          finalAIMessageId = chunk.messageId;
          
          // For token chunks, add to accumulated content
          if (chunk.chunk) {
            streamedContent += chunk.chunk;
          }

          // Update the placeholder message in our current conversation data
          const placeholderMessageIndex = this.currentConversation.messages.findIndex(msg => msg.id === aiMessageId);
          if (placeholderMessageIndex >= 0) {
            this.currentConversation.messages[placeholderMessageIndex] = {
              ...this.currentConversation.messages[placeholderMessageIndex],
              content: streamedContent,
              isLoading: !chunk.complete
            };
          }

          // Update the display with the current accumulated content (real-time streaming)
          if (this.messageDisplay) {
            this.messageDisplay.updateMessageContent(aiMessageId, streamedContent, !chunk.complete);
          } else {
            console.error(`[ChatView] MessageDisplay is null!`);
          }

          if (chunk.complete) {
            
            // Save the final AI message to database
            // Save AI response to database
            await this.chatService.addMessage({
              conversationId: this.currentConversation.id,
              role: 'assistant',
              content: streamedContent
            });
            // AI response saved successfully
            
            // Update the context progress bar
            await this.updateContextProgress();
            break;
          }
        }

      } catch (sendError) {
        console.error('[ChatView] Error during streaming:', sendError);
        this.showError('Failed to send message');
        this.removeLoadingMessage(aiMessageId);
        throw sendError; // Re-throw to be caught by outer try-catch
      }
    } catch (error) {
      console.error('[ChatView] Failed to send message:', error);
      this.showError('Failed to send message');
    } finally {
      this.isLoading = false;
      this.chatInput.setLoading(false);
    }
  }

  /**
   * Create new conversation with initial message
   */
  private async createNewConversationWithMessage(message: string): Promise<void> {
    const title = message.length > 50 ? message.substring(0, 47) + '...' : message;
    
    try {
      this.isLoading = true;
      this.chatInput.setLoading(true);

      const result = await this.chatService.createConversation(title, message, {
        provider: this.selectedModel?.providerId,
        model: this.selectedModel?.modelId,
        systemPrompt: this.currentSystemPrompt || undefined
      });
      
      if (result.success && result.conversationId) {
        // Reload conversations and select the new one
        await this.loadConversations();
        const conversation = await this.chatService.getConversation(result.conversationId);
        if (conversation) {
          await this.selectConversation(conversation);
        }
      } else {
        this.showError(result.error || 'Failed to create conversation');
      }
    } catch (error) {
      console.error('[ChatView] Failed to create conversation with message:', error);
      this.showError('Failed to create conversation');
    } finally {
      this.isLoading = false;
      this.chatInput.setLoading(false);
    }
  }

  /**
   * Delete a conversation
   */
  private async deleteConversation(conversationId: string): Promise<void> {
    try {
      const success = await this.chatService.deleteConversation(conversationId);
      
      if (success) {
        // If this was the current conversation, clear the display
        if (this.currentConversation?.id === conversationId) {
          this.currentConversation = null;
          this.showWelcomeState();
        }
        
        // Reload conversation list
        await this.loadConversations();
      } else {
        this.showError('Failed to delete conversation');
      }
    } catch (error) {
      console.error('[ChatView] Failed to delete conversation:', error);
      this.showError('Failed to delete conversation');
    }
  }

  /**
   * Handle retry message action
   */
  private async handleRetryMessage(messageId: string): Promise<void> {
    if (!this.currentConversation) return;
    
    const message = this.currentConversation.messages.find(msg => msg.id === messageId);
    if (!message) return;
    
    // For user messages, just resend the content
    if (message.role === 'user') {
      await this.sendMessage(message.content);
    }
    // For AI messages, get the previous user message and regenerate
    else if (message.role === 'assistant') {
      const messageIndex = this.currentConversation.messages.findIndex(msg => msg.id === messageId);
      if (messageIndex > 0) {
        const previousUserMessage = this.currentConversation.messages[messageIndex - 1];
        if (previousUserMessage.role === 'user') {
          // Remove the AI response and regenerate
          this.currentConversation.messages = this.currentConversation.messages.slice(0, messageIndex);
          await this.chatService.updateConversation(this.currentConversation);
          await this.sendMessage(previousUserMessage.content);
        }
      }
    }
  }

  /**
   * Handle edit message action
   */
  private async handleEditMessage(messageId: string, newContent: string): Promise<void> {
    if (!this.currentConversation) return;
    
    const messageIndex = this.currentConversation.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return;
    
    // Update the message content
    this.currentConversation.messages[messageIndex].content = newContent;
    
    // If this was a user message followed by AI responses, remove subsequent AI messages
    if (this.currentConversation.messages[messageIndex].role === 'user') {
      // Remove all messages after this one (they're now invalid)
      this.currentConversation.messages = this.currentConversation.messages.slice(0, messageIndex + 1);
    }
    
    // Update the conversation in storage
    await this.chatService.updateConversation(this.currentConversation);
    
    // Refresh the display
    this.messageDisplay.setConversation(this.currentConversation);
    
    // If this was a user message, automatically regenerate the response
    if (this.currentConversation.messages[messageIndex].role === 'user') {
      await this.sendMessage(newContent);
    }
  }

  /**
   * Show welcome state when no conversation is selected
   */
  private showWelcomeState(): void {
    this.messageDisplay.showWelcome();
    this.chatInput.setPlaceholder('Start a new conversation...');
  }

  /**
   * Show chat state when conversation is selected
   */
  private showChatState(): void {
    this.chatInput.setPlaceholder('Type your message...');
  }

  /**
   * Toggle conversation list visibility
   */
  private toggleConversationList(): void {
    const sidebar = this.containerEl.querySelector('.chat-sidebar');
    const backdrop = this.containerEl.querySelector('.chat-backdrop');
    if (!sidebar || !backdrop) return;
    
    this.sidebarVisible = !this.sidebarVisible;
    
    if (this.sidebarVisible) {
      sidebar.removeClass('chat-sidebar-hidden');
      sidebar.addClass('chat-sidebar-visible');
      backdrop.addClass('chat-backdrop-visible');
    } else {
      sidebar.removeClass('chat-sidebar-visible');
      sidebar.addClass('chat-sidebar-hidden');
      backdrop.removeClass('chat-backdrop-visible');
    }
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    // Create a temporary error display
    const container = this.containerEl.querySelector('.message-display-container');
    if (container) {
      const errorEl = container.createDiv('chat-error');
      errorEl.textContent = message;
      
      // Auto-remove after 5 seconds
      setTimeout(() => {
        errorEl.remove();
      }, 5000);
    }
  }

  /**
   * Prompt user for conversation title
   */
  private async promptForConversationTitle(): Promise<string | null> {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.addClass('chat-modal-overlay');
      
      // Create modal dialog
      const modal = overlay.createDiv('chat-modal');
      
      // Modal header
      const header = modal.createDiv('chat-modal-header');
      header.createEl('h3', { text: 'New Conversation' });
      
      // Close button
      const closeBtn = header.createEl('button', { 
        cls: 'chat-modal-close',
        text: '×' 
      });
      
      // Modal content
      const content = modal.createDiv('chat-modal-content');
      content.createEl('p', { text: 'Enter a title for your new conversation:' });
      
      const input = content.createEl('input', {
        type: 'text',
        cls: 'chat-title-input',
        attr: { placeholder: 'e.g., "Help with React project"' }
      });
      
      // Modal actions
      const actions = modal.createDiv('chat-modal-actions');
      const cancelBtn = actions.createEl('button', { 
        text: 'Cancel',
        cls: 'chat-btn-secondary'
      });
      const createBtn = actions.createEl('button', { 
        text: 'Create Chat',
        cls: 'chat-btn-primary'
      });
      
      // Event handlers
      const cleanup = () => {
        overlay.remove();
      };
      
      const handleSubmit = () => {
        const title = input.value.trim();
        if (title) {
          cleanup();
          resolve(title);
        } else {
          input.focus();
          input.addClass('chat-input-error');
          setTimeout(() => input.removeClass('chat-input-error'), 2000);
        }
      };
      
      const handleCancel = () => {
        cleanup();
        resolve(null);
      };
      
      // Wire up events
      closeBtn.addEventListener('click', handleCancel);
      cancelBtn.addEventListener('click', handleCancel);
      createBtn.addEventListener('click', handleSubmit);
      
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSubmit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel();
        }
      });
      
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          handleCancel();
        }
      });
      
      // Add to page and focus
      document.body.appendChild(overlay);
      input.focus();
      input.select();
    });
  }

  /**
   * Handle model selection change
   */
  private handleModelChange(model: ModelOption): void {
    this.selectedModel = model;
    console.log('[ChatView] Model changed:', model);
    
    // Update context progress bar when model changes
    if (this.contextProgressBar) {
      this.contextProgressBar.update();
    }
  }

  /**
   * Handle agent selection change
   */
  private handleAgentChange(agent: AgentOption | null): void {
    this.selectedAgent = agent;
    this.currentSystemPrompt = agent?.systemPrompt || null;
    
    console.log('[ChatView] Agent changed:', agent ? agent.name : 'No agent');
    if (agent) {
      console.log('[ChatView] System prompt:', this.currentSystemPrompt);
    }
  }

  /**
   * Get available models from validated providers
   */
  private async getAvailableModels(): Promise<ModelOption[]> {
    try {
      // Get plugin instance to access settings data
      const plugin = (this.app as any).plugins.plugins['claudesidian-mcp'];
      if (!plugin) {
        console.warn('[ChatView] Plugin not found for model loading');
        return [];
      }

      // Load plugin data directly
      const pluginData = await plugin.loadData();
      if (!pluginData?.llmProviders?.providers) {
        console.warn('[ChatView] No LLM providers found in plugin data');
        return [];
      }

      const models: ModelOption[] = [];
      const providers = pluginData.llmProviders.providers;
      
      // Import ModelRegistry to get actual model specs
      const { ModelRegistry } = await import('../../services/llm/adapters/ModelRegistry');
      
      // Iterate through enabled providers with valid API keys
      Object.entries(providers).forEach(([providerId, config]: [string, any]) => {
        // Only include providers that are enabled and have API keys
        if (!config.enabled || !config.apiKey || !config.apiKey.trim()) {
          console.log(`[ChatView] Skipping ${providerId} - not enabled or no API key`);
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

      console.log('[ChatView] Found models:', models);
      return models;
    } catch (error) {
      console.error('[ChatView] Error loading models:', error);
      return [];
    }
  }

  /**
   * Get available agents from agent manager
   */
  private async getAvailableAgents(): Promise<AgentOption[]> {
    try {
      // Get plugin instance to access settings data
      const plugin = (this.app as any).plugins.plugins['claudesidian-mcp'];
      if (!plugin) {
        console.warn('[ChatView] Plugin not found for agent loading');
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

      console.log('[ChatView] Found agents:', agentOptions);
      return agentOptions;
    } catch (error) {
      console.error('[ChatView] Error loading agents:', error);
      return [];
    }
  }

  /**
   * Get current context usage
   */
  private async getContextUsage(): Promise<ContextUsage> {
    try {
      if (!this.selectedModel || !this.currentConversation) {
        return { used: 0, total: 0, percentage: 0 };
      }

      // Estimate token count for current conversation
      const totalTokens = this.estimateTokenCount(this.currentConversation);
      const contextWindow = this.selectedModel.contextWindow;
      const percentage = (totalTokens / contextWindow) * 100;

      return {
        used: totalTokens,
        total: contextWindow,
        percentage: Math.min(percentage, 100)
      };
    } catch (error) {
      console.error('[ChatView] Error calculating context usage:', error);
      return { used: 0, total: 0, percentage: 0 };
    }
  }

  /**
   * Estimate token count for a conversation
   */
  private estimateTokenCount(conversation: ConversationData): number {
    let totalTokens = 0;
    
    // Add system prompt tokens if agent is selected
    if (this.currentSystemPrompt) {
      totalTokens += this.estimateTextTokens(this.currentSystemPrompt);
    }
    
    // Add message tokens
    conversation.messages.forEach(message => {
      totalTokens += this.estimateTextTokens(message.content);
      
      // Add tokens for tool calls if present
      if (message.tool_calls) {
        message.tool_calls.forEach(toolCall => {
          if (toolCall.parameters) {
            totalTokens += this.estimateTextTokens(JSON.stringify(toolCall.parameters));
          }
          if (toolCall.result) {
            const resultText = typeof toolCall.result === 'string' 
              ? toolCall.result 
              : JSON.stringify(toolCall.result);
            totalTokens += this.estimateTextTokens(resultText);
          }
        });
      }
    });
    
    return totalTokens;
  }

  /**
   * Rough estimation of token count for text (4 chars ≈ 1 token)
   */
  private estimateTextTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Get display name for provider
   */
  private getProviderDisplayName(providerId: string): string {
    const displayNames: Record<string, string> = {
      'openai': 'OpenAI',
      'anthropic': 'Anthropic',
      'mistral': 'Mistral AI',
      'ollama': 'Ollama',
      'openrouter': 'OpenRouter'
    };
    return displayNames[providerId] || providerId;
  }


  /**
   * Capitalize agent name for display
   */
  private capitalizeAgentName(agentId: string): string {
    return agentId
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Update context progress bar after message changes
   */
  private async updateContextProgress(): Promise<void> {
    if (this.contextProgressBar) {
      await this.contextProgressBar.update();
      this.contextProgressBar.checkWarningThresholds();
    }
  }

  /**
   * Show loading animation for AI response
   */
  private showAILoadingState(messageId: string): void {
    console.log(`[ChatView] Showing loading state for message: ${messageId}`);
    
    // Find the message element and add loading animation
    const messageElement = this.containerEl.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      const contentElement = messageElement.querySelector('.message-bubble .message-content');
      if (contentElement) {
        contentElement.innerHTML = '<span class="ai-loading">Thinking<span class="dots">...</span></span>';
        this.startLoadingAnimation(contentElement);
      }
    }
  }

  /**
   * Remove loading message from conversation
   */
  private removeLoadingMessage(messageId: string): void {
    console.log(`[ChatView] Removing loading message: ${messageId}`);
    
    // Remove from current conversation
    if (this.currentConversation) {
      const messageIndex = this.currentConversation.messages.findIndex(msg => msg.id === messageId);
      if (messageIndex >= 0) {
        this.currentConversation.messages.splice(messageIndex, 1);
        if (this.messageDisplay) {
          this.messageDisplay.setConversation(this.currentConversation);
        }
      }
    }
  }

  /**
   * Start loading animation (animated dots)
   */
  private startLoadingAnimation(element: Element): void {
    const dotsElement = element.querySelector('.dots');
    if (dotsElement) {
      let dotCount = 0;
      const interval = setInterval(() => {
        dotCount = (dotCount + 1) % 4;
        dotsElement.textContent = '.'.repeat(dotCount);
      }, 500);
      
      // Store interval ID for cleanup
      (element as any)._loadingInterval = interval;
    }
  }

  /**
   * Stop loading animation
   */
  private stopLoadingAnimation(element: Element): void {
    const interval = (element as any)._loadingInterval;
    if (interval) {
      clearInterval(interval);
      delete (element as any)._loadingInterval;
    }
  }

  /**
   * Update streaming message content in real-time
   */
  private updateStreamingMessage(messageId: string, content: string, isStreaming: boolean): void {
    
    const messageElement = this.containerEl.querySelector(`[data-message-id="${messageId}"]`);
    console.log(`[ChatView] Found message element:`, !!messageElement);
    
    if (messageElement) {
      const contentElement = messageElement.querySelector('.message-bubble .message-content');
      console.log(`[ChatView] Found content element:`, !!contentElement);
      
      if (contentElement) {
        // Stop loading animation
        this.stopLoadingAnimation(contentElement);
        
        // Update content with streaming text
        if (isStreaming) {
          contentElement.innerHTML = `<div class="streaming-content">${this.escapeHtml(content)}<span class="streaming-cursor">|</span></div>`;
        } else {
          contentElement.innerHTML = `<div class="final-content">${this.escapeHtml(content)}</div>`;
          console.log(`[ChatView] Set final content`);
        }
      } else {
        console.warn(`[ChatView] Content element not found for message ${messageId}`);
      }
    } else {
      console.warn(`[ChatView] Message element not found for messageId: ${messageId}`);
      // Log all message elements to debug
      const allMessages = this.containerEl.querySelectorAll('[data-message-id]');
      console.log(`[ChatView] Found ${allMessages.length} message elements:`, Array.from(allMessages).map(el => el.getAttribute('data-message-id')));
    }
  }

  /**
   * Escape HTML for safe display
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    // Clean up any event listeners or resources
    if (this.conversationList) {
      this.conversationList.cleanup();
    }
    if (this.messageDisplay) {
      this.messageDisplay.cleanup();
    }
    if (this.chatInput) {
      this.chatInput.cleanup();
    }
    if (this.modelSelector) {
      this.modelSelector.cleanup();
    }
    if (this.agentSelector) {
      this.agentSelector.cleanup();
    }
    if (this.contextProgressBar) {
      this.contextProgressBar.cleanup();
    }
  }
}