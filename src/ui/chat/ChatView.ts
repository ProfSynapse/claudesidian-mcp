/**
 * ChatView - Clean orchestrator for the chat interface
 * 
 * Coordinates between services, controllers, and UI components following SOLID principles.
 * This class is responsible for initialization, delegation, and high-level event coordination only.
 */

import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import { ConversationList } from './components/ConversationList';
import { MessageDisplay } from './components/MessageDisplay';
import { ChatInput } from './components/ChatInput';
import { ContextProgressBar } from './components/ContextProgressBar';
import { ChatSettingsModal } from './components/ChatSettingsModal';
// BranchNavigator removed - using message-level navigation
import { ChatService } from '../../services/chat/ChatService';
import { ConversationData, ConversationMessage } from '../../types/chat/ChatTypes';

// Services
import { ConversationManager, ConversationManagerEvents } from './services/ConversationManager';
import { MessageManager, MessageManagerEvents } from './services/MessageManager';
import { ModelAgentManager, ModelAgentManagerEvents } from './services/ModelAgentManager';
import { BranchManager, BranchManagerEvents } from './services/BranchManager';

// Controllers
import { UIStateController, UIStateControllerEvents } from './controllers/UIStateController';
import { StreamingController } from './controllers/StreamingController';

// Utils
import { TokenCalculator } from './utils/TokenCalculator';
import { ProviderUtils } from './utils/ProviderUtils';

export const CHAT_VIEW_TYPE = 'claudesidian-chat';

export class ChatView extends ItemView {
  // Core components
  private conversationList!: ConversationList;
  private messageDisplay!: MessageDisplay;
  private chatInput!: ChatInput;
  private contextProgressBar!: ContextProgressBar;
  // Branch navigation is now handled at message level
  
  // Services
  private conversationManager!: ConversationManager;
  private messageManager!: MessageManager;
  private modelAgentManager!: ModelAgentManager;
  private branchManager!: BranchManager;

  // Controllers
  private uiStateController!: UIStateController;
  private streamingController!: StreamingController;

  constructor(leaf: WorkspaceLeaf, private chatService: ChatService) {
    super(leaf);
  }

  getViewType(): string {
    return CHAT_VIEW_TYPE;
  }

  getDisplayText(): string {
    const conversation = this.conversationManager?.getCurrentConversation();
    return conversation?.title || 'AI Chat';
  }

  getIcon(): string {
    return 'message-square';
  }

  async onOpen(): Promise<void> {
    if (!this.chatService) {
      return;
    }

    try {
      await this.chatService.initialize();

      // Set up tool event callback for live UI updates (including 'detected', 'started', 'completed')
      this.chatService.setToolEventCallback((messageId, event, data) => {
        this.handleToolEvent(messageId, event, data);
      });

    } catch (error) {
      // ChatService initialization failed
    }

    this.initializeArchitecture();
    await this.loadInitialData();
  }

  async onClose(): Promise<void> {
    this.cleanup();
  }

  /**
   * Initialize the clean architecture components
   */
  private initializeArchitecture(): void {
    this.createChatInterface();
    this.initializeServices();
    this.initializeControllers();
    this.initializeComponents();
    this.wireEventHandlers();
  }

  /**
   * Create the main chat interface layout (DOM only)
   */
  private createChatInterface(): void {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('chat-view-container');

    // Create main layout structure
    const chatLayout = container.createDiv('chat-layout');
    const mainContainer = chatLayout.createDiv('chat-main');
    
    // Experimental warning banner (auto-hide after 5 seconds)
    const warningBanner = mainContainer.createDiv('chat-experimental-warning');
    warningBanner.innerHTML = `
      <span class="warning-icon">⚠️</span>
      <span class="warning-text">Experimental Feature: AI Chat is in beta.</span>
      <a href="https://github.com/ProfSynapse/claudesidian-mcp/issues" target="_blank" rel="noopener noreferrer" class="warning-link">Report issues</a>
      <span class="warning-text">• Use at your own risk</span>
    `;

    // Auto-hide warning after 5 seconds
    setTimeout(() => {
      warningBanner.style.opacity = '0';
      warningBanner.style.transition = 'opacity 0.5s ease-out';
      setTimeout(() => {
        warningBanner.style.display = 'none';
      }, 500); // Wait for fade transition to complete
    }, 5000);
    
    // Header
    const chatHeader = mainContainer.createDiv('chat-header');

    // Left: Hamburger button
    const hamburgerButton = chatHeader.createEl('button', { cls: 'chat-hamburger-button' });
    hamburgerButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg>';
    hamburgerButton.setAttribute('aria-label', 'Toggle conversations');

    // Center: Title
    const chatTitle = chatHeader.createDiv('chat-title');
    chatTitle.textContent = 'AI Chat';

    // Right: Settings gear icon
    const settingsButton = chatHeader.createEl('button', { cls: 'chat-settings-button' });
    setIcon(settingsButton, 'settings');
    settingsButton.setAttribute('aria-label', 'Chat settings');
    
    // Branch navigation is now at message level - no global navigator needed
    
    // Main content areas
    const messageContainer = mainContainer.createDiv('message-display-container');
    const inputContainer = mainContainer.createDiv('chat-input-container');
    const contextContainer = mainContainer.createDiv('chat-context-container');
    
    // Backdrop and sidebar
    const backdrop = chatLayout.createDiv('chat-backdrop');
    const sidebarContainer = chatLayout.createDiv('chat-sidebar');
    sidebarContainer.addClass('chat-sidebar-hidden');
    
    const sidebarHeader = sidebarContainer.createDiv('chat-sidebar-header');
    sidebarHeader.createEl('h3', { text: 'Conversations' });
    const newChatButton = sidebarHeader.createEl('button', { 
      cls: 'chat-new-button',
      text: '+ New Chat'
    });
    
    const conversationListContainer = sidebarContainer.createDiv('conversation-list-container');

    // Store references for services/controllers
    this.storeElementReferences({
      messageContainer,
      inputContainer,
      contextContainer,
      conversationListContainer,
      // branchNavigatorContainer removed - using message-level navigation
      newChatButton,
      settingsButton,
      chatTitle
    });
  }

  /**
   * Initialize business logic services
   */
  private initializeServices(): void {
    // Branch management - needed by other services
    const branchEvents: BranchManagerEvents = {
      onMessageAlternativeCreated: (messageId, alternativeIndex) => this.handleMessageAlternativeCreated(messageId, alternativeIndex),
      onMessageAlternativeSwitched: (messageId, alternativeIndex) => this.handleMessageAlternativeSwitched(messageId, alternativeIndex),
      onError: (message) => this.uiStateController.showError(message)
    };
    this.branchManager = new BranchManager(this.chatService.getConversationRepository(), branchEvents);

    // Conversation management
    const conversationEvents: ConversationManagerEvents = {
      onConversationSelected: (conversation) => this.handleConversationSelected(conversation),
      onConversationsChanged: () => this.handleConversationsChanged(),
      onError: (message) => this.uiStateController.showError(message)
    };
    this.conversationManager = new ConversationManager(this.chatService, this.branchManager, conversationEvents);

    // Message handling
    const messageEvents: MessageManagerEvents = {
      onMessageAdded: (message) => this.messageDisplay.addMessage(message),
      onAIMessageStarted: (message) => this.handleAIMessageStarted(message),
      onStreamingUpdate: (messageId, content, isComplete, isIncremental) =>
        this.handleStreamingUpdate(messageId, content, isComplete, isIncremental),
      onConversationUpdated: (conversation) => this.handleConversationUpdated(conversation),
      onLoadingStateChanged: (loading) => this.handleLoadingStateChanged(loading),
      onError: (message) => this.uiStateController.showError(message),
      onToolCallsDetected: (messageId, toolCalls) => this.handleToolCallsDetected(messageId, toolCalls),
      onToolExecutionStarted: (messageId, toolCall) => this.handleToolExecutionStarted(messageId, toolCall),
      onToolExecutionCompleted: (messageId, toolId, result, success, error) =>
        this.handleToolExecutionCompleted(messageId, toolId, result, success, error),
      onMessageIdUpdated: (oldId, newId, updatedMessage) => this.handleMessageIdUpdated(oldId, newId, updatedMessage),
      onGenerationAborted: (messageId, partialContent) => this.handleGenerationAborted(messageId, partialContent)
    };
    this.messageManager = new MessageManager(this.chatService, this.branchManager, messageEvents);

    // Model and agent management
    const modelAgentEvents: ModelAgentManagerEvents = {
      onModelChanged: (model) => this.handleModelChanged(model),
      onAgentChanged: (agent) => this.handleAgentChanged(agent),
      onSystemPromptChanged: () => this.updateContextProgress()
    };
    this.modelAgentManager = new ModelAgentManager(
      this.app,
      modelAgentEvents,
      this.chatService.getConversationService()
    );
  }

  /**
   * Initialize UI controllers
   */
  private initializeControllers(): void {
    const uiStateEvents: UIStateControllerEvents = {
      onSidebarToggled: (visible) => { /* Sidebar toggled */ }
    };
    this.uiStateController = new UIStateController(this.containerEl, uiStateEvents);
    this.streamingController = new StreamingController(this.containerEl, this.app, this);
  }

  /**
   * Initialize UI components
   */
  private initializeComponents(): void {
    const refs = this.getElementReferences();

    this.conversationList = new ConversationList(
      refs.conversationListContainer,
      (conversation) => this.conversationManager.selectConversation(conversation),
      (conversationId) => this.conversationManager.deleteConversation(conversationId)
    );

    this.messageDisplay = new MessageDisplay(
      refs.messageContainer,
      this.app,
      this.branchManager,
      (messageId) => this.handleRetryMessage(messageId),
      (messageId, newContent) => this.handleEditMessage(messageId, newContent),
      (messageId, event, data) => this.handleToolEvent(messageId, event, data),
      (messageId, alternativeIndex) => this.handleMessageAlternativeSwitched(messageId, alternativeIndex)
    );

    this.chatInput = new ChatInput(
      refs.inputContainer,
      (message) => this.handleSendMessage(message),
      () => this.messageManager.getIsLoading(),
      this.app, // Pass app for suggesters
      () => this.handleStopGeneration()
    );

    this.contextProgressBar = new ContextProgressBar(
      refs.contextContainer,
      () => this.getContextUsage(),
      () => this.getConversationCost()
    );

    // Branch navigation is now handled at message level - no global navigator needed

    // Update conversation list if conversations were already loaded
    const conversations = this.conversationManager.getConversations();
    if (conversations.length > 0) {
      this.conversationList.setConversations(conversations);
    }
  }

  /**
   * Wire up event handlers
   */
  private wireEventHandlers(): void {
    const refs = this.getElementReferences();
    
    // New chat button
    refs.newChatButton.addEventListener('click', () =>
      this.conversationManager.createNewConversation()
    );

    // Settings button
    refs.settingsButton.addEventListener('click', () =>
      this.openChatSettingsModal()
    );

    // UI state controller events
    this.uiStateController.initializeEventListeners();
  }

  /**
   * Open chat settings modal
   */
  private async openChatSettingsModal(): Promise<void> {
    // Get WorkspaceService from plugin
    const plugin = (this.app as any).plugins.plugins['claudesidian-mcp'];
    if (!plugin) {
      console.error('[ChatView] Plugin not found');
      return;
    }

    // Get WorkspaceService using the plugin's async service getter
    const workspaceService = await plugin.getService('workspaceService');
    if (!workspaceService) {
      console.error('[ChatView] WorkspaceService not available');
      return;
    }

    const currentConversation = this.conversationManager.getCurrentConversation();

    // ✅ CRITICAL FIX: Ensure ModelAgentManager has the current conversation ID
    // This is necessary for new conversations where the modal might open before
    // the conversation ID is fully propagated
    if (currentConversation) {
      (this.modelAgentManager as any).currentConversationId = currentConversation.id;
    }

    const modal = new ChatSettingsModal(
      this.app,
      currentConversation?.id || null,
      workspaceService,
      this.modelAgentManager
    );
    modal.open();
  }

  /**
   * Load initial data
   */
  private async loadInitialData(): Promise<void> {
    await this.conversationManager.loadConversations();

    // Only show welcome state if no conversations exist
    const conversations = this.conversationManager.getConversations();
    if (conversations.length === 0) {
      this.uiStateController.showWelcomeState();
    }
    // If conversations exist, the ConversationManager will auto-select the most recent one
  }

  // Event Handlers

  private async handleConversationSelected(conversation: ConversationData): Promise<void> {
    // Update ModelAgentManager's current conversation ID
    (this.modelAgentManager as any).currentConversationId = conversation.id;

    // Initialize ModelAgentManager from conversation metadata
    await this.modelAgentManager.initializeFromConversation(conversation.id);

    // Re-render from stored conversation data (single source of truth)
    this.messageDisplay.setConversation(conversation);

    // Update the chat title
    this.updateChatTitle();

    // Branch navigation is now at message level
    this.uiStateController.setInputPlaceholder('Type your message...');
    this.updateContextProgress();

    // Close the sidebar menu after selecting a conversation
    if (this.uiStateController.getSidebarVisible()) {
      this.uiStateController.toggleConversationList();
    }
  }

  private handleConversationsChanged(): void {
    // Ensure component is initialized before updating
    if (this.conversationList) {
      this.conversationList.setConversations(this.conversationManager.getConversations());
    }
  }

  private handleAIMessageStarted(message: ConversationMessage): void {
    // Create AI message bubble directly without full conversation re-render
    this.messageDisplay.addAIMessage(message);
  }

  private handleStreamingUpdate(messageId: string, content: string, isComplete: boolean, isIncremental?: boolean): void {
    if (isIncremental) {
      // Streaming chunk - route to StreamingController
      this.streamingController.updateStreamingChunk(messageId, content);
    } else if (isComplete) {
      // Final content - finalize streaming and update MessageBubble
      this.streamingController.finalizeStreaming(messageId, content);
      this.messageDisplay.updateMessageContent(messageId, content);
    } else {
      // Start of new stream - initialize streaming
      this.streamingController.startStreaming(messageId);
      this.streamingController.updateStreamingChunk(messageId, content);
    }
  }

  private handleConversationUpdated(conversation: ConversationData): void {
    this.conversationManager.updateCurrentConversation(conversation);

    // Always re-render from stored conversation data (single source of truth)
    this.messageDisplay.setConversation(conversation);

    // Update the chat title in case it changed
    this.updateChatTitle();

    this.updateContextProgress();
  }

  private async handleSendMessage(message: string): Promise<void> {
    const currentConversation = this.conversationManager.getCurrentConversation();
    const messageOptions = await this.modelAgentManager.getMessageOptions();

    if (!currentConversation) {
      // Create new conversation with message
      await this.conversationManager.createNewConversationWithMessage(
        message,
        messageOptions
      );
    } else {
      // Send message in current conversation
      await this.messageManager.sendMessage(
        currentConversation,
        message,
        messageOptions
      );
    }
  }

  private async handleRetryMessage(messageId: string): Promise<void> {
    const currentConversation = this.conversationManager.getCurrentConversation();
    if (currentConversation) {
      const messageOptions = await this.modelAgentManager.getMessageOptions();
      await this.messageManager.handleRetryMessage(
        currentConversation,
        messageId,
        messageOptions
      );
    }
  }

  private async handleEditMessage(messageId: string, newContent: string): Promise<void> {
    const currentConversation = this.conversationManager.getCurrentConversation();
    if (currentConversation) {
      const messageOptions = await this.modelAgentManager.getMessageOptions();
      await this.messageManager.handleEditMessage(
        currentConversation,
        messageId,
        newContent,
        messageOptions
      );
    }
  }

  private handleStopGeneration(): void {
    this.messageManager.cancelCurrentGeneration();
  }

  private handleGenerationAborted(messageId: string, partialContent: string): void {
    // Stop the MessageBubble's "Thinking..." animation
    const messageBubble = this.messageDisplay.findMessageBubble(messageId);
    if (messageBubble) {
      messageBubble.stopLoadingAnimation();
    }

    // Also stop any StreamingController animations
    const messageElement = this.containerEl.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      const contentElement = messageElement.querySelector('.message-bubble .message-content');
      if (contentElement) {
        this.streamingController.stopLoadingAnimation(contentElement);
      }
    }

    // Finalize any streaming state
    this.streamingController.finalizeStreaming(messageId, partialContent);
  }

  private handleLoadingStateChanged(loading: boolean): void {
    if (this.chatInput) {
      this.chatInput.setLoading(loading);
    }
  }

  private handleModelChanged(model: any | null): void {
    this.updateContextProgress();
  }

  private handleAgentChanged(agent: any | null): void {
    // Agent changed
  }

  private async getContextUsage() {
    const conversation = this.conversationManager.getCurrentConversation();
    const usage = await TokenCalculator.getContextUsage(
      this.modelAgentManager.getSelectedModel(),
      conversation,
      await this.modelAgentManager.getCurrentSystemPrompt()
    );
    return usage;
  }

  private getConversationCost(): { totalCost: number; currency: string } | null {
    const conversation = this.conversationManager.getCurrentConversation();
    if (!conversation?.metadata?.totalCost) {
      return null;
    }
    return {
      totalCost: conversation.metadata.totalCost,
      currency: conversation.metadata.currency || 'USD'
    };
  }

  private async updateContextProgress(): Promise<void> {
    if (this.contextProgressBar) {
      await this.contextProgressBar.update();
      this.contextProgressBar.checkWarningThresholds();
    }
  }

  private updateChatTitle(): void {
    const conversation = this.conversationManager.getCurrentConversation();
    const refs = this.getElementReferences();

    if (refs.chatTitle) {
      refs.chatTitle.textContent = conversation?.title || 'AI Chat';
    }
  }

  // Tool event handlers
  private handleToolCallsDetected(messageId: string, toolCalls: any[]): void {
    // Fire individual 'detected' event for each tool call to create progressive accordions
    const messageBubble = this.messageDisplay.findMessageBubble(messageId);
    if (messageBubble && toolCalls && toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        // Extract the tool call data in the format expected by MessageBubble
        const toolData = {
          id: toolCall.id,
          name: toolCall.name || toolCall.function?.name,
          parameters: toolCall.parameters || toolCall.arguments
        };
        messageBubble.handleToolEvent('detected', toolData);
      }
    }
  }

  private handleToolExecutionStarted(messageId: string, toolCall: { id: string; name: string; parameters?: any }): void {
    const messageBubble = this.messageDisplay.findMessageBubble(messageId);
    messageBubble?.handleToolEvent('started', toolCall);
  }

  private handleToolExecutionCompleted(messageId: string, toolId: string, result: any, success: boolean, error?: string): void {
    const messageBubble = this.messageDisplay.findMessageBubble(messageId);
    messageBubble?.handleToolEvent('completed', { toolId, result, success, error });
  }

  private handleMessageIdUpdated(oldId: string, newId: string, updatedMessage: ConversationMessage): void {
    // Notify MessageDisplay to update the corresponding MessageBubble reference
    this.messageDisplay.updateMessageId(oldId, newId, updatedMessage);
  }

  private handleToolEvent(messageId: string, event: 'detected' | 'updated' | 'started' | 'completed', data: any): void {
    const messageBubble = this.messageDisplay.findMessageBubble(messageId);
    messageBubble?.handleToolEvent(event, data);
  }

  // Element reference management (simple store/retrieve)
  private elementRefs: any = {};

  private storeElementReferences(refs: any): void {
    this.elementRefs = refs;
  }

  private getElementReferences(): any {
    return this.elementRefs;
  }

  // =============================================================================
  // BRANCH EVENT HANDLERS
  // =============================================================================

  /**
   * Handle message alternative creation
   */
  private handleMessageAlternativeCreated(messageId: string, alternativeIndex: number): void {
    // Update the message display to reflect new alternatives
    const currentConversation = this.conversationManager.getCurrentConversation();
    if (currentConversation) {
      this.messageDisplay.setConversation(currentConversation);
    }
  }

  /**
   * Handle message alternative switching
   */
  private async handleMessageAlternativeSwitched(messageId: string, alternativeIndex: number): Promise<void> {
    // Use BranchManager to switch to the alternative (this updates the conversation)
    const currentConversation = this.conversationManager.getCurrentConversation();
    if (currentConversation) {
      const success = await this.branchManager.switchToMessageAlternative(
        currentConversation,
        messageId,
        alternativeIndex
      );
      
      if (success) {
        // Get the updated message and update the bubble
        const updatedMessage = currentConversation.messages.find(msg => msg.id === messageId);
        if (updatedMessage) {
          this.messageDisplay.updateMessage(messageId, updatedMessage);
        }
      }
    }
  }


  private cleanup(): void {
    this.conversationList?.cleanup();
    this.messageDisplay?.cleanup();
    this.chatInput?.cleanup();
    this.contextProgressBar?.cleanup();
    // Branch navigator cleanup no longer needed
    this.uiStateController?.cleanup();
    this.streamingController?.cleanup();
  }
}