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
    private onRetry: (messageId: string) => void,
    private onEdit?: (messageId: string, newContent: string) => void
  ) {}

  /**
   * Create the message bubble element
   */
  createElement(): HTMLElement {
    const bubble = document.createElement('div');
    bubble.addClass('message-bubble');
    bubble.addClass(`message-${this.message.role}`);
    bubble.setAttribute('data-message-id', this.message.id);

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

    // Actions at bottom
    const actions = bubble.createDiv('message-actions');
    
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
    
    const contentDiv = this.element.querySelector('.message-content');
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
   * Cleanup resources
   */
  cleanup(): void {
    // Clean up event listeners if needed
    this.element = null;
  }
}