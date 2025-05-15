/**
 * Core type definitions for the Chatsidian MCP Plugin.
 * Defines shared interfaces and types used across the application,
 * particularly for the BCP (Bounded Context Packs) pattern.
 */

/**
 * Defines the structure for a tool handler function.
 * Tool handlers are responsible for executing the logic of a specific tool.
 * @template P Type of the parameters object the handler accepts.
 * @template R Type of the result the handler returns.
 * @param context The execution context containing core services.
 * @param params The parameters object passed to the tool call.
 * @returns The result of the tool execution, potentially asynchronously.
 */
export interface ToolHandler<P = any, R = any> {
  (context: ToolContext, params: P): R | Promise<R>; // Added context parameter
}

/**
 * Defines the structure for a tool definition.
 * Each tool file within a BCP exports an object conforming to this interface.
 * @template P Type of the parameters object the tool accepts.
 * @template R Type of the result the tool returns.
 */
export interface ToolDefinition<P = any, R = any> {
  /**
   * The name of the tool, unique within its BCP.
   * Should be in snake_case or camelCase. The full tool name will be prefixed
   * with the BCP domain (e.g., "Notes.append").
   */
  name: string;

  /**
   * A clear description of what the tool does, including its parameters
   * and expected outcome. This is used by the LLM to understand when
   * and how to use the tool.
   */
  description: string;

  /**
   * The function that implements the tool's logic.
   * It receives parameters and returns a result.
   */
  handler: ToolHandler<P, R>;

  /**
   * Optional: A JSON schema definition for the tool's parameters.
   * Helps with validation and potentially LLM understanding.
   */
  getParameterSchema?(): any; // Using 'any' for flexibility, consider 'JSONSchema7' from 'json-schema' if strict typing is needed

  /**
   * Optional: A JSON schema definition for the tool's result.
   */
  getResultSchema?(): any;
}

/**
 * Defines the structure for a Bounded Context Pack (BCP) barrel file (`index.ts`).
 * Each BCP folder exports an object conforming to this interface,
 * providing the domain name and the list of tools within that context.
 */
export interface BCP {
  /**
   * The domain name of the BCP (e.g., "Notes", "Vault", "Project").
   * This name is used as a prefix for all tools within the pack.
   */
  domain: string;

  /**
   * An array of tool definitions provided by this BCP.
   */
  tools: ToolDefinition[];
}

// --- Context Injection ---

import { App } from 'obsidian';
// Assuming AppEventTypes will be defined/imported elsewhere in this file or plugin entry
// Removed self-import of TypedEventEmitter
import { StorageManager } from './storage/manager';
import { SettingsManager } from '../settings/manager';
// MCPClient import is omitted here to avoid circular dependencies.
// The MCPClient instance will be passed dynamically during handler execution.

/**
 * Defines the context object provided to BCP Tool Handlers.
 * Contains references to core plugin services and the Obsidian App instance.
 */
export interface ToolContext {
  app: App;
  storage: StorageManager;
  events: TypedEventEmitter<any>; // Use 'any' for EventTypes here, or import AppEventTypes if available
  settings: SettingsManager;
  mcp: any; // MCPClient instance will be injected dynamically at runtime
}

// --- Core Interfaces ---

/**
 * Defines the structure for events used within the application's event system.
 * This is a placeholder and should be extended by specific modules (Core, Chat, MCP).
 */
export interface EventTypes {
  [key: string]: any; // Allows any string key with any value type
}

/**
 * Interface for a type-safe event emitter.
 * Ensures that events are emitted and listened to with correct payload types.
 * @template T Typically EventTypes or an extension of it.
 */
export interface TypedEventEmitter<T extends EventTypes = EventTypes> {
  emit<K extends keyof T>(event: K, data: T[K]): void;
  on<K extends keyof T>(event: K, handler: (data: T[K]) => void): void;
  off<K extends keyof T>(event: K, handler: (data: T[K]) => void): void;
  once<K extends keyof T>(event: K, handler: (data: T[K]) => void): void;
  /**
   * Removes all event handlers for a specific event, or all handlers if no event is specified.
   * @param event Optional. The name of the event for which to remove all handlers.
   */
  removeAllListeners<K extends keyof T>(event?: K): void;
  /**
   * Gets the number of listeners registered for a specific event.
   * @param event The name of the event.
   * @returns The number of listeners for the event.
   */
  listenerCount<K extends keyof T>(event: K): number;
}

/**
 * Defines the specific event types related to storage operations.
 */
export interface StorageEventTypes extends EventTypes {
  'storage:changed': { key: string; value: any; operation: 'write' | 'delete' };
  'storage:error': { key?: string; error: Error; operation: 'read' | 'write' | 'delete' | 'list' };
}

/**
 * Interface for storage adapters.
 * Defines the basic operations for reading, writing, and deleting data.
 * Allows for different storage backends (Obsidian API, in-memory, etc.).
 */
export interface StorageAdapter {
  read<T>(key: string): Promise<T | undefined>;
  write<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>; // Added list method for potential use cases
}

/**
 * Basic structure for MCP Tool parameters, often extended by specific tools.
 */
export interface BaseToolParams {
  [key: string]: any;
}

/**
 * Basic structure for MCP Tool results, often extended by specific tools.
 */
export interface BaseToolResult {
  success: boolean;
  error?: string;
  [key: string]: any;
}
