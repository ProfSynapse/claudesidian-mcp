/**
 * Chat Types - Minimal type definitions for native chatbot
 * Pure JSON-based chat
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  conversationId: string;
  toolCalls?: ToolCall[];
  tokens?: number;
}

export interface ToolCall {
  id: string;
  type: string;
  name?: string;
  function: {
    name: string;
    arguments: string;
  };
  result?: any;
  success?: boolean;
  error?: string;
  parameters?: any;
  executionTime?: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  created: number;
  updated: number;
  metadata?: Record<string, any>;
}

export interface ChatContext {
  conversationId: string;
  currentMessage?: ChatMessage;
  previousMessages: ChatMessage[];
  tokens: {
    input: number;
    output: number;
    total: number;
  };
}

export interface MessageBranch {
  id: string;
  parentId?: string;
  message: ChatMessage;
  children: string[];
  isActive: boolean;
}

// Legacy type aliases for compatibility
export type ConversationData = Conversation;
export type ConversationMessage = ChatMessage;

export interface ConversationDocument {
  id: string;
  data: Conversation;
}

export interface ConversationSearchOptions {
  query?: string;
  limit?: number;
  offset?: number;
}

export interface ConversationSearchResult {
  conversations: Conversation[];
  total: number;
}

export interface CreateConversationParams {
  title?: string;
  initialMessage?: string;
}

export interface AddMessageParams {
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
}

export interface UpdateConversationParams {
  id: string;
  title?: string;
  metadata?: Record<string, any>;
}

export function documentToConversationData(doc: ConversationDocument): Conversation {
  return doc.data;
}