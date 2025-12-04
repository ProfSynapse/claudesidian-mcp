/**
 * Location: src/database/repositories/MessageRepository.ts
 *
 * Message Repository
 *
 * Manages message persistence in conversation JSONL files.
 * Messages are stored in OpenAI fine-tuning format with auto-incrementing sequence numbers.
 *
 * Storage Strategy:
 * - JSONL: conversations/conv_{conversationId}.jsonl (source of truth)
 * - SQLite: messages table (cache for fast queries and pagination)
 * - Ordering: By sequence_number (auto-incremented)
 *
 * Related Files:
 * - src/database/repositories/interfaces/IMessageRepository.ts - Interface
 * - src/database/repositories/base/BaseRepository.ts - Base class
 * - src/types/storage/HybridStorageTypes.ts - Data types
 */

import { BaseRepository, RepositoryDependencies } from './base/BaseRepository';
import { IMessageRepository, CreateMessageData, UpdateMessageData } from './interfaces/IMessageRepository';
import { MessageData } from '../../types/storage/HybridStorageTypes';
import { MessageEvent, MessageUpdatedEvent } from '../interfaces/StorageEvents';
import { PaginatedResult, PaginationParams } from '../../types/pagination/PaginationTypes';

/**
 * Message repository implementation
 *
 * Messages are appended to conversation JSONL files in OpenAI format.
 * Each message has an auto-incrementing sequence number for ordering.
 */
export class MessageRepository
  extends BaseRepository<MessageData>
  implements IMessageRepository {

  protected readonly tableName = 'messages';
  protected readonly entityType = 'message';

  protected jsonlPath(conversationId: string): string {
    return `conversations/conv_${conversationId}.jsonl`;
  }

  constructor(deps: RepositoryDependencies) {
    super(deps);
  }

  // ============================================================================
  // Abstract method implementations
  // ============================================================================

  protected rowToEntity(row: any): MessageData {
    return this.rowToMessage(row);
  }

  async getById(id: string): Promise<MessageData | null> {
    const row = await this.sqliteCache.queryOne<any>(
      `SELECT * FROM ${this.tableName} WHERE id = ?`,
      [id]
    );
    return row ? this.rowToMessage(row) : null;
  }

  async getAll(options?: PaginationParams): Promise<PaginatedResult<MessageData>> {
    // Messages don't have a global getAll - they are per conversation
    // Return empty result - use getMessages instead
    return {
      items: [],
      page: 0,
      pageSize: options?.pageSize ?? 50,
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false
    };
  }

  async create(data: any): Promise<string> {
    // Use addMessage with conversationId
    throw new Error('Use addMessage(conversationId, data) instead');
  }

  async delete(id: string): Promise<void> {
    await this.sqliteCache.run(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
    this.invalidateCache();
  }

  async count(criteria?: Record<string, any>): Promise<number> {
    if (criteria?.conversationId) {
      return this.countMessages(criteria.conversationId);
    }
    const result = await this.sqliteCache.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName}`,
      []
    );
    return result?.count ?? 0;
  }

  // ============================================================================
  // Read Operations
  // ============================================================================

  /**
   * Get messages for a conversation (paginated, ordered by sequence number)
   */
  async getMessages(
    conversationId: string,
    options?: PaginationParams
  ): Promise<PaginatedResult<MessageData>> {
    const page = options?.page ?? 0;
    const pageSize = Math.min(options?.pageSize ?? 50, 200);

    // Count total
    const countResult = await this.sqliteCache.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE conversation_id = ?`,
      [conversationId]
    );
    const totalItems = countResult?.count ?? 0;

    // Get data (ordered by sequence number)
    const rows = await this.sqliteCache.query<any>(
      `SELECT * FROM ${this.tableName} WHERE conversation_id = ?
       ORDER BY sequence_number ASC
       LIMIT ? OFFSET ?`,
      [conversationId, pageSize, page * pageSize]
    );

    return {
      items: rows.map((r: any) => this.rowToMessage(r)),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
      hasNextPage: (page + 1) * pageSize < totalItems,
      hasPreviousPage: page > 0
    };
  }

  /**
   * Count messages in a conversation
   */
  async countMessages(conversationId: string): Promise<number> {
    const result = await this.sqliteCache.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE conversation_id = ?`,
      [conversationId]
    );
    return result?.count ?? 0;
  }

  /**
   * Get the next sequence number for a conversation
   */
  async getNextSequenceNumber(conversationId: string): Promise<number> {
    const result = await this.sqliteCache.queryOne<{ max_seq: number }>(
      `SELECT MAX(sequence_number) as max_seq FROM ${this.tableName} WHERE conversation_id = ?`,
      [conversationId]
    );
    return (result?.max_seq ?? -1) + 1;
  }

  // ============================================================================
  // Write Operations
  // ============================================================================

  /**
   * Add a new message to a conversation
   * Sequence number is auto-incremented
   */
  async addMessage(conversationId: string, data: CreateMessageData): Promise<string> {
    const id = data.id || this.generateId();

    try {
      // Get next sequence number
      const sequenceNumber = await this.getNextSequenceNumber(conversationId);

      // 1. Write message event to conversation JSONL
      await this.writeEvent<MessageEvent>(
        this.jsonlPath(conversationId),
        {
          type: 'message',
          conversationId,
          data: {
            id,
            role: data.role,
            content: data.content,
            tool_calls: data.toolCalls?.map(tc => ({
              id: tc.id,
              type: 'function' as const,
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments
              }
            })),
            tool_call_id: data.toolCallId,
            state: data.state,
            sequenceNumber
          }
        } as any
      );

      // 2. Update SQLite cache
      await this.sqliteCache.run(
        `INSERT INTO ${this.tableName}
         (id, conversation_id, role, content, timestamp, state, tool_calls_json, tool_call_id, sequence_number, reasoning_content)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          conversationId,
          data.role,
          data.content,
          data.timestamp,
          data.state ?? 'complete',
          data.toolCalls ? JSON.stringify(data.toolCalls) : null,
          data.toolCallId ?? null,
          sequenceNumber,
          data.reasoning ?? null
        ]
      );

      // 3. Invalidate cache
      this.invalidateCache();

      return id;

    } catch (error) {
      console.error('[MessageRepository] Failed to add message:', error);
      throw error;
    }
  }

  /**
   * Update an existing message
   * Only content, state, and reasoning can be updated
   */
  async update(messageId: string, data: UpdateMessageData): Promise<void> {
    try {
      // Get message to find conversation ID
      const message = await this.sqliteCache.queryOne<any>(
        `SELECT conversation_id FROM ${this.tableName} WHERE id = ?`,
        [messageId]
      );

      if (!message) {
        throw new Error(`Message ${messageId} not found`);
      }

      // 1. Write update event to JSONL
      await this.writeEvent<MessageUpdatedEvent>(
        this.jsonlPath(message.conversation_id),
        {
          type: 'message_updated',
          conversationId: message.conversation_id,
          messageId,
          data: {
            content: data.content ?? undefined,
            state: data.state,
            reasoning: data.reasoning
          }
        } as any
      );

      // 2. Update SQLite cache
      const setClauses: string[] = [];
      const params: any[] = [];

      if (data.content !== undefined) {
        setClauses.push('content = ?');
        params.push(data.content);
      }
      if (data.state !== undefined) {
        setClauses.push('state = ?');
        params.push(data.state);
      }
      if (data.reasoning !== undefined) {
        setClauses.push('reasoning_content = ?');
        params.push(data.reasoning);
      }

      if (setClauses.length > 0) {
        params.push(messageId);
        await this.sqliteCache.run(
          `UPDATE ${this.tableName} SET ${setClauses.join(', ')} WHERE id = ?`,
          params
        );
      }

      // 3. Invalidate cache
      this.invalidateCache();

    } catch (error) {
      console.error('[MessageRepository] Failed to update message:', error);
      throw error;
    }
  }

  /**
   * Delete a message from a conversation
   */
  async deleteMessage(conversationId: string, messageId: string): Promise<void> {
    try {
      // No specific delete event - just remove from SQLite
      await this.sqliteCache.run(`DELETE FROM ${this.tableName} WHERE id = ?`, [messageId]);

      // Invalidate cache
      this.invalidateCache();

    } catch (error) {
      console.error('[MessageRepository] Failed to delete message:', error);
      throw error;
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Convert SQLite row to MessageData
   */
  private rowToMessage(row: any): MessageData {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      timestamp: row.timestamp,
      state: row.state ?? 'complete',
      sequenceNumber: row.sequence_number,
      toolCalls: row.tool_calls_json ? JSON.parse(row.tool_calls_json) : undefined,
      toolCallId: row.tool_call_id ?? undefined,
      reasoning: row.reasoning_content ?? undefined,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined
    };
  }
}
