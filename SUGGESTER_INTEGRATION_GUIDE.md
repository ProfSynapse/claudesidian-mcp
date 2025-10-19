# Suggester Integration Guide

This document explains how to integrate the autocomplete suggester system with the main plugin.

## ✅ What's Been Built

### Core Components

1. **Type Definitions** (`src/ui/chat/components/suggesters/base/SuggesterInterfaces.ts`)
   - All TypeScript interfaces and types
   - Enums for suggester types, enhancement types, token warning levels

2. **BaseSuggester** (`src/ui/chat/components/suggesters/base/BaseSuggester.ts`)
   - Abstract base class extending Obsidian's `EditorSuggest`
   - Provides trigger detection, caching, token estimation
   - All three suggesters inherit from this

3. **Concrete Suggesters**
   - **NoteSuggester** (`src/ui/chat/components/suggesters/NoteSuggester.ts`) - `[[` trigger
   - **AgentSuggester** (`src/ui/chat/components/suggesters/AgentSuggester.ts`) - `@` trigger
   - **ToolSuggester** (`src/ui/chat/components/suggesters/ToolSuggester.ts`) - `/` trigger

4. **Services**
   - **MessageEnhancer** (`src/ui/chat/services/MessageEnhancer.ts`)
     - Collects tool hints, agent references, note content
     - Builds final enhancement object
     - Cleans user message by removing trigger characters

   - **SuggesterRegistry** (`src/ui/chat/services/SuggesterRegistry.ts`)
     - Manages all suggester instances
     - Tracks active suggesters
     - Provides central access point

5. **ModelAgentManager Extensions** (`src/ui/chat/services/ModelAgentManager.ts`)
   - Added `messageEnhancement` property
   - Added `setMessageEnhancement()`, `getMessageEnhancement()`, `clearMessageEnhancement()`
   - Modified `buildSystemPromptWithWorkspace()` to inject:
     - Tool hints in `<tool_hints>` section
     - Custom agents in `<custom_agents>` section
     - Additional notes in `<files>` section
   - Added XML escaping for security

6. **CSS Styling** (`styles.css`)
   - Suggester dropdown styles
   - Badge styles (category, token warnings, file size)
   - Icon colors for different suggester types
   - Hover and selection states

## 🔌 Integration Steps

### Step 1: Initialize in Main Plugin

In your main plugin file (likely `connector.ts` or similar), you need to:

```typescript
import { SuggesterRegistry } from './src/ui/chat/services/SuggesterRegistry';
import { NoteSuggester } from './src/ui/chat/components/suggesters/NoteSuggester';
import { AgentSuggester } from './src/ui/chat/components/suggesters/AgentSuggester';
import { ToolSuggester } from './src/ui/chat/components/suggesters/ToolSuggester';
import { SuggesterType } from './src/ui/chat/components/suggesters/base/SuggesterInterfaces';

export default class ClaudesidianMCPPlugin extends Plugin {
  private suggesterRegistry: SuggesterRegistry;

  async onload() {
    // ... existing onload code ...

    // Initialize suggester registry
    this.suggesterRegistry = new SuggesterRegistry(this.app);

    // Get dependencies
    const messageEnhancer = this.suggesterRegistry.getMessageEnhancer();
    const settings = await this.getSettings(); // Your settings service
    const promptStorage = new CustomPromptStorageService(settings);
    const toolListService = new ToolListService();

    // Create and register suggesters
    const noteSuggester = new NoteSuggester(this.app, messageEnhancer);
    const agentSuggester = new AgentSuggester(this.app, messageEnhancer, promptStorage);
    const toolSuggester = new ToolSuggester(
      this.app,
      messageEnhancer,
      toolListService,
      () => this.getAgents(), // Provide getter for agents
      () => this.isVaultEnabled(),
      () => this.getVaultName()
    );

    // Register suggesters
    this.suggesterRegistry.register(SuggesterType.NOTE, noteSuggester);
    this.suggesterRegistry.register(SuggesterType.AGENT, agentSuggester);
    this.suggesterRegistry.register(SuggesterType.TOOL, toolSuggester);

    // Register suggesters with Obsidian
    this.registerEditorSuggest(noteSuggester);
    this.registerEditorSuggest(agentSuggester);
    this.registerEditorSuggest(toolSuggester);
  }

  async onunload() {
    // Clean up
    this.suggesterRegistry.destroy();
  }
}
```

### Step 2: Integrate with Chat Message Sending

In your chat message sending logic (likely in ChatView or ChatInput), you need to:

```typescript
import { MessageEnhancement } from './components/suggesters/base/SuggesterInterfaces';

class ChatView {
  private suggesterRegistry: SuggesterRegistry;
  private modelAgentManager: ModelAgentManager;

  async sendMessage(message: string) {
    // Get message enhancer
    const messageEnhancer = this.suggesterRegistry.getMessageEnhancer();

    // Build enhancement from suggester selections
    const enhancement: MessageEnhancement = messageEnhancer.buildEnhancement(message);

    // Set enhancement in ModelAgentManager
    this.modelAgentManager.setMessageEnhancement(enhancement);

    // Get cleaned message (with trigger characters removed)
    const cleanedMessage = enhancement.cleanedMessage;

    // Send message with enhanced system prompt
    const messageOptions = await this.modelAgentManager.getMessageOptions();

    // The system prompt now includes tool hints, agents, and notes from suggesters
    await this.sendToLLM(cleanedMessage, messageOptions);

    // Clear enhancements after sending
    this.modelAgentManager.clearMessageEnhancement();
    messageEnhancer.clearEnhancements();
  }
}
```

### Step 3: Wire Up to ChatInput Component

The suggesters use Obsidian's `EditorSuggest` API which automatically works with any `Editor` instance. Since ChatInput likely uses a textarea or CodeMirror editor, the suggesters will automatically activate when:

- User types `[[` → NoteSuggester activates
- User types `@` → AgentSuggester activates
- User types `/` at start of line → ToolSuggester activates

**Important:** Make sure ChatInput is using an Obsidian `Editor` instance, not a plain HTML textarea.

If using a custom textarea, you may need to wrap it or use Obsidian's `MarkdownView.editor`.

## 🎨 Styling

All CSS has been added to `styles.css`. The suggesters will automatically use:

- `.suggester-item` - Base item style
- `.suggester-icon` - Icon container (file-text, bot, wrench)
- `.suggester-title` - Primary text
- `.suggester-description` - Secondary text
- `.suggester-badge-container` - Badge container
- `.token-badge-*` - Token warning badges (info, warning, error)

Icons are colored:
- Blue for notes (`.note-suggester-item`)
- Purple for agents (`.agent-suggester-item`)
- Green for tools (`.tool-suggester-item`)

## 🔧 Configuration

### Suggester Behavior

Each suggester has configurable options in its constructor:

```typescript
{
  trigger: RegExp,        // Pattern to activate suggester
  maxSuggestions: number, // Max items in dropdown
  cacheTTL: number,       // Cache lifetime in ms
  debounceDelay: number   // Debounce delay in ms
}
```

Current defaults:
- **NoteSuggester**: 50 max, 60s cache, 150ms debounce
- **AgentSuggester**: 20 max, 30s cache, 100ms debounce
- **ToolSuggester**: 30 max, 120s cache, 100ms debounce

### Token Limits

Token warnings are shown when:
- Note > 7,500 tokens (75% of 10,000 limit)
- Agent > 3,750 tokens (75% of 5,000 limit)

Adjust in suggester classes:
```typescript
private maxTokensPerNote = 10000;
private maxTokensPerAgent = 5000;
```

## 🧪 Testing

### Manual Testing Checklist

1. **Note Suggester (`[[`)**
   - [ ] Type `[[` in chat input
   - [ ] Verify dropdown appears with notes
   - [ ] Type query, verify fuzzy search works
   - [ ] Press Enter on highlighted item
   - [ ] Verify `[[note-name]]` is inserted
   - [ ] Send message and check system prompt includes note content

2. **Agent Suggester (`@`)**
   - [ ] Type `@` in chat input
   - [ ] Verify dropdown shows enabled agents
   - [ ] Type query, verify fuzzy search works
   - [ ] Select agent with Enter
   - [ ] Verify `@Agent_Name` is inserted
   - [ ] Send message and check system prompt includes agent instructions

3. **Tool Suggester (`/`)**
   - [ ] Type `/` at start of chat input
   - [ ] Verify dropdown shows available tools
   - [ ] Type query, verify fuzzy search works
   - [ ] Select tool with Enter
   - [ ] Verify `/` is removed
   - [ ] Send message and check system prompt includes tool hint

4. **Multiple Enhancements**
   - [ ] Use multiple suggesters in one message
   - [ ] Example: `/readFile about [[project-notes]] with @Technical_Writer`
   - [ ] Verify all enhancements are included in system prompt
   - [ ] Verify cleaned message is: "about project-notes with Technical_Writer"

5. **Token Warnings**
   - [ ] Select a large note (>7.5k tokens)
   - [ ] Verify warning badge appears in dropdown
   - [ ] Select agent with long prompt
   - [ ] Verify token count is displayed

## 📝 Architecture Reference

See `ARCHITECTURE_AUTOCOMPLETE_SUGGESTERS.md` for:
- Detailed component diagrams
- Sequence diagrams for user interactions
- Data flow diagrams
- Security considerations
- Performance optimizations

## 🐛 Troubleshooting

### Suggesters Not Appearing

1. Check that suggesters are registered:
   ```typescript
   this.registerEditorSuggest(suggester);
   ```

2. Verify ChatInput uses an Obsidian `Editor` instance

3. Check console for errors during suggester initialization

### Enhancements Not Injected

1. Verify `setMessageEnhancement()` is called before sending message
2. Check `buildSystemPromptWithWorkspace()` is called to get system prompt
3. Verify `messageEnhancement` is not null when building prompt
4. Check console for XML escaping errors

### Performance Issues

1. Increase cache TTL to reduce file reads
2. Reduce `maxSuggestions` to limit rendered items
3. Increase debounce delay to reduce trigger frequency
4. Check for console warnings about large notes/agents

## 🚀 Next Steps

1. **Integration Testing**: Wire up to main plugin and test all three suggesters
2. **Edge Cases**: Test with special characters, very long notes, disabled agents
3. **Performance**: Test with large vaults (1000+ notes)
4. **User Feedback**: Add visual indicators showing active enhancements
5. **Settings UI**: Add settings panel to configure suggester behavior
6. **Mobile Support**: Test and adjust for mobile devices

## 📚 Files Modified/Created

### New Files
- `src/ui/chat/components/suggesters/base/SuggesterInterfaces.ts`
- `src/ui/chat/components/suggesters/base/BaseSuggester.ts`
- `src/ui/chat/components/suggesters/NoteSuggester.ts`
- `src/ui/chat/components/suggesters/AgentSuggester.ts`
- `src/ui/chat/components/suggesters/ToolSuggester.ts`
- `src/ui/chat/services/SuggesterRegistry.ts`
- `src/ui/chat/services/MessageEnhancer.ts`
- `ARCHITECTURE_AUTOCOMPLETE_SUGGESTERS.md`
- `SUGGESTER_INTEGRATION_GUIDE.md` (this file)

### Modified Files
- `src/ui/chat/services/ModelAgentManager.ts`
  - Added import for `MessageEnhancement`
  - Added `messageEnhancement` property
  - Added `setMessageEnhancement()`, `getMessageEnhancement()`, `clearMessageEnhancement()`
  - Modified `buildSystemPromptWithWorkspace()` to include enhancements
  - Added `escapeXmlContent()` and `escapeXmlAttribute()` security methods

- `styles.css`
  - Added suggester autocomplete styles (~170 lines)

## ✨ Features Implemented

- ✅ Fuzzy search for all three suggester types
- ✅ Keyboard navigation (arrows, Enter, Escape)
- ✅ Top option auto-highlighted
- ✅ Mouse click selection
- ✅ Token estimation and warnings
- ✅ Multiple enhancements per message
- ✅ XML injection protection
- ✅ Caching for performance
- ✅ Responsive styling
- ✅ Icon differentiation by type
- ✅ Badge system (category, size, tokens)
