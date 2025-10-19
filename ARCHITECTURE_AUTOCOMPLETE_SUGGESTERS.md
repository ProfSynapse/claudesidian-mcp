# Chat Autocomplete Suggesters - Architectural Design

## Executive Summary

This document defines the architecture for implementing three autocomplete/suggester features in the claudesidian-mcp Obsidian plugin's chat interface:

1. **Tool Command Palette (`/`)** - Fuzzy search for MCP tools
2. **Agent Mention System (`@`)** - Reference custom agents in messages
3. **Note Link Injection (`[[`)** - Embed vault notes into chat context

These features enhance user experience by:
- Reducing friction in tool/agent discovery and invocation
- Enabling rapid context injection from vault notes
- Providing visual feedback on token usage and context limits
- Maintaining consistency with Obsidian's native UX patterns

**Key Architectural Decisions:**
- Use Obsidian's native `EditorSuggest` API for inline autocomplete
- Implement shared base class to reduce code duplication
- Inject enhancements into system prompt rather than user message
- Integrate with existing `TokenCalculator` for context management
- Support multiple mentions per message (composable context)

---

## Table of Contents

1. [System Context](#1-system-context)
2. [Component Architecture](#2-component-architecture)
3. [Data Architecture](#3-data-architecture)
4. [API Specifications](#4-api-specifications)
5. [Technology Decisions](#5-technology-decisions)
6. [Security Architecture](#6-security-architecture)
7. [Deployment Architecture](#7-deployment-architecture)
8. [Implementation Guidelines](#8-implementation-guidelines)
9. [Risk Assessment](#9-risk-assessment)

---

## 1. System Context

### 1.1 External Dependencies

```
┌─────────────────────────────────────────────────────────────┐
│                    Obsidian Application                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Vault API  │  │ Editor API   │  │  UI Classes  │      │
│  │              │  │              │  │              │      │
│  │ - getFiles() │  │ - Suggest    │  │ - Modal      │      │
│  │ - read()     │  │ - fuzzySearch│  │ - Component  │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │              │
└─────────┼─────────────────┼─────────────────┼──────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│              Claudesidian MCP Plugin                         │
│                                                               │
│  ┌────────────────────────────────────────────────────┐     │
│  │          Chat Suggester System (NEW)               │     │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐     │     │
│  │  │   Tool   │  │  Agent   │  │     Note     │     │     │
│  │  │Suggester │  │Suggester │  │  Suggester   │     │     │
│  │  └────┬─────┘  └────┬─────┘  └──────┬───────┘     │     │
│  │       └─────────────┼────────────────┘             │     │
│  │                     │                              │     │
│  │              ┌──────▼──────┐                       │     │
│  │              │BaseSuggester│                       │     │
│  │              └──────┬──────┘                       │     │
│  └─────────────────────┼────────────────────────────┬─┘     │
│                        │                            │       │
│  ┌─────────────────────▼────────────────────┐       │       │
│  │         ChatInput (MODIFIED)             │       │       │
│  │  - Textarea with suggester integration   │       │       │
│  │  - Trigger detection (/, @, [[)          │       │       │
│  │  - Message enhancement before send       │       │       │
│  └──────────────────────┬───────────────────┘       │       │
│                         │                           │       │
│  ┌──────────────────────▼────────────────────┐      │       │
│  │    ModelAgentManager (MODIFIED)           │      │       │
│  │  - buildSystemPromptWithWorkspace()       │◄─────┘       │
│  │  - Enhanced with suggester injections     │              │
│  └──────────────────────┬────────────────────┘              │
│                         │                                   │
└─────────────────────────┼───────────────────────────────────┘
                          │
                          ▼
                    ┌──────────┐
                    │   LLM    │
                    │ Provider │
                    └──────────┘
```

### 1.2 System Boundaries

**In Scope:**
- Inline suggester UI components
- Trigger detection and activation logic
- Data fetching from plugin services (tools, agents, notes)
- System prompt enhancement
- Token estimation and warnings
- Visual feedback (pills, badges, token counts)

**Out of Scope:**
- Modifying MCP tool execution logic
- Changing LLM provider adapters
- Altering conversation persistence logic
- Tool/agent schema modifications

### 1.3 Integration Points

| Integration Point | Location | Purpose |
|------------------|----------|---------|
| **ChatInput** | `src/ui/chat/components/ChatInput.ts` | Embed suggesters, detect triggers, enhance messages |
| **ModelAgentManager** | `src/ui/chat/services/ModelAgentManager.ts` | Inject suggester data into system prompt |
| **ToolListService** | `src/handlers/services/ToolListService.ts` | Fetch available MCP tools and schemas |
| **CustomPromptStorageService** | `src/agents/agentManager/services/CustomPromptStorageService.ts` | Fetch custom agents |
| **TokenCalculator** | `src/ui/chat/utils/TokenCalculator.ts` | Estimate token usage and warn on limits |
| **Vault API** | Obsidian `app.vault` | Read note content for injection |

---

## 2. Component Architecture

### 2.1 High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        ChatInput Component                       │
│                                                                  │
│  ┌────────────────────┐         ┌──────────────────────┐       │
│  │   TextArea         │         │  SuggesterRegistry   │       │
│  │  - User typing     │────────▶│  - Register triggers │       │
│  │  - Cursor tracking │         │  - Activate suggester│       │
│  │  - Key events      │         │  - Manage lifecycle  │       │
│  └────────┬───────────┘         └──────────┬───────────┘       │
│           │                                │                   │
│           │   Trigger detected             │                   │
│           │   (/, @, [[)                   │                   │
│           └────────────────────────────────┘                   │
│                                            │                   │
│                                            ▼                   │
│                     ┌──────────────────────────────┐           │
│                     │   Active Suggester           │           │
│                     │   (Tool/Agent/Note)          │           │
│                     └───────────┬──────────────────┘           │
│                                 │                              │
│                                 │ onSelect                     │
│                                 ▼                              │
│                     ┌──────────────────────┐                   │
│                     │  MessageEnhancer     │                   │
│                     │  - Track selections  │                   │
│                     │  - Build metadata    │                   │
│                     └──────────┬───────────┘                   │
│                                │                               │
└────────────────────────────────┼───────────────────────────────┘
                                 │
                                 │ On send message
                                 ▼
                     ┌──────────────────────────┐
                     │  ModelAgentManager       │
                     │  - Receive enhanced msg  │
                     │  - Inject into system    │
                     │    prompt                │
                     └──────────────────────────┘
```

### 2.2 Suggester Class Hierarchy

```
┌───────────────────────────────────────────────────────────┐
│              BaseSuggester<T>                              │
│  (Abstract class extending EditorSuggest<T>)              │
│                                                            │
│  Abstract Methods:                                         │
│  - getSuggestions(context: EditorSuggestContext): T[]     │
│  - renderSuggestion(item: T, el: HTMLElement): void       │
│  - selectSuggestion(item: T): void                        │
│                                                            │
│  Concrete Methods:                                         │
│  - onTrigger(editor, cursor, line): EditorSuggestContext  │
│  - close(): void                                           │
│  - estimateTokens(item: T): number                        │
│  - showTokenWarning(tokens: number): void                 │
│                                                            │
│  Protected Properties:                                     │
│  - triggerChar: string                                     │
│  - triggerPattern: RegExp                                  │
│  - tokenCalculator: TokenCalculator                        │
│  - cache: Map<string, T[]>                                │
│  - cacheExpiry: number                                     │
└───────────────────────────────────────────────────────────┘
                           ▲
                           │ extends
          ┌────────────────┼────────────────┐
          │                │                │
┌─────────▼──────┐  ┌──────▼──────┐  ┌─────▼──────────┐
│ ToolSuggester  │  │AgentSuggest │  │ NoteSuggester  │
│                │  │             │  │                │
│ trigger: "/"   │  │ trigger: "@"│  │ trigger: "[["  │
│                │  │             │  │                │
│ Data: Tool[]   │  │ Data:       │  │ Data: TFile[]  │
│               │  │ Agent[]     │  │                │
└────────────────┘  └─────────────┘  └────────────────┘
```

### 2.3 Message Enhancement Flow

```
User Types Message
      │
      ▼
┌──────────────────────┐
│ "Use @Marketing /    │  ← User typing with triggers
│  readFile for [[note│
│  s/project.md]]"     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────────────────────────────┐
│         Suggester Detection & Selection          │
│                                                   │
│  @Marketing     → AgentSuggester → Agent ID       │
│  /readFile      → ToolSuggester  → Tool schema    │
│  [[notes/...]]  → NoteSuggester  → File path      │
└──────────┬───────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────┐
│        MessageEnhancementData (Metadata)         │
│  {                                                │
│    agentIds: ["agent_123"],                      │
│    toolHints: [{                                 │
│      name: "vaultManager.readFile",              │
│      trigger: "/readFile"                        │
│    }],                                           │
│    noteRefs: [{                                  │
│      path: "notes/project.md",                   │
│      trigger: "[[notes/project.md]]"             │
│    }]                                            │
│  }                                               │
└──────────┬───────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────┐
│          User Message (Cleaned)                  │
│  "Use Marketing readFile for project notes"      │
└──────────┬───────────────────────────────────────┘
           │
           │ Send to ModelAgentManager
           ▼
┌──────────────────────────────────────────────────┐
│        System Prompt Enhancement                 │
│                                                   │
│  <custom_agent>                                  │
│    <name>Marketing Assistant</name>              │
│    <instructions>...</instructions>              │
│  </custom_agent>                                 │
│                                                   │
│  <tool_hint>                                     │
│    <name>vaultManager.readFile</name>            │
│    <schema>{ ... }</schema>                      │
│  </tool_hint>                                    │
│                                                   │
│  <files>                                         │
│    <project>                                     │
│      notes/project.md                            │
│      [note content...]                           │
│    </project>                                    │
│  </files>                                        │
└──────────────────────────────────────────────────┘
```

### 2.4 Component Responsibilities

#### 2.4.1 BaseSuggester (Abstract)

**Purpose:** Provide shared infrastructure for all suggester types

**Responsibilities:**
- Trigger detection using configurable patterns
- Cache management with TTL expiration
- Token estimation and warning display
- Common fuzzy search logic
- Suggestion rendering scaffolding
- Integration with Obsidian's `EditorSuggest` API

**Dependencies:**
- `obsidian.EditorSuggest`
- `TokenCalculator`
- `prepareFuzzySearch` (Obsidian API)

#### 2.4.2 ToolSuggester

**Purpose:** Enable `/` command palette for tool discovery

**Responsibilities:**
- Fetch available MCP tools from `ToolListService`
- Filter tools using fuzzy search on name/description
- Display tool name, description, and parameter hints
- Return selected tool schema for injection
- Cache tool list (refresh on MCP reconnection)

**Data Source:** `ToolListService.generateToolList()`

**Selection Behavior:**
- Replace `/command` with cleaned text (remove trigger)
- Store tool metadata for system prompt injection
- Display token estimate in suggestion UI

#### 2.4.3 AgentSuggester

**Purpose:** Enable `@` mentions for custom agent invocation

**Responsibilities:**
- Fetch enabled agents from `CustomPromptStorageService`
- Filter agents using fuzzy search on name/description
- Display agent name, description, and tags
- Return selected agent prompt for injection
- Support multiple agents per message

**Data Source:** `CustomPromptStorageService.getEnabledPrompts()`

**Selection Behavior:**
- Replace `@mention` with agent name (for user clarity)
- Store agent ID for system prompt injection
- Allow multiple mentions (combine agent prompts)

#### 2.4.4 NoteSuggester

**Purpose:** Enable `[[` wikilinks for note content injection

**Responsibilities:**
- Fetch vault notes from `app.vault.getMarkdownFiles()`
- Filter notes using fuzzy search on path/name
- Display note name, path, and file size
- Read note content on selection
- Estimate tokens and warn on large files
- Support multiple note references

**Data Source:** `app.vault.getMarkdownFiles()` + `app.vault.read()`

**Selection Behavior:**
- Replace `[[path]]` with `[[note-name]]` (standard wikilink)
- Store file path and content for system prompt injection
- Show token estimate after note name
- Warn if total context would exceed limits

#### 2.4.5 SuggesterRegistry

**Purpose:** Manage suggester lifecycle and activation

**Responsibilities:**
- Register suggesters with trigger patterns
- Detect trigger characters in user input
- Activate appropriate suggester based on cursor context
- Deactivate suggesters on completion/cancellation
- Track active selections across suggesters

**Interface:**
```typescript
interface SuggesterRegistry {
  register(suggester: BaseSuggester<any>): void;
  unregister(trigger: string): void;
  detectTrigger(text: string, cursorPos: number): string | null;
  getActiveSuggester(): BaseSuggester<any> | null;
  getEnhancements(): MessageEnhancementData;
  clearEnhancements(): void;
}
```

#### 2.4.6 MessageEnhancer

**Purpose:** Build enhancement metadata from suggester selections

**Responsibilities:**
- Collect selections from all active suggesters
- Build structured metadata object
- Clean user message (remove trigger markers)
- Pass enhancement data to `ModelAgentManager`

**Data Structure:**
```typescript
interface MessageEnhancementData {
  agentIds: string[];
  toolHints: ToolHint[];
  noteRefs: NoteReference[];
  estimatedTokens: number;
}
```

---

## 3. Data Architecture

### 3.1 Core Data Models

#### 3.1.1 Suggester Interfaces

```typescript
/**
 * Base suggester context passed to all suggesters
 */
interface EditorSuggestContext {
  query: string;           // Text after trigger character
  start: EditorPosition;   // Trigger start position
  end: EditorPosition;     // Current cursor position
  editor: Editor;          // Obsidian editor instance
}

/**
 * Base suggester configuration
 */
interface SuggesterConfig {
  trigger: string | string[];        // Trigger character(s)
  triggerPattern: RegExp;            // Pattern to detect trigger
  minQueryLength: number;            // Minimum chars to show suggestions
  maxSuggestions: number;            // Max suggestions to display
  cacheTimeout: number;              // Cache TTL in milliseconds
  enableTokenWarnings: boolean;      // Show token estimates
}

/**
 * Suggestion item rendering data
 */
interface SuggestionItem<T> {
  data: T;                           // Underlying data object
  displayText: string;               // Primary text to display
  displaySubtext?: string;           // Secondary text (description)
  icon?: string;                     // Icon name (Obsidian icons)
  tokenEstimate?: number;            // Estimated token count
  metadata?: Record<string, any>;    // Additional metadata
}
```

#### 3.1.2 Tool Suggester Data

```typescript
/**
 * Tool suggestion item
 */
interface ToolSuggestionItem {
  name: string;                      // Tool name (e.g., "vaultManager.readFile")
  description: string;               // Tool description
  inputSchema: Record<string, any>;  // JSON schema for parameters
  category?: string;                 // Tool category/manager
  tags?: string[];                   // Searchable tags
}

/**
 * Tool hint for system prompt injection
 */
interface ToolHint {
  name: string;                      // Full tool name
  trigger: string;                   // Original trigger text
  schema: Record<string, any>;       // Tool input schema
  description: string;               // Tool description
}
```

#### 3.1.3 Agent Suggester Data

```typescript
/**
 * Agent suggestion item (extends CustomPrompt)
 */
interface AgentSuggestionItem extends CustomPrompt {
  id: string;                        // Unique agent ID
  name: string;                      // Agent display name
  description: string;               // Agent description
  prompt: string;                    // Agent system prompt
  isEnabled: boolean;                // Whether agent is active
  tags?: string[];                   // Agent tags for filtering
  tokenEstimate?: number;            // Estimated prompt token count
}
```

#### 3.1.4 Note Suggester Data

```typescript
/**
 * Note suggestion item
 */
interface NoteSuggestionItem {
  file: TFile;                       // Obsidian TFile object
  path: string;                      // Full vault path
  name: string;                      // File name without extension
  size: number;                      // File size in bytes
  tokenEstimate?: number;            // Estimated content tokens
}

/**
 * Note reference for system prompt injection
 */
interface NoteReference {
  path: string;                      // Full file path
  trigger: string;                   // Original wikilink text
  content: string;                   // Note content
  tokenCount: number;                // Actual token count
  xmlTag: string;                    // Normalized XML tag name
}
```

#### 3.1.5 Message Enhancement Data

```typescript
/**
 * Complete enhancement metadata for a message
 */
interface MessageEnhancementData {
  // Agent mentions
  agentIds: string[];
  agentPrompts: Map<string, string>;  // ID -> prompt text

  // Tool hints
  toolHints: ToolHint[];

  // Note references
  noteRefs: NoteReference[];

  // Token tracking
  estimatedTokens: {
    agents: number;
    tools: number;
    notes: number;
    total: number;
  };

  // Original message with triggers
  rawMessage: string;

  // Cleaned message (triggers removed)
  cleanedMessage: string;
}
```

### 3.2 Data Flow Diagrams

#### 3.2.1 Tool Suggester Data Flow

```
┌─────────────────┐
│  User types "/" │
└────────┬────────┘
         │
         ▼
┌──────────────────────────────┐
│  ToolSuggester.onTrigger()   │
│  - Extract query after "/"   │
│  - Check cache validity      │
└────────┬─────────────────────┘
         │
         ▼
    Cache hit? ──No──▶ ┌────────────────────────┐
         │             │ ToolListService        │
        Yes            │ .generateToolList()    │
         │             └──────────┬─────────────┘
         │                        │
         │                        ▼
         │             ┌────────────────────────┐
         │             │ Store in cache         │
         │             │ TTL: 5 minutes         │
         │             └──────────┬─────────────┘
         │                        │
         └────────────────────────┘
                      │
                      ▼
         ┌────────────────────────────────┐
         │ getSuggestions()               │
         │ - Fuzzy filter on query        │
         │ - Rank by relevance            │
         │ - Limit to maxSuggestions      │
         └────────┬───────────────────────┘
                  │
                  ▼
         ┌────────────────────────────────┐
         │ renderSuggestion()             │
         │ - Display tool name            │
         │ - Show description             │
         │ - Indicate category            │
         └────────┬───────────────────────┘
                  │
                  ▼ User selects
         ┌────────────────────────────────┐
         │ selectSuggestion()             │
         │ - Store ToolHint               │
         │ - Update MessageEnhancer       │
         │ - Replace trigger in editor    │
         └────────────────────────────────┘
```

#### 3.2.2 Agent Suggester Data Flow

```
┌─────────────────┐
│  User types "@" │
└────────┬────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  AgentSuggester.onTrigger()          │
│  - Extract query after "@"           │
│  - Find word boundary                │
└────────┬─────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ CustomPromptStorageService              │
│ .getEnabledPrompts()                    │
│ - Returns enabled agents only           │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ getSuggestions()                        │
│ - Fuzzy filter on name/description      │
│ - Estimate prompt token count           │
│ - Sort by match score                   │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ renderSuggestion()                      │
│ - Display agent name                    │
│ - Show description                      │
│ - Show token estimate badge             │
└────────┬────────────────────────────────┘
         │
         ▼ User selects
┌─────────────────────────────────────────┐
│ selectSuggestion()                      │
│ - Store agent ID and prompt             │
│ - Update MessageEnhancer                │
│ - Replace @mention with name            │
│ - Allow multiple selections             │
└─────────────────────────────────────────┘
```

#### 3.2.3 Note Suggester Data Flow

```
┌──────────────────┐
│ User types "[["  │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  NoteSuggester.onTrigger()           │
│  - Extract query after "[["          │
│  - Detect closing "]]"               │
└────────┬─────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ app.vault.getMarkdownFiles()            │
│ - Get all markdown files                │
│ - Already cached by Obsidian            │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ getSuggestions()                        │
│ - Fuzzy filter on path/name             │
│ - prepareFuzzySearch() for ranking      │
│ - Estimate file size → tokens           │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ renderSuggestion()                      │
│ - Display note name                     │
│ - Show path as subtext                  │
│ - Show file size/token estimate         │
│ - Warn if >5000 tokens                  │
└────────┬────────────────────────────────┘
         │
         ▼ User selects
┌─────────────────────────────────────────┐
│ selectSuggestion()                      │
│ - Read file content async               │
│ - Calculate actual tokens               │
│ - Check total context limit             │
│ - Store NoteReference                   │
│ - Update MessageEnhancer                │
│ - Complete wikilink in editor           │
└─────────────────────────────────────────┘
```

### 3.3 Entity Relationship Diagram

```
┌────────────────────────┐
│   ChatInput            │
│                        │
│ - textarea: Element    │
│ - registry: Registry   │
│ - enhancer: Enhancer   │
└──────┬─────────────────┘
       │ 1:1
       │
       ▼
┌────────────────────────────┐
│  SuggesterRegistry         │
│                            │
│ - suggesters: Map          │
│ - activeSuggester: Base?   │
└──────┬─────────────────────┘
       │ 1:N
       │
       ▼
┌───────────────────────────────────────┐
│  BaseSuggester<T>                     │
│                                       │
│ + trigger: string                     │
│ + config: SuggesterConfig             │
│ # cache: Map<string, T[]>             │
└──────┬────────────────────────────────┘
       │
       │ extends
       │
       ├──────────┬──────────┬──────────┐
       ▼          ▼          ▼          ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│  Tool   │ │ Agent   │ │  Note   │
│Suggester│ │Suggester│ │Suggester│
└─────────┘ └─────────┘ └─────────┘
       │          │          │
       │          │          │
       ▼          ▼          ▼
┌──────────────────────────────────┐
│  MessageEnhancementData          │
│                                  │
│ - agentIds: string[]             │
│ - toolHints: ToolHint[]          │
│ - noteRefs: NoteReference[]      │
│ - estimatedTokens: object        │
└──────┬───────────────────────────┘
       │ used by
       ▼
┌────────────────────────────────┐
│  ModelAgentManager             │
│                                │
│ + buildSystemPrompt()          │
│   WithEnhancements()           │
└────────────────────────────────┘
```

---

## 4. API Specifications

### 4.1 BaseSuggester API

```typescript
/**
 * Abstract base class for all suggesters
 * Extends Obsidian's EditorSuggest API
 */
abstract class BaseSuggester<T> extends EditorSuggest<SuggestionItem<T>> {

  /**
   * Constructor
   * @param app - Obsidian App instance
   * @param config - Suggester configuration
   */
  constructor(app: App, config: SuggesterConfig);

  /**
   * Abstract: Get suggestions based on context
   * @param context - Editor context with query
   * @returns Array of suggestion items
   */
  abstract getSuggestions(
    context: EditorSuggestContext
  ): Promise<SuggestionItem<T>[]>;

  /**
   * Abstract: Render a suggestion in the dropdown
   * @param item - Suggestion item to render
   * @param el - HTML element to populate
   */
  abstract renderSuggestion(
    item: SuggestionItem<T>,
    el: HTMLElement
  ): void;

  /**
   * Abstract: Handle selection of a suggestion
   * @param item - Selected suggestion item
   * @param evt - Mouse/keyboard event
   */
  abstract selectSuggestion(
    item: SuggestionItem<T>,
    evt: MouseEvent | KeyboardEvent
  ): void;

  /**
   * Detect trigger and return context
   * @param cursor - Current cursor position
   * @param editor - Editor instance
   * @param file - Current file (if any)
   * @returns Context if trigger detected, null otherwise
   */
  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    file: TFile | null
  ): EditorSuggestContext | null;

  /**
   * Estimate tokens for a suggestion item
   * @param item - Suggestion item
   * @returns Estimated token count
   */
  protected estimateTokens(item: T): number;

  /**
   * Show token warning if estimate exceeds threshold
   * @param tokens - Token count
   * @param threshold - Warning threshold (default: 5000)
   */
  protected showTokenWarning(tokens: number, threshold?: number): void;

  /**
   * Get cached suggestions if valid
   * @param cacheKey - Cache key
   * @returns Cached items or null
   */
  protected getCached(cacheKey: string): T[] | null;

  /**
   * Store suggestions in cache
   * @param cacheKey - Cache key
   * @param items - Items to cache
   */
  protected setCached(cacheKey: string, items: T[]): void;

  /**
   * Clear all cached data
   */
  clearCache(): void;
}
```

### 4.2 ToolSuggester API

```typescript
/**
 * Tool command palette suggester (/)
 */
class ToolSuggester extends BaseSuggester<ToolSuggestionItem> {

  private toolListService: ToolListService;

  /**
   * Constructor
   * @param app - Obsidian App instance
   * @param toolListService - Service for fetching tools
   */
  constructor(app: App, toolListService: ToolListService);

  /**
   * Get tool suggestions
   * @param context - Editor context
   * @returns Filtered and ranked tool suggestions
   */
  async getSuggestions(
    context: EditorSuggestContext
  ): Promise<SuggestionItem<ToolSuggestionItem>[]>;

  /**
   * Render tool suggestion
   * @param item - Tool suggestion item
   * @param el - HTML element
   */
  renderSuggestion(
    item: SuggestionItem<ToolSuggestionItem>,
    el: HTMLElement
  ): void;

  /**
   * Handle tool selection
   * @param item - Selected tool
   * @param evt - Selection event
   */
  selectSuggestion(
    item: SuggestionItem<ToolSuggestionItem>,
    evt: MouseEvent | KeyboardEvent
  ): void;

  /**
   * Fetch all available tools from MCP
   * @returns Array of tool suggestion items
   */
  private async fetchTools(): Promise<ToolSuggestionItem[]>;

  /**
   * Create ToolHint from selected item
   * @param item - Selected tool
   * @returns Tool hint for system prompt
   */
  private createToolHint(item: ToolSuggestionItem): ToolHint;
}
```

### 4.3 AgentSuggester API

```typescript
/**
 * Agent mention suggester (@)
 */
class AgentSuggester extends BaseSuggester<AgentSuggestionItem> {

  private customPromptService: CustomPromptStorageService;

  /**
   * Constructor
   * @param app - Obsidian App instance
   * @param customPromptService - Service for fetching agents
   */
  constructor(app: App, customPromptService: CustomPromptStorageService);

  /**
   * Get agent suggestions
   * @param context - Editor context
   * @returns Filtered and ranked agent suggestions
   */
  async getSuggestions(
    context: EditorSuggestContext
  ): Promise<SuggestionItem<AgentSuggestionItem>[]>;

  /**
   * Render agent suggestion
   * @param item - Agent suggestion item
   * @param el - HTML element
   */
  renderSuggestion(
    item: SuggestionItem<AgentSuggestionItem>,
    el: HTMLElement
  ): void;

  /**
   * Handle agent selection
   * @param item - Selected agent
   * @param evt - Selection event
   */
  selectSuggestion(
    item: SuggestionItem<AgentSuggestionItem>,
    evt: MouseEvent | KeyboardEvent
  ): void;

  /**
   * Fetch enabled agents
   * @returns Array of enabled agent suggestion items
   */
  private async fetchAgents(): Promise<AgentSuggestionItem[]>;
}
```

### 4.4 NoteSuggester API

```typescript
/**
 * Note wikilink suggester ([[)
 */
class NoteSuggester extends BaseSuggester<NoteSuggestionItem> {

  /**
   * Constructor
   * @param app - Obsidian App instance
   */
  constructor(app: App);

  /**
   * Get note suggestions
   * @param context - Editor context
   * @returns Filtered and ranked note suggestions
   */
  async getSuggestions(
    context: EditorSuggestContext
  ): Promise<SuggestionItem<NoteSuggestionItem>[]>;

  /**
   * Render note suggestion
   * @param item - Note suggestion item
   * @param el - HTML element
   */
  renderSuggestion(
    item: SuggestionItem<NoteSuggestionItem>,
    el: HTMLElement
  ): void;

  /**
   * Handle note selection
   * @param item - Selected note
   * @param evt - Selection event
   */
  async selectSuggestion(
    item: SuggestionItem<NoteSuggestionItem>,
    evt: MouseEvent | KeyboardEvent
  ): Promise<void>;

  /**
   * Fetch all markdown files from vault
   * @returns Array of note suggestion items
   */
  private fetchNotes(): NoteSuggestionItem[];

  /**
   * Read note content and create reference
   * @param item - Selected note
   * @returns Note reference for system prompt
   */
  private async createNoteReference(
    item: NoteSuggestionItem
  ): Promise<NoteReference>;

  /**
   * Check if adding note would exceed context limits
   * @param noteTokens - Token count for note
   * @returns True if would exceed, false otherwise
   */
  private wouldExceedLimit(noteTokens: number): boolean;
}
```

### 4.5 SuggesterRegistry API

```typescript
/**
 * Manages suggester lifecycle and activation
 */
class SuggesterRegistry {

  private suggesters: Map<string, BaseSuggester<any>>;
  private activeSuggester: BaseSuggester<any> | null;
  private enhancements: MessageEnhancementData;

  /**
   * Constructor
   * @param editor - Editor instance to monitor
   */
  constructor(editor: Editor);

  /**
   * Register a suggester with the registry
   * @param suggester - Suggester to register
   */
  register(suggester: BaseSuggester<any>): void;

  /**
   * Unregister a suggester
   * @param trigger - Trigger character to unregister
   */
  unregister(trigger: string): void;

  /**
   * Detect trigger in current editor state
   * @param cursorPos - Current cursor position
   * @returns Detected trigger character or null
   */
  detectTrigger(cursorPos: EditorPosition): string | null;

  /**
   * Get currently active suggester
   * @returns Active suggester or null
   */
  getActiveSuggester(): BaseSuggester<any> | null;

  /**
   * Get accumulated message enhancements
   * @returns Enhancement data
   */
  getEnhancements(): MessageEnhancementData;

  /**
   * Clear all enhancements (after message sent)
   */
  clearEnhancements(): void;

  /**
   * Add enhancement from suggester selection
   * @param type - Enhancement type (agent/tool/note)
   * @param data - Enhancement data
   */
  addEnhancement(
    type: 'agent' | 'tool' | 'note',
    data: any
  ): void;
}
```

### 4.6 MessageEnhancer API

```typescript
/**
 * Builds enhancement metadata from suggester selections
 */
class MessageEnhancer {

  private registry: SuggesterRegistry;
  private tokenCalculator: TokenCalculator;

  /**
   * Constructor
   * @param registry - Suggester registry
   * @param tokenCalculator - Token calculator
   */
  constructor(
    registry: SuggesterRegistry,
    tokenCalculator: TokenCalculator
  );

  /**
   * Enhance a message with suggester data
   * @param rawMessage - Original message with triggers
   * @returns Enhanced message data
   */
  async enhanceMessage(
    rawMessage: string
  ): Promise<MessageEnhancementData>;

  /**
   * Clean triggers from message text
   * @param message - Message with triggers
   * @returns Cleaned message
   */
  cleanMessage(message: string): string;

  /**
   * Calculate total token estimate
   * @param enhancements - Enhancement data
   * @returns Token breakdown
   */
  calculateTokens(
    enhancements: MessageEnhancementData
  ): {
    agents: number;
    tools: number;
    notes: number;
    total: number;
  };

  /**
   * Check if enhancements would exceed context limit
   * @param enhancements - Enhancement data
   * @param currentUsage - Current context usage
   * @returns True if would exceed
   */
  wouldExceedLimit(
    enhancements: MessageEnhancementData,
    currentUsage: ContextUsage
  ): boolean;
}
```

### 4.7 ModelAgentManager Integration API

```typescript
/**
 * Extension to existing ModelAgentManager
 */
interface ModelAgentManagerExtension {

  /**
   * Build system prompt with suggester enhancements
   * @param enhancements - Message enhancements from suggesters
   * @returns Enhanced system prompt
   */
  buildSystemPromptWithEnhancements(
    enhancements?: MessageEnhancementData
  ): Promise<string | null>;

  /**
   * Inject agent prompts into system prompt
   * @param agentIds - Array of agent IDs to inject
   * @returns Agent prompt XML section
   */
  private buildAgentSection(agentIds: string[]): Promise<string>;

  /**
   * Inject tool hints into system prompt
   * @param toolHints - Array of tool hints
   * @returns Tool hints XML section
   */
  private buildToolHintsSection(toolHints: ToolHint[]): string;

  /**
   * Inject note contents into system prompt
   * @param noteRefs - Array of note references
   * @returns Notes XML section (extends existing <files>)
   */
  private buildNotesSection(noteRefs: NoteReference[]): string;
}
```

---

## 5. Technology Decisions

### 5.1 EditorSuggest vs SuggestModal

**Decision: Use `EditorSuggest` for inline autocomplete**

**Rationale:**
- **Inline Context**: Users can see their message while selecting suggestions
- **Native UX**: Matches Obsidian's wikilink and tag autocomplete behavior
- **Performance**: Lightweight, minimal DOM manipulation
- **Accessibility**: Keyboard navigation built-in
- **Visual Continuity**: Doesn't break user's flow with modal overlay

**Trade-offs:**
| Aspect | EditorSuggest | SuggestModal |
|--------|---------------|--------------|
| UX Flow | Inline, seamless | Modal, interrupts flow |
| Context Visibility | Full message visible | Message hidden behind modal |
| Implementation | More complex trigger detection | Simpler to implement |
| Performance | Better for real-time typing | Better for large lists |
| Familiarity | Matches Obsidian patterns | Generic modal pattern |

**Rejected Alternative:** `SuggestModal` would require user to explicitly open a command palette, breaking the natural typing flow.

#### 5.1.1 Built-in User Interaction Behavior

**EditorSuggest provides the following UX automatically:**

**Keyboard Navigation:**
- **First item auto-selected**: When suggester opens, the top-ranked suggestion is automatically highlighted
- **Enter key**: Selects the currently highlighted suggestion and closes the dropdown
- **Arrow keys**:
  - `↓` (Down) - Move highlight to next suggestion
  - `↑` (Up) - Move highlight to previous suggestion
  - Wraps around (top → bottom, bottom → top)
- **Escape**: Close suggester without selecting anything
- **Tab**: May select suggestion (depending on Obsidian version)

**Mouse Interaction:**
- **Hover**: Hovering over a suggestion highlights it
- **Click**: Clicking a suggestion selects it immediately
- **Scroll**: Mouse wheel or trackpad scrolls through long suggestion lists

**Visual Feedback:**
- Highlighted item has `.is-selected` CSS class (styled by Obsidian)
- Dropdown appears below cursor by default
- Automatically repositions if near bottom of viewport

**Implementation Note:**
All of this behavior is inherited from `EditorSuggest` base class. Developers only need to implement:
1. `getSuggestions()` - Return array of suggestions
2. `renderSuggestion()` - Style each suggestion item
3. `selectSuggestion()` - Handle what happens when user selects

The sorting/ranking logic in `getSuggestions()` determines which item appears at the top (and is therefore highlighted first).

### 5.2 Trigger Detection Strategy

**Decision: Character-based trigger with regex pattern matching**

**Implementation:**
```typescript
// Trigger patterns for each suggester
const TRIGGERS = {
  tool: {
    char: '/',
    pattern: /^\/(\w*)$/,           // "/" at start of line only
    position: 'line-start'
  },
  agent: {
    char: '@',
    pattern: /@([\w-]*)$/,          // "@" anywhere, alphanumeric
    position: 'anywhere'
  },
  note: {
    char: '[[',
    pattern: /\[\[([^\]]*)?$/,      // "[[" anywhere, until "]" or end
    position: 'anywhere'
  }
};
```

**Rationale:**
- **Tool (`/`)**: Line-start only prevents false triggers in URLs or mid-sentence
- **Agent (`@`)**: Anywhere allows mentioning agents in context ("ask @agent about...")
- **Note (`[[`)**: Standard Obsidian wikilink pattern, users already familiar

**Edge Cases Handled:**
- Multiple triggers in one message (tracked separately)
- Trigger characters inside existing selections
- Escaped trigger characters (e.g., `\@` or `\/`)
- Partial completions (trigger without selection)

### 5.3 Content Injection Location

**Decision: Inject into system prompt, not user message**

**System Prompt Injection Structure:**
```xml
<session_context>...</session_context>

<custom_agents>
  <agent id="agent_123">
    <name>Marketing Assistant</name>
    <instructions>You are a marketing expert...</instructions>
  </agent>
</custom_agents>

<tool_hints>
  <tool name="vaultManager.readFile">
    <description>Read a file from the vault</description>
    <schema>{ "type": "object", ... }</schema>
  </tool>
</tool_hints>

<files>
  <existing_context_note>...</existing_context_note>
  <project_notes>
    notes/project.md
    [Content from [[note]] reference...]
  </project_notes>
</files>

<agent>
  [Existing selected agent prompt...]
</agent>

<workspace>...</workspace>
```

**Rationale:**
- **Cleaner User Message**: User message remains readable and clean
- **LLM Guidance**: System prompt is the correct place for instructions and context
- **Token Efficiency**: Avoids duplicating content in conversation history
- **Existing Pattern**: Already using system prompt for workspace context
- **Separation of Concerns**: User intent vs. system-provided context

**Alternative Considered:** Injecting into user message would pollute conversation history and make transcripts harder to read.

### 5.4 Caching Strategy

**Decision: Multi-tier caching with TTL expiration**

**Cache Tiers:**
1. **Tool List Cache**: 5-minute TTL, invalidated on MCP reconnection
2. **Agent List Cache**: Session-based, invalidated on agent settings change
3. **Note List Cache**: No caching (uses Obsidian's internal vault cache)
4. **Note Content Cache**: No caching (always read fresh to avoid stale data)

**Implementation:**
```typescript
interface CacheEntry<T> {
  data: T[];
  timestamp: number;
  ttl: number;
}

class CacheManager {
  private cache = new Map<string, CacheEntry<any>>();

  get<T>(key: string): T[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set<T>(key: string, data: T[], ttl: number): void {
    this.cache.set(key, { data, timestamp: Date.now(), ttl });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}
```

**Rationale:**
- **Tool List**: MCP tools rarely change during a session, caching reduces IPC overhead
- **Agent List**: Agents may be edited in settings, but not frequently during chat
- **Notes**: Vault structure changes frequently, rely on Obsidian's caching
- **Note Content**: Always fresh to avoid showing outdated content to LLM

### 5.5 Fuzzy Search Algorithm

**Decision: Use Obsidian's native `prepareFuzzySearch` API**

**Example Usage:**
```typescript
import { prepareFuzzySearch } from 'obsidian';

const fuzzySearch = prepareFuzzySearch(query);

const results = items
  .map(item => ({
    item,
    match: fuzzySearch(item.searchText)
  }))
  .filter(result => result.match !== null)
  .sort((a, b) => b.match!.score - a.match!.score)
  .slice(0, maxResults)
  .map(result => result.item);
```

**Rationale:**
- **Consistency**: Matches Obsidian's fuzzy search behavior in other UI elements
- **Performance**: Optimized native implementation
- **Ranking**: Built-in relevance scoring
- **Maintenance**: No need to maintain custom fuzzy search logic

**Alternative Considered:** Custom fuzzy search (rejected due to maintenance burden and inconsistent UX).

### 5.6 Token Estimation Approach

**Decision: Extend existing `TokenCalculator` with enhancement support**

**New Methods:**
```typescript
class TokenCalculator {
  /**
   * Estimate tokens for message enhancements
   */
  static estimateEnhancementTokens(
    enhancements: MessageEnhancementData
  ): number {
    let total = 0;

    // Agent prompts
    enhancements.agentPrompts.forEach(prompt => {
      total += this.estimateTextTokens(prompt);
      total += 50; // XML wrapper overhead
    });

    // Tool hints (schemas can be large)
    enhancements.toolHints.forEach(hint => {
      total += this.estimateTextTokens(hint.description);
      total += this.estimateTextTokens(JSON.stringify(hint.schema));
      total += 30; // XML wrapper overhead
    });

    // Note content
    enhancements.noteRefs.forEach(ref => {
      total += ref.tokenCount; // Pre-calculated
      total += 40; // XML wrapper overhead
    });

    return total;
  }

  /**
   * Check if enhancements + current context exceeds limit
   */
  static wouldExceedContextWithEnhancements(
    currentUsage: ContextUsage,
    enhancements: MessageEnhancementData,
    bufferPercentage: number = 10
  ): boolean {
    const enhancementTokens = this.estimateEnhancementTokens(enhancements);
    const projectedTotal = currentUsage.used + enhancementTokens;
    const maxAllowed = currentUsage.total * (100 - bufferPercentage) / 100;

    return projectedTotal > maxAllowed;
  }
}
```

**Rationale:**
- **Reuse Existing Logic**: Leverage proven token estimation formula (4 chars ≈ 1 token)
- **Centralized Calculation**: All token logic in one place
- **Consistent Warnings**: Use same warning thresholds as existing code
- **Extensible**: Easy to add provider-specific tokenizers later

---

## 6. Security Architecture

### 6.1 Threat Model

| Threat | Impact | Likelihood | Mitigation |
|--------|--------|------------|------------|
| **Malicious Note Content** | Injection of harmful prompts into system prompt | Medium | Sanitize note content, XML escaping, token limits |
| **Path Traversal** | Reading files outside vault | Low | Use Obsidian API only, path validation |
| **Agent Prompt Injection** | Malicious agent overriding system behavior | Medium | Trust model: users control agents, isolate prompts in XML |
| **Token Exhaustion** | Denial of service via massive context injection | High | Token limits, warnings, prevent sending if exceeded |
| **XSS in Suggester UI** | Script injection in suggestion rendering | Low | Obsidian's setTextContent, avoid innerHTML |

### 6.2 Security Controls

#### 6.2.1 Input Sanitization

```typescript
/**
 * Sanitize note content for XML injection
 */
function sanitizeForXML(content: string): string {
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Validate file path is within vault
 */
function isValidVaultPath(path: string, vault: Vault): boolean {
  const file = vault.getAbstractFileByPath(path);
  return file instanceof TFile && file.extension === 'md';
}
```

#### 6.2.2 Token Limits

```typescript
// Maximum tokens per enhancement type
const TOKEN_LIMITS = {
  singleNote: 10000,        // Max tokens for one note
  totalNotes: 30000,        // Max tokens for all notes combined
  singleAgent: 5000,        // Max tokens for one agent prompt
  totalAgents: 15000,       // Max tokens for all agents combined
  toolHints: 5000,          // Max tokens for tool schema hints
  totalEnhancements: 50000  // Global limit for all enhancements
};

/**
 * Enforce token limits on enhancements
 */
function enforceTokenLimits(
  enhancements: MessageEnhancementData
): { allowed: boolean; reason?: string } {

  // Check individual note limits
  for (const note of enhancements.noteRefs) {
    if (note.tokenCount > TOKEN_LIMITS.singleNote) {
      return {
        allowed: false,
        reason: `Note "${note.path}" exceeds ${TOKEN_LIMITS.singleNote} token limit`
      };
    }
  }

  // Check total enhancement tokens
  const totalTokens = enhancements.estimatedTokens.total;
  if (totalTokens > TOKEN_LIMITS.totalEnhancements) {
    return {
      allowed: false,
      reason: `Total enhancements (${totalTokens} tokens) exceed limit of ${TOKEN_LIMITS.totalEnhancements}`
    };
  }

  return { allowed: true };
}
```

#### 6.2.3 Prompt Isolation

**Agent Prompts:** Each agent wrapped in separate XML tags to prevent prompt leakage:
```xml
<custom_agents>
  <agent id="agent_1" role="isolated">
    <name>Agent 1</name>
    <instructions>
      [Agent 1 prompt - cannot affect Agent 2]
    </instructions>
  </agent>
  <agent id="agent_2" role="isolated">
    <name>Agent 2</name>
    <instructions>
      [Agent 2 prompt - isolated from Agent 1]
    </instructions>
  </agent>
</custom_agents>
```

**Note Content:** Wrapped with clear boundaries:
```xml
<files>
  <file path="notes/file1.md" source="wikilink">
    [File 1 content - clearly bounded]
  </file>
  <file path="notes/file2.md" source="wikilink">
    [File 2 content - clearly bounded]
  </file>
</files>
```

### 6.3 Trust Boundaries

```
┌────────────────────────────────────────────────┐
│           Trusted Zone (User-Controlled)       │
│                                                 │
│  - User's vault notes                          │
│  - Custom agent definitions                    │
│  - Plugin settings                             │
│  - MCP tool schemas                            │
│                                                 │
└─────────────────┬──────────────────────────────┘
                  │
                  │ Read Only + Sanitization
                  │
┌─────────────────▼──────────────────────────────┐
│        Processing Zone (Plugin-Controlled)     │
│                                                 │
│  - Suggester components                        │
│  - Token calculation                           │
│  - XML sanitization                            │
│  - Context limit enforcement                   │
│                                                 │
└─────────────────┬──────────────────────────────┘
                  │
                  │ System Prompt + User Message
                  │
┌─────────────────▼──────────────────────────────┐
│        Execution Zone (LLM Provider)           │
│                                                 │
│  - LLM inference                               │
│  - Tool calling                                │
│  - Response generation                         │
│                                                 │
└────────────────────────────────────────────────┘
```

**Security Assumptions:**
1. Users trust their own vault content
2. Users trust custom agents they create
3. MCP tools are validated by plugin (existing security)
4. LLM providers handle prompt injection (out of scope)

---

## 7. Deployment Architecture

### 7.1 File Structure

```
src/
├── ui/
│   └── chat/
│       ├── components/
│       │   ├── ChatInput.ts                    [MODIFIED]
│       │   ├── suggesters/                     [NEW DIRECTORY]
│       │   │   ├── base/
│       │   │   │   ├── BaseSuggester.ts        [NEW]
│       │   │   │   ├── SuggesterConfig.ts      [NEW]
│       │   │   │   └── SuggesterInterfaces.ts  [NEW]
│       │   │   ├── ToolSuggester.ts            [NEW]
│       │   │   ├── AgentSuggester.ts           [NEW]
│       │   │   └── NoteSuggester.ts            [NEW]
│       │   └── ...
│       ├── services/
│       │   ├── ModelAgentManager.ts            [MODIFIED]
│       │   ├── SuggesterRegistry.ts            [NEW]
│       │   └── MessageEnhancer.ts              [NEW]
│       ├── utils/
│       │   ├── TokenCalculator.ts              [MODIFIED]
│       │   └── ...
│       └── ...
├── types/
│   ├── chat/
│   │   ├── ChatTypes.ts                        [MODIFIED]
│   │   └── SuggesterTypes.ts                   [NEW]
│   └── ...
└── styles/
    └── suggesters.css                          [NEW]
```

### 7.2 Initialization Sequence

```
Plugin Load
    │
    ▼
┌──────────────────────────┐
│  ChatView.onload()       │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  ChatInput.constructor() │
└──────────┬───────────────┘
           │
           ├─────────────────────────────────┐
           │                                 │
           ▼                                 ▼
┌──────────────────────┐       ┌────────────────────────┐
│ SuggesterRegistry    │       │ MessageEnhancer        │
│ .constructor()       │       │ .constructor()         │
└──────────┬───────────┘       └────────────────────────┘
           │
           │ Register suggesters
           │
           ├──────────────┬──────────────┬──────────────┐
           │              │              │              │
           ▼              ▼              ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │   Tool   │  │  Agent   │  │   Note   │
    │Suggester │  │Suggester │  │Suggester │
    └──────────┘  └──────────┘  └──────────┘
           │              │              │
           │              │              │
           └──────────────┴──────────────┘
                          │
                          ▼
                  Registry ready
                  Chat input active
```

### 7.3 Runtime Dependencies

```typescript
/**
 * ChatInput dependency injection
 */
class ChatInput {
  constructor(
    private container: HTMLElement,
    private onSendMessage: (
      message: string,
      enhancements?: MessageEnhancementData
    ) => void,
    private getLoadingState: () => boolean,
    private onStopGeneration?: () => void,
    private app: App,                            // NEW
    private toolListService: ToolListService,    // NEW
    private customPromptService: CustomPromptStorageService,  // NEW
    private tokenCalculator: TokenCalculator     // NEW
  ) {
    this.initializeSuggesters();
  }

  private initializeSuggesters(): void {
    this.registry = new SuggesterRegistry(this.textArea);
    this.enhancer = new MessageEnhancer(this.registry, this.tokenCalculator);

    // Register suggesters
    this.registry.register(
      new ToolSuggester(this.app, this.toolListService)
    );
    this.registry.register(
      new AgentSuggester(this.app, this.customPromptService)
    );
    this.registry.register(
      new NoteSuggester(this.app)
    );
  }
}
```

### 7.4 Performance Optimization

**Lazy Loading:**
```typescript
class BaseSuggester<T> {
  private dataLoader: (() => Promise<T[]>) | null = null;

  /**
   * Defer data loading until first trigger
   */
  protected lazyLoadData(loader: () => Promise<T[]>): void {
    this.dataLoader = loader;
  }

  async getSuggestions(context: EditorSuggestContext): Promise<T[]> {
    // Load data on first use
    if (this.dataLoader) {
      const data = await this.dataLoader();
      this.setCached('__initial__', data);
      this.dataLoader = null;
    }

    // ... fuzzy filter cached data
  }
}
```

**Debouncing:**
```typescript
class SuggesterRegistry {
  private triggerDebounce: number = 150; // ms
  private debounceTimer: number | null = null;

  detectTrigger(cursorPos: EditorPosition): string | null {
    // Debounce trigger detection to avoid excessive re-renders
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    return new Promise(resolve => {
      this.debounceTimer = setTimeout(() => {
        const trigger = this.detectTriggerImmediate(cursorPos);
        resolve(trigger);
      }, this.triggerDebounce);
    });
  }
}
```

**Virtualization (for large note lists):**
```typescript
class NoteSuggester {
  private maxRenderedSuggestions = 100;

  async getSuggestions(context: EditorSuggestContext): Promise<NoteSuggestionItem[]> {
    const allNotes = this.fetchNotes();
    const filtered = this.fuzzyFilter(allNotes, context.query);

    // Only return top N results to avoid rendering overhead
    return filtered.slice(0, this.maxRenderedSuggestions);
  }
}
```

---

## 8. Implementation Guidelines

### 8.1 Implementation Order

**Phase 1: Foundation (Week 1-2)**

**Tasks:**
1. Create type definitions in `src/types/chat/SuggesterTypes.ts`
2. Implement `BaseSuggester` abstract class
3. Implement `SuggesterRegistry`
4. Implement `MessageEnhancer`
5. Modify `ChatInput` to integrate registry
6. Extend `TokenCalculator` with enhancement methods
7. Create base styles in `styles/suggesters.css`

**Acceptance Criteria:**
- Registry can register/unregister suggesters
- Trigger detection works for all patterns
- MessageEnhancer builds enhancement data structure
- No visual changes yet (foundation only)

**Phase 2: Note Suggester (Week 3)**

**Tasks:**
1. Implement `NoteSuggester` extending `BaseSuggester`
2. Integrate with Obsidian's `prepareFuzzySearch`
3. Implement note content reading and token estimation
4. Add note reference injection to `ModelAgentManager`
5. Style note suggestions dropdown
6. Add token warning UI

**Acceptance Criteria:**
- `[[` triggers note suggester
- Fuzzy search filters vault notes
- Selected notes inject content into system prompt
- Token warnings display for large notes
- Multiple notes can be referenced per message

**Phase 3: Agent Suggester (Week 4)**

**Tasks:**
1. Implement `AgentSuggester` extending `BaseSuggester`
2. Integrate with `CustomPromptStorageService`
3. Add agent prompt injection to `ModelAgentManager`
4. Style agent suggestions dropdown
5. Test multi-agent scenarios

**Acceptance Criteria:**
- `@` triggers agent suggester
- Fuzzy search filters enabled agents
- Selected agents inject prompts into system prompt
- Multiple agents can be mentioned per message
- Agent prompts properly isolated in XML

**Phase 4: Tool Suggester (Week 5)**

**Tasks:**
1. Implement `ToolSuggester` extending `BaseSuggester`
2. Integrate with `ToolListService`
3. Add tool hint injection to `ModelAgentManager`
4. Style tool suggestions dropdown
5. Test with complex tool schemas

**Acceptance Criteria:**
- `/` triggers tool suggester (line-start only)
- Fuzzy search filters MCP tools
- Selected tools inject hints into system prompt
- Tool schemas properly formatted
- Cache invalidates on MCP reconnection

**Phase 5: Polish & Testing (Week 6)**

**Tasks:**
1. Add keyboard navigation enhancements
2. Implement visual feedback (pills/badges for selections)
3. Add context usage progress bar integration
4. Comprehensive error handling
5. Performance testing with large vaults
6. Cross-browser testing
7. Documentation

**Acceptance Criteria:**
- All keyboard shortcuts work
- Visual feedback clear and non-intrusive
- No performance degradation on large vaults (1000+ notes)
- Error messages user-friendly
- Code coverage >80%

### 8.2 Class Diagrams

#### 8.2.1 BaseSuggester Implementation

```
┌─────────────────────────────────────────────────────────┐
│  BaseSuggester<T>                                       │
│  extends EditorSuggest<SuggestionItem<T>>              │
├─────────────────────────────────────────────────────────┤
│  # config: SuggesterConfig                              │
│  # cache: Map<string, CacheEntry<T>>                    │
│  # registry: SuggesterRegistry                          │
│  # tokenCalculator: TokenCalculator                     │
├─────────────────────────────────────────────────────────┤
│  + constructor(app: App, config: SuggesterConfig)       │
│  + onTrigger(cursor, editor, file): Context | null      │
│  + abstract getSuggestions(context): Promise<Item<T>[]> │
│  + abstract renderSuggestion(item, el): void            │
│  + abstract selectSuggestion(item, evt): void           │
│  # getCached(key: string): T[] | null                   │
│  # setCached(key: string, items: T[]): void             │
│  # estimateTokens(item: T): number                      │
│  # showTokenWarning(tokens: number): void               │
│  + clearCache(): void                                   │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │ extends
          ┌───────────────┼───────────────┐
          │               │               │
┌─────────▼────────┐ ┌────▼────────┐ ┌───▼──────────┐
│  ToolSuggester   │ │AgentSuggest │ │NoteSuggester │
├──────────────────┤ ├─────────────┤ ├──────────────┤
│ - toolService    │ │ - promptSvc │ │              │
├──────────────────┤ ├─────────────┤ ├──────────────┤
│ + getSuggestions │ │+ getSuggest │ │+ getSuggest  │
│ + renderSuggest  │ │+ renderSugg │ │+ renderSugg  │
│ + selectSuggest  │ │+ selectSugg │ │+ selectSugg  │
│ - fetchTools     │ │- fetchAgents│ │- fetchNotes  │
│ - createHint     │ │             │ │- readContent │
└──────────────────┘ └─────────────┘ └──────────────┘
```

#### 8.2.2 Message Enhancement Flow

```
┌──────────────────┐
│   ChatInput      │
├──────────────────┤
│ - textArea       │
│ - registry       │
│ - enhancer       │
├──────────────────┤
│ + handleSend()   │────┐
└──────────────────┘    │
                        │
                        ▼
              ┌─────────────────────┐
              │ MessageEnhancer     │
              ├─────────────────────┤
              │+ enhanceMessage()   │
              │  1. Get enhancements│
              │  2. Clean message   │
              │  3. Calculate tokens│
              │  4. Validate limits │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ ModelAgentManager   │
              ├─────────────────────┤
              │+ buildSystemPrompt  │
              │  WithEnhancements() │
              │  1. Session context │
              │  2. Agent section   │
              │  3. Tool hints      │
              │  4. Files section   │
              │  5. Workspace       │
              └─────────────────────┘
```

### 8.3 Sequence Diagrams

#### 8.3.1 Tool Suggestion Sequence

```
User    ChatInput    Registry    ToolSuggester    ToolListService    MessageEnhancer
 │          │            │              │                 │                │
 │ types "/"│            │              │                 │                │
 ├─────────>│            │              │                 │                │
 │          │ detectTrigger()          │                 │                │
 │          ├───────────>│              │                 │                │
 │          │            │ onTrigger()  │                 │                │
 │          │            ├─────────────>│                 │                │
 │          │            │              │ getCached()     │                │
 │          │            │              ├─────────────────┤                │
 │          │            │              │ cache miss      │                │
 │          │            │              │ fetchTools()    │                │
 │          │            │              ├────────────────>│                │
 │          │            │              │ generateToolList()              │
 │          │            │              │<────────────────┤                │
 │          │            │              │ setCached()     │                │
 │          │            │              │                 │                │
 │          │            │<─────────────┤                 │                │
 │          │<───────────┤ suggestions  │                 │                │
 │ shows    │            │              │                 │                │
 │dropdown  │            │              │                 │                │
 │<─────────┤            │              │                 │                │
 │          │            │              │                 │                │
 │ selects  │            │              │                 │                │
 │ "readFile"            │              │                 │                │
 ├─────────>│            │              │                 │                │
 │          │            │ selectSuggestion()            │                │
 │          │            ├─────────────>│                 │                │
 │          │            │              │ createToolHint()│                │
 │          │            │              ├─────────────────┤                │
 │          │            │              │ addEnhancement()│                │
 │          │            │              ├────────────────────────────────>│
 │          │            │              │                 │    store hint  │
 │          │            │              │<───────────────────────────────┤
 │          │<───────────┴──────────────┤                 │                │
 │ text     │            │              │                 │                │
 │ updated  │            │              │                 │                │
 │<─────────┤            │              │                 │                │
```

#### 8.3.2 Note Selection Sequence

```
User    ChatInput    Registry    NoteSuggester    Vault API    TokenCalc    MessageEnhancer
 │          │            │              │              │            │              │
 │types "[[p"           │              │              │            │              │
 ├─────────>│            │              │              │            │              │
 │          │ detectTrigger()          │              │            │              │
 │          ├───────────>│              │              │            │              │
 │          │            │ onTrigger()  │              │            │              │
 │          │            ├─────────────>│              │            │              │
 │          │            │              │ getMarkdownFiles()       │              │
 │          │            │              ├─────────────>│            │              │
 │          │            │              │ files[]      │            │              │
 │          │            │              │<─────────────┤            │              │
 │          │            │              │ fuzzyFilter()│            │              │
 │          │            │              ├──────────────┤            │              │
 │          │            │<─────────────┤suggestions   │            │              │
 │          │<───────────┤              │              │            │              │
 │ shows    │            │              │              │            │              │
 │dropdown  │            │              │              │            │              │
 │<─────────┤            │              │              │            │              │
 │          │            │              │              │            │              │
 │ selects  │            │              │              │            │              │
 │"project" │            │              │              │            │              │
 ├─────────>│            │              │              │            │              │
 │          │            │ selectSuggestion()          │            │              │
 │          │            ├─────────────>│              │            │              │
 │          │            │              │ read(file)   │            │              │
 │          │            │              ├─────────────>│            │              │
 │          │            │              │ content      │            │              │
 │          │            │              │<─────────────┤            │              │
 │          │            │              │ estimateTokens(content)   │              │
 │          │            │              ├──────────────────────────>│              │
 │          │            │              │              │ tokens: 3420              │
 │          │            │              │<─────────────────────────┤              │
 │          │            │              │ wouldExceedLimit()?      │              │
 │          │            │              ├──────────────────────────>│              │
 │          │            │              │              │  false    │              │
 │          │            │              │<─────────────────────────┤              │
 │          │            │              │ createNoteReference()    │              │
 │          │            │              ├──────────────┤            │              │
 │          │            │              │ addEnhancement()         │              │
 │          │            │              ├─────────────────────────────────────────>│
 │          │            │              │              │            │   store ref  │
 │          │            │              │<────────────────────────────────────────┤
 │          │<───────────┴──────────────┤              │            │              │
 │ wikilink │            │              │              │            │              │
 │completed │            │              │              │            │              │
 │<─────────┤            │              │            │            │              │
```

#### 8.3.3 Message Send with Enhancements

```
User    ChatInput    MessageEnhancer    ModelAgentManager    CustomPromptService    LLM
 │          │              │                    │                    │              │
 │ clicks   │              │                    │                    │              │
 │  send    │              │                    │                    │              │
 ├─────────>│              │                    │                    │              │
 │          │ enhanceMessage(rawMsg)           │                    │              │
 │          ├─────────────>│                    │                    │              │
 │          │              │ getEnhancements()  │                    │              │
 │          │              ├────────────────────┤                    │              │
 │          │              │ cleanMessage()     │                    │              │
 │          │              ├────────────────────┤                    │              │
 │          │              │ calculateTokens()  │                    │              │
 │          │              ├────────────────────┤                    │              │
 │          │              │ wouldExceedLimit() │                    │              │
 │          │              ├────────────────────┤                    │              │
 │          │              │ enhancement data   │                    │              │
 │          │<─────────────┤                    │                    │              │
 │          │              │                    │                    │              │
 │          │ onSendMessage(cleanMsg, enhancements)                 │              │
 │          ├───────────────────────────────────>│                    │              │
 │          │              │                    │ buildSystemPrompt  │              │
 │          │              │                    │ WithEnhancements() │              │
 │          │              │                    ├────────────────────┤              │
 │          │              │                    │ getPrompt(agentId) │              │
 │          │              │                    ├───────────────────>│              │
 │          │              │                    │ agent prompt       │              │
 │          │              │                    │<──────────────────┤              │
 │          │              │                    │ build XML sections │              │
 │          │              │                    ├────────────────────┤              │
 │          │              │                    │ system prompt      │              │
 │          │              │                    ├────────────────────┤              │
 │          │              │                    │ sendMessage(       │              │
 │          │              │                    │   cleanMsg,        │              │
 │          │              │                    │   systemPrompt)    │              │
 │          │              │                    ├───────────────────────────────────>│
 │          │              │                    │                    │   response   │
 │          │              │                    │<──────────────────────────────────┤
 │          │<───────────────────────────────────┤                    │              │
 │ display  │              │                    │                    │              │
 │ response │              │                    │                    │              │
 │<─────────┤              │                    │                    │              │
```

### 8.4 Code Examples

#### 8.4.1 BaseSuggester Implementation

```typescript
// src/ui/chat/components/suggesters/base/BaseSuggester.ts

import { App, Editor, EditorPosition, EditorSuggest, TFile } from 'obsidian';
import { TokenCalculator } from '../../../utils/TokenCalculator';
import { SuggesterConfig, SuggestionItem, EditorSuggestContext } from './SuggesterInterfaces';

export abstract class BaseSuggester<T> extends EditorSuggest<SuggestionItem<T>> {

  protected config: SuggesterConfig;
  protected cache = new Map<string, { data: T[]; timestamp: number }>();
  protected tokenCalculator: TokenCalculator;

  constructor(app: App, config: SuggesterConfig) {
    super(app);
    this.config = config;
    this.tokenCalculator = TokenCalculator;
  }

  /**
   * Detect trigger and extract context
   */
  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    file: TFile | null
  ): EditorSuggestContext | null {

    const line = editor.getLine(cursor.line);
    const textBeforeCursor = line.substring(0, cursor.ch);

    // Check trigger pattern
    const match = textBeforeCursor.match(this.config.triggerPattern);
    if (!match) return null;

    // Extract query after trigger
    const query = match[1] || '';

    // Check minimum query length
    if (query.length < this.config.minQueryLength) {
      return null;
    }

    // Calculate trigger start position
    const triggerStart = {
      line: cursor.line,
      ch: match.index!
    };

    return {
      query,
      start: triggerStart,
      end: cursor,
      editor
    };
  }

  /**
   * Abstract method: Get filtered suggestions
   */
  abstract getSuggestions(
    context: EditorSuggestContext
  ): Promise<SuggestionItem<T>[]> | SuggestionItem<T>[];

  /**
   * Abstract method: Render suggestion item
   */
  abstract renderSuggestion(
    item: SuggestionItem<T>,
    el: HTMLElement
  ): void;

  /**
   * Abstract method: Handle suggestion selection
   */
  abstract selectSuggestion(
    item: SuggestionItem<T>,
    evt: MouseEvent | KeyboardEvent
  ): void;

  /**
   * Get cached data if valid
   */
  protected getCached(key: string): T[] | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.config.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * Store data in cache
   */
  protected setCached(key: string, data: T[]): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Estimate tokens for item (override in subclasses)
   */
  protected estimateTokens(item: T): number {
    return 0; // Subclasses should implement
  }

  /**
   * Show token warning if exceeds threshold
   */
  protected showTokenWarning(tokens: number, threshold: number = 5000): void {
    if (tokens > threshold) {
      // Show warning notice (implementation depends on UI framework)
      console.warn(`[${this.constructor.name}] High token count: ${tokens}`);
    }
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
  }
}
```

#### 8.4.2 ToolSuggester Implementation

```typescript
// src/ui/chat/components/suggesters/ToolSuggester.ts

import { App, prepareFuzzySearch, setIcon } from 'obsidian';
import { BaseSuggester } from './base/BaseSuggester';
import { SuggestionItem, EditorSuggestContext, ToolSuggestionItem, ToolHint } from './base/SuggesterInterfaces';
import { ToolListService } from '../../../handlers/services/ToolListService';

export class ToolSuggester extends BaseSuggester<ToolSuggestionItem> {

  private toolListService: ToolListService;

  constructor(app: App, toolListService: ToolListService) {
    super(app, {
      trigger: '/',
      triggerPattern: /^\/(\w*)$/,
      minQueryLength: 0,
      maxSuggestions: 20,
      cacheTimeout: 5 * 60 * 1000, // 5 minutes
      enableTokenWarnings: false
    });

    this.toolListService = toolListService;
  }

  async getSuggestions(
    context: EditorSuggestContext
  ): Promise<SuggestionItem<ToolSuggestionItem>[]> {

    // Check cache first
    let tools = this.getCached('tools');

    if (!tools) {
      // Fetch from service
      tools = await this.fetchTools();
      this.setCached('tools', tools);
    }

    // Fuzzy filter
    const query = context.query.toLowerCase();
    const fuzzySearch = prepareFuzzySearch(query);

    const filtered = tools
      .map(tool => {
        const searchText = `${tool.name} ${tool.description}`;
        const match = fuzzySearch(searchText);

        return {
          tool,
          match
        };
      })
      .filter(result => result.match !== null)
      .sort((a, b) => b.match!.score - a.match!.score)
      .slice(0, this.config.maxSuggestions)
      .map(result => ({
        data: result.tool,
        displayText: result.tool.name,
        displaySubtext: result.tool.description,
        icon: 'wrench',
        metadata: { category: result.tool.category }
      }));

    return filtered;
  }

  renderSuggestion(
    item: SuggestionItem<ToolSuggestionItem>,
    el: HTMLElement
  ): void {

    el.addClass('suggester-item', 'tool-suggester-item');

    // Icon
    const iconEl = el.createDiv('suggester-icon');
    setIcon(iconEl, item.icon || 'wrench');

    // Content
    const contentEl = el.createDiv('suggester-content');

    // Title
    const titleEl = contentEl.createDiv('suggester-title');
    titleEl.textContent = item.displayText;

    // Category badge
    if (item.metadata?.category) {
      const categoryEl = titleEl.createSpan('suggester-badge');
      categoryEl.textContent = item.metadata.category;
    }

    // Description
    if (item.displaySubtext) {
      const descEl = contentEl.createDiv('suggester-description');
      descEl.textContent = item.displaySubtext;
    }
  }

  selectSuggestion(
    item: SuggestionItem<ToolSuggestionItem>,
    evt: MouseEvent | KeyboardEvent
  ): void {

    const context = this.context;
    if (!context) return;

    // Create tool hint
    const hint = this.createToolHint(item.data);

    // Add to message enhancer (accessed via registry)
    (this.app as any).workspace.chatInput?.registry?.addEnhancement('tool', hint);

    // Replace trigger text with cleaned version (remove "/")
    context.editor.replaceRange(
      '',
      context.start,
      context.end
    );

    this.close();
  }

  private async fetchTools(): Promise<ToolSuggestionItem[]> {
    try {
      const plugin = (this.app as any).plugins.plugins['claudesidian-mcp'];
      const agents = await plugin.getAgents();
      const { tools } = await this.toolListService.generateToolList(
        agents,
        true
      );

      return tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        category: this.extractCategory(tool.name),
        tags: this.extractTags(tool)
      }));

    } catch (error) {
      console.error('[ToolSuggester] Error fetching tools:', error);
      return [];
    }
  }

  private extractCategory(toolName: string): string {
    const parts = toolName.split('.');
    return parts[0] || 'general';
  }

  private extractTags(tool: any): string[] {
    // Extract keywords from description
    const keywords = tool.description
      .toLowerCase()
      .split(/\s+/)
      .filter((word: string) => word.length > 4);

    return [...new Set(keywords)];
  }

  private createToolHint(item: ToolSuggestionItem): ToolHint {
    return {
      name: item.name,
      trigger: `/${item.name.split('.').pop()}`,
      schema: item.inputSchema,
      description: item.description
    };
  }
}
```

#### 8.4.3 ModelAgentManager Enhancement

```typescript
// src/ui/chat/services/ModelAgentManager.ts (additions)

import { MessageEnhancementData, ToolHint, NoteReference } from '../../types/chat/SuggesterTypes';

export class ModelAgentManager {
  // ... existing properties ...

  /**
   * Build system prompt with suggester enhancements
   */
  async buildSystemPromptWithEnhancements(
    enhancements?: MessageEnhancementData
  ): Promise<string | null> {

    let prompt = '';

    // 0. Session and workspace context (existing)
    const sessionContext = await this.buildSessionContext();
    if (sessionContext) {
      prompt += sessionContext;
    }

    // 1. Custom agents from suggester (NEW)
    if (enhancements?.agentIds && enhancements.agentIds.length > 0) {
      const agentSection = await this.buildAgentSection(enhancements.agentIds);
      if (agentSection) {
        prompt += agentSection;
      }
    }

    // 2. Tool hints from suggester (NEW)
    if (enhancements?.toolHints && enhancements.toolHints.length > 0) {
      const toolSection = this.buildToolHintsSection(enhancements.toolHints);
      if (toolSection) {
        prompt += toolSection;
      }
    }

    // 3. Context files (existing + suggester notes)
    const notesToInject = [
      ...this.contextNotes,  // Existing context notes
      ...(enhancements?.noteRefs?.map(ref => ref.path) || [])
    ];

    if (notesToInject.length > 0) {
      prompt += '<files>\n';

      for (const notePath of notesToInject) {
        // Check if this is a suggester note reference
        const noteRef = enhancements?.noteRefs?.find(ref => ref.path === notePath);

        if (noteRef) {
          // Use pre-loaded content from suggester
          prompt += `<${noteRef.xmlTag}>\n`;
          prompt += `${noteRef.path}\n\n`;
          prompt += noteRef.content;
          prompt += `\n</${noteRef.xmlTag}>\n`;
        } else {
          // Existing context note, read as before
          const xmlTag = this.normalizePathToXmlTag(notePath);
          const content = await this.readNoteContent(notePath);
          prompt += `<${xmlTag}>\n`;
          prompt += `${notePath}\n\n`;
          prompt += content || '[File content unavailable]';
          prompt += `\n</${xmlTag}>\n`;
        }
      }

      prompt += '</files>\n\n';
    }

    // 4. Agent section (existing selected agent)
    if (this.currentSystemPrompt) {
      prompt += '<agent>\n';
      prompt += this.currentSystemPrompt;
      prompt += '\n</agent>\n\n';
    }

    // 5. Workspace section (existing)
    if (this.workspaceContext) {
      prompt += '<workspace>\n';
      prompt += JSON.stringify(this.workspaceContext, null, 2);
      prompt += '\n</workspace>';
    }

    return prompt || null;
  }

  /**
   * Build agent section from suggester selections
   */
  private async buildAgentSection(agentIds: string[]): Promise<string> {
    const plugin = this.app.plugins.plugins['claudesidian-mcp'];
    const customPromptService = await plugin.getService('customPromptService');

    if (!customPromptService) return '';

    let section = '<custom_agents>\n';

    for (const agentId of agentIds) {
      const agent = customPromptService.getPrompt(agentId);
      if (!agent) continue;

      section += `  <agent id="${agentId}" role="isolated">\n`;
      section += `    <name>${this.escapeXml(agent.name)}</name>\n`;
      section += `    <description>${this.escapeXml(agent.description)}</description>\n`;
      section += `    <instructions>\n`;
      section += `${agent.prompt}\n`;
      section += `    </instructions>\n`;
      section += `  </agent>\n`;
    }

    section += '</custom_agents>\n\n';

    return section;
  }

  /**
   * Build tool hints section
   */
  private buildToolHintsSection(toolHints: ToolHint[]): string {
    let section = '<tool_hints>\n';
    section += '  <context>The user has indicated interest in these tools:</context>\n';

    for (const hint of toolHints) {
      section += `  <tool name="${this.escapeXml(hint.name)}">\n`;
      section += `    <description>${this.escapeXml(hint.description)}</description>\n`;
      section += `    <schema>\n`;
      section += JSON.stringify(hint.schema, null, 2)
        .split('\n')
        .map(line => `      ${line}`)
        .join('\n');
      section += `\n    </schema>\n`;
      section += `  </tool>\n`;
    }

    section += '</tool_hints>\n\n';

    return section;
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
```

---

## 9. Risk Assessment

### 9.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Performance degradation with large vaults** | Medium | High | - Implement caching<br>- Limit max suggestions<br>- Virtual scrolling<br>- Debounce trigger detection |
| **Token estimation accuracy** | Medium | Medium | - Use conservative estimates<br>- Add safety buffers<br>- Warn users proactively<br>- Allow override if needed |
| **EditorSuggest API limitations** | Low | Medium | - Thoroughly test API<br>- Fallback to custom implementation<br>- Monitor Obsidian updates |
| **Memory leaks from cached data** | Low | Low | - Implement TTL expiration<br>- Clear cache on unmount<br>- Monitor memory usage |
| **Conflicts with other plugins** | Medium | Low | - Namespace CSS classes<br>- Test with popular plugins<br>- Provide disable option |
| **Async race conditions** | Medium | Medium | - Proper promise handling<br>- Cancel outdated requests<br>- Lock critical sections |

### 9.2 UX Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Accidental trigger activation** | Medium | Low | - Require minimum query length<br>- ESC to dismiss<br>- Clear visual feedback |
| **Confusing enhancement display** | Low | Medium | - Clear visual indicators<br>- Token estimates<br>- Preview before send |
| **Context limit surprises** | Medium | High | - Real-time token display<br>- Warning before send<br>- Explain limits clearly |
| **Learning curve for new users** | Low | Low | - In-app tooltips<br>- Documentation<br>- Tutorial on first use |
| **Mobile compatibility** | High | Medium | - Test on mobile<br>- Adjust touch targets<br>- Alternative input methods |

### 9.3 Integration Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Breaking changes in Obsidian API** | Low | High | - Use stable APIs only<br>- Version compatibility checks<br>- Automated testing |
| **MCP service unavailability** | Low | Medium | - Graceful degradation<br>- Cache last known state<br>- User-friendly errors |
| **System prompt exceeds LLM limits** | Medium | High | - Enforce strict token limits<br>- Prioritize enhancements<br>- Truncate if needed |
| **Agent prompt conflicts** | Low | Low | - XML isolation<br>- Clear boundaries<br>- Document best practices |

### 9.4 Security Risks

*(See Section 6: Security Architecture for detailed threat model)*

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Malicious note content injection** | Medium | Medium | - XML escaping<br>- Token limits<br>- Sanitize content |
| **Agent prompt injection attacks** | Low | Medium | - Trust boundary enforcement<br>- Prompt isolation<br>- User education |
| **Path traversal attacks** | Low | High | - Use Obsidian API only<br>- Path validation<br>- No direct file access |
| **Token exhaustion DOS** | Medium | Low | - Hard token limits<br>- Prevent send if exceeded<br>- Rate limiting |

### 9.5 Mitigation Summary

**Top Priority Mitigations:**
1. **Comprehensive token limit enforcement** - Prevent context overflow
2. **Performance optimization for large vaults** - Caching, virtualization, debouncing
3. **Clear UX feedback** - Token estimates, warnings, visual indicators
4. **XML content sanitization** - Prevent injection attacks
5. **Graceful error handling** - Never crash, always inform user

---

## Conclusion

This architectural design provides a complete blueprint for implementing autocomplete/suggester features in the claudesidian-mcp chat interface. The design prioritizes:

- **User Experience**: Seamless, inline suggestions matching Obsidian's native behavior
- **Code Quality**: Shared base classes, clear separation of concerns, DRY principles
- **Performance**: Caching, lazy loading, optimized fuzzy search
- **Security**: Input sanitization, token limits, prompt isolation
- **Maintainability**: Clear interfaces, comprehensive documentation, testable components

**Next Steps:**
1. Review and approve this architectural design
2. Create implementation tasks from Phase 1 (Foundation)
3. Set up testing framework for suggesters
4. Begin implementation following the phased approach (Weeks 1-6)

**Success Metrics:**
- All three suggesters operational and performant
- No performance degradation on vaults with 1000+ notes
- Token warnings prevent context overflow
- User adoption rate >50% within first month
- Zero security incidents related to content injection

---

**Document Version:** 1.0
**Last Updated:** 2025-10-19
**Author:** PACT Architect
**Status:** Ready for Implementation
