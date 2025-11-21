/**
 * MessageBubble - Individual message bubble component
 * Location: /src/ui/chat/components/MessageBubble.ts
 *
 * Renders user/AI messages with copy, retry, and edit actions.
 * Delegates rendering responsibilities to specialized classes following SOLID principles.
 *
 * Used by MessageDisplay to render individual messages in the chat interface.
 * Coordinates with ReferenceBadgeRenderer, ToolBubbleFactory, ToolEventParser,
 * MessageContentRenderer, and MessageEditController for specific concerns.
 */

import { ConversationMessage, MessageAlternativeBranch } from '../../../types/chat/ChatTypes';
import { ProgressiveToolAccordion } from './ProgressiveToolAccordion';
import { MessageBranchNavigator, MessageBranchNavigatorEvents } from './MessageBranchNavigator';
import { setIcon, Component, App } from 'obsidian';

// Extracted classes
import { ReferenceBadgeRenderer } from './renderers/ReferenceBadgeRenderer';
import { ToolBubbleFactory } from './factories/ToolBubbleFactory';
import { ToolEventParser } from '../utils/ToolEventParser';
import { MessageContentRenderer } from './renderers/MessageContentRenderer';
import { MessageEditController } from '../controllers/MessageEditController';

export class MessageBubble extends Component {
  private element: HTMLElement | null = null;
  private loadingInterval: any = null;
  private progressiveToolAccordions: Map<string, ProgressiveToolAccordion> = new Map();
  private messageBranchNavigator: MessageBranchNavigator | null = null;
  private actionContainer: HTMLElement | null = null;
  private toolBubbleElement: HTMLElement | null = null;
  private textBubbleElement: HTMLElement | null = null;
  private branchStatusElement: HTMLElement | null = null;
  private headerLoadingElement: HTMLElement | null = null;
  private navigatorContainer: HTMLElement | null = null;

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
  }

  /**
   * Create the message bubble element
   * For assistant messages with toolCalls, returns a fragment containing tool bubble + text bubble
   */
  createElement(): HTMLElement {
    const activeToolCalls = this.getActiveMessageToolCalls(this.message);
    const hasToolCalls = this.message.role === 'assistant' && activeToolCalls && activeToolCalls.length > 0;
    const toolCallMessage = hasToolCalls
      ? { ...this.message, toolCalls: activeToolCalls }
      : this.message;

    if (hasToolCalls) {
      const wrapper = document.createElement('div');
      wrapper.addClass('message-group');
      wrapper.setAttribute('data-message-id', this.message.id);

      // Create tool bubble using factory
      this.toolBubbleElement = ToolBubbleFactory.createToolBubble({
        message: toolCallMessage,
        parseParameterValue: ToolEventParser.parseParameterValue,
        getToolCallArguments: ToolEventParser.getToolCallArguments,
        progressiveToolAccordions: this.progressiveToolAccordions
      });
      if (!this.toolBubbleElement) {
        console.warn('[MessageBubble] Tool bubble element not created for message', this.message.id);
      }
      wrapper.appendChild(this.toolBubbleElement);

      // Create text bubble if there's content
      if (this.message.content && this.message.content.trim()) {
        this.textBubbleElement = ToolBubbleFactory.createTextBubble(
          this.message,
          (container, content) => this.renderContent(container, content),
          this.onCopy,
          (button) => this.showCopyFeedback(button),
          this.messageBranchNavigator,
          this.onMessageAlternativeChanged
        );
        wrapper.appendChild(this.textBubbleElement);
      }

      const actions = wrapper.createDiv('message-actions-external');
      this.createActionButtons(actions, wrapper);

      this.element = wrapper;
      this.renderHeaderThinking(this.getActiveBranch(this.message));
      this.syncNavigator(); // Sync navigator based on message state
      return wrapper;
    }

    // Normal single bubble for user messages or assistant without tools
    const messageContainer = document.createElement('div');
    messageContainer.addClass('message-container');
    messageContainer.addClass(`message-${this.message.role}`);
    messageContainer.setAttribute('data-message-id', this.message.id);

    const bubble = messageContainer.createDiv('message-bubble');

    // Message header with role icon only
    const header = bubble.createDiv('message-header');
    const roleIcon = header.createDiv('message-role-icon');
    if (this.message.role === 'user') {
      setIcon(roleIcon, 'user');
    } else if (this.message.role === 'tool') {
      setIcon(roleIcon, 'wrench');
    } else {
      setIcon(roleIcon, 'bot');
    }

    // Add loading state in header if AI message is loading
    if (this.message.role === 'assistant' && this.message.isLoading) {
      const loadingSpan = header.createEl('span', { cls: 'ai-loading-header' });
      loadingSpan.innerHTML = 'Thinking<span class="dots">...</span>';
      this.startLoadingAnimation(loadingSpan);
      this.headerLoadingElement = loadingSpan;
    }

    // Message content
    const content = bubble.createDiv('message-content');
    const activeContent = this.getActiveMessageContent(this.message);
    this.renderContent(content, activeContent).catch(error => {
      console.error('[MessageBubble] Error rendering initial content:', error);
    });

    // Create actions - inside bubble for assistant, outside for user/tool
    const actions = this.message.role === 'assistant'
      ? bubble.createDiv('message-actions-external')
      : messageContainer.createDiv('message-actions-external');

    this.createActionButtons(actions, bubble);

    this.element = messageContainer;
    this.syncNavigator(); // Sync navigator based on message state
    return messageContainer;
  }

  /**
   * Create action buttons (edit, retry, copy, branch navigator)
   */
  private createActionButtons(actions: HTMLElement, bubble: HTMLElement): void {
    this.actionContainer = actions;
    if (this.message.role === 'user') {
      // Edit button for user messages
      if (this.onEdit) {
        const editBtn = actions.createEl('button', {
          cls: 'message-action-btn',
          attr: { title: 'Edit message' }
        });
        setIcon(editBtn, 'edit');
        editBtn.addEventListener('click', () => MessageEditController.handleEdit(this.message, this.element, this.onEdit!));
      }

      // Retry button for user messages
      const retryBtn = actions.createEl('button', {
        cls: 'message-action-btn',
        attr: { title: 'Retry message' }
      });
      setIcon(retryBtn, 'rotate-ccw');
      retryBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (this.onRetry) {
          this.onRetry(this.message.id);
        }
      });
    } else if (this.message.role === 'tool') {
      // Tool messages get minimal actions - just copy for debugging
      const copyBtn = actions.createEl('button', {
        cls: 'message-action-btn',
        attr: { title: 'Copy tool execution details' }
      });
      setIcon(copyBtn, 'copy');
      copyBtn.addEventListener('click', () => {
        this.showCopyFeedback(copyBtn);
        this.onCopy(this.message.id);
      });
    } else {
      // Only show copy button when message is complete (not streaming)
      // Only check if the ACTIVE branch is streaming, not all branches
      const activeBranch = this.getActiveBranch(this.message);
      const isStreaming = this.message.isLoading ||
                         (activeBranch ? activeBranch.status === 'streaming' : this.message.state === 'streaming');

      if (!isStreaming) {
        // Copy button for AI messages
        const copyBtn = actions.createEl('button', {
          cls: 'message-action-btn',
          attr: { title: 'Copy message' }
        });
        setIcon(copyBtn, 'copy');
        copyBtn.addEventListener('click', () => {
          this.showCopyFeedback(copyBtn);
          this.onCopy(this.message.id);
        });
      }
      // Navigator is managed by syncNavigator() - called after state changes
    }
  }

  /**
   * Render message content using enhanced markdown renderer
   */
  private async renderContent(container: HTMLElement, content: string): Promise<void> {
    // Skip rendering if loading with empty content
    if (this.message.isLoading && this.message.role === 'assistant' && !content.trim()) {
      return;
    }

    const referenceMetadata = ReferenceBadgeRenderer.getReferenceMetadata(this.message.metadata);
    await MessageContentRenderer.renderContent(container, content, this.app, this, referenceMetadata);
  }

  /**
   * Get the DOM element
   */
  getElement(): HTMLElement | null {
    return this.element;
  }

  /**
   * Start loading animation (animated dots)
   */
  private startLoadingAnimation(container: HTMLElement): void {
    const dotsElement = container.querySelector('.dots');
    if (dotsElement) {
      let dotCount = 0;
      this.loadingInterval = setInterval(() => {
        dotCount = (dotCount + 1) % 4;
        dotsElement.textContent = '.'.repeat(dotCount);
      }, 500);
    }
  }

  /**
   * Stop loading animation and remove loading UI
   */
  stopLoadingAnimation(): void {
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval);
      this.loadingInterval = null;
    }

    if (this.element) {
      const loadingElement = this.element.querySelector('.ai-loading-header');
      if (loadingElement) {
        loadingElement.remove();
      }
    }

    if (this.headerLoadingElement && this.headerLoadingElement.isConnected) {
      this.headerLoadingElement.remove();
      this.headerLoadingElement = null;
    }
  }

  /**
   * Update static message content
   */
  updateContent(content: string): void {
    if (!this.element) return;

    const contentElement = this.element.querySelector('.message-content');
    if (!contentElement) return;

    this.stopLoadingAnimation();

    // Preserve progressive accordions during content update
    const progressiveAccordions: HTMLElement[] = [];
    if (this.progressiveToolAccordions.size > 0) {
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
    if (this.progressiveToolAccordions.size > 0 && progressiveAccordions.length > 0) {
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

    console.log('[MessageBubble] updateWithNewMessage', {
      messageId: this.message.id,
      sameObject: this.message === newMessage,
      messageObjectChanged,
      oldActiveBranchId: this.message.activeAlternativeId,
      newActiveBranchId: newMessage.activeAlternativeId,
      oldToolCalls: this.getActiveMessageToolCalls(this.message)?.length,
      newToolCalls: this.getActiveMessageToolCalls(newMessage)?.length
    });

    // Capture previous state from OLD message object before updating reference
    const previousActiveBranchId = this.message.activeAlternativeId;
    const previousActiveBranch = this.getActiveBranch(this.message);
    const previousActiveBranchStatus = previousActiveBranch?.status;
    // Handle progressive accordion transition to static
    if (this.progressiveToolAccordions.size > 0 && newMessage.toolCalls) {
      const hasCompletedTools = newMessage.toolCalls.some(tc =>
        tc.result !== undefined || tc.success !== undefined
      );

      if (!hasCompletedTools) {
        this.message = newMessage;
        this.syncNavigator(); // Sync navigator state
        return;
      }
    }

    this.clearBranchStatus();
    this.message = newMessage;

    if (!this.element) return;
    const contentElement = this.element.querySelector('.message-content');
    if (!contentElement) return;

    contentElement.empty();

    const activeContent = this.getActiveMessageContent(newMessage);
    this.renderContent(contentElement as HTMLElement, activeContent).catch(error => {
      console.error('[MessageBubble] Error re-rendering content:', error);
    });
    // Get the NEW active branch from newMessage to detect changes
    const newActiveBranch = this.getActiveBranch(newMessage);
    const branchChanged = previousActiveBranchId !== newActiveBranch?.id;
    const branchStatusChanged = previousActiveBranchStatus !== newActiveBranch?.status;
    const isStreamingStatus = newActiveBranch?.status === 'streaming';

    console.log('[MessageBubble] Branch change check', {
      messageId: this.message.id,
      branchChanged,
      branchStatusChanged,
      isStreamingStatus,
      shouldReset: branchChanged || (branchStatusChanged && !isStreamingStatus)
    });

    // Reset tool bubble when branch changes (retry clicked) OR when status changes to complete/aborted
    const shouldResetToolBubble = branchChanged || (branchStatusChanged && !isStreamingStatus);
    if (shouldResetToolBubble) {
      console.log('[MessageBubble] Resetting tool bubble');
      this.resetToolBubble();
    }

    // Only render tool bubble if:
    // 1. We just reset it (state transition), OR
    // 2. Message object changed (immutable update)
    const shouldRenderToolBubble = shouldResetToolBubble || messageObjectChanged;

    // Check for tool calls in the NEW message
    const activeToolCalls = this.getActiveMessageToolCalls(newMessage);
    console.log('[MessageBubble] Tool calls check', {
      messageId: this.message.id,
      hasToolCalls: !!activeToolCalls,
      toolCallCount: activeToolCalls?.length,
      messageObjectChanged,
      shouldRenderToolBubble,
      willRender: shouldRenderToolBubble && newMessage.role === 'assistant' && activeToolCalls && activeToolCalls.length > 0
    });

    if (shouldRenderToolBubble && newMessage.role === 'assistant' && activeToolCalls && activeToolCalls.length > 0) {
      console.log('[MessageBubble] Rendering tool bubble content');
      this.renderToolBubbleContent(activeToolCalls);
    }
    this.renderBranchStatus(contentElement as HTMLElement, newActiveBranch);
    this.renderHeaderThinking(newActiveBranch);

    // Sync navigator state based on new message state
    this.syncNavigator();
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

    const activeBranch = this.getActiveBranch(this.message);

    // Only act if this is the active branch
    if (activeBranch?.id !== branchId) {
      return;
    }

    // Recreate action buttons with copy button and navigator
    if (this.actionContainer) {
      this.actionContainer.empty();
      this.destroyNavigator();

      const bubbleElement = this.element?.querySelector('.message-bubble');
      if (bubbleElement) {
        this.createActionButtons(this.actionContainer, bubbleElement as HTMLElement);
      }
    }

    // Sync navigator - now using fresh message with correct state
    this.syncNavigator();
  }

  /**
   * Handle tool events from MessageManager
   */
  handleToolEvent(event: 'detected' | 'updated' | 'started' | 'completed', data: any): void {
    const info = ToolEventParser.getToolEventInfo(data);
    const toolId = info.toolId;
    if (!toolId) {
      console.warn('[MessageBubble] Tool event missing ID:', data);
      return;
    }

    let accordion = this.progressiveToolAccordions.get(toolId);

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

      this.progressiveToolAccordions.set(toolId, accordion);
    }

    if (!accordion) {
      console.warn('[MessageBubble] No accordion found for tool:', toolId);
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
   */
  private createToolBubbleOnDemand(): void {
    if (this.toolBubbleElement) return;

    this.toolBubbleElement = ToolBubbleFactory.createToolBubbleOnDemand(this.message, this.element);
    if (!this.toolBubbleElement) {
      console.warn('[MessageBubble] Failed to create tool bubble on demand for message', this.message.id);
    }
  }

  /**
   * Get progressive tool accordions for external updates
   */
  getProgressiveToolAccordions(): Map<string, ProgressiveToolAccordion> {
    return this.progressiveToolAccordions;
  }

  /**
   * Get the active content for the message (original or alternative)
   * If we have an active branch, use branch content even if empty string
   */
  private getActiveMessageContent(message: ConversationMessage): string {
    // If we have an active branch, ALWAYS use branch content (even if empty string)
    // This prevents parent's content from showing during branch streaming
    if (message.activeAlternativeId && message.alternativeBranches) {
      const activeBranch = message.alternativeBranches.find(
        branch => branch.id === message.activeAlternativeId
      );
      if (activeBranch) {
        // Return branch content, with null coalescing to empty string
        return activeBranch.content ?? '';
      }
    }

    // Check legacy alternatives (same pattern - prefer alternative data)
    const activeIndex = message.activeAlternativeIndex || 0;

    if (activeIndex === 0) {
      return message.content;
    }

    if (message.alternatives && message.alternatives.length > 0) {
      const alternativeIndex = activeIndex - 1;
      if (alternativeIndex >= 0 && alternativeIndex < message.alternatives.length) {
        return message.alternatives[alternativeIndex].content;
      }
    }

    // Fallback to parent message content
    return message.content;
  }

  private getActiveMessageToolCalls(message: ConversationMessage): any[] | undefined {
    // If we have an active branch, ALWAYS use branch data (even if empty)
    // This prevents parent's tool calls from bleeding through during branch streaming
    if (message.activeAlternativeId && message.alternativeBranches) {
      const activeBranch = message.alternativeBranches.find(
        branch => branch.id === message.activeAlternativeId
      );
      if (activeBranch) {
        // Return branch toolCalls if it exists (even empty array)
        return activeBranch.toolCalls ?? [];
      }
    }

    // Check legacy alternatives (same pattern - prefer alternative data)
    const activeIndex = message.activeAlternativeIndex || 0;
    if (activeIndex > 0 && message.alternatives && message.alternatives.length >= activeIndex) {
      const alternative = message.alternatives[activeIndex - 1];
      return alternative.toolCalls ?? [];
    }

    // Only fallback to parent when NO active alternative
    return message.toolCalls;
  }

  private getActiveBranch(message: ConversationMessage): MessageAlternativeBranch | null {
    if (!message.activeAlternativeId || !message.alternativeBranches) {
      return null;
    }
    return message.alternativeBranches.find(branch => branch.id === message.activeAlternativeId) || null;
  }

  private resetToolBubble(): void {
    if (this.toolBubbleElement) {
      this.toolBubbleElement.remove();
      this.toolBubbleElement = null;
    }
    this.cleanupProgressiveAccordions();
  }

  private renderToolBubbleContent(toolCalls: any[]): void {
    if (!this.element || !this.element.classList.contains('message-group')) {
      return;
    }

    const toolCallMessage = {
      ...this.message,
      toolCalls
    };

    const newToolBubble = ToolBubbleFactory.createToolBubble({
      message: toolCallMessage,
      parseParameterValue: ToolEventParser.parseParameterValue,
      getToolCallArguments: ToolEventParser.getToolCallArguments,
      progressiveToolAccordions: this.progressiveToolAccordions
    });

    if (!newToolBubble) {
      return;
    }

    if (this.toolBubbleElement) {
      this.toolBubbleElement.replaceWith(newToolBubble);
    } else {
      this.element.insertBefore(newToolBubble, this.element.firstChild);
    }

    this.toolBubbleElement = newToolBubble;
  }

  private clearBranchStatus(): void {
    if (this.branchStatusElement) {
      this.branchStatusElement.remove();
      this.branchStatusElement = null;
    }
  }

  private renderBranchStatus(container: HTMLElement, branch: MessageAlternativeBranch | null): void {
    this.clearBranchStatus();
    // Avoid duplicate thinking indicators when the base message is already loading
    if (!branch || branch.status === 'complete' || this.message.isLoading) {
      return;
    }

    this.branchStatusElement = container.createDiv('branch-streaming-status');
    this.branchStatusElement.innerHTML = '<span class="ai-loading">Thinking<span class="dots">...</span></span>';
  }

  private renderHeaderThinking(branch: MessageAlternativeBranch | null): void {
    if (!this.element || this.message.role !== 'assistant') return;
    const shouldShow = this.message.isLoading || (branch !== null && branch.status === 'streaming');

    // Prefer the text bubble header (bot icon) when present
    const targetHeader =
      this.textBubbleElement?.querySelector('.message-header') ||
      this.element.querySelector('.message-container .message-header') ||
      this.element.querySelector('.message-header');

    if (!targetHeader) return;

    const existing = targetHeader.querySelector('.ai-loading-header');
    if (existing) {
      existing.remove();
    }

    if (!shouldShow) {
      return;
    }

    this.headerLoadingElement = targetHeader.createEl('span', { cls: 'ai-loading-header' });
    this.headerLoadingElement.innerHTML = 'Thinking<span class="dots">...</span>';
    this.startLoadingAnimation(this.headerLoadingElement);
  }

  /**
   * Show visual feedback when copy button is clicked
   */
  private showCopyFeedback(button: HTMLElement): void {
    const originalIcon = button.innerHTML;
    const originalTitle = button.getAttribute('title') || '';

    setIcon(button, 'check');
    button.setAttribute('title', 'Copied!');
    button.classList.add('copy-success');

    setTimeout(() => {
      button.innerHTML = originalIcon;
      button.setAttribute('title', originalTitle);
      button.classList.remove('copy-success');
    }, 1500);
  }

  /**
   * Clean up progressive tool accordions
   */
  private cleanupProgressiveAccordions(): void {
    this.progressiveToolAccordions.forEach(accordion => {
      const element = accordion.getElement();
      if (element) {
        element.remove();
      }
      accordion.cleanup();
    });

    this.progressiveToolAccordions.clear();
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stopLoadingAnimation();
    this.cleanupProgressiveAccordions();
    this.destroyNavigator();
    this.element = null;
  }

  /**
   * STATE-DRIVEN NAVIGATOR MANAGEMENT
   * Single source of truth for navigator lifecycle
   */

  /**
   * Determine if navigator should be visible based on current message state
   */
  private shouldShowNavigator(): boolean {
    // Only assistant messages can have alternatives
    if (this.message.role !== 'assistant') {
      return false;
    }

    // Must have alternatives to show navigator
    const hasAlternatives = (this.message.alternativeBranches?.length ?? 0) > 0 ||
                           (this.message.alternatives?.length ?? 0) > 0;
    if (!hasAlternatives) {
      return false;
    }

    // Don't show during streaming - only check the ACTIVE branch/message, not all branches
    const activeBranch = this.getActiveBranch(this.message);
    const isStreaming = this.message.isLoading ||
                       (activeBranch ? activeBranch.status === 'streaming' : this.message.state === 'streaming');

    return !isStreaming;
  }

  /**
   * Sync navigator state with message state
   * Call this whenever message state changes
   */
  private syncNavigator(): void {
    const shouldShow = this.shouldShowNavigator();

    if (shouldShow && !this.messageBranchNavigator) {
      // Create navigator
      this.createNavigator();
    } else if (!shouldShow && this.messageBranchNavigator) {
      // Destroy navigator
      this.destroyNavigator();
    } else if (shouldShow && this.messageBranchNavigator) {
      // Update existing navigator
      this.messageBranchNavigator.updateMessage(this.message);
    }
  }

  /**
   * Create the navigator component
   */
  private createNavigator(): void {
    if (!this.actionContainer) {
      return;
    }

    const navigatorEvents: MessageBranchNavigatorEvents = {
      onAlternativeChanged: (messageId, alternativeIndex) => {
        if (this.onMessageAlternativeChanged) {
          this.onMessageAlternativeChanged(messageId, alternativeIndex);
        }
      },
      onError: (message) => console.error('[MessageBubble] Branch navigation error:', message)
    };

    // Create or reuse navigator container
    if (!this.navigatorContainer) {
      this.navigatorContainer = this.actionContainer.createDiv('message-branch-navigator-container');
      this.actionContainer.prepend(this.navigatorContainer);
    }

    this.messageBranchNavigator = new MessageBranchNavigator(this.navigatorContainer, navigatorEvents);
    this.messageBranchNavigator.updateMessage(this.message);
  }

  /**
   * Destroy the navigator component
   */
  private destroyNavigator(): void {
    if (this.messageBranchNavigator) {
      this.messageBranchNavigator.destroy();
      this.messageBranchNavigator = null;
    }

    if (this.navigatorContainer) {
      this.navigatorContainer.remove();
      this.navigatorContainer = null;
    }
  }
}
