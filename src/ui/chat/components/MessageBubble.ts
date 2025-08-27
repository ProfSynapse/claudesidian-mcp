/**
 * MessageBubble - Individual message bubble component
 * 
 * Renders user/AI messages with copy, retry, and edit actions
 */

import { ConversationMessage } from '../../../types/chat/ChatTypes';

export class MessageBubble {
  private element: HTMLElement | null = null;

  constructor(
    private message: ConversationMessage,
    private onCopy: (messageId: string) => void,
    private onRetry: (messageId: string) => void
  ) {}

  /**
   * Create the message bubble element
   */
  createElement(): HTMLElement {
    const bubble = document.createElement('div');
    bubble.addClass('message-bubble');
    bubble.addClass(`message-${this.message.role}`);
    bubble.setAttribute('data-message-id', this.message.id);

    // Message header with timestamp and actions
    const header = bubble.createDiv('message-header');
    
    // Role indicator
    const roleIndicator = header.createDiv('message-role');
    roleIndicator.textContent = this.message.role === 'user' ? 'You' : 'AI';
    
    // Timestamp
    const timestamp = header.createDiv('message-timestamp');
    timestamp.textContent = this.formatTimestamp(this.message.timestamp);

    // Actions
    const actions = header.createDiv('message-actions');
    
    // Copy button
    const copyBtn = actions.createEl('button', { 
      cls: 'message-action-btn',
      attr: { title: 'Copy message' }
    });
    copyBtn.innerHTML = '📋';
    copyBtn.addEventListener('click', () => this.onCopy(this.message.id));

    // Retry button (only for AI messages)
    if (this.message.role === 'assistant') {
      const retryBtn = actions.createEl('button', { 
        cls: 'message-action-btn',
        attr: { title: 'Retry message' }
      });
      retryBtn.innerHTML = '🔄';
      retryBtn.addEventListener('click', () => this.onRetry(this.message.id));
    }

    // Message content
    const content = bubble.createDiv('message-content');
    
    // Render content with basic markdown support
    this.renderContent(content, this.message.content);

    this.element = bubble;
    return bubble;
  }

  /**
   * Render message content with basic markdown
   */
  private renderContent(container: HTMLElement, content: string): void {
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
   * Format timestamp for display
   */
  private formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Get the DOM element
   */
  getElement(): HTMLElement | null {
    return this.element;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Clean up event listeners if needed
    this.element = null;
  }
}