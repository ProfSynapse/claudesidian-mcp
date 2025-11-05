/**
 * ChatLayoutBuilder - Builds the chat interface DOM structure
 * Location: /src/ui/chat/builders/ChatLayoutBuilder.ts
 *
 * This class is responsible for:
 * - Creating the main chat layout structure
 * - Building header with hamburger, title, and settings buttons
 * - Creating message display, input, and context containers
 * - Building sidebar with conversation list
 * - Auto-hiding experimental warning banner
 *
 * Used by ChatView to build the initial DOM structure,
 * following the Builder pattern for complex UI construction.
 */

import { setIcon } from 'obsidian';

export interface ChatLayoutElements {
  messageContainer: HTMLElement;
  inputContainer: HTMLElement;
  contextContainer: HTMLElement;
  conversationListContainer: HTMLElement;
  newChatButton: HTMLElement;
  settingsButton: HTMLElement;
  chatTitle: HTMLElement;
  hamburgerButton: HTMLElement;
  backdrop: HTMLElement;
  sidebarContainer: HTMLElement;
}

export class ChatLayoutBuilder {
  /**
   * Build the complete chat interface layout
   */
  static buildLayout(container: HTMLElement): ChatLayoutElements {
    container.empty();
    container.addClass('chat-view-container');

    // Create main layout structure
    const chatLayout = container.createDiv('chat-layout');
    const mainContainer = chatLayout.createDiv('chat-main');

    // Experimental warning banner
    this.createWarningBanner(mainContainer);

    // Header
    const { chatTitle, hamburgerButton, settingsButton } = this.createHeader(mainContainer);

    // Main content areas
    const messageContainer = mainContainer.createDiv('message-display-container');
    const inputContainer = mainContainer.createDiv('chat-input-container');
    const contextContainer = mainContainer.createDiv('chat-context-container');

    // Backdrop and sidebar
    const backdrop = chatLayout.createDiv('chat-backdrop');
    const { sidebarContainer, conversationListContainer, newChatButton } = this.createSidebar(chatLayout);

    return {
      messageContainer,
      inputContainer,
      contextContainer,
      conversationListContainer,
      newChatButton,
      settingsButton,
      chatTitle,
      hamburgerButton,
      backdrop,
      sidebarContainer
    };
  }

  /**
   * Create experimental warning banner with auto-hide
   */
  private static createWarningBanner(container: HTMLElement): void {
    const warningBanner = container.createDiv('chat-experimental-warning');
    warningBanner.innerHTML = `
      <span class="warning-icon">⚠️</span>
      <span class="warning-text">Experimental Feature: AI Chat is in beta.</span>
      <a href="https://github.com/ProfSynapse/claudesidian-mcp/issues" target="_blank" rel="noopener noreferrer" class="warning-link">Report issues</a>
      <span class="warning-text">• Use at your own risk</span>
    `;

    // Auto-hide warning after 5 seconds
    setTimeout(() => {
      warningBanner.style.opacity = '0';
      warningBanner.style.transition = 'opacity 0.5s ease-out';
      setTimeout(() => {
        warningBanner.style.display = 'none';
      }, 500);
    }, 5000);
  }

  /**
   * Create chat header with hamburger, title, and settings
   */
  private static createHeader(container: HTMLElement): {
    chatTitle: HTMLElement;
    hamburgerButton: HTMLElement;
    settingsButton: HTMLElement;
  } {
    const chatHeader = container.createDiv('chat-header');

    // Left: Hamburger button
    const hamburgerButton = chatHeader.createEl('button', { cls: 'chat-hamburger-button' });
    hamburgerButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg>';
    hamburgerButton.setAttribute('aria-label', 'Toggle conversations');

    // Center: Title
    const chatTitle = chatHeader.createDiv('chat-title');
    chatTitle.textContent = 'AI Chat';

    // Right: Settings gear icon
    const settingsButton = chatHeader.createEl('button', { cls: 'chat-settings-button' });
    setIcon(settingsButton, 'settings');
    settingsButton.setAttribute('aria-label', 'Chat settings');

    return { chatTitle, hamburgerButton, settingsButton };
  }

  /**
   * Create sidebar with conversation list
   */
  private static createSidebar(container: HTMLElement): {
    sidebarContainer: HTMLElement;
    conversationListContainer: HTMLElement;
    newChatButton: HTMLElement;
  } {
    const sidebarContainer = container.createDiv('chat-sidebar');
    sidebarContainer.addClass('chat-sidebar-hidden');

    const sidebarHeader = sidebarContainer.createDiv('chat-sidebar-header');
    sidebarHeader.createEl('h3', { text: 'Conversations' });
    const newChatButton = sidebarHeader.createEl('button', {
      cls: 'chat-new-button',
      text: '+ New Chat'
    });

    const conversationListContainer = sidebarContainer.createDiv('conversation-list-container');

    return { sidebarContainer, conversationListContainer, newChatButton };
  }
}
