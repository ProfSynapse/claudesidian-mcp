// Location: src/types/storage/StorageTypes.ts
// Type definitions for the split storage architecture
// Used by: FileSystemService, IndexManager, ConversationService, WorkspaceService
// Dependencies: Replaces monolithic data structures with individual file formats

import { WorkspaceContext } from '../../database/types/workspace/WorkspaceTypes';
import { WorkspaceStateSnapshot } from '../../database/types/session/SessionTypes';

/**
 * Individual conversation file structure (conversations/{id}.json)
 */
export interface IndividualConversation {
  id: string;
  title: string;
  created: number;
  updated: number;
  vault_name: string;
  message_count: number;
  messages: ConversationMessage[];
}

/**
 * Conversation message structure
 */
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  toolName?: string;
  toolParams?: any;
  toolResult?: any;
}

/**
 * Tool call structure
 */
export interface ToolCall {
  id: string;
  type: string;
  name: string;
  function?: {
    name: string;
    arguments: string;
  };
  parameters?: any;
  result?: any;
  success?: boolean;
  error?: string;
}

/**
 * Conversation metadata for index (lightweight - NO messages)
 */
export interface ConversationMetadata {
  id: string;
  title: string;
  created: number;
  updated: number;
  vault_name: string;
  message_count: number;
}

/**
 * Full conversation index structure (conversations/index.json)
 */
export interface ConversationIndex {
  conversations: Record<string, ConversationMetadata>;
  byTitle: Record<string, string[]>;
  byContent: Record<string, string[]>;
  byVault: Record<string, string[]>;
  byDateRange: Array<{
    start: number;
    end: number;
    conversationIds: string[];
  }>;
  lastUpdated: number;
}

/**
 * Individual workspace file structure (workspaces/{id}.json)
 */
export interface IndividualWorkspace {
  id: string;
  name: string;
  description?: string;
  rootFolder: string;
  created: number;
  lastAccessed: number;
  isActive?: boolean;
  context?: WorkspaceContext;
  sessions: Record<string, SessionData>;
}

/**
 * Session data nested within workspace
 */
export interface SessionData {
  id: string;
  name?: string;
  description?: string;
  startTime: number;
  endTime?: number;
  isActive: boolean;
  memoryTraces: Record<string, MemoryTrace>;
  states: Record<string, StateData>;
}

/**
 * Memory trace within session
 */
export interface MemoryTrace {
  id: string;
  timestamp: number;
  type: string;
  content: string;
  metadata?: {
    tool?: string;
    params?: any;
    result?: any;
    relatedFiles?: string[];
  };
}

/**
 * State snapshot within session
 */
export interface StateData {
  id: string;
  name: string;
  created: number;
  snapshot: WorkspaceStateSnapshot;
}

/**
 * Workspace metadata for index (lightweight - NO sessions)
 */
export interface WorkspaceMetadata {
  id: string;
  name: string;
  description?: string;
  rootFolder: string;
  created: number;
  lastAccessed: number;
  isActive?: boolean;
  sessionCount: number;
  traceCount: number;
}

/**
 * Full workspace index structure (workspaces/index.json)
 */
export interface WorkspaceIndex {
  workspaces: Record<string, WorkspaceMetadata>;
  byName: Record<string, string[]>;
  byDescription: Record<string, string[]>;
  byFolder: Record<string, string>;
  sessionsByWorkspace: Record<string, string[]>;
  lastUpdated: number;
}