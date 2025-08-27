/**
 * ChatInput - Message input component with send functionality
 * 
 * Provides text input, send button, and model selection
 */

export class ChatInput {
  private element: HTMLElement | null = null;
  private textArea: HTMLTextAreaElement | null = null;
  private sendButton: HTMLButtonElement | null = null;
  private isLoading = false;

  constructor(
    private container: HTMLElement,
    private onSendMessage: (message: string) => void,
    private getLoadingState: () => boolean
  ) {
    this.render();
  }

  /**
   * Set loading state
   */
  setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.updateUI();
  }

  /**
   * Set placeholder text
   */
  setPlaceholder(placeholder: string): void {
    if (this.textArea) {
      this.textArea.placeholder = placeholder;
    }
  }

  /**
   * Render the chat input interface
   */
  private render(): void {
    this.container.empty();
    this.container.addClass('chat-input');

    // Input container with flex layout
    const inputContainer = this.container.createDiv('chat-input-flex');

    // Text area container
    const textareaContainer = inputContainer.createDiv('chat-textarea-container');
    this.textArea = textareaContainer.createEl('textarea', {
      cls: 'chat-textarea',
      attr: {
        placeholder: 'Type your message...',
        rows: '1'
      }
    });

    // Handle Enter key (send) and Shift+Enter (new line)
    this.textArea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSendMessage();
      }
    });

    // Auto-resize textarea
    this.textArea.addEventListener('input', () => {
      this.autoResizeTextarea();
    });

    // Send button container
    const buttonContainer = inputContainer.createDiv('chat-send-container');
    this.sendButton = buttonContainer.createEl('button', {
      cls: 'chat-send-button'
    });
    
    // Add send icon (Lucide 'send' icon)
    this.sendButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>';
    this.sendButton.setAttribute('aria-label', 'Send message');

    this.sendButton.addEventListener('click', () => {
      this.handleSendMessage();
    });

    // Model selector removed - now handled by separate ModelSelector component

    this.element = this.container;
    this.updateUI();
  }

  /**
   * Handle sending a message
   */
  private handleSendMessage(): void {
    if (!this.textArea || this.isLoading) return;

    const message = this.textArea.value.trim();
    if (!message) return;

    // Clear the input
    this.textArea.value = '';
    this.autoResizeTextarea();

    // Send the message
    this.onSendMessage(message);
  }

  /**
   * Auto-resize textarea based on content (limited to 2 lines)
   */
  private autoResizeTextarea(): void {
    if (!this.textArea) return;

    // Reset height to auto to get the correct scrollHeight
    this.textArea.style.height = 'auto';
    
    // Set height limits for 2 lines maximum
    const minHeight = 40; // Single line height with padding
    const maxHeight = 72; // Two line height (40px base + 32px for second line)
    const newHeight = Math.min(Math.max(this.textArea.scrollHeight, minHeight), maxHeight);
    this.textArea.style.height = newHeight + 'px';
    
    // Enable scrolling if content exceeds 2 lines
    this.textArea.style.overflowY = this.textArea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  /**
   * Update UI based on current state
   */
  private updateUI(): void {
    if (!this.sendButton || !this.textArea) return;

    const actuallyLoading = this.isLoading || this.getLoadingState();

    if (actuallyLoading) {
      this.sendButton.disabled = true;
      this.sendButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chat-loading-spinner"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>';
      this.textArea.disabled = true;
    } else {
      this.sendButton.disabled = false;
      this.sendButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>';
      this.textArea.disabled = false;
    }
  }

  /**
   * Focus the input
   */
  focus(): void {
    if (this.textArea) {
      this.textArea.focus();
    }
  }

  /**
   * Clear the input
   */
  clear(): void {
    if (this.textArea) {
      this.textArea.value = '';
      this.autoResizeTextarea();
    }
  }

  /**
   * Get current input value
   */
  getValue(): string {
    return this.textArea?.value || '';
  }

  /**
   * Set input value
   */
  setValue(value: string): void {
    if (this.textArea) {
      this.textArea.value = value;
      this.autoResizeTextarea();
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.element = null;
    this.textArea = null;
    this.sendButton = null;
  }
}