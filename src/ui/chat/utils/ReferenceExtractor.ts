/**
 * ReferenceExtractor - Extract references and plain text from contenteditable
 *
 * Handles conversion of styled HTML content to plain text for message sending
 */

import {
  ToolHint,
  AgentReference,
  NoteReference,
  WorkspaceReference
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
  /** Workspace references found */
  workspaces: WorkspaceReference[];
  /** Reference metadata for badge reconstruction */
  references: ExtractedReference[];
}

export interface ExtractedReference {
  type: 'tool' | 'agent' | 'note' | 'workspace';
  displayText: string;
  technicalName: string;
  position: number;
}

export interface ReferenceMetadata {
  references: ExtractedReference[];
}

export class ReferenceExtractor {
  /**
   * Extract all content from contenteditable element
   */
  static extractContent(element: HTMLElement): ExtractedContent {
    const tools: ToolHint[] = [];
    const agents: AgentReference[] = [];
    const notes: NoteReference[] = [];
    const workspaces: WorkspaceReference[] = [];
    const textParts: string[] = [];
    const references: ExtractedReference[] = [];
    let currentOffset = 0;

    const traverse = (node: Node): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text) {
          textParts.push(text);
          currentOffset += text.length;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;

        // Check if this is a reference node
        if (element.classList.contains('chat-reference')) {
          const type = element.getAttribute('data-type');
          const name = element.getAttribute('data-name');
          const displayText = element.textContent || '';

          if (type && name && (type === 'tool' || type === 'agent' || type === 'note' || type === 'workspace')) {
            references.push({
              type,
              displayText,
              technicalName: name,
              position: currentOffset
            });
          }
          // Do not return early - keep traversing children so the display text
          // remains part of the plain-text message sent to the LLM.
        }

        // Traverse children
        for (const child of Array.from(node.childNodes)) {
          traverse(child);
        }

        // Add line break for block elements
        if (this.isBlockElement(element)) {
          textParts.push('\n');
          currentOffset += 1;
        }
      }
    };

    traverse(element);

    const rawText = textParts.join('');
    const leadingWhitespace = rawText.length - rawText.trimStart().length;
    const plainText = rawText.trim();
    const normalizedReferences = references.map(reference => {
      const adjustedPosition = Math.max(0, reference.position - leadingWhitespace);
      const boundedPosition = Math.min(adjustedPosition, plainText.length);
      return {
        ...reference,
        position: boundedPosition
      };
    });

    return {
      plainText,
      tools,
      agents,
      notes,
      workspaces,
      references: normalizedReferences
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
    type: 'tool' | 'agent' | 'note' | 'workspace'
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
    workspaces: number;
    total: number;
  } {
    const tools = this.extractReferencesByType(element, 'tool').length;
    const agents = this.extractReferencesByType(element, 'agent').length;
    const notes = this.extractReferencesByType(element, 'note').length;
    const workspaces = this.extractReferencesByType(element, 'workspace').length;

    return {
      tools,
      agents,
      notes,
      workspaces,
      total: tools + agents + notes + workspaces
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
