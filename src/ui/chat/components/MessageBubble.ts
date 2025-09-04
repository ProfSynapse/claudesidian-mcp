/**
 * MessageBubble - Individual message bubble component
 * 
 * Renders user/AI messages with copy, retry, and edit actions
 */

import { ConversationMessage } from '../../../types/chat/ChatTypes';
import { ToolAccordion } from './ToolAccordion';
import { ProgressiveToolAccordion } from './ProgressiveToolAccordion';
import { MessageBranchNavigator, MessageBranchNavigatorEvents } from './MessageBranchNavigator';
import { MarkdownRenderer } from '../utils/MarkdownRenderer';
import { setIcon, Component, App } from 'obsidian';

export class MessageBubble extends Component {
  private element: HTMLElement | null = null;
  private loadingInterval: any = null;
  private progressiveToolAccordions: Map<string, ProgressiveToolAccordion> = new Map();
  private messageBranchNavigator: MessageBranchNavigator | null = null;

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
   */
  createElement(): HTMLElement {
    // Create wrapper container that holds both bubble and actions
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
        console.log('[MessageBubble] Retry button clicked!', {
          messageId: this.message.id,
          messageRole: this.message.role,
          messageContent: this.message.content.substring(0, 50) + '...',
          onRetryExists: !!this.onRetry,
          elementDataId: this.element?.getAttribute('data-message-id')
        });
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
   * Render message content using enhanced markdown renderer
   */
  private async renderContent(container: HTMLElement, content: string): Promise<void> {
    // Handle loading state for AI messages
    if (this.message.isLoading && this.message.role === 'assistant' && !content.trim()) {
      container.innerHTML = '<span class="ai-loading">Thinking<span class="dots">...</span></span>';
      this.startLoadingAnimation(container);
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

    // Add tool accordion if there are tool calls
    this.renderToolCalls(container);
  }

  /**
   * Render tool calls accordion within the message content
   */
  private renderToolCalls(container: HTMLElement): void {
    // For tool role messages, always render the tool accordion 
    if (this.message.role === 'tool' && this.message.tool_calls && this.message.tool_calls.length > 0) {

      // Create accordion for tool execution message
      const accordion = new ToolAccordion(this.message.tool_calls);
      const accordionEl = accordion.createElement();
      container.appendChild(accordionEl);
      return;
    }

    // Assistant messages should never render tool accordions - tools are in separate tool messages
    // This ensures clean separation: assistant = text only, tool = accordions only
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
   * Stop loading animation
   */
  private stopLoadingAnimation(): void {
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval);
      this.loadingInterval = null;
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
  }


  /**
   * Update MessageBubble with new message data (including tool calls)
   * This triggers a re-render when tool calls are detected from LLM
   */
  updateWithNewMessage(newMessage: ConversationMessage): void {
    console.log('[MessageBubble] updateWithNewMessage called:', {
      oldId: this.message.id,
      newId: newMessage.id,
      oldContent: this.message.content.substring(0, 30) + '...',
      newContent: newMessage.content.substring(0, 30) + '...',
      hasProgressiveAccordions: this.progressiveToolAccordions.size > 0
    });

    // PROBLEM: This method completely re-renders and puts tool calls at the end
    // We should avoid calling this if we already have progressive accordions
    if (this.progressiveToolAccordions.size > 0 && newMessage.tool_calls) {
      // Skip update - preserving progressive accordions
      // Just update the stored message reference but don't re-render
      console.log('[MessageBubble] Preserving progressive accordions, only updating message reference');
      this.message = newMessage;
      
      // Update branch navigator if it exists
      if (this.messageBranchNavigator) {
        this.messageBranchNavigator.updateMessage(newMessage);
      }
      return;
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

    // If there are tool calls, render them
    if (newMessage.tool_calls && newMessage.tool_calls.length > 0) {
      this.renderToolCalls(contentElement as HTMLElement);
    }

    // If still loading, show appropriate loading state
    if (newMessage.isLoading && newMessage.role === 'assistant') {
      const loadingDiv = contentElement.createDiv('ai-loading-continuation');
      loadingDiv.innerHTML = '<span class="ai-loading">Thinking<span class="dots">...</span></span>';
      this.startLoadingAnimation(loadingDiv);
    }

    // Re-rendered with tool calls
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
   * Create individual accordion for a specific tool
   */
  createIndividualToolAccordion(toolCall: { id: string; name: string; parameters?: any }): void {
    
    if (!this.element) return;
    const contentElement = this.element.querySelector('.message-content');
    if (!contentElement) return;
    
    // On first tool call, move "Thinking..." to the bottom
    if (this.progressiveToolAccordions.size === 0) {
      // Find existing loading element
      const existingLoading = contentElement.querySelector('.ai-loading');
      if (existingLoading) {
        existingLoading.remove(); // Remove from current position
      }
      
      // Stop any existing loading animation
      this.stopLoadingAnimation();
    }
    
    // Create a new ProgressiveToolAccordion for this specific tool
    const toolAccordion = new ProgressiveToolAccordion();
    const accordionElement = toolAccordion.createElement();
    
    // Add it to the content (chronological order - accordions appear in order)
    contentElement.appendChild(accordionElement);
    
    // Store the accordion instance mapped to tool ID
    this.progressiveToolAccordions.set(toolCall.id, toolAccordion);
    
    // Start the tool execution in this accordion
    toolAccordion.startTool(toolCall);
    
    // Add "Thinking..." below all accordions for next potential tool calls
    this.addContinuationThinking(contentElement);
  }

  /**
   * Add "Thinking..." below accordions for continuation
   */
  private addContinuationThinking(contentElement: Element): void {
    // Remove any existing continuation thinking
    const existingContinuation = contentElement.querySelector('.ai-loading-continuation');
    if (existingContinuation) {
      existingContinuation.remove();
    }
    
    // Add new thinking state at the bottom
    const continuationLoading = contentElement.createDiv('ai-loading-continuation');
    continuationLoading.innerHTML = '<span class="ai-loading">Thinking<span class="dots">...</span></span>';
    this.startLoadingAnimation(continuationLoading);
  }

  /**
   * Complete individual tool execution
   */
  completeIndividualTool(toolId: string, result: any, success: boolean, error?: string): void {
    const toolAccordion = this.progressiveToolAccordions.get(toolId);
    if (toolAccordion) {
      toolAccordion.completeTool(toolId, result, success, error);
    }
  }

  /**
   * Remove continuation thinking when all tools are done (called when final response comes)
   */
  private removeContinuationThinking(): void {
    if (!this.element) return;
    const contentElement = this.element.querySelector('.message-content');
    if (!contentElement) return;
    
    const continuationLoading = contentElement.querySelector('.ai-loading-continuation');
    if (continuationLoading) {
      this.stopLoadingAnimation();
      continuationLoading.remove();
    }
  }

  /**
   * Handle tool events from MessageManager
   */
  handleToolEvent(event: 'detected' | 'started' | 'completed', data: any): void {
    switch(event) {
      case 'detected':
        // Tool calls detected - but don't show accordions yet (they come individually via 'started' events)
        break;
      case 'started':
        // Individual tool started - create separate accordion for this specific tool
        
        // Check if this tool accordion already exists (avoid duplicates)
        if (this.progressiveToolAccordions.has(data.id)) {
          break;
        }
        
        if (this.message.role === 'assistant') {
          this.createIndividualToolAccordion({
            id: data.id,
            name: data.name,
            parameters: data.parameters
          });
        }
        break;
      case 'completed':
        // Individual tool completed  
        this.completeIndividualTool(data.toolId, data.result, data.success, data.error);
        break;
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
    this.progressiveToolAccordions.forEach(accordion => {
      accordion.cleanup();
    });
    this.progressiveToolAccordions.clear();
    
    // Cleanup branch navigator
    if (this.messageBranchNavigator) {
      this.messageBranchNavigator.destroy();
      this.messageBranchNavigator = null;
    }
    
    this.element = null;
  }
}