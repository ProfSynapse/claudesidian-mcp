/**
 * Enhanced Markdown Renderer Service
 * 
 * Provides streaming markdown rendering using streaming-markdown library
 * with fallback to Obsidian's native MarkdownRenderer API for final rendering.
 */

import { App, Component, MarkdownRenderer as ObsidianMarkdownRenderer } from 'obsidian';
import * as smd from 'streaming-markdown';

export class MarkdownRenderer {
  
  /**
   * Render complete markdown content using Obsidian's native renderer
   * This provides full markdown support including blockquotes, checkboxes, strikethrough, etc.
   */
  static async renderMarkdown(
    content: string, 
    container: HTMLElement, 
    app: App, 
    component: Component
  ): Promise<void> {
    try {
      // Clear container first
      container.empty();
      
      // Use Obsidian's native markdown renderer
      await ObsidianMarkdownRenderer.render(
        app,
        content,
        container,
        '', // sourcePath - empty for chat context
        component
      );
      
    } catch (error) {
      console.error('[MarkdownRenderer] Error rendering markdown:', error);
      // Fallback to plain text if rendering fails
      this.renderPlainText(content, container);
    }
  }

  /**
   * Initialize streaming markdown parser for progressive rendering
   */
  static initializeStreamingParser(container: HTMLElement): any {
    console.log('[STREAM DEBUG] MarkdownRenderer.initializeStreamingParser called', {
      containerClassName: container.className,
      containerChildCount: container.children.length
    });
    
    // Clear container
    container.empty();
    
    // Create dedicated content container for streaming-markdown
    const contentDiv = document.createElement('div');
    contentDiv.className = 'streaming-content';
    container.appendChild(contentDiv);
    
    console.log('[STREAM DEBUG] Created contentDiv', {
      contentDivClassName: contentDiv.className,
      containerChildCount: container.children.length
    });
    
    // Initialize streaming-markdown renderer with content div
    const renderer = smd.default_renderer(contentDiv);
    const parser = smd.parser(renderer);
    
    console.log('[STREAM DEBUG] Created parser and renderer', {
      hasRenderer: !!renderer,
      hasParser: !!parser,
      rendererData: renderer?.data
    });
    
    return { parser, renderer, contentDiv };
  }

  /**
   * Write chunk to streaming markdown parser
   */
  static writeStreamingChunk(streamingState: any, chunk: string): void {
    console.log('[STREAM DEBUG] MarkdownRenderer.writeStreamingChunk called', {
      hasStreamingState: !!streamingState,
      hasParser: !!streamingState?.parser,
      chunkLength: chunk.length,
      chunkContent: chunk.substring(0, 30) + '...',
      contentDivExists: !!streamingState?.contentDiv,
      contentDivChildCount: streamingState?.contentDiv?.children?.length || 0
    });
    
    if (streamingState && streamingState.parser) {
      try {
        smd.parser_write(streamingState.parser, chunk);
        
        console.log('[STREAM DEBUG] After parser_write', {
          contentDivChildCount: streamingState?.contentDiv?.children?.length || 0,
          contentDivHTML: streamingState?.contentDiv?.innerHTML?.substring(0, 100) + '...'
        });
      } catch (error) {
        console.error('[MarkdownRenderer] Error writing streaming chunk:', error);
      }
    }
  }

  /**
   * Finalize streaming parser and optionally render with Obsidian
   */
  static async finalizeStreamingContent(
    streamingState: any,
    finalContent: string,
    container: HTMLElement,
    app: App,
    component: Component,
    useObsidianRenderer: boolean = true
  ): Promise<void> {
    // Finalize streaming parser
    if (streamingState && streamingState.parser) {
      try {
        smd.parser_end(streamingState.parser);
      } catch (error) {
        console.error('[MarkdownRenderer] Error finalizing streaming parser:', error);
      }
    }
    
    // Optionally replace with Obsidian's native renderer for advanced features
    if (useObsidianRenderer && this.hasAdvancedMarkdownFeatures(finalContent)) {
      // Remove streaming content
      const streamingContent = container.querySelector('.streaming-content');
      if (streamingContent) {
        streamingContent.remove();
      }
      
      // Render final content with full Obsidian renderer
      const finalDiv = document.createElement('div');
      finalDiv.className = 'final-content';
      container.appendChild(finalDiv);
      
      try {
        await ObsidianMarkdownRenderer.render(
          app,
          finalContent,
          finalDiv,
          '',
          component
        );
      } catch (error) {
        console.error('[MarkdownRenderer] Error finalizing with Obsidian renderer:', error);
        // Keep the streaming-markdown result
        if (streamingContent) {
          container.appendChild(streamingContent);
        }
      }
    }
  }

  /**
   * Check if content has advanced markdown features that benefit from Obsidian renderer
   */
  private static hasAdvancedMarkdownFeatures(content: string): boolean {
    const advancedPatterns = [
      /^-\s\[[x\s]\]/m, // Checkboxes
      /^\>/m, // Blockquotes  
      /\[\[.*\]\]/m, // Internal links
      /!\[\[.*\]\]/m, // Embedded files
      /^\|.*\|/m, // Tables
      /^```\w/m, // Code blocks with language
    ];
    
    return advancedPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Fallback plain text rendering
   */
  private static renderPlainText(content: string, container: HTMLElement): void {
    const pre = document.createElement('pre');
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.wordWrap = 'break-word';
    pre.textContent = content;
    container.appendChild(pre);
  }

  /**
   * Escape HTML for safe display
   */
  private static escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Check if content appears to be markdown (has common markdown patterns)
   */
  static hasMarkdownFormatting(content: string): boolean {
    const markdownPatterns = [
      /^#{1,6}\s/, // Headers
      /^\*\s|\d+\.\s/, // Lists
      /^\>\s/, // Blockquotes
      /^-\s\[[\sx]\]\s/, // Checkboxes
      /\*\*.*\*\*/, // Bold
      /\*.*\*/, // Italic
      /`.*`/, // Inline code
      /```/, // Code blocks
      /~~.*~~/, // Strikethrough
    ];
    
    return markdownPatterns.some(pattern => pattern.test(content));
  }
}