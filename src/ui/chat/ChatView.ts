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
import { ChatService } from '../../services/chat/ChatService';
import { ConversationData } from '../../types/chat/ChatTypes';

// Services
import { ConversationManager, ConversationManagerEvents } from './services/ConversationManager';
import { MessageManager, MessageManagerEvents } from './services/MessageManager';
import { ModelAgentManager, ModelAgentManagerEvents } from './services/ModelAgentManager';

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
  
  // Services
  private conversationManager!: ConversationManager;
  private messageManager!: MessageManager;
  private modelAgentManager!: ModelAgentManager;

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
    console.log('[ChatView] Opening chat view');
    
    if (!this.chatService) {
      console.error('[ChatView] ChatService not available');
      return;
    }

    try {
      await this.chatService.initialize();
      console.log('[ChatView] ChatService initialized successfully');
    } catch (error) {
      console.error('[ChatView] Failed to initialize ChatService:', error);
    }

    this.initializeArchitecture();
    await this.loadInitialData();
  }

  async onClose(): Promise<void> {
    console.log('[ChatView] Closing chat view');
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
    
    // Header
    const chatHeader = mainContainer.createDiv('chat-header');
    const hamburgerButton = chatHeader.createEl('button', { cls: 'chat-hamburger-button' });
    hamburgerButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg>';
    hamburgerButton.setAttribute('aria-label', 'Toggle conversations');
    
    const chatTitle = chatHeader.createDiv('chat-title');
    chatTitle.textContent = 'AI Chat';
    
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
      newChatButton
    });
  }

  /**
   * Initialize business logic services
   */
  private initializeServices(): void {
    // Conversation management
    const conversationEvents: ConversationManagerEvents = {
      onConversationSelected: (conversation) => this.handleConversationSelected(conversation),
      onConversationsChanged: () => this.handleConversationsChanged(),
      onError: (message) => this.uiStateController.showError(message)
    };
    this.conversationManager = new ConversationManager(this.chatService, conversationEvents);

    // Message handling
    const messageEvents: MessageManagerEvents = {
      onMessageAdded: (message) => this.messageDisplay.addUserMessage(message.content),
      onStreamingUpdate: (messageId, content, isComplete) => 
        this.streamingController.updateStreamingMessage(messageId, content, !isComplete),
      onConversationUpdated: (conversation) => this.handleConversationUpdated(conversation),
      onLoadingStateChanged: (loading) => this.uiStateController.setInputLoading(loading),
      onError: (message) => this.uiStateController.showError(message)
    };
    this.messageManager = new MessageManager(this.chatService, messageEvents);

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
      onSidebarToggled: (visible) => console.log(`[ChatView] Sidebar toggled: ${visible}`)
    };
    this.uiStateController = new UIStateController(this.containerEl, uiStateEvents);
    this.streamingController = new StreamingController(this.containerEl);
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
      (messageId) => this.handleRetryMessage(messageId),
      (messageId, newContent) => this.handleEditMessage(messageId, newContent)
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
    this.uiStateController.setInputPlaceholder('Type your message...');
    this.updateContextProgress();
  }

  private handleConversationsChanged(): void {
    this.conversationList.setConversations(this.conversationManager.getConversations());
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
    console.log('[ChatView] Model changed:', model);
    this.updateContextProgress();
  }

  private handleAgentChanged(agent: AgentOption | null): void {
    console.log('[ChatView] Agent changed:', agent ? agent.name : 'No agent');
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

  // Element reference management (simple store/retrieve)
  private elementRefs: any = {};

  private storeElementReferences(refs: any): void {
    this.elementRefs = refs;
  }

  private getElementReferences(): any {
    return this.elementRefs;
  }

  private cleanup(): void {
    this.conversationList?.cleanup();
    this.messageDisplay?.cleanup();
    this.chatInput?.cleanup();
    this.modelSelector?.cleanup();
    this.agentSelector?.cleanup();
    this.contextProgressBar?.cleanup();
    this.uiStateController?.cleanup();
    this.streamingController?.cleanup();
  }
}