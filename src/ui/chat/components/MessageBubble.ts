/**
 * MessageBubble - Individual message bubble component
 * 
 * Renders user/AI messages with copy, retry, and edit actions
 */

import { ConversationMessage } from '../../../types/chat/ChatTypes';
import { ProgressiveToolAccordion } from './ProgressiveToolAccordion';
import { MessageBranchNavigator, MessageBranchNavigatorEvents } from './MessageBranchNavigator';
import { MarkdownRenderer } from '../utils/MarkdownRenderer';
import { setIcon, Component, App } from 'obsidian';

export class MessageBubble extends Component {
  private element: HTMLElement | null = null;
  private loadingInterval: any = null;
  private progressiveToolAccordions: Map<string, ProgressiveToolAccordion> = new Map(); // Keyed by tool.id
  private messageBranchNavigator: MessageBranchNavigator | null = null;
  private toolBubbleElement: HTMLElement | null = null; // Separate tool bubble
  private textBubbleElement: HTMLElement | null = null; // Separate text bubble

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
    // Check if we need to split into tool bubble + text bubble
    const hasToolCalls = this.message.role === 'assistant' && this.message.toolCalls && this.message.toolCalls.length > 0;

    if (hasToolCalls) {
      // Create a wrapper fragment that will hold both bubbles
      const wrapper = document.createElement('div');
      wrapper.addClass('message-group');
      wrapper.setAttribute('data-message-id', this.message.id);

      // Create tool bubble
      this.toolBubbleElement = this.createToolBubble();
      wrapper.appendChild(this.toolBubbleElement);

      // Create text bubble (if there's content)
      if (this.message.content && this.message.content.trim()) {
        this.textBubbleElement = this.createTextBubble();
        wrapper.appendChild(this.textBubbleElement);
      }

      this.element = wrapper;
      return wrapper;
    }

    // Normal single bubble for user messages or assistant without tools
    const messageContainer = document.createElement('div');
    messageContainer.addClass('message-container');
    messageContainer.addClass(`message-${this.message.role}`);
    messageContainer.setAttribute('data-message-id', this.message.id);

    // Create the actual bubble
    const bubble = messageContainer.createDiv('message-bubble');

    // Message header with role icon only
    const header = bubble.createDiv('message-header');

    // Role icon
    const roleIcon = header.createDiv('message-role-icon');
    if (this.message.role === 'user') {
      setIcon(roleIcon, 'user');
    } else if (this.message.role === 'tool') {
      setIcon(roleIcon, 'wrench');
    } else {
      setIcon(roleIcon, 'bot');
    }

    // Add loading state in header if AI message is loading with empty content
    if (this.message.role === 'assistant' && this.message.isLoading && !this.message.content.trim()) {
      const loadingSpan = header.createEl('span', { cls: 'ai-loading-header' });
      loadingSpan.innerHTML = 'Thinking<span class="dots">...</span>';
      this.startLoadingAnimation(loadingSpan);
    }

    // Message content
    const content = bubble.createDiv('message-content');
    
    // Render content with enhanced markdown support (use active alternative if any)
    const activeContent = this.getActiveMessageContent(this.message);
    this.renderContent(content, activeContent).catch(error => {
      console.error('[MessageBubble] Error rendering initial content:', error);
    });

    // Actions outside and underneath the bubble, justified right
    const actions = messageContainer.createDiv('message-actions-external');
    
    if (this.message.role === 'user') {
      // Edit button for user messages
      if (this.onEdit) {
        const editBtn = actions.createEl('button', { 
          cls: 'message-action-btn',
          attr: { title: 'Edit message' }
        });
        setIcon(editBtn, 'edit');
        editBtn.addEventListener('click', () => this.handleEdit());
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
        } else {
          console.error('[MessageBubble] onRetry callback is null/undefined!');
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
      
      // Message branch navigator for AI messages with alternatives
      if (this.message.alternatives && this.message.alternatives.length > 0) {
        const navigatorContainer = actions.createDiv('message-branch-navigator-container');
        
        const navigatorEvents: MessageBranchNavigatorEvents = {
          onAlternativeChanged: (messageId, alternativeIndex) => {
            if (this.onMessageAlternativeChanged) {
              this.onMessageAlternativeChanged(messageId, alternativeIndex);
            }
          },
          onError: (message) => console.error('[MessageBubble] Branch navigation error:', message)
        };
        
        this.messageBranchNavigator = new MessageBranchNavigator(navigatorContainer, navigatorEvents);
        this.messageBranchNavigator.updateMessage(this.message);
      }
    }

    this.element = messageContainer;
    return messageContainer;
  }

  /**
   * Create tool bubble containing multiple tool accordions
   */
  private createToolBubble(): HTMLElement {
    const toolContainer = document.createElement('div');
    toolContainer.addClass('message-container');
    toolContainer.addClass('message-tool');
    toolContainer.setAttribute('data-message-id', `${this.message.id}_tools`);

    const bubble = toolContainer.createDiv('message-bubble tool-bubble');

    // Header with wrench icon
    const header = bubble.createDiv('message-header');
    const roleIcon = header.createDiv('message-role-icon');
    setIcon(roleIcon, 'wrench');

    // Content area for tool accordions
    const content = bubble.createDiv('tool-bubble-content');

    // Create one ProgressiveToolAccordion per tool
    if (this.message.toolCalls) {
      this.message.toolCalls.forEach(toolCall => {
        const accordion = new ProgressiveToolAccordion();
        const accordionEl = accordion.createElement();

        // Initialize accordion with completed state from JSON
        accordion.detectTool({
          id: toolCall.id,
          name: toolCall.name || toolCall.function?.name || 'Unknown Tool',
          parameters: toolCall.parameters,
          isComplete: true
        });

        // If tool has results, mark as completed
        if (toolCall.result !== undefined || toolCall.success !== undefined) {
          accordion.completeTool(
            toolCall.id,
            toolCall.result,
            toolCall.success !== false,
            toolCall.error
          );
        }

        content.appendChild(accordionEl);
        this.progressiveToolAccordions.set(toolCall.id, accordion);
      });
    }

    return toolContainer;
  }

  /**
   * Create text bubble containing only the assistant response text
   */
  private createTextBubble(): HTMLElement {
    const messageContainer = document.createElement('div');
    messageContainer.addClass('message-container');
    messageContainer.addClass('message-assistant');
    messageContainer.setAttribute('data-message-id', `${this.message.id}_text`);

    const bubble = messageContainer.createDiv('message-bubble');

    // Header with bot icon
    const header = bubble.createDiv('message-header');
    const roleIcon = header.createDiv('message-role-icon');
    setIcon(roleIcon, 'bot');

    // Message content
    const content = bubble.createDiv('message-content');

    // Render content with enhanced markdown support
    const activeContent = this.getActiveMessageContent(this.message);
    this.renderContent(content, activeContent).catch(error => {
      console.error('[MessageBubble] Error rendering text bubble content:', error);
    });

    // Actions for text bubble
    const actions = messageContainer.createDiv('message-actions-external');

    // Copy button
    const copyBtn = actions.createEl('button', {
      cls: 'message-action-btn',
      attr: { title: 'Copy message' }
    });
    setIcon(copyBtn, 'copy');
    copyBtn.addEventListener('click', () => {
      this.showCopyFeedback(copyBtn);
      this.onCopy(this.message.id);
    });

    // Message branch navigator for messages with alternatives
    if (this.message.alternatives && this.message.alternatives.length > 0) {
      const navigatorContainer = actions.createDiv('message-branch-navigator-container');

      const navigatorEvents: MessageBranchNavigatorEvents = {
        onAlternativeChanged: (messageId, alternativeIndex) => {
          if (this.onMessageAlternativeChanged) {
            this.onMessageAlternativeChanged(messageId, alternativeIndex);
          }
        },
        onError: (message) => console.error('[MessageBubble] Branch navigation error:', message)
      };

      this.messageBranchNavigator = new MessageBranchNavigator(navigatorContainer, navigatorEvents);
      this.messageBranchNavigator.updateMessage(this.message);
    }

    return messageContainer;
  }

  /**
   * Render message content using enhanced markdown renderer
   */
  private async renderContent(container: HTMLElement, content: string): Promise<void> {
    // Skip rendering if loading with empty content (loading is shown in header)
    if (this.message.isLoading && this.message.role === 'assistant' && !content.trim()) {
      return;
    }

    // Use enhanced markdown renderer with Obsidian's native rendering
    try {
      await MarkdownRenderer.renderMarkdown(content, container, this.app, this);
    } catch (error) {
      console.error('[MessageBubble] Error rendering markdown:', error);
      // Fallback to plain text
      const pre = container.createEl('pre');
      pre.style.whiteSpace = 'pre-wrap';
      pre.textContent = content;
    }

    // Tool calls are now rendered separately in createToolBubble() or via handleToolEvent()
  }



  /**
   * Handle edit functionality
   */
  private handleEdit(): void {
    if (!this.onEdit || !this.element) return;
    
    const contentDiv = this.element.querySelector('.message-bubble .message-content');
    if (!contentDiv) return;

    // Create textarea for editing
    const textarea = document.createElement('textarea');
    textarea.className = 'message-edit-textarea';
    textarea.value = this.message.content;
    textarea.style.width = '100%';
    textarea.style.minHeight = '60px';
    textarea.style.resize = 'vertical';
    
    // Create edit controls
    const editControls = document.createElement('div');
    editControls.className = 'message-edit-controls';
    
    const saveBtn = editControls.createEl('button', {
      text: 'Save',
      cls: 'message-edit-save'
    });
    
    const cancelBtn = editControls.createEl('button', {
      text: 'Cancel', 
      cls: 'message-edit-cancel'
    });
    
    // Store original content
    const originalContent = contentDiv.innerHTML;
    
    // Replace content with edit interface
    contentDiv.empty();
    contentDiv.appendChild(textarea);
    contentDiv.appendChild(editControls);
    
    // Focus textarea
    textarea.focus();
    
    // Save handler
    saveBtn.addEventListener('click', () => {
      const newContent = textarea.value.trim();
      if (newContent && newContent !== this.message.content) {
        this.onEdit!(this.message.id, newContent);
      }
      this.exitEditMode(contentDiv, originalContent);
    });
    
    // Cancel handler
    cancelBtn.addEventListener('click', () => {
      this.exitEditMode(contentDiv, originalContent);
    });
    
    // ESC key handler
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.exitEditMode(contentDiv, originalContent);
      }
    });
  }

  /**
   * Exit edit mode and restore original content
   */
  private exitEditMode(contentDiv: Element, originalContent: string): void {
    contentDiv.innerHTML = originalContent;
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

    // Remove the "Thinking..." element from the header
    if (this.element) {
      const loadingElement = this.element.querySelector('.ai-loading-header');
      if (loadingElement) {
        loadingElement.remove();
      }
    }
  }

  /**
   * Update static message content - MessageBubble now handles final content only
   * Streaming is handled by StreamingController
   */
  updateContent(content: string): void {
    if (!this.element) return;

    const contentElement = this.element.querySelector('.message-content');
    if (!contentElement) return;

    // Stop any loading animations
    this.stopLoadingAnimation();

    // If we have progressive accordions, preserve them during content update
    // Save reference to progressive accordion elements before clearing
    const progressiveAccordions: HTMLElement[] = [];
    if (this.progressiveToolAccordions.size > 0) {
      const accordionElements = contentElement.querySelectorAll('.progressive-tool-accordion');
      accordionElements.forEach(el => {
        if (el instanceof HTMLElement) {
          progressiveAccordions.push(el);
          el.remove(); // Temporarily remove from DOM
        }
      });
    }

    // Clear any existing content
    contentElement.empty();

    // Render final content using Obsidian's markdown renderer
    this.renderContent(contentElement as HTMLElement, content).catch(error => {
      console.error('[MessageBubble] Error rendering content:', error);
      // Fallback to plain text
      const fallbackDiv = document.createElement('div');
      fallbackDiv.textContent = content;
      contentElement.appendChild(fallbackDiv);
    });

    // Re-append progressive accordions if they were preserved
    // (renderContent will call renderToolCalls which creates static accordion if tools are complete)
    // So we only re-append if progressive accordions still exist
    if (this.progressiveToolAccordions.size > 0 && progressiveAccordions.length > 0) {
      progressiveAccordions.forEach(accordion => {
        contentElement.appendChild(accordion);
      });
    }
  }


  /**
   * Update MessageBubble with new message data (including tool calls)
   * This triggers a re-render when tool calls are detected from LLM
   */
  updateWithNewMessage(newMessage: ConversationMessage): void {
    // If we have progressive accordions AND the message has completed tool calls,
    // it's time to transition from progressive to static
    if (this.progressiveToolAccordions.size > 0 && newMessage.toolCalls) {
      const hasCompletedTools = newMessage.toolCalls.some(tc =>
        tc.result !== undefined || tc.success !== undefined
      );

      if (hasCompletedTools) {
        // Tools are complete - transition complete
        // No need to cleanup - ProgressiveToolAccordions already show completed state
      } else {
        // Tools still executing - preserve progressive accordion
        this.message = newMessage;
        if (this.messageBranchNavigator) {
          this.messageBranchNavigator.updateMessage(newMessage);
        }
        return;
      }
    }

    // Update stored message reference
    this.message = newMessage;
    
    // Update branch navigator if it exists
    if (this.messageBranchNavigator) {
      this.messageBranchNavigator.updateMessage(newMessage);
    }

    if (!this.element) return;
    const contentElement = this.element.querySelector('.message-content');
    if (!contentElement) return;

    // Clear existing content
    contentElement.empty();

    // Re-render content with the active alternative (if any)
    const activeContent = this.getActiveMessageContent(newMessage);
    this.renderContent(contentElement as HTMLElement, activeContent).catch(error => {
      console.error('[MessageBubble] Error re-rendering content:', error);
    });

    // Tool calls are now rendered by renderContent -> renderToolCalls()
    // No need to call separately here

    // If still loading, show appropriate loading state
    if (newMessage.isLoading && newMessage.role === 'assistant') {
      const loadingDiv = contentElement.createDiv('ai-loading-continuation');
      loadingDiv.innerHTML = '<span class="ai-loading">Thinking<span class="dots">...</span></span>';
      this.startLoadingAnimation(loadingDiv);
    }

    // Re-rendered with tool calls
  }

  /**
   * Clean up progressive tool accordions and prepare for static accordion
   */
  private cleanupProgressiveAccordions(): void {
    // Clean up all progressive accordions
    this.progressiveToolAccordions.forEach(accordion => {
      const element = accordion.getElement();
      if (element) {
        element.remove();  // Remove from DOM
      }
      accordion.cleanup();  // Clean up internal state
    });

    this.progressiveToolAccordions.clear();
  }

  /**
   * Get the active content for the message (original or alternative)
   */
  private getActiveMessageContent(message: ConversationMessage): string {
    const activeIndex = message.activeAlternativeIndex || 0;
    
    // Index 0 is the original message
    if (activeIndex === 0) {
      return message.content;
    }
    
    // Alternative messages start at index 1
    if (message.alternatives && message.alternatives.length > 0) {
      const alternativeIndex = activeIndex - 1;
      if (alternativeIndex >= 0 && alternativeIndex < message.alternatives.length) {
        return message.alternatives[alternativeIndex].content;
      }
    }
    
    // Fallback to original content
    return message.content;
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
   * Handle tool events from MessageManager
   * Creates individual accordions per tool during streaming
   */
  handleToolEvent(event: 'detected' | 'updated' | 'started' | 'completed', data: any): void {
    const toolId = data.id || data.toolId;
    if (!toolId) {
      console.warn('[MessageBubble] Tool event missing ID:', data);
      return;
    }

    // Get or create accordion for THIS SPECIFIC TOOL
    let accordion = this.progressiveToolAccordions.get(toolId);

    if (!accordion && (event === 'detected' || event === 'started')) {
      // Create new accordion for this tool
      accordion = new ProgressiveToolAccordion();
      const accordionElement = accordion.createElement();

      // Ensure tool bubble exists
      if (!this.toolBubbleElement) {
        this.createToolBubbleOnDemand();
      }

      // Insert accordion into tool bubble content
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

    // Handle different event types
    switch (event) {
      case 'detected':
        // Tool call detected - may have incomplete parameters
        accordion.detectTool({
          id: toolId,
          name: data.name,
          parameters: data.parameters,
          isComplete: data.isComplete
        });
        break;

      case 'updated':
        // Parameters updated (now complete)
        accordion.updateToolParameters(toolId, data.parameters, data.isComplete);
        break;

      case 'started':
        // Tool execution started
        accordion.startTool({
          id: toolId,
          name: data.name,
          parameters: data.parameters
        });
        break;

      case 'completed':
        // Tool execution completed
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
   * Create tool bubble on-demand during streaming (when first tool is detected)
   */
  private createToolBubbleOnDemand(): void {
    if (this.toolBubbleElement) return; // Already exists

    const toolContainer = document.createElement('div');
    toolContainer.addClass('message-container');
    toolContainer.addClass('message-tool');
    toolContainer.setAttribute('data-message-id', `${this.message.id}_tools`);

    const bubble = toolContainer.createDiv('message-bubble tool-bubble');

    // Header with wrench icon
    const header = bubble.createDiv('message-header');
    const roleIcon = header.createDiv('message-role-icon');
    setIcon(roleIcon, 'wrench');

    // Content area for tool accordions
    bubble.createDiv('tool-bubble-content');

    this.toolBubbleElement = toolContainer;

    // Insert before the main message bubble (or at the beginning if no main bubble yet)
    if (this.element) {
      this.element.insertBefore(toolContainer, this.element.firstChild);
    }
  }


  /**
   * Get progressive tool accordions for external updates
   */
  getProgressiveToolAccordions(): Map<string, ProgressiveToolAccordion> {
    return this.progressiveToolAccordions;
  }

  /**
   * Show visual feedback when copy button is clicked
   */
  private showCopyFeedback(button: HTMLElement): void {
    const originalIcon = button.innerHTML;
    const originalTitle = button.getAttribute('title') || '';
    
    // Change to checkmark icon and update tooltip
    setIcon(button, 'check');
    button.setAttribute('title', 'Copied!');
    button.classList.add('copy-success');
    
    // Revert after 1.5 seconds
    setTimeout(() => {
      button.innerHTML = originalIcon;
      button.setAttribute('title', originalTitle);
      button.classList.remove('copy-success');
    }, 1500);
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stopLoadingAnimation();

    // Use centralized cleanup method
    this.cleanupProgressiveAccordions();

    // Cleanup branch navigator
    if (this.messageBranchNavigator) {
      this.messageBranchNavigator.destroy();
      this.messageBranchNavigator = null;
    }

    this.element = null;
  }
}