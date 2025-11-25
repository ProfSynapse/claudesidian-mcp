/**
 * ToolCallContentParser
 *
 * Parses tool calls from content that uses the [TOOL_CALLS] format
 * commonly used by fine-tuned models (e.g., Nexus tools SFT).
 *
 * Format example:
 * "[TOOL_CALLS] [{\"name\": \"tool_name\", \"arguments\": \"{...}\", \"id\": \"abc123\"}]"
 *
 * This parser extracts these embedded tool calls and converts them to the
 * standard ToolCall format used by the streaming orchestrator.
 */

import { ToolCall } from '../types';

export interface ParsedToolCallResult {
  /** Whether tool calls were found in the content */
  hasToolCalls: boolean;
  /** Extracted tool calls in standard format */
  toolCalls: ToolCall[];
  /** Content with [TOOL_CALLS] prefix and JSON removed (any remaining text) */
  cleanContent: string;
  /** Any text that appeared before [TOOL_CALLS] */
  prefixContent: string;
}

export interface RawToolCall {
  name: string;
  arguments: string;
  id?: string;
}

export class ToolCallContentParser {
  /** Pattern to detect [TOOL_CALLS] prefix */
  private static readonly TOOL_CALLS_PATTERN = /\[TOOL_CALLS\]/;

  /** Pattern to extract JSON array after [TOOL_CALLS] */
  private static readonly TOOL_CALLS_JSON_PATTERN = /\[TOOL_CALLS\]\s*(\[[\s\S]*\])/;

  /** Pattern to strip [/TOOL_CALLS] end tag if present */
  private static readonly END_TAG_PATTERN = /\[\/TOOL_CALLS\]\s*$/;

  /**
   * Check if content contains [TOOL_CALLS] format
   */
  static hasToolCallsFormat(content: string): boolean {
    return this.TOOL_CALLS_PATTERN.test(content);
  }

  /**
   * Parse content for embedded tool calls
   *
   * @param content - The raw content string that may contain [TOOL_CALLS]
   * @returns ParsedToolCallResult with extracted tool calls and cleaned content
   */
  static parse(content: string): ParsedToolCallResult {
    const result: ParsedToolCallResult = {
      hasToolCalls: false,
      toolCalls: [],
      cleanContent: content,
      prefixContent: ''
    };

    if (!content || !this.hasToolCallsFormat(content)) {
      return result;
    }

    try {
      // Strip [/TOOL_CALLS] end tag if present before parsing
      const normalizedContent = content.replace(this.END_TAG_PATTERN, '');

      // Find the position of [TOOL_CALLS]
      const toolCallsMatch = normalizedContent.match(this.TOOL_CALLS_PATTERN);
      if (!toolCallsMatch || toolCallsMatch.index === undefined) {
        return result;
      }

      // Extract any content before [TOOL_CALLS]
      result.prefixContent = normalizedContent.slice(0, toolCallsMatch.index).trim();

      // Extract the JSON array after [TOOL_CALLS]
      const jsonMatch = normalizedContent.match(this.TOOL_CALLS_JSON_PATTERN);
      if (!jsonMatch || !jsonMatch[1]) {
        console.warn('[ToolCallContentParser] Found [TOOL_CALLS] but could not extract JSON array');
        return result;
      }

      const jsonString = jsonMatch[1];

      // Parse the JSON array
      const rawToolCalls: RawToolCall[] = JSON.parse(jsonString);

      if (!Array.isArray(rawToolCalls)) {
        console.warn('[ToolCallContentParser] Parsed content is not an array');
        return result;
      }

      // Convert to standard ToolCall format
      result.toolCalls = rawToolCalls.map((rawCall, index) =>
        this.convertToToolCall(rawCall, index)
      );

      result.hasToolCalls = result.toolCalls.length > 0;

      // Clean content: remove [TOOL_CALLS], JSON, and end tag - keep any remaining text
      const afterJson = normalizedContent.slice(
        (jsonMatch.index || 0) + jsonMatch[0].length
      ).trim();

      result.cleanContent = [result.prefixContent, afterJson]
        .filter(Boolean)
        .join('\n')
        .trim();

    } catch (error) {
      console.error('[ToolCallContentParser] Failed to parse tool calls:', error);
      // Return original content on parse failure
      result.cleanContent = content;
    }

    return result;
  }

  /**
   * Convert a raw tool call to the standard ToolCall format
   */
  private static convertToToolCall(raw: RawToolCall, index: number): ToolCall {
    // Generate ID if not provided
    const id = raw.id || `toolcall_${Date.now()}_${index}`;

    // Ensure arguments is a string (may already be JSON string or could be object)
    let argsString: string;
    if (typeof raw.arguments === 'string') {
      argsString = raw.arguments;
    } else {
      argsString = JSON.stringify(raw.arguments);
    }

    return {
      id,
      type: 'function',
      function: {
        name: raw.name,
        arguments: argsString
      }
    };
  }

  /**
   * Parse streaming content incrementally
   * Returns partial result for streaming UI updates
   *
   * @param accumulatedContent - Content accumulated so far in the stream
   * @returns ParsedToolCallResult (may be incomplete if stream is ongoing)
   */
  static parseStreaming(accumulatedContent: string): ParsedToolCallResult & { isComplete: boolean } {
    const result = this.parse(accumulatedContent);

    // Check if the JSON array appears complete (ends with ])
    const isComplete = result.hasToolCalls &&
      accumulatedContent.includes(']') &&
      this.isJsonArrayComplete(accumulatedContent);

    return {
      ...result,
      isComplete
    };
  }

  /**
   * Check if a JSON array in the content appears complete
   */
  private static isJsonArrayComplete(content: string): boolean {
    const jsonMatch = content.match(this.TOOL_CALLS_JSON_PATTERN);
    if (!jsonMatch) return false;

    const jsonString = jsonMatch[1];
    try {
      JSON.parse(jsonString);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extract tool name from partial streaming content
   * Useful for showing tool call UI before full JSON is received
   */
  static extractPartialToolInfo(content: string): { name?: string; inProgress: boolean } {
    if (!this.hasToolCallsFormat(content)) {
      return { inProgress: false };
    }

    // Try to extract the first tool name even if JSON is incomplete
    const nameMatch = content.match(/"name"\s*:\s*"([^"]+)"/);

    return {
      name: nameMatch?.[1],
      inProgress: true
    };
  }
}
