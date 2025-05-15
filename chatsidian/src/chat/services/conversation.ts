import { StorageManager } from "../../core/storage/manager";
import { TypedEventEmitter } from "../../core/types";
import { AppEventTypes } from "../../core/plugin"; // Use combined types
import { Conversation, ConversationIndex, ChatMessage } from "../types";
import { v4 as uuidv4 } from 'uuid'; // Assuming uuid is installed

/**
 * Manages chat conversations, including creating, loading, saving,
 * deleting, and switching between them. Interacts with StorageManager
 * for persistence and emits events for UI updates.
 */
export class ConversationManager {
  private storage: StorageManager;
  private events: TypedEventEmitter<AppEventTypes>;
  private currentConversationId: string | null = null;
  private conversations: Map<string, Conversation> = new Map(); // In-memory cache

  /**
   * Creates an instance of ConversationManager.
   * @param storage The application's StorageManager instance.
   * @param events The application's TypedEventEmitter instance.
   */
  constructor(storage: StorageManager, events: TypedEventEmitter<AppEventTypes>) {
    this.storage = storage;
    this.events = events;
    this.registerEventHandlers();
  }

  /**
   * Initializes the ConversationManager, loading the index and potentially the last active conversation.
   */
  async initialize(): Promise<void> {
    console.log("Initializing ConversationManager...");
    // Load conversation index (optional, could be loaded on demand)
    // await this.loadConversationIndex();

    // Load last active conversation
    const lastId = await this.storage.read<string>('chat:lastActiveConversation');
    if (lastId) {
      await this.loadConversation(lastId);
      this.currentConversationId = lastId;
      this.events.emit('chat:conversation.selected', { conversationId: lastId });
    } else {
      // Optionally create a new conversation if none exists
      // await this.createNewConversation();
    }
    console.log("ConversationManager initialized.");
  }

  /**
   * Registers event handlers for relevant events.
   * @private
   */
  private registerEventHandlers(): void {
    // Listen for requests to select a conversation
    this.events.on('chat:conversation.selected', this.handleSelectConversation.bind(this));
    // Listen for messages being sent to add them to the current conversation
    this.events.on('chat:message.sent', this.handleMessageSent.bind(this));
    // Listen for fully received assistant messages
    this.events.on('chat:message.received', this.handleMessageReceived.bind(this));
    // Listen for streaming tokens (optional, might be handled directly by UI or MessageProcessor)
    // this.events.on('chat:message.streaming', this.handleMessageStreaming.bind(this));
  }

  /**
   * Creates a new, empty conversation.
   * @param title Optional title for the new conversation.
   * @returns The newly created Conversation object.
   */
  async createNewConversation(title: string = "New Chat"): Promise<Conversation> {
    const newConversation: Conversation = {
      id: uuidv4(),
      title: title,
      messages: [], // Start with an empty message list or a system prompt
      created: Date.now(),
      updated: Date.now(),
      metadata: {}, // Initialize with default metadata if needed
    };

    this.conversations.set(newConversation.id, newConversation);
    await this.saveConversation(newConversation); // Persist immediately
    await this.updateConversationIndex(newConversation);

    this.currentConversationId = newConversation.id;
    this.events.emit('chat:conversation.created', { conversation: newConversation });
    this.events.emit('chat:conversation.selected', { conversationId: newConversation.id }); // Auto-select new convo

    console.log(`Created new conversation: ${newConversation.id}`);
    return newConversation;
  }

  /**
   * Loads a conversation from storage by its ID.
   * @param id The ID of the conversation to load.
   * @returns The loaded Conversation object, or undefined if not found.
   */
  async loadConversation(id: string): Promise<Conversation | undefined> {
    if (this.conversations.has(id)) {
      return this.conversations.get(id);
    }

    const conversation = await this.storage.read<Conversation>(`conversation:${id}`);
    if (conversation) {
      this.conversations.set(id, conversation); // Cache it
      this.events.emit('chat:conversation.loaded', { conversation });
      console.log(`Loaded conversation from storage: ${id}`);
    } else {
      console.warn(`Conversation not found in storage: ${id}`);
    }
    return conversation;
  }

  /**
   * Saves a conversation to storage.
   * @param conversation The Conversation object to save.
   */
  async saveConversation(conversation: Conversation): Promise<void> {
    conversation.updated = Date.now(); // Update timestamp
    this.conversations.set(conversation.id, conversation); // Update cache
    await this.storage.write(`conversation:${conversation.id}`, conversation);
    await this.updateConversationIndex(conversation); // Update index as well
    this.events.emit('chat:conversation.updated', { conversation });
    // console.log(`Saved conversation: ${conversation.id}`); // Can be noisy
  }

  /**
   * Deletes a conversation by its ID.
   * @param id The ID of the conversation to delete.
   */
  async deleteConversation(id: string): Promise<void> {
    this.conversations.delete(id);
    await this.storage.delete(`conversation:${id}`);
    await this.removeConversationFromIndex(id);

    this.events.emit('chat:conversation.deleted', { conversationId: id });
    console.log(`Deleted conversation: ${id}`);

    // Handle switching to another conversation if the deleted one was active
    if (this.currentConversationId === id) {
      this.currentConversationId = null;
      // TODO: Select another conversation (e.g., the most recent one) or create a new one.
      // For now, just emit null selection.
      this.events.emit('chat:conversation.selected', { conversationId: null });
    }
  }

  /**
   * Gets the currently active conversation ID.
   * @returns The current conversation ID or null.
   */
  getCurrentConversationId(): string | null {
    return this.currentConversationId;
  }

  /**
   * Gets the currently active conversation object.
   * Loads it if necessary.
   * @returns A promise resolving to the current Conversation or undefined.
   */
  async getCurrentConversation(): Promise<Conversation | undefined> {
    if (!this.currentConversationId) {
      return undefined;
    }
    return await this.loadConversation(this.currentConversationId);
  }

  /**
   * Adds a message to a specific conversation.
   * @param conversationId The ID of the conversation.
   * @param message The ChatMessage object to add.
   */
  async addMessage(conversationId: string, message: ChatMessage): Promise<void> {
    const conversation = await this.loadConversation(conversationId);
    if (conversation) {
      conversation.messages.push(message);
      await this.saveConversation(conversation);
    } else {
      console.error(`Cannot add message, conversation not found: ${conversationId}`);
    }
  }

  // --- Event Handlers ---

  private async handleSelectConversation(data: { conversationId: string | null }): Promise<void> {
    const { conversationId } = data;
    if (this.currentConversationId !== conversationId) {
      this.currentConversationId = conversationId;
      await this.storage.write('chat:lastActiveConversation', conversationId); // Persist selection
      console.log(`Selected conversation: ${conversationId}`);
      if (conversationId) {
        // Ensure the conversation is loaded and emit loaded event for UI
        await this.loadConversation(conversationId);
      }
      // UI should react to 'chat:conversation.loaded' or handle null selection directly
    }
  }

  private async handleMessageSent(data: { conversationId: string; message: ChatMessage }): Promise<void> {
    // Add the user's message to the conversation state
    await this.addMessage(data.conversationId, data.message);
  }

    private async handleMessageReceived(data: { conversationId: string; message: ChatMessage }): Promise<void> {
    // Add the assistant's final message to the conversation state
    await this.addMessage(data.conversationId, data.message);
  }

  // --- Private Helper Methods ---

  /**
   * Updates the conversation index in storage.
   * @param conversation The conversation to add/update in the index.
   * @private
   */
  private async updateConversationIndex(conversation: Conversation): Promise<void> {
    const index = await this.storage.read<ConversationIndex>('conversation:index') || {};
    index[conversation.id] = {
      title: conversation.title,
      created: conversation.created,
      updated: conversation.updated,
    };
    await this.storage.write('conversation:index', index);
  }

  /**
   * Removes a conversation from the index in storage.
   * @param id The ID of the conversation to remove from the index.
   * @private
   */
  private async removeConversationFromIndex(id: string): Promise<void> {
    const index = await this.storage.read<ConversationIndex>('conversation:index') || {};
    if (index[id]) {
      delete index[id];
      await this.storage.write('conversation:index', index);
    }
  }
}
