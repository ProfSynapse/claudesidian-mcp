/**
 * Location: src/services/llm/utils/WebSearchUtils.ts
 * Summary: Utility functions for web search source extraction and formatting
 * Used by: LLM adapters for standardized source extraction and markdown formatting
 */

import { SearchResult } from '../adapters/types';

export class WebSearchUtils {
  /**
   * Format web search sources as markdown
   */
  static formatSourcesAsMarkdown(sources: SearchResult[]): string {
    if (!sources || sources.length === 0) {
      return '';
    }

    return sources
      .map(source =>
        `- [${source.title}](${source.url})${source.date ? ` - ${source.date}` : ''}`
      )
      .join('\n');
  }

  /**
   * Validate and normalize a search result
   */
  static validateSearchResult(result: any): SearchResult | null {
    if (!result || typeof result !== 'object') {
      return null;
    }

    if (!result.title || !result.url) {
      return null;
    }

    // Validate URL format
    try {
      new URL(result.url);
    } catch {
      return null;
    }

    return {
      title: String(result.title).trim(),
      url: String(result.url).trim(),
      date: result.date ? String(result.date).trim() : undefined
    };
  }

  /**
   * Extract and validate multiple search results
   */
  static extractSearchResults(results: any[]): SearchResult[] {
    if (!Array.isArray(results)) {
      return [];
    }

    return results
      .map(result => this.validateSearchResult(result))
      .filter((result): result is SearchResult => result !== null);
  }

  /**
   * Generate sources section for markdown content
   */
  static generateSourcesSection(sources: SearchResult[]): string {
    if (!sources || sources.length === 0) {
      return '';
    }

    const sourcesMarkdown = this.formatSourcesAsMarkdown(sources);
    return `\n\n---\n\n## Sources\n\n${sourcesMarkdown}`;
  }

  /**
   * Check if provider supports web search
   */
  static isWebSearchSupported(provider: string): boolean {
    const supportedProviders = [
      'perplexity',
      'openrouter',
      'openai',
      'google',
      'anthropic',
      'groq',
      'mistral'
    ];

    return supportedProviders.includes(provider.toLowerCase());
  }

  /**
   * Validate web search request
   */
  static validateWebSearchRequest(provider: string, webSearchRequested: boolean): void {
    if (webSearchRequested && !this.isWebSearchSupported(provider)) {
      const supportedProviders = [
        'perplexity', 'openrouter', 'openai',
        'google', 'anthropic', 'groq', 'mistral'
      ];

      throw new Error(
        `Web search not supported by ${provider}. ` +
        `Supported providers: ${supportedProviders.join(', ')}`
      );
    }
  }
}