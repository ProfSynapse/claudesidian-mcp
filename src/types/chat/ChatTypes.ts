/**
 * Chat Types - Minimal type definitions for native chatbot
 * Pure JSON-based chat
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  conversationId: string;
  state?: 'draft' | 'streaming' | 'complete' | 'aborted' | 'invalid'; // Message lifecycle state
  toolCalls?: ToolCall[];
  tokens?: number;
  alternatives?: ChatMessage[];
  activeAlternativeIndex?: number;
  alternativeBranches?: MessageAlternativeBranch[];
  activeAlternativeId?: string;
  isLoading?: boolean;
  metadata?: Record<string, any>;
}

export interface ToolCall {
  id: string;
  type: string;
  name?: string;
  displayName?: string;
  technicalName?: string;
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

export type MessageAlternativeStatus = 'draft' | 'streaming' | 'complete' | 'aborted';

export interface MessageAlternativeBranch {
  id: string;
  parentMessageId: string;
  status: MessageAlternativeStatus;
  content: string;
  toolCalls?: ToolCall[];
  provider?: string;
  model?: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, any>;
  isDraft?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  created: number;
  updated: number;
  metadata?: {
    previousResponseId?: string; // OpenAI Responses API: Track last response ID for continuations
    [key: string]: any;
  };
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
  provider?: string;
  model?: string;
  systemPrompt?: string;
  workspaceId?: string;
  sessionId?: string;
}

export interface AddMessageParams {
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  metadata?: Record<string, any>;
}

export interface UpdateConversationParams {
  id: string;
  title?: string;
  metadata?: Record<string, any>;
}

export function documentToConversationData(doc: ConversationDocument): Conversation {
  return doc.data;
}
