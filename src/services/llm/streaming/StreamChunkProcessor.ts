/**
 * Stream Chunk Processor
 * Location: src/services/llm/streaming/StreamChunkProcessor.ts
 *
 * Extracted from BaseAdapter.ts to follow Single Responsibility Principle.
 * Handles processing of individual stream chunks with tool call accumulation.
 *
 * Usage:
 * - Used by BaseAdapter.processStream() for SDK stream processing
 * - Processes delta.content and delta.tool_calls from OpenAI-compatible providers
 * - Accumulates tool calls across multiple chunks
 * - Provides throttled progress updates for long tool arguments
 */

import { StreamChunk } from '../adapters/types';

export interface StreamChunkOptions {
  extractContent: (chunk: any) => string | null;
  extractToolCalls: (chunk: any) => any[] | null;
  extractFinishReason: (chunk: any) => string | null;
  extractUsage?: (chunk: any) => any;
}

export class StreamChunkProcessor {
  /**
   * Process individual stream chunk with tool call accumulation
   * Handles delta.content and delta.tool_calls from any OpenAI-compatible provider
   */
  static* processStreamChunk(
    chunk: any,
    options: StreamChunkOptions,
    toolCallsAccumulator: Map<number, any>,
    usageRef: any
  ): Generator<StreamChunk, void, unknown> {

    // Extract text content
    const content = options.extractContent(chunk);
    if (content) {
      yield { content, complete: false };
    }

    // Extract and accumulate tool calls
    const toolCalls = options.extractToolCalls(chunk);
    if (toolCalls) {
      for (const toolCall of toolCalls) {
        const index = toolCall.index || 0;

        if (!toolCallsAccumulator.has(index)) {
          // Initialize new tool call
          toolCallsAccumulator.set(index, {
            id: toolCall.id || '',
            type: toolCall.type || 'function',
            function: {
              name: toolCall.function?.name || '',
              arguments: toolCall.function?.arguments || ''
            }
          });
        } else {
          // Accumulate existing tool call arguments
          const existing = toolCallsAccumulator.get(index);
          if (toolCall.id) existing.id = toolCall.id;
          if (toolCall.function?.name) existing.function.name = toolCall.function.name;
          if (toolCall.function?.arguments) {
            existing.function.arguments += toolCall.function.arguments;
          }
        }
      }

      // Yield progress for UI (every 50 characters of arguments)
      const currentToolCalls = Array.from(toolCallsAccumulator.values());
      const totalArgLength = currentToolCalls.reduce((sum, tc) =>
        sum + (tc.function?.arguments?.length || 0), 0
      );

      if (totalArgLength > 0 && totalArgLength % 50 === 0) {
        yield {
          content: '',
          complete: false,
          toolCalls: currentToolCalls
        };
      }
    }
  }
}
