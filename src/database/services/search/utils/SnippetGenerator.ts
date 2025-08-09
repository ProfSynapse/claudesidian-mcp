/**
 * SnippetGenerator - Shared utility for generating contextual snippets across all search services
 * DRY implementation to eliminate duplicate snippet generation code in HybridSearchService, 
 * KeywordSearchService, and FuzzySearchService
 */

import { TFile } from 'obsidian';

export interface SnippetOptions {
  /**
   * Length of context window around search matches (in characters)
   * Creates snippets with this many characters before and after the match
   */
  contextLength?: number;

  /**
   * Maximum total snippet length (fallback when no matches found)
   */
  maxLength?: number;

  /**
   * Whether to use word boundaries for cleaner cuts
   */
  useWordBoundaries?: boolean;

  /**
   * Minimum term length to consider for matching
   */
  minTermLength?: number;
}

export interface SearchableContent {
  content: string;
  title?: string;
  filePath?: string;
}

/**
 * Shared snippet generation utility that implements the context window approach
 * Uses Obsidian's content normalization patterns where possible
 */
export class SnippetGenerator {
  private static readonly DEFAULT_CONTEXT_LENGTH = 75;
  private static readonly DEFAULT_MAX_LENGTH = 300;
  private static readonly MIN_TERM_LENGTH = 2;

  /**
   * Generate a contextual snippet with configurable context window around query matches
   * Implements the behavior: contextLength chars before + match + contextLength chars after
   */
  static generateContextSnippet(
    content: string,
    query: string,
    options: SnippetOptions = {}
  ): string {
    const {
      contextLength = this.DEFAULT_CONTEXT_LENGTH,
      maxLength = this.DEFAULT_MAX_LENGTH,
      useWordBoundaries = true,
      minTermLength = this.MIN_TERM_LENGTH
    } = options;

    if (!content || content.length === 0) {
      return '';
    }

    // Clean up content using Obsidian's content normalization approach
    const cleanContent = content.replace(/\s+/g, ' ').trim();
    
    // If content fits within total context window, return it as is
    const totalContextWindow = contextLength * 2;
    if (cleanContent.length <= totalContextWindow) {
      return cleanContent;
    }

    // Try to find query terms in content for contextual snippet
    const queryTerms = this.extractQueryTerms(query, minTermLength);
    
    // Search for the best match location
    const matchInfo = this.findBestMatch(cleanContent, queryTerms);
    
    if (matchInfo) {
      return this.createContextWindow(
        cleanContent, 
        matchInfo, 
        contextLength, 
        useWordBoundaries
      );
    }

    // Fallback to beginning of content if no query terms found
    return this.createFallbackSnippet(cleanContent, maxLength, useWordBoundaries);
  }

  /**
   * Generate snippet from searchable document (for KeywordSearchService compatibility)
   */
  static generateDocumentSnippet(
    doc: SearchableContent,
    queryTerms: string[],
    phraseTerms: string[] = [],
    options: SnippetOptions = {}
  ): string {
    const content = doc.content;
    
    if (!content || content.length === 0) {
      return doc.title || '';
    }

    const allTerms = [...queryTerms, ...phraseTerms];
    const query = allTerms.join(' ');
    
    return this.generateContextSnippet(content, query, options);
  }

  /**
   * Extract meaningful query terms from search query
   */
  private static extractQueryTerms(query: string, minLength: number): string[] {
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter(term => term.length >= minLength)
      .map(term => term.replace(/[^\w]/g, '')) // Remove non-word characters
      .filter(term => term.length >= minLength);
  }

  /**
   * Find the best match location in content
   */
  private static findBestMatch(
    content: string, 
    queryTerms: string[]
  ): { index: number; term: string; length: number } | null {
    const contentLower = content.toLowerCase();
    
    // Try exact phrase matches first
    for (const term of queryTerms) {
      const index = contentLower.indexOf(term);
      if (index !== -1) {
        return {
          index,
          term,
          length: term.length
        };
      }
    }

    // Try partial matches for longer terms
    for (const term of queryTerms.filter(t => t.length > 3)) {
      const partial = term.substring(0, Math.floor(term.length * 0.7));
      const index = contentLower.indexOf(partial);
      if (index !== -1) {
        return {
          index,
          term: partial,
          length: partial.length
        };
      }
    }

    return null;
  }

  /**
   * Create context window around the found match
   */
  private static createContextWindow(
    content: string,
    matchInfo: { index: number; term: string; length: number },
    contextLength: number,
    useWordBoundaries: boolean
  ): string {
    const { index, length } = matchInfo;
    
    // Create context window: contextLength chars before + match + contextLength chars after
    let start = Math.max(0, index - contextLength);
    let end = Math.min(content.length, index + length + contextLength);
    
    // Adjust for word boundaries if requested
    if (useWordBoundaries) {
      start = this.adjustToWordBoundary(content, start, 'start');
      end = this.adjustToWordBoundary(content, end, 'end');
    }
    
    let snippet = content.substring(start, end);
    
    // Add ellipses if content was truncated
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';
    
    return snippet;
  }

  /**
   * Adjust position to word boundary for cleaner cuts
   */
  private static adjustToWordBoundary(
    content: string, 
    position: number, 
    direction: 'start' | 'end'
  ): number {
    if (direction === 'start') {
      // Move forward to next word boundary
      while (position < content.length && /\S/.test(content[position])) {
        position++;
      }
      while (position < content.length && /\s/.test(content[position])) {
        position++;
      }
    } else {
      // Move backward to previous word boundary
      while (position > 0 && /\S/.test(content[position - 1])) {
        position--;
      }
    }
    return position;
  }

  /**
   * Create fallback snippet from beginning of content
   */
  private static createFallbackSnippet(
    content: string, 
    maxLength: number, 
    useWordBoundaries: boolean
  ): string {
    if (content.length <= maxLength) {
      return content;
    }

    let cutPosition = maxLength;
    
    if (useWordBoundaries) {
      // Find the last complete word within maxLength
      cutPosition = this.adjustToWordBoundary(content, maxLength, 'end');
    }
    
    return content.substring(0, cutPosition) + (cutPosition < content.length ? '...' : '');
  }
}