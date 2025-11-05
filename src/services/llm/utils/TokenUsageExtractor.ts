/**
 * Token Usage Extractor Utility
 * Location: src/services/llm/utils/TokenUsageExtractor.ts
 *
 * Extracted from BaseAdapter.ts to follow Single Responsibility Principle.
 * Handles extraction of token usage information from different provider response formats.
 *
 * Usage:
 * - Used by BaseAdapter and all provider adapters
 * - Normalizes token usage data from different provider formats (OpenAI, Anthropic, Google, etc.)
 * - Extracts detailed token breakdowns (cached, reasoning, audio tokens)
 */

import { TokenUsage } from '../adapters/types';

export class TokenUsageExtractor {
  /**
   * Extract token usage from provider response
   * Supports multiple provider formats and detailed token breakdowns
   */
  static extractUsage(response: any): TokenUsage | undefined {
    // Check for usage data
    if (!response.usage) {
      return undefined;
    }

    const usage: TokenUsage = {
      promptTokens: response.usage.prompt_tokens || response.usage.input_tokens || 0,
      completionTokens: response.usage.completion_tokens || response.usage.output_tokens || 0,
      totalTokens: response.usage.total_tokens || 0
    };

    // Extract detailed token breakdowns (OpenAI format)
    if (response.usage.prompt_tokens_details?.cached_tokens) {
      usage.cachedTokens = response.usage.prompt_tokens_details.cached_tokens;
    }

    if (response.usage.completion_tokens_details?.reasoning_tokens) {
      usage.reasoningTokens = response.usage.completion_tokens_details.reasoning_tokens;
    }

    // Audio tokens (sum of input and output if present)
    const inputAudio = response.usage.prompt_tokens_details?.audio_tokens || 0;
    const outputAudio = response.usage.completion_tokens_details?.audio_tokens || 0;
    if (inputAudio + outputAudio > 0) {
      usage.audioTokens = inputAudio + outputAudio;
    }

    return usage;
  }

  /**
   * Format usage for streaming context (convert snake_case to camelCase)
   */
  static formatStreamingUsage(rawUsage: any): TokenUsage | undefined {
    if (!rawUsage) {
      return undefined;
    }

    return {
      promptTokens: rawUsage.prompt_tokens || rawUsage.promptTokens || 0,
      completionTokens: rawUsage.completion_tokens || rawUsage.completionTokens || 0,
      totalTokens: rawUsage.total_tokens || rawUsage.totalTokens || 0,
      cachedTokens: rawUsage.cached_tokens || rawUsage.cachedTokens,
      reasoningTokens: rawUsage.reasoning_tokens || rawUsage.reasoningTokens,
      audioTokens: rawUsage.audio_tokens || rawUsage.audioTokens
    };
  }
}
