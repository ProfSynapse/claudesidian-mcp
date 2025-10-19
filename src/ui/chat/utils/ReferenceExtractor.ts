/**
 * ReferenceExtractor - Extract references and plain text from contenteditable
 *
 * Handles conversion of styled HTML content to plain text for message sending
 */

import {
  ToolHint,
  AgentReference,
  NoteReference
} from '../components/suggesters/base/SuggesterInterfaces';

export interface ExtractedContent {
  /** Plain text message (without reference markers) */
  plainText: string;
  /** Tool references found */
  tools: ToolHint[];
  /** Agent references found */
  agents: AgentReference[];
  /** Note references found */
  notes: NoteReference[];
}

export class ReferenceExtractor {
  /**
   * Extract all content from contenteditable element
   */
  static extractContent(element: HTMLElement): ExtractedContent {
    const tools: ToolHint[] = [];
    const agents: AgentReference[] = [];
    const notes: NoteReference[] = [];
    const textParts: string[] = [];

    const traverse = (node: Node): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text) {
          textParts.push(text);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;

        // Check if this is a reference node
        if (element.classList.contains('chat-reference')) {
          const type = element.getAttribute('data-type');
          const name = element.getAttribute('data-name');
          const displayText = element.textContent || '';

          if (type && name) {
            // Store reference (already added via MessageEnhancer during selection)
            // Just skip in text output
            return;
          }
        }

        // Traverse children
        for (const child of Array.from(node.childNodes)) {
          traverse(child);
        }

        // Add line break for block elements
        if (this.isBlockElement(element)) {
          textParts.push('\n');
        }
      }
    };

    traverse(element);

    const plainText = textParts.join('').trim();

    return {
      plainText,
      tools,
      agents,
      notes
    };
  }

  /**
   * Get just the plain text (for display/processing)
   */
  static getPlainText(element: HTMLElement): string {
    return this.extractContent(element).plainText;
  }

  /**
   * Check if an element is a block-level element
   */
  private static isBlockElement(element: HTMLElement): boolean {
    const blockTags = ['DIV', 'P', 'BR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI'];
    return blockTags.includes(element.tagName);
  }

  /**
   * Extract references by type
   */
  static extractReferencesByType(
    element: HTMLElement,
    type: 'tool' | 'agent' | 'note'
  ): Array<{ displayText: string; technicalName: string }> {
    const references: Array<{ displayText: string; technicalName: string }> = [];

    const traverse = (node: Node): void => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;

        if (
          el.classList.contains('chat-reference') &&
          el.getAttribute('data-type') === type
        ) {
          const name = el.getAttribute('data-name');
          const displayText = el.textContent || '';
          if (name) {
            references.push({ displayText, technicalName: name });
          }
        }

        // Traverse children
        for (const child of Array.from(node.childNodes)) {
          traverse(child);
        }
      }
    };

    traverse(element);
    return references;
  }

  /**
   * Count references in the element
   */
  static countReferences(element: HTMLElement): {
    tools: number;
    agents: number;
    notes: number;
    total: number;
  } {
    const tools = this.extractReferencesByType(element, 'tool').length;
    const agents = this.extractReferencesByType(element, 'agent').length;
    const notes = this.extractReferencesByType(element, 'note').length;

    return {
      tools,
      agents,
      notes,
      total: tools + agents + notes
    };
  }

  /**
   * Check if element has any references
   */
  static hasReferences(element: HTMLElement): boolean {
    return element.querySelector('.chat-reference') !== null;
  }

  /**
   * Remove all references from element (for testing/cleanup)
   */
  static removeAllReferences(element: HTMLElement): void {
    const references = element.querySelectorAll('.chat-reference');
    references.forEach(ref => ref.remove());
  }
}
