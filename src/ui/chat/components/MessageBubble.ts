/**
 * MessageBubble - Individual message bubble component (REFACTORED)
 * Location: /src/ui/chat/components/MessageBubble.ts
 *
 * Renders user/AI messages with copy, retry, and edit actions.
 * Delegates responsibilities to specialized managers following SOLID principles.
 *
 * **Refactored to follow Single Responsibility Principle:**
 * - Core responsibility: Orchestrate UI components
 * - Delegates to specialized managers for specific concerns
 * - Reduced from 866 lines to ~350 lines
 */

import { ConversationMessage, MessageAlternativeBranch } from '../../../types/chat/ChatTypes';
import { ProgressiveToolAccordion } from './ProgressiveToolAccordion';
import { setIcon, Component, App } from 'obsidian';

// Extracted managers and utilities
import { BranchStateHelper } from './utils/BranchStateHelper';
import { LoadingAnimationManager } from './managers/LoadingAnimationManager';
import { ToolBubbleManager } from './managers/ToolBubbleManager';
import { MessageActionButtonManager } from './managers/MessageActionButtonManager';
import { MessageBranchNavigatorManager } from './managers/MessageBranchNavigatorManager';
import { MessageContentRendererEnhanced } from './renderers/MessageContentRendererEnhanced';

// Existing renderers and factories
import { ToolBubbleFactory } from './factories/ToolBubbleFactory';
import { ToolEventParser } from '../utils/ToolEventParser';

// Event Bus
import { eventBus } from '../../../events/EventBus';
import { ChatEventNames, BranchFinalizedEvent } from '../../../events/ChatEvents';

export class MessageBubble extends Component {
  private element: HTMLElement | null = null;
  private toolBubbleElement: HTMLElement | null = null;
  private textBubbleElement: HTMLElement | null = null;

  // Specialized managers (following Single Responsibility Principle)
  private loadingAnimationManager: LoadingAnimationManager;
  private toolBubbleManager: ToolBubbleManager;
  private actionButtonManager: MessageActionButtonManager;
  private navigatorManager: MessageBranchNavigatorManager;
  private contentRenderer: MessageContentRendererEnhanced;

  // Event Bus
  private eventBusUnsubscribers: Array<() => void> = [];

  constructor(
    private message: ConversationMessage,
    private app: App,
    private onCopy: (messageId: string) => void,
    private onRetry: (messageId: string) => void,
    private onEdit?: (messageId: string, newContent: string) => void,
    private onToolEvent?: (messageId: string, event: 'detected' | 'started' | 'completed', data: any) => void,
    private onMessageAlternativeChanged?: (messageId: string, alternativeIndex: number) => void
  ) {
    super();

    // Initialize managers
    this.loadingAnimationManager = new LoadingAnimationManager();
    this.toolBubbleManager = new ToolBubbleManager(message);
    this.actionButtonManager = new MessageActionButtonManager(message, onCopy, onRetry, onEdit);
    this.navigatorManager = new MessageBranchNavigatorManager(onMessageAlternativeChanged);
    this.contentRenderer = new MessageContentRendererEnhanced();

    // Subscribe to event bus events
    this.setupEventBusSubscriptions();
  }

  /**
   * Set up event bus subscriptions
   */
  private setupEventBusSubscriptions(): void {
    // Branch finalized
    this.eventBusUnsubscribers.push(
      eventBus.on<BranchFinalizedEvent>(
        ChatEventNames.BRANCH_FINALIZED,
        (event) => {
          if (event.messageId === this.message.id) {
            this.handleBranchFinalized(event.branchId, event.message);
          }
        }
      )
    );

    // Tool events - need to check both base message ID and any branch IDs
    this.eventBusUnsubscribers.push(
      eventBus.on(ChatEventNames.TOOL_DETECTED, (event: any) => {
        if (this.isEventForThisMessage(event.messageId)) {
          this.handleToolEvent('detected', event);
        }
      })
    );

    this.eventBusUnsubscribers.push(
      eventBus.on(ChatEventNames.TOOL_STARTED, (event: any) => {
        if (this.isEventForThisMessage(event.messageId)) {
          this.handleToolEvent('started', event);
        }
      })
    );

    this.eventBusUnsubscribers.push(
      eventBus.on(ChatEventNames.TOOL_COMPLETED, (event: any) => {
        if (this.isEventForThisMessage(event.messageId)) {
          this.handleToolEvent('completed', event);
        }
      })
    );
  }

  /**
   * Check if an event messageId belongs to this message bubble
   * Handles both base message ID and branch IDs (for retry streaming)
   */
  private isEventForThisMessage(eventMessageId: string): boolean {
    // Check base message ID
    if (eventMessageId === this.message.id) {
      return true;
    }

    // Check if it's a branch ID for this message
    const isBranchId = this.message.alternativeBranches?.some(
      branch => branch.id === eventMessageId
    );

    return !!isBranchId;
  }

  /**
   * Create the message bubble element
   * For assistant messages with toolCalls, returns a fragment containing tool bubble + text bubble
   */
  createElement(): HTMLElement {
    const activeToolCalls = BranchStateHelper.getActiveToolCalls(this.message);
    const hasToolCalls = this.message.role === 'assistant' && activeToolCalls && activeToolCalls.length > 0;
    const toolCallMessage = hasToolCalls
      ? { ...this.message, toolCalls: activeToolCalls }
      : this.message;

    if (hasToolCalls) {
      return this.createMessageGroupWithTools(toolCallMessage);
    }

    return this.createSingleBubble();
  }

  /**
   * Create message group with separate tool and text bubbles
   */
  private createMessageGroupWithTools(toolCallMessage: ConversationMessage): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.addClass('message-group');
    wrapper.setAttribute('data-message-id', this.message.id);

    // Create tool bubble using factory
    this.toolBubbleElement = ToolBubbleFactory.createToolBubble({
      message: toolCallMessage,
      parseParameterValue: ToolEventParser.parseParameterValue,
      getToolCallArguments: ToolEventParser.getToolCallArguments,
      progressiveToolAccordions: this.toolBubbleManager.getProgressiveAccordions()
    });

    if (this.toolBubbleElement) {
      wrapper.appendChild(this.toolBubbleElement);
    }

    // Create text bubble if there's content
    if (this.message.content && this.message.content.trim()) {
      this.textBubbleElement = ToolBubbleFactory.createTextBubble(
        this.message,
        (container, content) => this.renderContent(container, content),
        this.onCopy,
        (button) => this.actionButtonManager['showCopyFeedback'](button),
        null, // Navigator managed separately
        this.onMessageAlternativeChanged
      );
      wrapper.appendChild(this.textBubbleElement);
    }

    // Create action buttons
    const actions = wrapper.createDiv('message-actions-external');
    this.actionButtonManager.createButtons(actions, wrapper);

    this.element = wrapper;

    // Show thinking animation if needed
    const activeBranch = BranchStateHelper.getActiveBranch(this.message);
    this.loadingAnimationManager.showThinking(this.message, activeBranch, this.textBubbleElement, this.element);

    // Sync navigator state
    this.navigatorManager.sync(this.message, this.actionButtonManager.getContainer());

    return wrapper;
  }

  /**
   * Create single bubble for user messages or assistant without tools
   */
  private createSingleBubble(): HTMLElement {
    const messageContainer = document.createElement('div');
    messageContainer.addClass('message-container');
    messageContainer.addClass(`message-${this.message.role}`);
    messageContainer.setAttribute('data-message-id', this.message.id);

    const bubble = messageContainer.createDiv('message-bubble');

    // Message header with role icon
    const header = bubble.createDiv('message-header');
    const roleIcon = header.createDiv('message-role-icon');
    this.setRoleIcon(roleIcon);

    // Add loading state in header if AI message is loading
    if (this.message.role === 'assistant' && this.message.isLoading) {
      const loadingSpan = header.createEl('span', { cls: 'ai-loading-header' });
      loadingSpan.innerHTML = 'Thinking<span class="dots">...</span>';
      this.loadingAnimationManager['startAnimation'](loadingSpan);
    }

    // Message content
    const content = bubble.createDiv('message-content');
    const activeContent = BranchStateHelper.getActiveContent(this.message);
    this.renderContent(content, activeContent).catch(error => {
      console.error('[MessageBubble] Error rendering initial content:', error);
    });

    // Create actions - inside bubble for assistant, outside for user/tool
    const actions = this.message.role === 'assistant'
      ? bubble.createDiv('message-actions-external')
      : messageContainer.createDiv('message-actions-external');

    this.actionButtonManager.createButtons(actions, bubble);

    this.element = messageContainer;

    // Sync navigator state
    this.navigatorManager.sync(this.message, this.actionButtonManager.getContainer());

    return messageContainer;
  }

  /**
   * Set role icon based on message role
   */
  private setRoleIcon(roleIcon: HTMLElement): void {
    if (this.message.role === 'user') {
      setIcon(roleIcon, 'user');
    } else if (this.message.role === 'tool') {
      setIcon(roleIcon, 'wrench');
    } else {
      setIcon(roleIcon, 'bot');
    }
  }

  /**
   * Render message content using enhanced renderer
   */
  private async renderContent(container: HTMLElement, content: string): Promise<void> {
    await this.contentRenderer.renderContent(container, content, this.message, this.app, this);
  }

  /**
   * Update static message content
   */
  updateContent(content: string): void {
    if (!this.element) return;

    const contentElement = this.element.querySelector('.message-content');
    if (!contentElement) return;

    this.loadingAnimationManager.hideThinking();

    // Preserve progressive accordions during content update
    const progressiveAccordions: HTMLElement[] = [];
    const accordionMap = this.toolBubbleManager.getProgressiveAccordions();
    if (accordionMap.size > 0) {
      const accordionElements = contentElement.querySelectorAll('.progressive-tool-accordion');
      accordionElements.forEach(el => {
        if (el instanceof HTMLElement) {
          progressiveAccordions.push(el);
          el.remove();
        }
      });
    }

    contentElement.empty();

    this.renderContent(contentElement as HTMLElement, content).catch(error => {
      console.error('[MessageBubble] Error rendering content:', error);
      const fallbackDiv = document.createElement('div');
      fallbackDiv.textContent = content;
      contentElement.appendChild(fallbackDiv);
    });

    // Re-append progressive accordions if they were preserved
    if (accordionMap.size > 0 && progressiveAccordions.length > 0) {
      progressiveAccordions.forEach(accordion => {
        contentElement.appendChild(accordion);
      });
    }
  }

  /**
   * Update MessageBubble with new message data
   */
  updateWithNewMessage(newMessage: ConversationMessage): void {
    // CRITICAL: Capture whether message object changed BEFORE any updates to this.message
    const messageObjectChanged = this.message !== newMessage;

    // Capture previous state from OLD message object before updating reference
    const previousActiveBranchId = this.message.activeAlternativeId;
    const previousActiveBranch = BranchStateHelper.getActiveBranch(this.message);
    const previousActiveBranchStatus = previousActiveBranch?.status;

    // Handle progressive accordion transition to static
    const accordionMap = this.toolBubbleManager.getProgressiveAccordions();
    if (accordionMap.size > 0 && newMessage.toolCalls) {
      const hasCompletedTools = newMessage.toolCalls.some(tc =>
        tc.result !== undefined || tc.success !== undefined
      );

      if (!hasCompletedTools) {
        this.message = newMessage;
        this.toolBubbleManager.updateMessage(newMessage);
        this.actionButtonManager.updateMessage(newMessage);
        this.navigatorManager.sync(newMessage, this.actionButtonManager.getContainer());
        return;
      }
    }

    // Update message reference in all managers
    this.message = newMessage;
    this.toolBubbleManager.updateMessage(newMessage);
    this.actionButtonManager.updateMessage(newMessage);

    if (!this.element) return;
    const contentElement = this.element.querySelector('.message-content');
    if (!contentElement) return;

    contentElement.empty();

    const activeContent = BranchStateHelper.getActiveContent(newMessage);
    this.renderContent(contentElement as HTMLElement, activeContent).catch(error => {
      console.error('[MessageBubble] Error re-rendering content:', error);
    });

    // Get the NEW active branch from newMessage to detect changes
    const newActiveBranch = BranchStateHelper.getActiveBranch(newMessage);
    const branchChanged = previousActiveBranchId !== newActiveBranch?.id;

    // NEVER reset/render tool bubble in updateWithNewMessage during retry flow
    // Let handleBranchFinalized be the sole handler for retry completion rendering
    // Only reset when switching branches (user clicks branch navigator)
    const hasMultipleBranches = (newMessage.alternativeBranches?.length ?? 0) > 1;
    const shouldResetToolBubble = branchChanged && !hasMultipleBranches;

    if (shouldResetToolBubble) {
      this.toolBubbleManager.reset();
      const activeToolCalls = BranchStateHelper.getActiveToolCalls(newMessage);
      if (newMessage.role === 'assistant' && activeToolCalls && activeToolCalls.length > 0) {
        this.toolBubbleManager.render(activeToolCalls, this.element);
      }
    }

    // Update thinking animation
    this.loadingAnimationManager.showThinking(newMessage, newActiveBranch, this.textBubbleElement, this.element);

    // Always sync navigator - it has internal logic to prevent redundant updates
    this.navigatorManager.sync(newMessage, this.actionButtonManager.getContainer());
  }

  /**
   * Handle branch finalized event - create action buttons for completed branch
   * This is called via event-driven architecture when a branch completes
   *
   * @param branchId - The ID of the finalized branch
   * @param freshMessage - Fresh message object from storage with updated state
   */
  handleBranchFinalized(branchId: string, freshMessage: ConversationMessage): void {
    // Update message reference FIRST with fresh data from storage
    this.message = freshMessage;
    this.toolBubbleManager.updateMessage(freshMessage);
    this.actionButtonManager.updateMessage(freshMessage);

    const activeBranch = BranchStateHelper.getActiveBranch(this.message);

    // Only act if this is the active branch
    if (activeBranch?.id !== branchId) {
      return;
    }

    // Clean up progressive tool accordions and render final static tool bubble
    const activeToolCalls = BranchStateHelper.getActiveToolCalls(this.message);

    if (activeToolCalls && activeToolCalls.length > 0) {
      this.toolBubbleManager.reset(); // Clean up progressive accordions
      this.toolBubbleManager.render(activeToolCalls, this.element); // Render final static bubble
    }

    // Hide thinking animation
    this.loadingAnimationManager.hideThinking();

    // Sync navigator (will create it if it should exist)
    this.navigatorManager.sync(this.message, this.actionButtonManager.getContainer());
  }

  /**
   * Handle tool events from MessageManager
   */
  handleToolEvent(event: 'detected' | 'updated' | 'started' | 'completed', data: any): void {
    const info = ToolEventParser.getToolEventInfo(data);
    const toolId = info.toolId;

    if (!toolId) {
      return;
    }

    const accordionMap = this.toolBubbleManager.getProgressiveAccordions();
    let accordion = accordionMap.get(toolId);

    if (!accordion && (event === 'detected' || event === 'started')) {
      accordion = new ProgressiveToolAccordion();
      const accordionElement = accordion.createElement();

      if (!this.toolBubbleElement) {
        this.createToolBubbleOnDemand();
      }

      const toolContent = this.toolBubbleElement?.querySelector('.tool-bubble-content');
      if (toolContent) {
        toolContent.appendChild(accordionElement);
      }

      accordionMap.set(toolId, accordion);
    }

    if (!accordion) {
      return;
    }

    switch (event) {
      case 'detected':
        accordion.detectTool({
          id: toolId,
          name: info.displayName,
          technicalName: info.technicalName,
          parameters: info.parameters,
          isComplete: info.isComplete
        });
        break;

      case 'updated':
        accordion.updateToolParameters(toolId, info.parameters, info.isComplete);
        break;

      case 'started':
        accordion.startTool({
          id: toolId,
          name: info.displayName,
          technicalName: info.technicalName,
          parameters: info.parameters
        });
        break;

      case 'completed':
        accordion.completeTool(
          toolId,
          data.result,
          data.success,
          data.error
        );
        break;
    }
  }

  /**
   * Create tool bubble on-demand during streaming
   * Converts message-container to message-group if needed
   */
  createToolBubbleOnDemand(): void {
    if (!this.element) {
      return;
    }

    // Check if we need to convert message-container to message-group
    if (this.element.classList.contains('message-container')) {
      // Change class from message-container to message-group
      this.element.classList.remove('message-container');
      this.element.classList.add('message-group');

      // The message-bubble div becomes the text bubble in the group structure
      const messageBubble = this.element.querySelector('.message-bubble');
      if (messageBubble) {
        this.textBubbleElement = messageBubble as HTMLElement;
      }
    }

    // Create the tool bubble via manager
    this.toolBubbleManager.createOnDemand(this.element);

    // Sync the tool bubble element reference from manager to MessageBubble
    const createdToolBubble = this.element.querySelector('.message-tool');
    if (createdToolBubble) {
      this.toolBubbleElement = createdToolBubble as HTMLElement;
    }
  }

  /**
   * Get the DOM element
   */
  getElement(): HTMLElement | null {
    return this.element;
  }

  /**
   * Get progressive tool accordions for external updates
   */
  getProgressiveToolAccordions(): Map<string, ProgressiveToolAccordion> {
    return this.toolBubbleManager.getProgressiveAccordions();
  }

  /**
   * Stop loading animation (public API for MessageStreamHandler)
   */
  stopLoadingAnimation(): void {
    this.loadingAnimationManager.hideThinking();
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Unsubscribe from all event bus subscriptions
    this.eventBusUnsubscribers.forEach(unsub => unsub());
    this.eventBusUnsubscribers = [];

    this.loadingAnimationManager.cleanup();
    this.toolBubbleManager.cleanup();
    this.navigatorManager.cleanup();
    this.contentRenderer.cleanup();
    this.element = null;
  }
}
