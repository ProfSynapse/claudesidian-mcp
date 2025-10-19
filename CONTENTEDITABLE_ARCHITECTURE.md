# ContentEditable Chat Input Architecture

**Version:** 1.0
**Status:** Architectural Specification
**Author:** PACT Architect
**Date:** 2025-10-19

---

## Executive Summary

This document outlines the architectural plan to convert the chat input system from a plain `<textarea>` element to a rich `contenteditable` `<div>` with styled inline references. The conversion will enable visual differentiation of tools (`/ToolName`), agents (`@AgentName`), and notes (`[[NoteName]]`) while maintaining all existing functionality including auto-complete suggestions, keyboard navigation, and message enhancement.

### Key Objectives

1. **Visual Enhancement**: Display references as styled badges/pills instead of plain text
2. **Functional Parity**: Maintain all existing suggester and input behaviors
3. **Clean Architecture**: Create reusable utilities for contenteditable manipulation
4. **Backward Compatibility**: Ensure seamless conversion to plain text for message sending
5. **User Experience**: Improve reference editing, deletion, and navigation behaviors

### High-Level Impact

- **Files Modified**: 7 core files
- **New Files**: 3 utility modules
- **Lines of Code**: ~1200 new/modified LOC
- **Risk Level**: Medium (requires careful DOM manipulation)
- **Implementation Time**: 2-3 development days

---

## Table of Contents

1. [System Context & Architecture Overview](#1-system-context--architecture-overview)
2. [Component Architecture](#2-component-architecture)
3. [Data Architecture & Flow](#3-data-architecture--flow)
4. [API Specifications](#4-api-specifications)
5. [Technology Decisions](#5-technology-decisions)
6. [Implementation Roadmap](#6-implementation-roadmap)
7. [File-by-File Implementation Plan](#7-file-by-file-implementation-plan)
8. [Styling Architecture](#8-styling-architecture)
9. [Edge Cases & Solutions](#9-edge-cases--solutions)
10. [Risk Assessment & Mitigation](#10-risk-assessment--mitigation)
11. [Testing Strategy](#11-testing-strategy)
12. [Quality Checks](#12-quality-checks)

---

## 1. System Context & Architecture Overview

### 1.1 Current System Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                        ChatInput                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │ HTMLTextAreaElement                                 │    │
│  │  - Plain text input                                 │    │
│  │  - selectionStart/selectionEnd API                  │    │
│  │  - .value property                                  │    │
│  └────────────────────────────────────────────────────┘    │
│                           │                                  │
│                           ▼                                  │
│  ┌────────────────────────────────────────────────────┐    │
│  │ TextAreaSuggester (Base Class)                      │    │
│  │  - Cursor position via selectionStart               │    │
│  │  - Text insertion via .value manipulation           │    │
│  │  - RegEx trigger matching                           │    │
│  └────────────────────────────────────────────────────┘    │
│       │                    │                    │            │
│       ▼                    ▼                    ▼            │
│  ┌─────────┐         ┌─────────┐         ┌─────────┐       │
│  │  Tool   │         │  Agent  │         │  Note   │       │
│  │Suggester│         │Suggester│         │Suggester│       │
│  └─────────┘         └─────────┘         └─────────┘       │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ MessageEnhancer                                     │    │
│  │  - Collects references                              │    │
│  │  - Cleans message (removes markers)                 │    │
│  │  - Builds enhancement metadata                      │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Target System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        ChatInput                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │ ContentEditableDiv                                  │    │
│  │  - Rich HTML content                                │    │
│  │  - Selection/Range API                              │    │
│  │  - Styled reference spans                           │    │
│  │    <span class="ref-tool">/ReadFile</span>          │    │
│  │    <span class="ref-agent">@CodeExpert</span>       │    │
│  │    <span class="ref-note">[[ProjectNotes]]</span>   │    │
│  └────────────────────────────────────────────────────┘    │
│                           │                                  │
│                           ▼                                  │
│  ┌────────────────────────────────────────────────────┐    │
│  │ ContentEditableHelper (NEW)                         │    │
│  │  - getCursorPosition(): { text, offset }            │    │
│  │  - setCursorPosition(offset)                        │    │
│  │  - insertNode(node)                                 │    │
│  │  - getPlainText(): string                           │    │
│  │  - getRichText(): string (HTML)                     │    │
│  └────────────────────────────────────────────────────┘    │
│                           │                                  │
│                           ▼                                  │
│  ┌────────────────────────────────────────────────────┐    │
│  │ ContentEditableSuggester (Base Class) (NEW)         │    │
│  │  - Cursor position via Selection API                │    │
│  │  - Text insertion via DOM manipulation              │    │
│  │  - Reference creation as styled spans               │    │
│  └────────────────────────────────────────────────────┘    │
│       │                    │                    │            │
│       ▼                    ▼                    ▼            │
│  ┌─────────┐         ┌─────────┐         ┌─────────┐       │
│  │  Tool   │         │  Agent  │         │  Note   │       │
│  │Suggester│         │Suggester│         │Suggester│       │
│  │ (Updated)│        │ (Updated)│        │ (Updated)│       │
│  └─────────┘         └─────────┘         └─────────┘       │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ ReferenceExtractor (NEW)                            │    │
│  │  - extractPlainText(html): string                   │    │
│  │  - extractReferences(html): Reference[]             │    │
│  │  - parseReference(node): Reference | null           │    │
│  └────────────────────────────────────────────────────┘    │
│                           │                                  │
│                           ▼                                  │
│  ┌────────────────────────────────────────────────────┐    │
│  │ MessageEnhancer                                     │    │
│  │  - Collects references (unchanged)                  │    │
│  │  - Builds enhancement metadata (unchanged)          │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 External Dependencies

- **Obsidian API**: `App`, `setIcon`, `prepareFuzzySearch`, `TFile`
- **Browser APIs**:
  - Selection API (`window.getSelection()`)
  - Range API (`document.createRange()`)
  - MutationObserver (optional, for tracking changes)
  - Input events (`beforeinput`, `input`)

---

## 2. Component Architecture

### 2.1 Component Hierarchy

```
ChatInput (Modified)
├── ContentEditableDiv (element)
│   ├── Text nodes
│   └── Reference spans
│       ├── <span class="ref-tool" contenteditable="false">
│       ├── <span class="ref-agent" contenteditable="false">
│       └── <span class="ref-note" contenteditable="false">
│
├── ContentEditableHelper (NEW utility)
│   ├── Cursor manipulation
│   ├── Text extraction
│   └── Node insertion
│
├── ContentEditableSuggester (NEW base class)
│   ├── Selection-based cursor tracking
│   ├── DOM-based text insertion
│   └── Reference creation
│
├── ToolSuggester (Updated)
├── AgentSuggester (Updated)
├── NoteSuggester (Updated)
│
└── ReferenceExtractor (NEW utility)
    ├── HTML to plain text conversion
    ├── Reference parsing
    └── Metadata extraction
```

### 2.2 Responsibility Matrix

| Component | Single Responsibility |
|-----------|----------------------|
| `ChatInput` | Manage input lifecycle, coordinate suggesters, handle send/stop |
| `ContentEditableHelper` | Abstract contenteditable DOM manipulation |
| `ContentEditableSuggester` | Base suggester logic adapted for Selection API |
| `ReferenceExtractor` | Convert rich HTML to plain text and extract references |
| `ToolSuggester` | Tool-specific suggestion logic (unchanged core logic) |
| `AgentSuggester` | Agent-specific suggestion logic (unchanged core logic) |
| `NoteSuggester` | Note-specific suggestion logic (unchanged core logic) |
| `MessageEnhancer` | Collect and organize references (unchanged) |

---

## 3. Data Architecture & Flow

### 3.1 Data Flow Diagram

```
┌─────────────┐
│ User Types  │
│   "/read"   │
└─────┬───────┘
      │
      ▼
┌──────────────────────┐
│ ContentEditableDiv   │
│ innerHTML: "/read"   │
└─────┬────────────────┘
      │ input event
      ▼
┌──────────────────────────────┐
│ ContentEditableSuggester     │
│ 1. Get cursor position       │
│ 2. Extract text before cursor│
│ 3. Match trigger pattern     │
└─────┬────────────────────────┘
      │ trigger matched
      ▼
┌──────────────────────────┐
│ ToolSuggester            │
│ Get suggestions          │
└─────┬────────────────────┘
      │
      ▼
┌──────────────────────────┐
│ User selects suggestion  │
│ "Read File"              │
└─────┬────────────────────┘
      │
      ▼
┌──────────────────────────────────────┐
│ ToolSuggester.selectSuggestion()     │
│ 1. Create styled span:               │
│    <span class="ref-tool"            │
│          data-type="tool"            │
│          data-name="vaultManager...">│
│      /ReadFile                       │
│    </span>                           │
│ 2. Replace "/read" with span         │
│ 3. Move cursor after span            │
│ 4. Add to MessageEnhancer            │
└─────┬────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────┐
│ ContentEditableDiv                   │
│ <span class="ref-tool">/ReadFile</span>│
│ get project status                   │
└─────┬────────────────────────────────┘
      │ User presses Enter
      ▼
┌──────────────────────────────────────┐
│ ChatInput.handleSendMessage()        │
│ 1. Call ReferenceExtractor           │
│ 2. Get plain text: "/ReadFile get..."│
│ 3. Get MessageEnhancer data          │
│ 4. Send to onSendMessage callback    │
└──────────────────────────────────────┘
```

### 3.2 Reference Data Structure

#### HTML Representation
```html
<span
  class="ref-tool"
  contenteditable="false"
  data-type="tool"
  data-name="vaultManager.readFile"
  data-display="/ReadFile">
  /ReadFile
</span>
```

#### Extracted Plain Text
```
/ReadFile
```

#### Reference Metadata (in MessageEnhancer)
```typescript
{
  type: 'tool',
  name: 'vaultManager.readFile',
  displayName: 'Read File',
  schema: { /* tool schema */ }
}
```

### 3.3 State Management

```typescript
// ChatInput internal state
{
  element: HTMLElement | null;              // Container
  inputDiv: HTMLDivElement | null;          // NEW: contenteditable div
  sendButton: HTMLButtonElement | null;
  isLoading: boolean;
  suggesters: SuggesterInstances | null;
}

// ContentEditableSuggester state
{
  inputDiv: HTMLDivElement;                 // NEW: Reference to input
  suggestionContainer: HTMLElement | null;
  suggestions: SuggestionItem<T>[];
  selectedIndex: number;
  isActive: boolean;
}

// MessageEnhancer state (unchanged)
{
  tools: ToolHint[];
  agents: AgentReference[];
  notes: NoteReference[];
}
```

---

## 4. API Specifications

### 4.1 ContentEditableHelper Utility

**Location**: `/src/ui/chat/utils/ContentEditableHelper.ts`

```typescript
/**
 * Utility class for contenteditable DOM manipulation
 * Abstracts browser Selection/Range API complexity
 */
export class ContentEditableHelper {
  /**
   * Get current cursor position and surrounding text
   * @param element - The contenteditable element
   * @returns Cursor context
   */
  static getCursorContext(element: HTMLElement): {
    textBeforeCursor: string;
    textAfterCursor: string;
    offset: number;
    range: Range | null;
  };

  /**
   * Set cursor position in contenteditable element
   * @param element - The contenteditable element
   * @param offset - Character offset from start
   */
  static setCursorPosition(element: HTMLElement, offset: number): void;

  /**
   * Insert a DOM node at current cursor position
   * @param element - The contenteditable element
   * @param node - Node to insert
   * @param moveCursorAfter - Whether to move cursor after inserted node
   */
  static insertNodeAtCursor(
    element: HTMLElement,
    node: Node,
    moveCursorAfter?: boolean
  ): void;

  /**
   * Replace text range with a node
   * @param element - The contenteditable element
   * @param startOffset - Start position
   * @param endOffset - End position
   * @param node - Replacement node
   */
  static replaceTextWithNode(
    element: HTMLElement,
    startOffset: number,
    endOffset: number,
    node: Node
  ): void;

  /**
   * Get plain text content (ignoring HTML)
   * @param element - The contenteditable element
   * @returns Plain text string
   */
  static getPlainText(element: HTMLElement): string;

  /**
   * Get text content up to cursor position
   * @param element - The contenteditable element
   * @returns Text before cursor
   */
  static getTextBeforeCursor(element: HTMLElement): string;

  /**
   * Create a styled reference span
   * @param type - Reference type (tool|agent|note)
   * @param displayText - Visual text
   * @param metadata - Additional data attributes
   * @returns Styled span element
   */
  static createReferenceSpan(
    type: 'tool' | 'agent' | 'note',
    displayText: string,
    metadata?: Record<string, string>
  ): HTMLSpanElement;

  /**
   * Check if cursor is inside a reference span
   * @param element - The contenteditable element
   * @returns Reference span or null
   */
  static getCursorReferenceSpan(element: HTMLElement): HTMLSpanElement | null;

  /**
   * Set contenteditable placeholder
   * @param element - The contenteditable element
   * @param placeholder - Placeholder text
   */
  static setPlaceholder(element: HTMLElement, placeholder: string): void;
}
```

### 4.2 ReferenceExtractor Utility

**Location**: `/src/ui/chat/utils/ReferenceExtractor.ts`

```typescript
/**
 * Utility for extracting plain text and references from rich HTML
 */
export class ReferenceExtractor {
  /**
   * Convert HTML to plain text with references preserved
   * @param html - HTML content from contenteditable
   * @returns Plain text string
   */
  static extractPlainText(html: string): string;

  /**
   * Extract all reference spans from HTML
   * @param html - HTML content from contenteditable
   * @returns Array of reference metadata
   */
  static extractReferences(html: string): ParsedReference[];

  /**
   * Parse a single reference span element
   * @param element - The span element
   * @returns Parsed reference or null
   */
  static parseReferenceSpan(element: HTMLElement): ParsedReference | null;

  /**
   * Clean HTML for sending (strip non-reference formatting)
   * @param html - Raw HTML content
   * @returns Cleaned text with references
   */
  static cleanForSending(html: string): string;
}

/**
 * Parsed reference structure
 */
export interface ParsedReference {
  type: 'tool' | 'agent' | 'note';
  displayText: string;
  technicalName: string;
  metadata: Record<string, string>;
}
```

### 4.3 ContentEditableSuggester Base Class

**Location**: `/src/ui/chat/components/suggesters/ContentEditableSuggester.ts`

```typescript
/**
 * Base class for contenteditable-based suggesters
 * Replaces TextAreaSuggester for contenteditable elements
 */
export abstract class ContentEditableSuggester<T> {
  protected app: App;
  protected config: SuggesterConfig;
  protected inputDiv: HTMLDivElement;
  protected suggestionContainer: HTMLElement | null = null;
  protected suggestions: SuggestionItem<T>[] = [];
  protected selectedIndex = 0;
  protected isActive = false;

  constructor(
    app: App,
    inputDiv: HTMLDivElement,
    config: SuggesterConfig
  );

  // Abstract methods (must be implemented by subclasses)
  abstract getSuggestions(query: string): Promise<SuggestionItem<T>[]> | SuggestionItem<T>[];
  abstract renderSuggestion(item: SuggestionItem<T>, el: HTMLElement): void;
  abstract selectSuggestion(item: SuggestionItem<T>): void;

  // NEW: Create reference span for selected suggestion
  abstract createReferenceSpan(item: SuggestionItem<T>): HTMLSpanElement;

  // Protected utility methods
  protected onInput(): Promise<void>;
  protected onKeyDown(e: KeyboardEvent): void;
  protected show(): void;
  protected close(): void;
  protected confirmSelection(): void;

  // NEW: Selection-based methods
  protected getCursorContext(): { text: string; offset: number };
  protected replaceTextWithReference(
    startOffset: number,
    endOffset: number,
    referenceSpan: HTMLSpanElement
  ): void;

  public destroy(): void;
}
```

### 4.4 Updated ChatInput Interface

```typescript
export class ChatInput {
  private element: HTMLElement | null = null;
  private inputDiv: HTMLDivElement | null = null;  // CHANGED: was textArea
  private sendButton: HTMLButtonElement | null = null;
  private isLoading = false;
  private suggesters: SuggesterInstances | null = null;

  // Public API (unchanged signatures)
  setLoading(loading: boolean): void;
  setPlaceholder(placeholder: string): void;  // UPDATED: uses ContentEditableHelper
  focus(): void;
  clear(): void;
  getValue(): string;  // UPDATED: calls ReferenceExtractor.extractPlainText
  setValue(value: string): void;  // UPDATED: sets innerHTML
  getMessageEnhancer(): MessageEnhancer | null;
  cleanup(): void;

  // Private methods (updated implementations)
  private render(): void;  // Creates contenteditable div
  private handleSendMessage(): void;  // Uses ReferenceExtractor
  private autoResizeInput(): void;  // Renamed from autoResizeTextarea
  private updateUI(): void;
}
```

---

## 5. Technology Decisions

### 5.1 ContentEditable vs Alternatives

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| **ContentEditable** | Native browser support, rich text, styled elements | Complex API, cross-browser quirks | **SELECTED** |
| Custom input + overlays | Full control, predictable | Complex synchronization, accessibility issues | Rejected |
| Draft.js / Slate | Full-featured | Heavy dependency, learning curve | Rejected (overkill) |
| Textarea + CSS overlays | Simple fallback | Limited interactivity with styled elements | Rejected |

**Rationale**: ContentEditable provides the best balance of native functionality and styling capabilities while maintaining accessibility and avoiding heavy dependencies.

### 5.2 Reference Implementation Strategy

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| **Inline spans with contenteditable=false** | Prevents editing, acts like chips, easy deletion | Slightly complex cursor handling | **SELECTED** |
| Editable spans | Simpler cursor logic | User can break reference integrity | Rejected |
| Custom elements | Clean separation | Requires polyfills, more complex | Rejected |
| Button elements | True "chip" UX | Non-semantic, complex styling | Rejected |

**Rationale**: Non-editable spans (`contenteditable="false"`) provide the best UX by treating references as atomic units while maintaining semantic HTML.

### 5.3 Text Extraction Strategy

**Selected Approach**: DOM traversal with whitespace preservation

```typescript
// Example implementation logic
function extractPlainText(element: HTMLElement): string {
  let text = '';

  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.classList.contains('ref-tool') ||
          el.classList.contains('ref-agent') ||
          el.classList.contains('ref-note')) {
        // Extract original reference text from data attribute
        text += el.dataset.display || el.textContent;
      } else if (el.tagName === 'BR') {
        text += '\n';
      } else {
        text += extractPlainText(el);  // Recurse
      }
    }
  }

  return text;
}
```

**Rationale**: Direct DOM traversal gives precise control over text extraction and handles edge cases like nested elements and line breaks.

### 5.4 Backward Compatibility

**Strategy**: Feature detection with graceful degradation

```typescript
function initializeInput(container: HTMLElement): HTMLElement {
  // Check for contenteditable support
  const supportsContentEditable = 'isContentEditable' in document.createElement('div');

  if (supportsContentEditable) {
    // Use contenteditable implementation
    return createContentEditableInput(container);
  } else {
    // Fallback to textarea (legacy code path)
    return createTextAreaInput(container);
  }
}
```

**Rollback Plan**: Keep old textarea code in separate files for 1-2 versions, allowing easy rollback if critical issues arise.

---

## 6. Implementation Roadmap

### Phase 1: Foundation (Day 1)
**Goal**: Create core utilities and contenteditable infrastructure

```
✓ Create ContentEditableHelper utility
  - Implement cursor position methods
  - Implement text extraction methods
  - Implement node insertion methods
  - Write unit tests

✓ Create ReferenceExtractor utility
  - Implement HTML to text conversion
  - Implement reference parsing
  - Write unit tests

✓ Update ChatInput to use contenteditable
  - Replace textarea with div
  - Update event handlers
  - Update getValue/setValue methods
  - Test basic input functionality
```

### Phase 2: Suggester Adaptation (Day 2)
**Goal**: Adapt suggester system for contenteditable

```
✓ Create ContentEditableSuggester base class
  - Port core logic from TextAreaSuggester
  - Adapt to Selection API
  - Implement reference span creation
  - Test trigger detection

✓ Update ToolSuggester
  - Extend ContentEditableSuggester
  - Update selectSuggestion to create styled spans
  - Test with tool suggestions

✓ Update AgentSuggester
  - Extend ContentEditableSuggester
  - Update selectSuggestion to create styled spans
  - Test with agent suggestions

✓ Update NoteSuggester
  - Extend ContentEditableSuggester
  - Update selectSuggestion to create styled spans
  - Test with note suggestions
```

### Phase 3: Styling & Polish (Day 2-3)
**Goal**: Add visual styling and handle edge cases

```
✓ Implement CSS for reference spans
  - Tool reference styles (green badge)
  - Agent reference styles (purple badge)
  - Note reference styles (blue badge)
  - Hover and focus states

✓ Handle placeholder
  - CSS ::before pseudo-element
  - Show/hide based on content

✓ Implement paste handling
  - Strip formatting from external content
  - Preserve references from internal copy

✓ Handle reference deletion
  - Backspace deletes entire reference
  - Delete key deletes entire reference
  - Selection + delete removes references
```

### Phase 4: Edge Cases & Testing (Day 3)
**Goal**: Ensure robustness and polish UX

```
✓ Test edge cases
  - Multiple references in sequence
  - Mixed content (text + references)
  - Copy/paste behavior
  - Cursor navigation through references
  - Undo/redo behavior

✓ Test keyboard navigation
  - Arrow keys skip over references
  - Home/End keys work correctly
  - Selection across references

✓ Test accessibility
  - Screen reader support
  - Keyboard-only navigation
  - ARIA attributes

✓ Performance testing
  - Large messages with many references
  - Rapid typing
  - Suggester performance
```

### Milestones

| Milestone | Deliverable | Acceptance Criteria |
|-----------|-------------|---------------------|
| M1: Core Utilities | ContentEditableHelper, ReferenceExtractor | Unit tests pass, API stable |
| M2: Basic Input | ContentEditable input working | Can type, send messages, basic formatting |
| M3: Suggesters Working | All three suggesters functional | Can trigger, select, insert references |
| M4: Styled References | CSS applied, visual distinction | References appear as badges/pills |
| M5: Edge Cases Handled | Paste, delete, navigation | No UX regressions, smooth interactions |
| M6: Production Ready | All tests passing, docs updated | Ready for merge and release |

---

## 7. File-by-File Implementation Plan

### 7.1 New File: `ContentEditableHelper.ts`

**Path**: `/src/ui/chat/utils/ContentEditableHelper.ts`

**Purpose**: Abstract contenteditable DOM manipulation

**Implementation Steps**:

1. **Create file structure**
```typescript
export class ContentEditableHelper {
  // Cursor methods
  static getCursorContext(element: HTMLElement): CursorContext { }
  static setCursorPosition(element: HTMLElement, offset: number): void { }
  static getTextBeforeCursor(element: HTMLElement): string { }

  // Node manipulation
  static insertNodeAtCursor(element: HTMLElement, node: Node, moveCursorAfter?: boolean): void { }
  static replaceTextWithNode(element: HTMLElement, startOffset: number, endOffset: number, node: Node): void { }

  // Text extraction
  static getPlainText(element: HTMLElement): string { }

  // Reference creation
  static createReferenceSpan(type: 'tool' | 'agent' | 'note', displayText: string, metadata?: Record<string, string>): HTMLSpanElement { }
  static getCursorReferenceSpan(element: HTMLElement): HTMLSpanElement | null { }

  // Placeholder
  static setPlaceholder(element: HTMLElement, placeholder: string): void { }
}

interface CursorContext {
  textBeforeCursor: string;
  textAfterCursor: string;
  offset: number;
  range: Range | null;
}
```

2. **Implement getCursorContext**
```typescript
static getCursorContext(element: HTMLElement): CursorContext {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return { textBeforeCursor: '', textAfterCursor: '', offset: 0, range: null };
  }

  const range = selection.getRangeAt(0);

  // Create range from start of element to cursor
  const preRange = document.createRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.endContainer, range.endOffset);

  const textBeforeCursor = this.extractTextFromRange(preRange);

  // Create range from cursor to end
  const postRange = document.createRange();
  postRange.selectNodeContents(element);
  postRange.setStart(range.endContainer, range.endOffset);

  const textAfterCursor = this.extractTextFromRange(postRange);

  return {
    textBeforeCursor,
    textAfterCursor,
    offset: textBeforeCursor.length,
    range
  };
}

// Helper to extract text from range, respecting reference spans
private static extractTextFromRange(range: Range): string {
  const container = document.createElement('div');
  container.appendChild(range.cloneContents());
  return this.getPlainText(container);
}
```

3. **Implement getPlainText**
```typescript
static getPlainText(element: HTMLElement): string {
  let text = '';

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;

      // Handle reference spans - extract display text
      if (el.classList.contains('ref-tool') ||
          el.classList.contains('ref-agent') ||
          el.classList.contains('ref-note')) {
        text += el.dataset.display || el.textContent || '';
      }
      // Handle line breaks
      else if (el.tagName === 'BR') {
        text += '\n';
      }
      // Handle divs as newlines (contenteditable creates these)
      else if (el.tagName === 'DIV') {
        if (text && !text.endsWith('\n')) {
          text += '\n';
        }
        for (const child of el.childNodes) {
          walk(child);
        }
      }
      // Recurse into other elements
      else {
        for (const child of el.childNodes) {
          walk(child);
        }
      }
    }
  };

  walk(element);
  return text;
}
```

4. **Implement createReferenceSpan**
```typescript
static createReferenceSpan(
  type: 'tool' | 'agent' | 'note',
  displayText: string,
  metadata?: Record<string, string>
): HTMLSpanElement {
  const span = document.createElement('span');

  // Set classes
  span.className = `ref-${type}`;

  // Make non-editable (acts like a chip)
  span.contentEditable = 'false';

  // Set text content
  span.textContent = displayText;

  // Set data attributes
  span.dataset.type = type;
  span.dataset.display = displayText;

  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      span.dataset[key] = value;
    }
  }

  return span;
}
```

5. **Implement insertNodeAtCursor**
```typescript
static insertNodeAtCursor(
  element: HTMLElement,
  node: Node,
  moveCursorAfter: boolean = true
): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    // No selection, append to end
    element.appendChild(node);
    return;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(node);

  if (moveCursorAfter) {
    // Move cursor after inserted node
    range.setStartAfter(node);
    range.setEndAfter(node);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}
```

**Dependencies**: None (pure utility)

**Testing Checklist**:
- [ ] getCursorContext returns correct text before/after cursor
- [ ] getPlainText correctly extracts text from references
- [ ] createReferenceSpan creates properly formatted span
- [ ] insertNodeAtCursor inserts at correct position
- [ ] Cursor position is preserved after operations

---

### 7.2 New File: `ReferenceExtractor.ts`

**Path**: `/src/ui/chat/utils/ReferenceExtractor.ts`

**Purpose**: Extract plain text and references from contenteditable HTML

**Implementation Steps**:

1. **Create file structure**
```typescript
export interface ParsedReference {
  type: 'tool' | 'agent' | 'note';
  displayText: string;
  technicalName: string;
  metadata: Record<string, string>;
}

export class ReferenceExtractor {
  static extractPlainText(html: string): string { }
  static extractReferences(html: string): ParsedReference[] { }
  static parseReferenceSpan(element: HTMLElement): ParsedReference | null { }
  static cleanForSending(html: string): string { }
}
```

2. **Implement extractPlainText**
```typescript
static extractPlainText(html: string): string {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Reuse ContentEditableHelper.getPlainText
  return ContentEditableHelper.getPlainText(temp);
}
```

3. **Implement extractReferences**
```typescript
static extractReferences(html: string): ParsedReference[] {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  const references: ParsedReference[] = [];
  const spans = temp.querySelectorAll('.ref-tool, .ref-agent, .ref-note');

  spans.forEach(span => {
    const ref = this.parseReferenceSpan(span as HTMLElement);
    if (ref) {
      references.push(ref);
    }
  });

  return references;
}
```

4. **Implement parseReferenceSpan**
```typescript
static parseReferenceSpan(element: HTMLElement): ParsedReference | null {
  const type = element.dataset.type as 'tool' | 'agent' | 'note';
  if (!type) return null;

  const displayText = element.dataset.display || element.textContent || '';
  const technicalName = element.dataset.name || '';

  // Extract all data attributes except type, display, name
  const metadata: Record<string, string> = {};
  for (const key in element.dataset) {
    if (key !== 'type' && key !== 'display' && key !== 'name') {
      metadata[key] = element.dataset[key] || '';
    }
  }

  return {
    type,
    displayText,
    technicalName,
    metadata
  };
}
```

**Dependencies**: ContentEditableHelper

**Testing Checklist**:
- [ ] extractPlainText converts HTML to correct plain text
- [ ] extractReferences finds all reference spans
- [ ] parseReferenceSpan correctly extracts metadata
- [ ] Handles malformed HTML gracefully

---

### 7.3 New File: `ContentEditableSuggester.ts`

**Path**: `/src/ui/chat/components/suggesters/ContentEditableSuggester.ts`

**Purpose**: Base class for suggesters using contenteditable

**Implementation Steps**:

1. **Copy and adapt from TextAreaSuggester.ts**
   - Change `textarea: HTMLTextAreaElement` to `inputDiv: HTMLDivElement`
   - Replace `textarea.selectionStart` with `ContentEditableHelper.getCursorContext()`
   - Replace `textarea.value` with `ContentEditableHelper.getPlainText()`

2. **Key method changes**:

```typescript
// OLD (TextAreaSuggester)
private async onInput(): Promise<void> {
  const cursorPos = this.textarea.selectionStart;
  const text = this.textarea.value.substring(0, cursorPos);

  const match = this.config.trigger.exec(text);
  // ...
}

// NEW (ContentEditableSuggester)
private async onInput(): Promise<void> {
  const context = ContentEditableHelper.getCursorContext(this.inputDiv);
  const text = context.textBeforeCursor;

  const match = this.config.trigger.exec(text);
  // ...
}
```

3. **Add new abstract method for reference creation**
```typescript
abstract createReferenceSpan(item: SuggestionItem<T>): HTMLSpanElement;
```

4. **Update selectSuggestion to use DOM manipulation**
```typescript
protected replaceTextWithReference(
  matchStart: number,
  matchEnd: number,
  referenceSpan: HTMLSpanElement
): void {
  ContentEditableHelper.replaceTextWithNode(
    this.inputDiv,
    matchStart,
    matchEnd,
    referenceSpan
  );

  // Dispatch input event to maintain reactivity
  this.inputDiv.dispatchEvent(new Event('input', { bubbles: true }));
}
```

**Dependencies**: ContentEditableHelper

**Testing Checklist**:
- [ ] Trigger detection works with Selection API
- [ ] Suggestions appear at correct position
- [ ] Selection works with keyboard
- [ ] Reference insertion works correctly

---

### 7.4 Modified File: `ChatInput.ts`

**Path**: `/src/ui/chat/components/ChatInput.ts`

**Changes Required**:

1. **Replace textarea with contenteditable div** (lines 12, 56-62):

```typescript
// OLD
private textArea: HTMLTextAreaElement | null = null;

// NEW
private inputDiv: HTMLDivElement | null = null;
```

```typescript
// OLD
this.textArea = textareaContainer.createEl('textarea', {
  cls: 'chat-textarea',
  attr: {
    placeholder: 'Type your message...',
    rows: '1'
  }
});

// NEW
this.inputDiv = textareaContainer.createDiv('chat-input-editable');
this.inputDiv.contentEditable = 'true';
this.inputDiv.setAttribute('role', 'textbox');
this.inputDiv.setAttribute('aria-label', 'Message input');
this.inputDiv.setAttribute('aria-multiline', 'false');
ContentEditableHelper.setPlaceholder(this.inputDiv, 'Type your message...');
```

2. **Update event listeners** (lines 65-75):

```typescript
// OLD
this.textArea.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    this.handleSendMessage();
  }
});

// NEW
this.inputDiv.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    this.handleSendMessage();
  }
});
```

3. **Update auto-resize** (lines 73-156):

```typescript
// OLD
this.textArea.addEventListener('input', () => {
  this.autoResizeTextarea();
});

// REMOVED (contenteditable auto-grows, use CSS max-height instead)
// Can still implement dynamic height if needed
```

4. **Update suggester initialization** (lines 94-96):

```typescript
// OLD
this.suggesters = initializeSuggesters(this.app, this.textArea);

// NEW
this.suggesters = initializeSuggesters(this.app, this.inputDiv);
```

5. **Update handleSendMessage** (lines 125-137):

```typescript
// OLD
private handleSendMessage(): void {
  if (!this.textArea) return;

  const message = this.textArea.value.trim();
  if (!message) return;

  this.textArea.value = '';
  this.autoResizeTextarea();

  this.onSendMessage(message);
}

// NEW
private handleSendMessage(): void {
  if (!this.inputDiv) return;

  const message = ContentEditableHelper.getPlainText(this.inputDiv).trim();
  if (!message) return;

  // Clear input
  this.inputDiv.innerHTML = '';

  this.onSendMessage(message);
}
```

6. **Update getValue/setValue** (lines 207-219):

```typescript
// OLD
getValue(): string {
  return this.textArea?.value || '';
}

setValue(value: string): void {
  if (this.textArea) {
    this.textArea.value = value;
    this.autoResizeTextarea();
  }
}

// NEW
getValue(): string {
  if (!this.inputDiv) return '';
  return ContentEditableHelper.getPlainText(this.inputDiv);
}

setValue(value: string): void {
  if (this.inputDiv) {
    // Set as plain text (not HTML) for safety
    this.inputDiv.textContent = value;
  }
}
```

7. **Update setPlaceholder** (lines 38-42):

```typescript
// OLD
setPlaceholder(placeholder: string): void {
  if (this.textArea) {
    this.textArea.placeholder = placeholder;
  }
}

// NEW
setPlaceholder(placeholder: string): void {
  if (this.inputDiv) {
    ContentEditableHelper.setPlaceholder(this.inputDiv, placeholder);
  }
}
```

8. **Update focus and clear** (lines 188-202):

```typescript
// OLD
focus(): void {
  if (this.textArea) {
    this.textArea.focus();
  }
}

clear(): void {
  if (this.textArea) {
    this.textArea.value = '';
    this.autoResizeTextarea();
  }
}

// NEW
focus(): void {
  if (this.inputDiv) {
    this.inputDiv.focus();
  }
}

clear(): void {
  if (this.inputDiv) {
    this.inputDiv.innerHTML = '';
  }
}
```

**Dependencies**: ContentEditableHelper, ReferenceExtractor

**Testing Checklist**:
- [ ] Input renders correctly
- [ ] Can type text
- [ ] Enter sends message
- [ ] Shift+Enter creates newline
- [ ] Clear works
- [ ] Focus works
- [ ] Loading state disables input

---

### 7.5 Modified File: `initializeSuggesters.ts`

**Path**: `/src/ui/chat/components/suggesters/initializeSuggesters.ts`

**Changes Required**:

1. **Update function signature** (line 22):

```typescript
// OLD
export function initializeSuggesters(
  app: App,
  textarea: HTMLTextAreaElement
): SuggesterInstances

// NEW
export function initializeSuggesters(
  app: App,
  inputDiv: HTMLDivElement
): SuggesterInstances
```

2. **Update suggester instantiation** (lines 29-38):

```typescript
// OLD
const noteSuggester = new TextAreaNoteSuggester(app, textarea, messageEnhancer);
const toolSuggester = new TextAreaToolSuggester(app, textarea, messageEnhancer);
agentSuggester = new TextAreaAgentSuggester(app, textarea, messageEnhancer, promptStorage);

// NEW
const noteSuggester = new ContentEditableNoteSuggester(app, inputDiv, messageEnhancer);
const toolSuggester = new ContentEditableToolSuggester(app, inputDiv, messageEnhancer);
agentSuggester = new ContentEditableAgentSuggester(app, inputDiv, messageEnhancer, promptStorage);
```

**Dependencies**: All three updated suggester classes

**Testing Checklist**:
- [ ] All suggesters initialize correctly
- [ ] No console errors
- [ ] MessageEnhancer is shared correctly

---

### 7.6 Modified File: `TextAreaToolSuggester.ts` → `ContentEditableToolSuggester.ts`

**Path**: `/src/ui/chat/components/suggesters/ContentEditableToolSuggester.ts`

**Changes Required**:

1. **Rename file and class**
2. **Extend ContentEditableSuggester instead of TextAreaSuggester**

```typescript
// OLD
export class TextAreaToolSuggester extends TextAreaSuggester<ToolSuggestionItem>

// NEW
export class ContentEditableToolSuggester extends ContentEditableSuggester<ToolSuggestionItem>
```

3. **Update constructor** (lines 18-32):

```typescript
// OLD
constructor(
  app: App,
  textarea: HTMLTextAreaElement,
  messageEnhancer: MessageEnhancer
)

// NEW
constructor(
  app: App,
  inputDiv: HTMLDivElement,
  messageEnhancer: MessageEnhancer
)
```

4. **Update selectSuggestion** (lines 172-198):

```typescript
// OLD
selectSuggestion(item: SuggestionItem<ToolSuggestionItem>): void {
  const toolHint: ToolHint = {
    name: item.data.name,
    schema: item.data.schema
  };
  this.messageEnhancer.addTool(toolHint);

  const cursorPos = this.textarea.selectionStart;
  const text = this.textarea.value;
  const beforeCursor = text.substring(0, cursorPos);
  const match = /\/(\w*)$/.exec(beforeCursor);

  if (match) {
    const start = cursorPos - match[0].length;
    const before = text.substring(0, start);
    const after = text.substring(cursorPos);
    const displayName = item.data.displayName || item.data.name;
    const replacement = `\`/${displayName.replace(/\s+/g, '')}\` `;

    this.textarea.value = before + replacement + after;
    this.textarea.selectionStart = this.textarea.selectionEnd = start + replacement.length;
    this.textarea.dispatchEvent(new Event('input'));
  }
}

// NEW
selectSuggestion(item: SuggestionItem<ToolSuggestionItem>): void {
  // Add to message enhancer
  const toolHint: ToolHint = {
    name: item.data.name,
    schema: item.data.schema
  };
  this.messageEnhancer.addTool(toolHint);

  // Create reference span
  const referenceSpan = this.createReferenceSpan(item);

  // Find match position
  const context = ContentEditableHelper.getCursorContext(this.inputDiv);
  const match = /\/(\w*)$/.exec(context.textBeforeCursor);

  if (match) {
    const matchStart = context.offset - match[0].length;
    const matchEnd = context.offset;

    // Replace trigger text with styled reference
    this.replaceTextWithReference(matchStart, matchEnd, referenceSpan);
  }
}
```

5. **Implement createReferenceSpan** (new method):

```typescript
createReferenceSpan(item: SuggestionItem<ToolSuggestionItem>): HTMLSpanElement {
  const displayName = item.data.displayName || item.data.name;
  const displayText = `/${displayName.replace(/\s+/g, '')}`;

  return ContentEditableHelper.createReferenceSpan('tool', displayText, {
    name: item.data.name,
    displayName: displayName
  });
}
```

**Dependencies**: ContentEditableSuggester, ContentEditableHelper

**Testing Checklist**:
- [ ] Tool suggestions appear
- [ ] Selecting tool creates styled span
- [ ] Span is non-editable
- [ ] MessageEnhancer receives tool hint
- [ ] Plain text extraction works

---

### 7.7 Modified File: `TextAreaAgentSuggester.ts` → `ContentEditableAgentSuggester.ts`

**Path**: `/src/ui/chat/components/suggesters/ContentEditableAgentSuggester.ts`

**Changes Required**: (Similar to ToolSuggester)

1. **Rename and extend ContentEditableSuggester**
2. **Update constructor parameter**
3. **Update selectSuggestion**:

```typescript
selectSuggestion(item: SuggestionItem<AgentSuggestionItem>): void {
  // Add to message enhancer
  const agentRef: AgentReference = {
    id: item.data.id,
    name: item.data.name,
    prompt: item.data.prompt,
    tokens: item.data.promptTokens
  };
  this.messageEnhancer.addAgent(agentRef);

  // Create reference span
  const referenceSpan = this.createReferenceSpan(item);

  // Find match position
  const context = ContentEditableHelper.getCursorContext(this.inputDiv);
  const match = /@(\w*)$/.exec(context.textBeforeCursor);

  if (match) {
    const matchStart = context.offset - match[0].length;
    const matchEnd = context.offset;

    this.replaceTextWithReference(matchStart, matchEnd, referenceSpan);
  }
}

createReferenceSpan(item: SuggestionItem<AgentSuggestionItem>): HTMLSpanElement {
  const displayText = `@${item.data.name.replace(/\s+/g, '_')}`;

  return ContentEditableHelper.createReferenceSpan('agent', displayText, {
    id: item.data.id,
    name: item.data.name
  });
}
```

---

### 7.8 Modified File: `TextAreaNoteSuggester.ts` → `ContentEditableNoteSuggester.ts`

**Path**: `/src/ui/chat/components/suggesters/ContentEditableNoteSuggester.ts`

**Changes Required**: (Similar to ToolSuggester and AgentSuggester)

1. **Update selectSuggestion**:

```typescript
async selectSuggestion(item: SuggestionItem<NoteSuggestionItem>): Promise<void> {
  // Read note content
  const content = await this.app.vault.read(item.data.file);
  const tokens = TokenCalculator.estimateTextTokens(content);

  // Add to message enhancer
  const noteRef: NoteReference = {
    path: item.data.path,
    name: item.data.name,
    content: content,
    tokens: tokens
  };
  this.messageEnhancer.addNote(noteRef);

  // Create reference span
  const referenceSpan = this.createReferenceSpan(item);

  // Find match position
  const context = ContentEditableHelper.getCursorContext(this.inputDiv);
  const match = /\[\[([^\]]*)$/.exec(context.textBeforeCursor);

  if (match) {
    const matchStart = context.offset - match[0].length;
    const matchEnd = context.offset;

    this.replaceTextWithReference(matchStart, matchEnd, referenceSpan);
  }
}

createReferenceSpan(item: SuggestionItem<NoteSuggestionItem>): HTMLSpanElement {
  const displayText = `[[${item.data.name}]]`;

  return ContentEditableHelper.createReferenceSpan('note', displayText, {
    path: item.data.path,
    name: item.data.name
  });
}
```

---

## 8. Styling Architecture

### 8.1 ContentEditable Base Styles

**File**: `styles.css`

**Changes**:

```css
/* REPLACE: .chat-textarea (lines 893-920) */

.chat-input-editable {
    width: 100%;
    min-height: 40px;
    max-height: 72px; /* 2 lines max */
    padding: 10px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 14px;
    font-family: var(--font-text);
    line-height: 1.5;
    overflow-y: auto;
    overflow-x: hidden;
    word-wrap: break-word;
    white-space: pre-wrap;
    box-sizing: border-box;
    transition: border-color 0.2s ease;

    /* Hide default outline, show custom focus style */
    outline: none;
}

.chat-input-editable:focus {
    border-color: var(--interactive-accent);
}

.chat-input-editable:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    pointer-events: none;
}

/* Placeholder using CSS (when empty and not focused) */
.chat-input-editable[data-placeholder]:empty::before {
    content: attr(data-placeholder);
    color: var(--text-muted);
    font-style: italic;
    pointer-events: none;
}

.chat-input-editable[data-placeholder]:focus::before {
    content: '';
}

/* Dark theme adjustments */
.theme-dark .chat-input-editable {
    background: var(--background-primary);
}
```

### 8.2 Reference Span Styles

```css
/* Reference base styles */
.chat-input-editable .ref-tool,
.chat-input-editable .ref-agent,
.chat-input-editable .ref-note {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    margin: 0 2px;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    font-family: var(--font-monospace);
    cursor: default;
    user-select: none;
    white-space: nowrap;
    transition: all 0.15s ease;
}

/* Tool references - Green theme */
.chat-input-editable .ref-tool {
    background: rgba(16, 185, 129, 0.15);
    color: rgb(16, 185, 129);
    border: 1px solid rgba(16, 185, 129, 0.3);
}

.chat-input-editable .ref-tool:hover {
    background: rgba(16, 185, 129, 0.25);
    border-color: rgba(16, 185, 129, 0.5);
}

/* Agent references - Purple theme */
.chat-input-editable .ref-agent {
    background: rgba(139, 92, 246, 0.15);
    color: rgb(139, 92, 246);
    border: 1px solid rgba(139, 92, 246, 0.3);
}

.chat-input-editable .ref-agent:hover {
    background: rgba(139, 92, 246, 0.25);
    border-color: rgba(139, 92, 246, 0.5);
}

/* Note references - Blue theme */
.chat-input-editable .ref-note {
    background: rgba(59, 130, 246, 0.15);
    color: rgb(59, 130, 246);
    border: 1px solid rgba(59, 130, 246, 0.3);
}

.chat-input-editable .ref-note:hover {
    background: rgba(59, 130, 246, 0.25);
    border-color: rgba(59, 130, 246, 0.5);
}

/* Dark theme adjustments */
.theme-dark .chat-input-editable .ref-tool {
    background: rgba(16, 185, 129, 0.2);
    color: rgb(52, 211, 153);
}

.theme-dark .chat-input-editable .ref-agent {
    background: rgba(139, 92, 246, 0.2);
    color: rgb(167, 139, 250);
}

.theme-dark .chat-input-editable .ref-note {
    background: rgba(59, 130, 246, 0.2);
    color: rgb(96, 165, 250);
}

/* Focus state for entire input when reference is focused */
.chat-input-editable:focus-within {
    border-color: var(--interactive-accent);
}
```

### 8.3 Responsive Adjustments

```css
/* Mobile optimizations */
@media (max-width: 768px) {
    .chat-input-editable {
        font-size: 14px !important;
        padding: 8px 10px;
    }

    .chat-input-editable .ref-tool,
    .chat-input-editable .ref-agent,
    .chat-input-editable .ref-note {
        font-size: 12px;
        padding: 1px 6px;
    }
}
```

---

## 9. Edge Cases & Solutions

### 9.1 Paste Handling

**Problem**: Users paste content from external sources with formatting

**Solution**: Strip formatting, preserve only text and references

```typescript
// Add to ChatInput.ts
private setupPasteHandler(): void {
  this.inputDiv.addEventListener('paste', (e: ClipboardEvent) => {
    e.preventDefault();

    // Get plain text from clipboard
    const text = e.clipboardData?.getData('text/plain') || '';

    // Check if pasting from within our own input (has HTML with references)
    const html = e.clipboardData?.getData('text/html') || '';

    if (html && this.isInternalPaste(html)) {
      // Preserve references
      const temp = document.createElement('div');
      temp.innerHTML = html;
      const fragment = document.createDocumentFragment();
      temp.childNodes.forEach(node => fragment.appendChild(node.cloneNode(true)));

      ContentEditableHelper.insertNodeAtCursor(this.inputDiv, fragment);
    } else {
      // Insert as plain text
      document.execCommand('insertText', false, text);
    }
  });
}

private isInternalPaste(html: string): boolean {
  // Check if HTML contains our reference spans
  return html.includes('ref-tool') || html.includes('ref-agent') || html.includes('ref-note');
}
```

### 9.2 Reference Deletion

**Problem**: Backspace/Delete should remove entire reference, not character-by-character

**Solution**: Detect adjacent reference and delete atomically

```typescript
// Add to ContentEditableSuggester.ts or ChatInput.ts
private setupDeletionHandler(): void {
  this.inputDiv.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Backspace') {
      const context = ContentEditableHelper.getCursorContext(this.inputDiv);
      const refSpan = this.getReferenceBeforeCursor(context);

      if (refSpan && context.textBeforeCursor.endsWith(refSpan.textContent || '')) {
        e.preventDefault();
        refSpan.remove();
        return;
      }
    }

    if (e.key === 'Delete') {
      const context = ContentEditableHelper.getCursorContext(this.inputDiv);
      const refSpan = this.getReferenceAfterCursor(context);

      if (refSpan && context.textAfterCursor.startsWith(refSpan.textContent || '')) {
        e.preventDefault();
        refSpan.remove();
        return;
      }
    }
  });
}

private getReferenceBeforeCursor(context: CursorContext): HTMLSpanElement | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  let node = range.startContainer.previousSibling;

  while (node && node.nodeType !== Node.ELEMENT_NODE) {
    node = node.previousSibling;
  }

  if (node && (node as HTMLElement).classList?.contains('ref-tool') ||
      (node as HTMLElement).classList?.contains('ref-agent') ||
      (node as HTMLElement).classList?.contains('ref-note')) {
    return node as HTMLSpanElement;
  }

  return null;
}
```

### 9.3 Multiple References in Sequence

**Problem**: `/ReadFile @Agent [[Note]]` should have proper spacing

**Solution**: Add space after reference span insertion

```typescript
// In each suggester's selectSuggestion
createReferenceSpan(item: SuggestionItem<T>): HTMLSpanElement {
  const span = ContentEditableHelper.createReferenceSpan(/* ... */);

  // Create text node with trailing space
  const spaceNode = document.createTextNode(' ');

  // Wrap in fragment
  const fragment = document.createDocumentFragment();
  fragment.appendChild(span);
  fragment.appendChild(spaceNode);

  return fragment; // Actually return DocumentFragment
}
```

### 9.4 Cursor Navigation

**Problem**: Arrow keys should skip over contenteditable=false spans

**Solution**: Browser handles this automatically for `contenteditable="false"` elements. No additional code needed.

### 9.5 Copy/Paste Behavior

**Problem**: Copying references should preserve them

**Solution**:
- Browser automatically copies HTML including reference spans
- Pasting within app preserves references (handled in 9.1)
- Pasting to external app shows plain text (handled by `data-display` attribute)

### 9.6 Undo/Redo

**Problem**: Browser undo stack may break with DOM manipulation

**Solution**: Use `document.execCommand` where possible, or disable undo for reference operations

```typescript
// When replacing text with reference
const selection = window.getSelection();
const range = selection.getRangeAt(0);

// Use execCommand for better undo support
document.execCommand('delete', false);
document.execCommand('insertHTML', false, referenceSpan.outerHTML);
```

### 9.7 Empty State Detection

**Problem**: Need to show placeholder when input is empty

**Solution**: Use CSS `::before` pseudo-element with `:empty` selector (see 8.1)

---

## 10. Risk Assessment & Mitigation

### 10.1 Technical Risks

| Risk | Severity | Probability | Mitigation |
|------|----------|-------------|------------|
| **Cross-browser inconsistencies** | High | Medium | Extensive browser testing, polyfills for edge cases |
| **Selection API bugs** | Medium | Low | Fallback to simpler text insertion if Selection fails |
| **Performance with many references** | Medium | Low | Debounce input events, limit reference count |
| **Undo stack corruption** | Medium | Medium | Use `document.execCommand` when possible |
| **Paste from Word/Excel** | Low | High | Strip all formatting except plain text |
| **Mobile keyboard issues** | Medium | Medium | Test on iOS/Android, adjust event handling |

### 10.2 User Experience Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Learning curve** | Low | References look similar to current syntax |
| **Accidental reference editing** | Medium | Make spans `contenteditable="false"` |
| **Confusion about deletion** | Low | Delete entire reference atomically |
| **Copy/paste confusion** | Medium | Preserve references on internal paste |

### 10.3 Rollback Strategy

**Phase 1: Feature Flag** (Week 1-2)
```typescript
const USE_CONTENTEDITABLE = false; // Toggle for testing
```

**Phase 2: Opt-in Beta** (Week 3-4)
- Add setting: "Enable rich input (beta)"
- Collect user feedback

**Phase 3: Default On** (Week 5+)
- Make default for all users
- Keep textarea fallback for 2 versions

**Emergency Rollback**:
1. Set `USE_CONTENTEDITABLE = false` in code
2. Release hotfix
3. Investigate issues
4. Fix and re-release

---

## 11. Testing Strategy

### 11.1 Unit Tests

**ContentEditableHelper**:
- [ ] `getCursorContext` returns correct text and position
- [ ] `getPlainText` extracts text correctly
- [ ] `createReferenceSpan` creates proper HTML
- [ ] `insertNodeAtCursor` inserts at correct position

**ReferenceExtractor**:
- [ ] `extractPlainText` handles references correctly
- [ ] `extractReferences` finds all reference types
- [ ] `parseReferenceSpan` extracts metadata

**ContentEditableSuggester**:
- [ ] Trigger detection works with Selection API
- [ ] Suggestions appear at correct position
- [ ] Reference insertion works
- [ ] Multiple suggesters don't conflict

### 11.2 Integration Tests

**ChatInput Flow**:
- [ ] Type `/` → suggestions appear
- [ ] Select tool → styled reference inserted
- [ ] Type `@` → agent suggestions appear
- [ ] Select agent → styled reference inserted
- [ ] Type `[[` → note suggestions appear
- [ ] Select note → styled reference inserted
- [ ] Mix text and references → plain text extracted correctly
- [ ] Press Enter → message sent with correct text
- [ ] MessageEnhancer receives correct references

**Edge Cases**:
- [ ] Paste plain text → formatting stripped
- [ ] Paste HTML → references preserved if internal
- [ ] Backspace on reference → entire reference deleted
- [ ] Delete on reference → entire reference deleted
- [ ] Multiple references in sequence → spaced correctly
- [ ] Empty input → placeholder shown
- [ ] Focus/blur → styles applied correctly

### 11.3 Browser Compatibility Tests

Test on:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

### 11.4 Accessibility Tests

- [ ] Screen reader reads references correctly
- [ ] Keyboard-only navigation works
- [ ] ARIA attributes present
- [ ] Focus indicators visible
- [ ] Color contrast meets WCAG AA

### 11.5 Performance Tests

- [ ] Type 100 characters → no lag
- [ ] Insert 10 references → no lag
- [ ] Suggester with 100+ items → no lag
- [ ] Paste 1000 words → handles gracefully

---

## 12. Quality Checks

### 12.1 Pre-Implementation Checklist

- [x] Architecture document reviewed and approved
- [x] All edge cases documented
- [x] API specifications complete
- [x] File-by-file plan detailed
- [x] Testing strategy defined
- [ ] Team review completed
- [ ] Stakeholder approval obtained

### 12.2 Implementation Checklist

**Phase 1: Foundation**
- [ ] ContentEditableHelper implemented
- [ ] ReferenceExtractor implemented
- [ ] Unit tests passing
- [ ] Code review completed

**Phase 2: Suggester Adaptation**
- [ ] ContentEditableSuggester base class complete
- [ ] ToolSuggester updated
- [ ] AgentSuggester updated
- [ ] NoteSuggester updated
- [ ] Integration tests passing

**Phase 3: Styling & Polish**
- [ ] CSS implemented
- [ ] Placeholder working
- [ ] Reference styles applied
- [ ] Visual QA completed

**Phase 4: Edge Cases**
- [ ] Paste handling implemented
- [ ] Deletion behavior correct
- [ ] Navigation smooth
- [ ] All edge case tests passing

### 12.3 Pre-Merge Checklist

- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Browser compatibility verified
- [ ] Accessibility audit passed
- [ ] Performance benchmarks met
- [ ] Code review approved
- [ ] Documentation updated
- [ ] Changelog entry added

---

## Appendix A: Code Examples

### A.1 Complete ContentEditableHelper Implementation

See Section 7.1 for detailed implementation steps.

### A.2 Example Usage

```typescript
// Create contenteditable input
const container = document.getElementById('chat-input');
const inputDiv = container.createDiv('chat-input-editable');
inputDiv.contentEditable = 'true';

// Set placeholder
ContentEditableHelper.setPlaceholder(inputDiv, 'Type your message...');

// User types "/read"
// Suggester detects trigger
const context = ContentEditableHelper.getCursorContext(inputDiv);
// context.textBeforeCursor = "/read"

// User selects "Read File" suggestion
const refSpan = ContentEditableHelper.createReferenceSpan('tool', '/ReadFile', {
  name: 'vaultManager.readFile'
});

ContentEditableHelper.replaceTextWithNode(inputDiv, 0, 5, refSpan);

// Result in DOM:
// <div class="chat-input-editable">
//   <span class="ref-tool" contenteditable="false" data-type="tool" data-name="vaultManager.readFile">/ReadFile</span>
// </div>

// Extract plain text for sending
const plainText = ContentEditableHelper.getPlainText(inputDiv);
// plainText = "/ReadFile"
```

---

## Appendix B: Migration Path

### B.1 Backward Compatibility

**Old API** (deprecated but supported):
```typescript
// Still works, but logs warning
chatInput.getValue(); // Returns plain text
chatInput.setValue(text); // Sets as plain text
```

**New API** (recommended):
```typescript
// Use new methods
chatInput.getPlainText(); // Returns plain text
chatInput.getRichHTML(); // Returns HTML with references
chatInput.setPlainText(text); // Sets as plain text
chatInput.setRichHTML(html); // Sets as HTML (with validation)
```

### B.2 Data Migration

No data migration needed - all message history remains plain text.

### B.3 Deprecation Timeline

- **v1.0**: Release with contenteditable (feature flag off by default)
- **v1.1**: Enable by default (opt-out available)
- **v1.2**: Remove textarea fallback code
- **v1.3**: Remove old API methods

---

## Appendix C: Performance Benchmarks

### C.1 Target Metrics

| Metric | Target | Current (Textarea) | Expected (ContentEditable) |
|--------|--------|-------------------|---------------------------|
| First render | < 50ms | ~30ms | ~40ms |
| Keystroke latency | < 16ms (60fps) | ~5ms | ~8ms |
| Suggester trigger | < 100ms | ~80ms | ~90ms |
| Reference insertion | < 50ms | ~20ms (text) | ~35ms (DOM) |
| Message extraction | < 50ms | ~5ms | ~20ms |
| Memory usage | < 5MB | ~2MB | ~3MB |

### C.2 Optimization Strategies

1. **Debounce input events**: 50ms delay
2. **Memoize plain text extraction**: Cache result until next DOM change
3. **Lazy load suggester items**: Virtualize long lists
4. **Throttle cursor position updates**: Only update on actual cursor move

---

## Conclusion

This architectural specification provides a comprehensive plan for converting the chat input from a textarea to a contenteditable div with styled references. The design maintains functional parity while enhancing the user experience through visual distinction of references.

**Key Success Factors**:
1. Comprehensive utility abstractions (ContentEditableHelper, ReferenceExtractor)
2. Clean separation of concerns (suggesters focus on logic, helpers handle DOM)
3. Extensive edge case handling (paste, delete, navigation)
4. Robust testing strategy (unit, integration, browser compatibility)
5. Safe rollback path (feature flag, backward compatibility)

**Next Steps**:
1. Review and approve this architecture document
2. Begin Phase 1 implementation (Foundation)
3. Conduct code reviews after each phase
4. Deploy with feature flag for internal testing
5. Gather user feedback before full rollout

---

**Document Version**: 1.0
**Last Updated**: 2025-10-19
**Status**: Ready for Implementation
