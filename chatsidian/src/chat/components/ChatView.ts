import { ItemView, WorkspaceLeaf } from "obsidian";
import { ChatsidianPlugin } from "../../core/plugin"; // Adjust path as needed
import { TypedEventEmitter } from "../../core/types";
import { AppEventTypes } from "../../core/plugin"; // Assuming combined types are in plugin.ts for now
import { StorageManager } from "../../core/storage/manager";
// Import ChatEventTypes if needed for specific event handling within the view
// import { ChatEventTypes, Conversation, ChatMessage } from "../types";

/**
 * Represents the main Chat View UI component within Obsidian.
 * Extends ItemView to integrate with Obsidian's workspace system.
 * Responsible for rendering the chat interface, including messages,
 * input area, and potentially tool panels.
 */
export class ChatView extends ItemView {
  plugin: ChatsidianPlugin;
  events: TypedEventEmitter<AppEventTypes>;
  storage: StorageManager;
  // mcpClient: MCPClient; // Will be needed later

  // Child components (placeholders for now)
  // private messageListComponent: MessageList;
  // private inputAreaComponent: InputArea;
  // private toolPanelComponent: ToolPanel;

  /**
   * Creates an instance of ChatView.
   * @param leaf The WorkspaceLeaf associated with this view.
   * @param plugin The main ChatsidianPlugin instance.
   */
  constructor(leaf: WorkspaceLeaf, plugin: ChatsidianPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.events = plugin.events;
    this.storage = plugin.storage;
    // this.mcpClient = plugin.mcpClient; // Assign when available

    // TODO: Initialize child components (MessageList, InputArea, ToolPanel)
  }

  /**
   * Returns the unique type identifier for this view.
   * Used by Obsidian to manage view registration and layout.
   */
  getViewType(): string {
    return ChatsidianPlugin.VIEW_TYPE_CHAT;
  }

  /**
   * Returns the display text for the view's tab header.
   */
  getDisplayText(): string {
    return "Chatsidian"; // Or dynamically set based on conversation
  }

  /**
   * Returns the icon name for the view's tab header.
   * Uses Obsidian's built-in icons (see https://lucide.dev/).
   */
  getIcon(): string {
    return "message-circle";
  }

  /**
   * Called when the view is first loaded into the workspace.
   * Responsible for setting up the initial DOM structure and event listeners.
   */
  protected async onOpen(): Promise<void> {
    console.log("ChatView opened");
    const container = this.containerEl.children[1]; // Content container
    container.empty();
    container.createEl("h4", { text: "Chatsidian Chat View" }); // Placeholder content

    // TODO: Render actual chat UI structure
    // - Create divs for message list, input area, etc.
    // - Instantiate and append child components

    this.registerEventHandlers();

    // TODO: Load initial or last active conversation
    // const lastConversationId = await this.storage.read<string>('chat:lastActiveConversation');
    // if (lastConversationId) {
    //   this.events.emit('chat:conversation.selected', { conversationId: lastConversationId });
    // } else {
    //   // Handle case with no previous conversation
    // }
  }

  /**
   * Called when the view is closed or unloaded.
   * Responsible for cleaning up resources and event listeners.
   */
  protected async onClose(): Promise<void> {
    console.log("ChatView closed");
    // TODO: Unregister event handlers to prevent memory leaks
    // this.events.off(...)
  }

  /**
   * Registers event handlers for communication with other parts of the plugin.
   * @private
   */
  private registerEventHandlers(): void {
    // Example: Listen for conversation loading events
    // this.events.on('chat:conversation.loaded', this.handleConversationLoaded.bind(this));
    // Example: Listen for new messages
    // this.events.on('chat:message.received', this.handleMessageReceived.bind(this));
    // Example: Listen for tool status updates
    // this.events.on('chat:tool.status', this.handleToolStatusUpdate.bind(this));

    // Listen for plugin unloading to clean up
    this.events.on('plugin:unloading', this.cleanup.bind(this));
  }

  /**
   * Cleans up resources when the plugin is unloading.
   * @private
   */
  private cleanup(): void {
    // Unregister specific handlers added in registerEventHandlers
    this.events.off('plugin:unloading', this.cleanup.bind(this));
    // Add other .off calls here
  }

  // --- Placeholder methods for UI updates ---

  // private handleConversationLoaded(data: { conversation: Conversation }): void {
  //   console.log("Handling conversation loaded:", data.conversation.id);
  //   // TODO: Update UI title, render messages via MessageList component
  // }

  // private handleMessageReceived(data: { conversationId: string; message: ChatMessage }): void {
  //   // TODO: Check if this is the active conversation
  //   // TODO: Add message to MessageList component
  // }

  // private handleToolStatusUpdate(data: any): void {
  //   // TODO: Update UI in ToolPanel component
  // }

  // --- Placeholder methods for user actions ---

  // public async sendMessage(content: string): Promise<void> {
  //   // TODO: Get current conversation ID
  //   const conversationId = "current-convo-id"; // Replace with actual logic
  //   const messageId = generateUUID(); // Assuming a utility function
  //   const message: ChatMessage = { /* ... create user message ... */ };
  //
  //   // Emit event for ConversationManager/MessageProcessor to handle
  //   this.events.emit('chat:message.sent', { conversationId, message });
  //   this.events.emit('chat:message.process', { conversationId, messageId, content });
  // }
}
