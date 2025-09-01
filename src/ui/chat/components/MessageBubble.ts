/**
 * MessageBubble - Individual message bubble component
 * 
 * Renders user/AI messages with copy, retry, and edit actions
 */

import { ConversationMessage } from '../../../types/chat/ChatTypes';
import { ToolAccordion } from './ToolAccordion';
import { ProgressiveToolAccordion } from './ProgressiveToolAccordion';
import { setIcon } from 'obsidian';

export class MessageBubble {
  private element: HTMLElement | null = null;
  private loadingInterval: any = null;
  private progressiveToolAccordions: Map<string, ProgressiveToolAccordion> = new Map();
  private accumulatedStreamContent: string = ''; // Track accumulated streaming content

  constructor(
    private message: ConversationMessage,
    private onCopy: (messageId: string) => void,
    private onRetry: (messageId: string) => void,
    private onEdit?: (messageId: string, newContent: string) => void,
    private onToolEvent?: (messageId: string, event: 'detected' | 'started' | 'completed', data: any) => void
  ) {
    // Reset accumulated content for new message
    this.accumulatedStreamContent = '';
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
        setIcon(editBtn, 'edit');
        editBtn.addEventListener('click', () => this.handleEdit());
      }
      
      // Retry button for user messages
      const retryBtn = actions.createEl('button', { 
        cls: 'message-action-btn',
        attr: { title: 'Retry message' }
      });
      setIcon(retryBtn, 'rotate-ccw');
      retryBtn.addEventListener('click', () => this.onRetry(this.message.id));
    } else if (this.message.role === 'tool') {
      // Tool messages get minimal actions - just copy for debugging
      const copyBtn = actions.createEl('button', { 
        cls: 'message-action-btn',
        attr: { title: 'Copy tool execution details' }
      });
      setIcon(copyBtn, 'copy');
      copyBtn.addEventListener('click', () => this.onCopy(this.message.id));
    } else {
      // Copy button for AI messages
      const copyBtn = actions.createEl('button', { 
        cls: 'message-action-btn',
        attr: { title: 'Copy message' }
      });
      setIcon(copyBtn, 'copy');
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
    // For tool role messages, always render the tool accordion 
    if (this.message.role === 'tool' && this.message.tool_calls && this.message.tool_calls.length > 0) {
      console.log('[MessageBubble] Rendering tool accordion for tool message:', {
        messageId: this.message.id,
        toolCallCount: this.message.tool_calls.length,
        toolNames: this.message.tool_calls.map(tc => tc.name).filter(Boolean)
      });

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
   * Update content for streaming - completely rewritten for clarity
   */
  updateContent(content: string, isComplete: boolean = false, isIncremental?: boolean): void {
    if (!this.element) return;

    const contentElement = this.element.querySelector('.message-content');
    if (!contentElement) return;

    // Stop loading animation
    this.stopLoadingAnimation();

    if (isIncremental) {
      // Streaming chunk: accumulate content and update single streaming div
      console.log(`[MessageBubble] Streaming chunk: "${content}" (${content.length} chars)`);
      
      this.accumulatedStreamContent += content;
      
      console.log(`[MessageBubble] Total accumulated: ${this.accumulatedStreamContent.length} chars`);
      
      // Find or create streaming div
      let streamingDiv = contentElement.querySelector('.streaming-content') as HTMLElement;
      if (!streamingDiv) {
        streamingDiv = document.createElement('div');
        streamingDiv.className = 'streaming-content';
        streamingDiv.style.marginTop = this.progressiveToolAccordions.size > 0 ? '8px' : '0px';
        contentElement.appendChild(streamingDiv);
        console.log(`[MessageBubble] Created streaming div`);
      }
      
      // Update streaming div with accumulated content
      streamingDiv.innerHTML = `${this.escapeHtml(this.accumulatedStreamContent)}<span class="streaming-cursor">|</span>`;
      
    } else if (isComplete) {
      // Final content: replace streaming div with final div
      console.log(`[MessageBubble] Final content: ${content.length} chars`);
      
      const streamingDiv = contentElement.querySelector('.streaming-content');
      if (streamingDiv) {
        const finalDiv = document.createElement('div');
        finalDiv.className = 'final-content';
        finalDiv.style.marginTop = this.progressiveToolAccordions.size > 0 ? '8px' : '0px';
        finalDiv.innerHTML = this.escapeHtml(content);
        
        contentElement.replaceChild(finalDiv, streamingDiv);
        console.log(`[MessageBubble] Replaced streaming div with final content`);
      } else {
        // No streaming div exists, create final content div
        const finalDiv = document.createElement('div');
        finalDiv.className = 'final-content';
        finalDiv.innerHTML = this.escapeHtml(content);
        contentElement.appendChild(finalDiv);
        console.log(`[MessageBubble] Created final content div`);
      }
      
      // Remove thinking when final content is inserted
      this.removeContinuationThinking();
    }
  }


  /**
   * Update MessageBubble with new message data (including tool calls)
   * This triggers a re-render when tool calls are detected from LLM
   */
  updateWithNewMessage(newMessage: ConversationMessage): void {
    // Update with new message data

    // PROBLEM: This method completely re-renders and puts tool calls at the end
    // We should avoid calling this if we already have progressive accordions
    if (this.progressiveToolAccordions.size > 0 && newMessage.tool_calls) {
      // Skip update - preserving progressive accordions
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

    // Re-rendered with tool calls
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