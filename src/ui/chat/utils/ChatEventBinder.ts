/**
 * ChatEventBinder - Binds event handlers to chat UI elements
 * Location: /src/ui/chat/utils/ChatEventBinder.ts
 *
 * This class is responsible for:
 * - Wiring up new chat button event
 * - Wiring up settings button event
 * - Wiring up welcome screen button event
 *
 * Used by ChatView to bind event handlers to UI elements,
 * following the Single Responsibility Principle.
 */

export class ChatEventBinder {
  /**
   * Wire up new chat button
   */
  static bindNewChatButton(button: HTMLElement, createNewConversation: () => void): void {
    button.addEventListener('click', () => createNewConversation());
  }

  /**
   * Wire up settings button
   */
  static bindSettingsButton(button: HTMLElement, openSettings: () => void): void {
    button.addEventListener('click', () => openSettings());
  }

  /**
   * Wire up welcome screen button
   */
  static bindWelcomeButton(container: HTMLElement, createNewConversation: () => void): void {
    const welcomeButton = container.querySelector('.chat-welcome-button');
    if (welcomeButton) {
      welcomeButton.addEventListener('click', () => createNewConversation());
    }
  }
}
