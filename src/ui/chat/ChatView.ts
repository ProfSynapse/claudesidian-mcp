/**
 * ChatView - Clean orchestrator for the chat interface
 * 
 * Coordinates between services, controllers, and UI components following SOLID principles.
 * This class is responsible for initialization, delegation, and high-level event coordination only.
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import { ConversationList } from './components/ConversationList';
import { MessageDisplay } from './components/MessageDisplay';
import { ChatInput } from './components/ChatInput';
import { ModelSelector, ModelOption } from './components/ModelSelector';
import { AgentSelector, AgentOption } from './components/AgentSelector';
import { ContextProgressBar } from './components/ContextProgressBar';
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
  private modelSelector!: ModelSelector;
  private agentSelector!: AgentSelector;
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
    return 'AI Chat';
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

      // Set up tool event callback for live UI updates
      this.chatService.setToolEventCallback((messageId, event, data) => {
        if (event === 'started') {
          this.handleToolExecutionStarted(messageId, data);
        } else if (event === 'completed') {
          this.handleToolExecutionCompleted(messageId, data.toolId, data.result, data.success, data.error);
        }
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
    const hamburgerButton = chatHeader.createEl('button', { cls: 'chat-hamburger-button' });
    hamburgerButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg>';
    hamburgerButton.setAttribute('aria-label', 'Toggle conversations');
    
    const chatTitle = chatHeader.createDiv('chat-title');
    chatTitle.textContent = 'AI Chat';
    
    // Branch navigation is now at message level - no global navigator needed
    
    // Main content areas
    const messageContainer = mainContainer.createDiv('message-display-container');
    const selectorsContainer = mainContainer.createDiv('chat-selectors-container');
    const modelSelectorContainer = selectorsContainer.createDiv('selector-item');
    const agentSelectorContainer = selectorsContainer.createDiv('selector-item');
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
      modelSelectorContainer,
      agentSelectorContainer,
      inputContainer,
      contextContainer,
      conversationListContainer,
      // branchNavigatorContainer removed - using message-level navigation
      newChatButton
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
      onLoadingStateChanged: (loading) => this.uiStateController.setInputLoading(loading),
      onError: (message) => this.uiStateController.showError(message),
      onToolCallsDetected: (messageId, toolCalls) => this.handleToolCallsDetected(messageId, toolCalls),
      onToolExecutionStarted: (messageId, toolCall) => this.handleToolExecutionStarted(messageId, toolCall),
      onToolExecutionCompleted: (messageId, toolId, result, success, error) => 
        this.handleToolExecutionCompleted(messageId, toolId, result, success, error),
      onMessageIdUpdated: (oldId, newId, updatedMessage) => this.handleMessageIdUpdated(oldId, newId, updatedMessage)
    };
    this.messageManager = new MessageManager(this.chatService, this.branchManager, messageEvents);

    // Model and agent management
    const modelAgentEvents: ModelAgentManagerEvents = {
      onModelChanged: (model) => this.handleModelChanged(model),
      onAgentChanged: (agent) => this.handleAgentChanged(agent),
      onSystemPromptChanged: () => this.updateContextProgress()
    };
    this.modelAgentManager = new ModelAgentManager(this.app, modelAgentEvents);
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
      () => this.messageManager.getIsLoading()
    );

    this.modelSelector = new ModelSelector(
      refs.modelSelectorContainer,
      (model) => this.modelAgentManager.handleModelChange(model),
      () => this.modelAgentManager.getAvailableModels(),
      () => this.modelAgentManager.getDefaultModel()
    );

    this.agentSelector = new AgentSelector(
      refs.agentSelectorContainer,
      (agent) => this.modelAgentManager.handleAgentChange(agent),
      () => this.modelAgentManager.getAvailableAgents()
    );

    this.contextProgressBar = new ContextProgressBar(
      refs.contextContainer,
      () => this.getContextUsage()
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

    // UI state controller events
    this.uiStateController.initializeEventListeners();
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

  private handleConversationSelected(conversation: ConversationData): void {
    this.messageDisplay.setConversation(conversation);
    // Branch navigation is now at message level
    this.uiStateController.setInputPlaceholder('Type your message...');
    this.updateContextProgress();
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
    this.messageDisplay.setConversation(conversation);
    this.updateContextProgress();
  }

  private async handleSendMessage(message: string): Promise<void> {
    const currentConversation = this.conversationManager.getCurrentConversation();
    
    if (!currentConversation) {
      // Create new conversation with message
      await this.conversationManager.createNewConversationWithMessage(
        message,
        this.modelAgentManager.getMessageOptions()
      );
    } else {
      // Send message in current conversation
      await this.messageManager.sendMessage(
        currentConversation,
        message,
        this.modelAgentManager.getMessageOptions()
      );
    }
  }

  private async handleRetryMessage(messageId: string): Promise<void> {
    const currentConversation = this.conversationManager.getCurrentConversation();
    if (currentConversation) {
      await this.messageManager.handleRetryMessage(
        currentConversation,
        messageId,
        this.modelAgentManager.getMessageOptions()
      );
    }
  }

  private async handleEditMessage(messageId: string, newContent: string): Promise<void> {
    const currentConversation = this.conversationManager.getCurrentConversation();
    if (currentConversation) {
      await this.messageManager.handleEditMessage(
        currentConversation,
        messageId,
        newContent,
        this.modelAgentManager.getMessageOptions()
      );
    }
  }

  private handleModelChanged(model: ModelOption | null): void {
    this.updateContextProgress();
  }

  private handleAgentChanged(agent: AgentOption | null): void {
    // Agent changed
  }

  private async getContextUsage() {
    return TokenCalculator.getContextUsage(
      this.modelAgentManager.getSelectedModel(),
      this.conversationManager.getCurrentConversation(),
      this.modelAgentManager.getCurrentSystemPrompt()
    );
  }

  private async updateContextProgress(): Promise<void> {
    if (this.contextProgressBar) {
      await this.contextProgressBar.update();
      this.contextProgressBar.checkWarningThresholds();
    }
  }

  // Tool event handlers
  private handleToolCallsDetected(messageId: string, toolCalls: any[]): void {
    
    // With progressive tool execution, we don't need to batch re-render here
    // Individual tool accordions will be added via 'started' events
    // Just notify the MessageBubble that tool calls were detected
    const messageBubble = this.messageDisplay.findMessageBubble(messageId);
    messageBubble?.handleToolEvent('detected', toolCalls);
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
    console.log('[ChatView] RECEIVED onMessageIdUpdated event:', {
      oldId,
      newId,
      updatedMessageId: updatedMessage.id,
      messageDisplayExists: !!this.messageDisplay
    });
    // Notify MessageDisplay to update the corresponding MessageBubble reference
    this.messageDisplay.updateMessageId(oldId, newId, updatedMessage);
  }

  private handleToolEvent(messageId: string, event: 'detected' | 'started' | 'completed', data: any): void {
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
    console.log('[ChatView] Message alternative created:', { messageId, alternativeIndex });
    
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
    console.log('[ChatView] Message alternative switched:', { messageId, alternativeIndex });
    
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
    this.modelSelector?.cleanup();
    this.agentSelector?.cleanup();
    this.contextProgressBar?.cleanup();
    // Branch navigator cleanup no longer needed
    this.uiStateController?.cleanup();
    this.streamingController?.cleanup();
  }
}