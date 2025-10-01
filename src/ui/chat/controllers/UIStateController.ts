/**
 * UIStateController - Manages all UI state transitions and visual feedback
 */

export interface UIStateControllerEvents {
  onSidebarToggled: (visible: boolean) => void;
}

export class UIStateController {
  private sidebarVisible = false;

  constructor(
    private containerEl: HTMLElement,
    private events: UIStateControllerEvents
  ) {}

  /**
   * Get sidebar visibility state
   */
  getSidebarVisible(): boolean {
    return this.sidebarVisible;
  }

  /**
   * Show welcome state when no conversation is selected
   */
  showWelcomeState(): void {
    const messageDisplay = this.containerEl.querySelector('.message-display-container');
    if (!messageDisplay) return;

    messageDisplay.empty();
    messageDisplay.addClass('message-display');

    const welcome = messageDisplay.createDiv('chat-welcome');
    welcome.innerHTML = `
      <div class="chat-welcome-content">
        <div class="chat-welcome-icon">💬</div>
        <h2>Welcome to AI Chat</h2>
        <p>Start a conversation with your AI assistant. You can:</p>
        <ul>
          <li>Ask questions about your notes</li>
          <li>Create and edit content</li>
          <li>Search and organize your vault</li>
          <li>Get help with any task</li>
        </ul>
        <p>Type a message below to get started!</p>
      </div>
    `;
  }

  /**
   * Show chat state when conversation is selected
   */
  showChatState(): void {
    // Chat state is handled by MessageDisplay component
    // This method exists for state management consistency
  }

  /**
   * Toggle conversation list visibility
   */
  toggleConversationList(): void {
    const sidebar = this.containerEl.querySelector('.chat-sidebar');
    const backdrop = this.containerEl.querySelector('.chat-backdrop');
    if (!sidebar || !backdrop) return;
    
    this.sidebarVisible = !this.sidebarVisible;
    
    if (this.sidebarVisible) {
      sidebar.removeClass('chat-sidebar-hidden');
      sidebar.addClass('chat-sidebar-visible');
      backdrop.addClass('chat-backdrop-visible');
    } else {
      sidebar.removeClass('chat-sidebar-visible');
      sidebar.addClass('chat-sidebar-hidden');
      backdrop.removeClass('chat-backdrop-visible');
    }

    this.events.onSidebarToggled(this.sidebarVisible);
  }

  /**
   * Show error message with auto-dismiss
   */
  showError(message: string): void {
    // Create a temporary error display
    const container = this.containerEl.querySelector('.message-display-container');
    if (container) {
      const errorEl = container.createDiv('chat-error');
      errorEl.textContent = message;
      
      // Auto-remove after 5 seconds
      setTimeout(() => {
        errorEl.remove();
      }, 5000);
    }
  }

  /**
   * Set loading state on chat input
   * Note: ChatInput component now manages its own loading state and stop button
   * This method is kept for backward compatibility but does nothing
   */
  setInputLoading(loading: boolean): void {
    // ChatInput component handles its own state now
    // No-op to avoid conflicts with ChatInput's updateUI()
  }

  /**
   * Set input placeholder text
   */
  setInputPlaceholder(placeholder: string): void {
    const textarea = this.containerEl.querySelector('.chat-textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.placeholder = placeholder;
    }
  }

  /**
   * Update context progress display
   */
  updateContextProgress(): void {
    // This will be handled by the ContextProgressBar component
    // Method exists for consistency with the original ChatView interface
  }

  /**
   * Initialize UI event listeners
   */
  initializeEventListeners(): void {
    // Hamburger menu button
    const hamburgerButton = this.containerEl.querySelector('.chat-hamburger-button');
    if (hamburgerButton) {
      hamburgerButton.addEventListener('click', () => this.toggleConversationList());
    }

    // Backdrop click to close sidebar
    const backdrop = this.containerEl.querySelector('.chat-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', () => {
        if (this.sidebarVisible) {
          this.toggleConversationList();
        }
      });
    }
  }

  /**
   * Clean up event listeners
   */
  cleanup(): void {
    // Remove event listeners if needed
    // Most listeners are attached to elements that will be removed with the container
  }
}