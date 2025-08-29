/**
 * MessageBubble - Individual message bubble component
 * 
 * Renders user/AI messages with copy, retry, and edit actions
 */

import { ConversationMessage } from '../../../types/chat/ChatTypes';
import { ToolAccordion } from './ToolAccordion';
import { ProgressiveToolAccordion } from './ProgressiveToolAccordion';

export class MessageBubble {
  private element: HTMLElement | null = null;
  private loadingInterval: any = null;
  private progressiveToolAccordions: Map<string, ProgressiveToolAccordion> = new Map();

  constructor(
    private message: ConversationMessage,
    private onCopy: (messageId: string) => void,
    private onRetry: (messageId: string) => void,
    private onEdit?: (messageId: string, newContent: string) => void,
    private onToolEvent?: (messageId: string, event: 'detected' | 'started' | 'completed', data: any) => void
  ) {}

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
      roleIcon.innerHTML = this.createLucideIcon('user');
    } else {
      roleIcon.innerHTML = this.createLucideIcon('bot');
    }

    // Message content
    const content = bubble.createDiv('message-content');
    
    // Render content with basic markdown support
    this.renderContent(content, this.message.content);

    // Actions outside and underneath the bubble, justified right
    const actions = messageContainer.createDiv('message-actions-external');
    
    if (this.message.role === 'user') {
      // Edit button for user messages
      if (this.onEdit) {
        const editBtn = actions.createEl('button', { 
          cls: 'message-action-btn',
          attr: { title: 'Edit message' }
        });
        editBtn.innerHTML = this.createLucideIcon('edit');
        editBtn.addEventListener('click', () => this.handleEdit());
      }
      
      // Retry button for user messages
      const retryBtn = actions.createEl('button', { 
        cls: 'message-action-btn',
        attr: { title: 'Retry message' }
      });
      retryBtn.innerHTML = this.createLucideIcon('rotate-ccw');
      retryBtn.addEventListener('click', () => this.onRetry(this.message.id));
    } else {
      // Copy button for AI messages
      const copyBtn = actions.createEl('button', { 
        cls: 'message-action-btn',
        attr: { title: 'Copy message' }
      });
      copyBtn.innerHTML = this.createLucideIcon('copy');
      copyBtn.addEventListener('click', () => this.onCopy(this.message.id));
    }

    this.element = messageContainer;
    return messageContainer;
  }

  /**
   * Render message content with basic markdown
   */
  private renderContent(container: HTMLElement, content: string): void {
    // Handle loading state for AI messages
    if (this.message.isLoading && this.message.role === 'assistant' && !content.trim()) {
      container.innerHTML = '<span class="ai-loading">Thinking<span class="dots">...</span></span>';
      this.startLoadingAnimation(container);
      return;
    }

    // Simple markdown rendering - can be enhanced later
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Code blocks
      if (line.startsWith('```')) {
        const codeBlock = container.createEl('pre');
        const code = codeBlock.createEl('code');
        
        i++; // Skip opening ```
        const codeContent: string[] = [];
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeContent.push(lines[i]);
          i++;
        }
        
        code.textContent = codeContent.join('\n');
        continue;
      }
      
      // Headers
      if (line.startsWith('# ')) {
        container.createEl('h1', { text: line.substring(2) });
      } else if (line.startsWith('## ')) {
        container.createEl('h2', { text: line.substring(3) });
      } else if (line.startsWith('### ')) {
        container.createEl('h3', { text: line.substring(4) });
      }
      // Lists
      else if (line.startsWith('- ') || line.startsWith('* ')) {
        if (!container.lastElementChild || container.lastElementChild.tagName !== 'UL') {
          container.createEl('ul');
        }
        const ul = container.lastElementChild as HTMLUListElement;
        ul.createEl('li', { text: line.substring(2) });
      }
      // Regular paragraphs
      else if (line.trim()) {
        const p = container.createEl('p');
        this.renderInlineMarkdown(p, line);
      }
      // Empty lines (line breaks)
      else if (i > 0 && lines[i - 1].trim()) {
        container.createEl('br');
      }
    }

    // Add tool accordion if there are tool calls
    this.renderToolCalls(container);
  }

  /**
   * Render tool calls accordion within the message content
   */
  private renderToolCalls(container: HTMLElement): void {
    // For completed messages with tool calls, show static tool accordion
    if (this.message.tool_calls && this.message.tool_calls.length > 0 && !this.message.isLoading) {
      console.log('[MessageBubble] Rendering static tool accordion inside message:', {
        messageId: this.message.id,
        toolCallCount: this.message.tool_calls.length,
        toolNames: this.message.tool_calls.map(tc => tc.name).filter(Boolean)
      });
      
      // If we already have individual progressive accordions, don't render static ones
      if (this.progressiveToolAccordions.size > 0) {
        console.log('[MessageBubble] Already have individual progressive accordions, skipping static rendering');
        return;
      }

      // Create static accordion for completed tools (fallback for static messages)
      const accordion = new ToolAccordion(this.message.tool_calls);
      const accordionEl = accordion.createElement();
      container.appendChild(accordionEl);
    }
  }

  /**
   * Render inline markdown (bold, italic, code)
   */
  private renderInlineMarkdown(container: HTMLElement, text: string): void {
    // Simple regex-based inline markdown
    // This is basic - could be enhanced with a proper markdown parser
    
    let processed = text;
    
    // Inline code
    processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Bold
    processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    processed = processed.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    container.innerHTML = processed;
  }

  /**
   * Create Lucide icon SVG
   */
  private createLucideIcon(iconName: string): string {
    const icons: { [key: string]: string } = {
      'user': '<svg class="lucide lucide-user" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
      'bot': '<svg class="lucide lucide-bot" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"></path><rect width="16" height="12" x="4" y="8" rx="2"></rect><path d="M2 14h2"></path><path d="M20 14h2"></path><path d="M15 13v2"></path><path d="M9 13v2"></path></svg>',
      'copy': '<svg class="lucide lucide-copy" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>',
      'edit': '<svg class="lucide lucide-edit" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
      'rotate-ccw': '<svg class="lucide lucide-rotate-ccw" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>'
    };
    return icons[iconName] || '';
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
   * Update content after streaming starts - insert chronologically
   */
  updateContent(content: string, isStreaming: boolean = false): void {
    console.log('[MessageBubble DEBUG] updateContent called:', {
      hasContent: !!content,
      isStreaming,
      progressiveAccordionCount: this.progressiveToolAccordions.size
    });

    if (!this.element) return;

    const contentElement = this.element.querySelector('.message-content');
    if (!contentElement) return;

    // Stop loading animation
    this.stopLoadingAnimation();

    // If we have individual accordions, we need to insert content chronologically
    if (this.progressiveToolAccordions.size > 0) {
      this.insertContentChronologically(content, isStreaming);
    } else {
      // No accordions yet - normal content replacement
      if (isStreaming) {
        contentElement.innerHTML = `<div class="streaming-content">${this.escapeHtml(content)}<span class="streaming-cursor">|</span></div>`;
      } else {
        contentElement.innerHTML = `<div class="final-content">${this.escapeHtml(content)}</div>`;
      }
    }
  }

  /**
   * Insert content chronologically at the "thinking" position
   */
  private insertContentChronologically(content: string, isStreaming: boolean): void {
    if (!this.element) return;
    const contentElement = this.element.querySelector('.message-content');
    if (!contentElement) return;

    // Find the continuation thinking element (this marks where new content should go)
    const continuationLoading = contentElement.querySelector('.ai-loading-continuation');
    
    // Create content element with spacing from accordions
    let contentDiv: HTMLElement;
    if (isStreaming) {
      contentDiv = document.createElement('div');
      contentDiv.className = 'streaming-content';
      contentDiv.style.marginTop = '8px'; // Add spacing from accordions
      contentDiv.innerHTML = `${this.escapeHtml(content)}<span class="streaming-cursor">|</span>`;
    } else {
      contentDiv = document.createElement('div');
      contentDiv.className = 'final-content';
      contentDiv.style.marginTop = '8px'; // Add spacing from accordions
      contentDiv.innerHTML = this.escapeHtml(content);
    }

    // Insert content chronologically
    if (continuationLoading) {
      // Insert content before the "thinking" element (chronological position)
      contentElement.insertBefore(contentDiv, continuationLoading);
      console.log('[MessageBubble DEBUG] Inserted content chronologically before "Thinking..."');
      
      if (!isStreaming) {
        // Remove thinking when final content is inserted
        this.removeContinuationThinking();
      }
    } else {
      // No thinking element, append at the end
      contentElement.appendChild(contentDiv);
      console.log('[MessageBubble DEBUG] Appended content at end (no thinking element found)');
    }
  }

  /**
   * Update MessageBubble with new message data (including tool calls)
   * This triggers a re-render when tool calls are detected from LLM
   */
  updateWithNewMessage(newMessage: ConversationMessage): void {
    console.log('[MessageBubble DEBUG] updateWithNewMessage called - THIS CAUSES REORDERING:', {
      messageId: newMessage.id,
      hasToolCalls: !!(newMessage.tool_calls && newMessage.tool_calls.length > 0),
      toolCallCount: newMessage.tool_calls?.length || 0,
      isLoading: newMessage.isLoading,
      progressiveAccordionCount: this.progressiveToolAccordions.size,
      contentLength: newMessage.content?.length || 0
    });

    // PROBLEM: This method completely re-renders and puts tool calls at the end
    // We should avoid calling this if we already have progressive accordions
    if (this.progressiveToolAccordions.size > 0 && newMessage.tool_calls) {
      console.log('[MessageBubble DEBUG] SKIPPING updateWithNewMessage - already have', this.progressiveToolAccordions.size, 'individual progressive accordions');
      // Just update the stored message reference but don't re-render
      this.message = newMessage;
      return;
    }

    // Update stored message reference
    this.message = newMessage;

    if (!this.element) return;
    const contentElement = this.element.querySelector('.message-content');
    if (!contentElement) return;

    // Clear existing content
    contentElement.empty();

    // Re-render content with the new message data
    this.renderContent(contentElement as HTMLElement, newMessage.content);

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

    console.log('[MessageBubble DEBUG] Re-rendered with tool calls and loading state');
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
    console.log('[MessageBubble] Creating individual accordion for tool:', toolCall.name, toolCall.id);
    
    if (!this.element) return;
    const contentElement = this.element.querySelector('.message-content');
    if (!contentElement) return;
    
    // On first tool call, move "Thinking..." to the bottom
    if (this.progressiveToolAccordions.size === 0) {
      // Find existing loading element
      const existingLoading = contentElement.querySelector('.ai-loading');
      if (existingLoading) {
        existingLoading.remove(); // Remove from current position
        console.log('[MessageBubble] Removed existing "Thinking..." to reposition it');
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
    
    console.log('[MessageBubble] Individual accordion created and "Thinking..." repositioned below');
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
    
    console.log('[MessageBubble] Added continuation "Thinking..." below accordions');
  }

  /**
   * Complete individual tool execution
   */
  completeIndividualTool(toolId: string, result: any, success: boolean, error?: string): void {
    console.log('[MessageBubble] Completing individual tool:', toolId);
    
    const toolAccordion = this.progressiveToolAccordions.get(toolId);
    if (toolAccordion) {
      toolAccordion.completeTool(toolId, result, success, error);
      console.log('[MessageBubble] Individual tool completed successfully');
    } else {
      console.error('[MessageBubble] No accordion found for tool ID:', toolId);
      console.log('[MessageBubble] Available tool accordions:', Array.from(this.progressiveToolAccordions.keys()));
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
      console.log('[MessageBubble] Removed continuation "Thinking..." - all tools complete');
    }
  }

  /**
   * Handle tool events from MessageManager
   */
  handleToolEvent(event: 'detected' | 'started' | 'completed', data: any): void {
    console.log('[MessageBubble] Handling tool event:', event, data);
    
    switch(event) {
      case 'detected':
        // Tool calls detected - but don't show accordions yet (they come individually via 'started' events)
        console.log('[MessageBubble] Tool calls detected, waiting for individual execution events');
        break;
      case 'started':
        // Individual tool started - create separate accordion for this specific tool
        console.log('[MessageBubble] Individual tool started - creating individual accordion:', data.name);
        
        // Check if this tool accordion already exists (avoid duplicates)
        if (this.progressiveToolAccordions.has(data.id)) {
          console.log(`[MessageBubble] Tool accordion ${data.id} already exists, skipping duplicate`);
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
   * Cleanup resources
   */
  cleanup(): void {
    this.stopLoadingAnimation();
    this.progressiveToolAccordions.forEach(accordion => {
      accordion.cleanup();
    });
    this.progressiveToolAccordions.clear();
    this.element = null;
  }
}