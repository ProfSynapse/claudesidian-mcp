import { EventTypes } from "../core/types";

/**
 * Defines the structure for a single chat message.
 */
export interface ChatMessage {
  id: string; // Unique identifier for the message
  role: 'user' | 'assistant' | 'system' | 'tool'; // Sender role
  content: string; // Message content (text, markdown, etc.)
  timestamp: number; // Unix timestamp (ms) when the message was created/received
  toolCalls?: any[]; // Placeholder for tool call information (Phase 3)
  toolResult?: any; // Placeholder for tool result information (Phase 3)
  error?: any; // Placeholder for errors related to this message
  metadata?: Record<string, any>; // Any additional metadata
}

/**
 * Defines the structure for a conversation.
 */
export interface Conversation {
  id: string; // Unique identifier for the conversation
  title: string; // User-defined or auto-generated title
  messages: ChatMessage[]; // Chronological list of messages
  created: number; // Unix timestamp (ms)
  updated: number; // Unix timestamp (ms) of the last update
  metadata?: {
    // Placeholder for conversation-specific settings
    defaultAgent?: string;
    defaultModel?: string;
    [key: string]: any;
  };
}

/**
 * Defines the structure for the conversation index stored in storage.
 */
export type ConversationIndex = Record<string, {
  title: string;
  created: number;
  updated: number;
}>;


/**
 * Defines the specific event types related to chat operations.
 * Extends the base EventTypes.
 */
export interface ChatEventTypes extends EventTypes {
  // Message Events
  'chat:message.sent': { conversationId: string; message: ChatMessage }; // User sends a message
  'chat:message.received': { conversationId: string; message: ChatMessage }; // Assistant message fully received
  'chat:message.streaming': { conversationId: string; messageId: string; token: string }; // Assistant message token received
  'chat:message.error': { conversationId: string; messageId?: string; error: any }; // Error during message processing/streaming
  'chat:message.process': { conversationId: string; messageId: string; content: string; context?: any }; // Request to process a user message

  // Conversation Events
  'chat:conversation.created': { conversation: Conversation };
  'chat:conversation.loaded': { conversation: Conversation }; // A conversation is loaded into the view
  'chat:conversation.updated': { conversation: Conversation }; // Conversation metadata or messages updated
  'chat:conversation.deleted': { conversationId: string };
  'chat:conversation.selected': { conversationId: string | null }; // User selects a conversation from a list

  // Tool Interaction Events (UI-focused, distinct from MCP events)
  'chat:tool.invoked': { conversationId: string; messageId: string; toolName: string; params: any }; // User explicitly invokes a tool via UI
  'chat:tool.status': { conversationId: string; messageId?: string; toolName: string; status: 'running' | 'complete' | 'error'; result?: any; error?: any; params?: any }; // Update UI with tool status

  // UI Events
  'chat:ui.input.focus': void;
  'chat:ui.settings.open': void;
}
