# Feature Ideas & Roadmap

## 🐛 Bugs & UX Issues

### 1. 🔑 API Key Validation Requires Full Restart
**Status:** 🔴 To Do  
**Priority:** High  
**Estimated Effort:** Small

#### Problem
When validating an API key in the LLM Provider settings, users must fully restart Obsidian before they can use the chat interface with the newly validated provider. The validation succeeds and settings are saved, but the chat cannot use the provider until restart.

#### Root Cause
The API key validation flow in `LLMProviderModal` does the following:
1. Validates the API key via `LLMValidationService.validateApiKey()`
2. Calls `autoSave()` which triggers the `onSave` callback
3. The callback saves settings via `this.settings.saveSettings()` (in `AgentManagement.ts:178`)
4. **Missing step:** The `LLMService` has an `updateSettings()` method that reinitializes adapters, but it's never called

#### Technical Details
**Affected Files:**
- `src/components/LLMProviderModal.ts:373-378` - `autoSave()` calls `onSave` callback
- `src/components/accordions/AgentManagement.ts:178-180` - `onSettingsChange` saves but doesn't refresh services
- `src/services/llm/core/LLMService.ts:165-168` - `updateSettings()` method exists but isn't called
- `src/services/llm/providers/ProviderManager.ts:41` - Already calls `llmService.updateSettings()` but only from its own `updateSettings()`

#### Proposed Solution
After saving settings in the `onSettingsChange` callback, trigger a refresh of the `LLMService`:

```typescript
// In AgentManagement.ts onSettingsChange callback:
onSettingsChange: async (llmProviderSettings: LLMProviderSettings) => {
    this.settings.settings.llmProviders = llmProviderSettings;
    await this.settings.saveSettings();
    
    // Refresh LLMService to reinitialize adapters with new API keys
    const llmService = await this.plugin.getService('llmService');
    if (llmService) {
        llmService.updateSettings(llmProviderSettings);
    }
}
```

#### Alternative Approach
Could also update the `ProviderManager` to automatically call `LLMService.updateSettings()` when its own `updateSettings()` is called, which already happens in `LLMProviderTab.ts:319`.

---

### 2. 🤖 OpenAI o3/o4 Models Use Wrong Token Parameter
**Status:** ✅ Resolved (Models Removed)  
**Priority:** High  
**Estimated Effort:** Small

#### Problem
OpenAI's o3 and o4 reasoning models (o3, o3-pro, o4-mini) failed with a 400 error when used because they require `max_completion_tokens` instead of `max_tokens` parameter.

#### Resolution
Removed o3 and o4 models from the available model list (`src/services/llm/adapters/openai/OpenAIModels.ts`) since they:
1. Use an incompatible API parameter structure (`max_completion_tokens` vs `max_tokens`)
2. Don't support functions/tools (which is core to MCP functionality)
3. Don't support streaming (which the chat interface relies on)
4. Would require significant adapter refactoring to support properly

Added a comment in the models file noting why these models were removed for future reference.

**Note:** If these models are needed in the future, they will require:
- Conditional parameter logic in `OpenAIAdapter.ts` (4 locations)
- Special handling for non-streaming responses
- Alternative UI for reasoning models without tool support

---

## 🎯 Priority Features

### 1. ⚡ Consolidated Manager Tool System
**Status:** 🔴 To Do  
**Priority:** High  
**Estimated Effort:** Medium

#### Problem
Currently, the MCP server exposes many individual tools (one per agent/mode combination), which clutters the LLM's context window and makes tool discovery difficult.

#### Proposed Solution
Create a single meta-tool `get_manager_tools` that dynamically returns the tool schemas for a specific manager when requested.

#### Technical Specification

**Implementation Approach:**
1. **New Tool Structure**
   - Add a new tool: `get_manager_tools`
   - Input: `{ manager: string }` where manager is one of:
     - `vaultManager` - File system operations (read, write, create, delete)
     - `vaultLibrarian` - Advanced search, content discovery, metadata queries
     - `contentManager` - Content processing and batch operations
     - `memoryManager` - Workspace and session memory management
     - `commandManager` - Obsidian command execution
     - `agentManager` - Custom agents and LLM execution
   - Output: JSON array of tool schemas for that specific manager

2. **Affected Files**
   - `src/handlers/services/ToolListService.ts` - Add new tool generation logic
   - `src/handlers/strategies/ToolListStrategy.ts` - Modify to include meta-tool
   - `src/agents/index.ts` - Potentially consolidate agent exports
   - Create new file: `src/handlers/services/ManagerToolService.ts`

3. **Tool Description Template**
   ```
   Use get_manager_tools to discover available tools for a specific manager.
   
   Available managers:
   - vaultManager: File operations (read, write, create, delete, move)
   - vaultLibrarian: Advanced search (content, directory, metadata, universal search)
   - contentManager: Batch content processing, transformations
   - memoryManager: Workspaces, sessions, context management
   - commandManager: Execute Obsidian commands
   - agentManager: Custom agents, LLM execution, image generation
   
   Example: Call get_manager_tools with manager="vaultLibrarian" to see all search operations.
   ```

4. **Benefits**
   - Reduces initial tool count from ~50+ to ~7 (one per manager + meta-tool)
   - LLM can dynamically discover tools as needed
   - Better context window utilization
   - Clearer tool organization

5. **Backward Compatibility**
   - Phase 1: Add meta-tool alongside existing tools
   - Phase 2: Optionally hide individual tools behind feature flag
   - Phase 3: Full migration after testing

---

### 2. 🎹 Chat Interface Hotkeys
**Status:** 🟡 In Progress
**Priority:** High
**Estimated Effort:** Large

#### Current Implementation Status (2025-10-19)

**✅ Completed:**
- All suggester UI components built and functional:
  - `TextAreaToolSuggester.ts` - `/` tool command palette
  - `TextAreaAgentSuggester.ts` - `@` agent mentions
  - `TextAreaNoteSuggester.ts` - `[[` note links
  - `ContentEditableSuggester.ts` - Base suggester framework
  - `MessageEnhancer.ts` - Enhancement metadata collector
  - `ReferenceExtractor.ts` - Reference extraction utilities
- Suggesters successfully detect triggers and show autocomplete dropdowns
- Visual feedback with styled reference pills in chat input
- References correctly inserted into contenteditable input

**🔴 Blocking Issues:**
1. **Enhancement data not being sent to LLM**
   - `MessageEnhancer` successfully collects tool hints, agent references, and note references
   - `ChatInput.handleSendMessage()` only sends plain text via `onSendMessage()`
   - Enhancement data is lost and never reaches the system prompt
   - **Impact:** `/`, `@`, and `[[` features appear to work in UI but have no effect on LLM behavior

2. **Architecture gap in message flow:**
   ```
   ChatInput (has MessageEnhancer)
     → onSendMessage(plainText)
       → ChatView.handleSendMessage(plainText)
         → MessageManager.sendMessage(plainText, options)
           → ChatService.generateResponseStreaming(plainText, options)
             → LLM receives only plain text ❌
   ```

**🔧 Required Fixes:**
1. Modify message flow to pass `MessageEnhancement` data through the chain
2. Update system prompt builder to inject:
   - Tool hints (prioritize specific tools in context)
   - Agent prompts (inject custom agent instructions)
   - Note content (add to `<files>` section)
3. Add logging to verify enhancement data reaches LLM (✅ logging added)

**📝 Implementation Progress:**
1. ✅ Add comprehensive logging to trace message flow
2. ✅ Implement enhancement data passing through message chain
3. ✅ Inject enhancements into system prompt before LLM call
4. ✅ Fix callback signature bug (ChatView was dropping enhancement parameter)
5. 🔄 Testing end-to-end functionality (ready for testing)

---

#### Problem
Users need to manually type tool names and agent names, leading to typos and inefficient workflows. Context injection from notes requires multiple clicks through modals.

#### Proposed Solutions

---

#### 2a. `/` - Tool Command Palette
**Trigger:** Type `/` at the start of a message  
**Behavior:** Opens fuzzy search suggester for available tools

##### Technical Specification

**Implementation:**
1. **UI Component: ToolSuggester**
   - Create: `src/ui/chat/components/suggesters/ToolSuggester.ts`
   - Extend Obsidian's `EditorSuggest` or create custom suggester
   - Use `prepareFuzzySearch` from Obsidian API (see `SearchContentMode.ts` reference)

2. **Integration Points**
   - Modify: `src/ui/chat/components/ChatInput.ts`
   - Add event listener for `/` keypress
   - Track cursor position and text context
   - Show suggester dropdown below cursor

3. **Data Source**
   - Query current MCP tools via `ToolListService`
   - Cache tool schemas for fast lookup
   - Filter based on fuzzy match against tool name + description

4. **User Experience**
   ```
   User types: "/"
   → Dropdown appears with all tools
   
   User types: "/vault"
   → Filters to: vaultManager.readFile, vaultManager.searchContent, etc.
   
   User selects tool with Enter
   → Injects: "@tool:vaultManager.readFile {remaining_message}"
   
   LLM receives enhanced context:
   "User requested tool: vaultManager.readFile
   Tool schema: {...}
   User message: {remaining_message}"
   ```

5. **Schema Injection Strategy**
   - Option A: Inject full tool schema in system prompt
   - Option B: Inject tool name as special marker, backend enhances context
   - **Recommended:** Option B for token efficiency

6. **Reference Implementation**
   - Study: `src/agents/vaultLibrarian/modes/searchContentMode.ts:49-62` (fuzzy search)
   - Study: `src/components/workspace/WorkspaceEditModal.ts:276-300` (file picker with fuzzy)
   - Study: Obsidian API `EditorSuggest` class (for inline suggestions)

---

#### 2b. `@` - Agent Mention System
**Trigger:** Type `@` anywhere in message  
**Behavior:** Opens fuzzy search for custom agents from AgentManager

##### Technical Specification

**Implementation:**
1. **UI Component: AgentSuggester**
   - Create: `src/ui/chat/components/suggesters/AgentSuggester.ts`
   - Similar to ToolSuggester but queries agents instead

2. **Data Source**
   - Query: `AgentManager.listPrompts` mode
   - Access via: `src/agents/agentManager/services/CustomPromptStorageService.ts`
   - Filter: Only show enabled agents (`prompt.isEnabled === true`)

3. **Integration Points**
   - Modify: `src/ui/chat/components/ChatInput.ts`
   - Detect `@` keypress
   - Track mention context (can use multiple `@agent` mentions per message)

4. **Schema Injection**
   - When agent mentioned, inject into system prompt:
     ```xml
     <custom_agent>
       <name>{agent.name}</name>
       <description>{agent.description}</description>
       <instructions>
       {agent.prompt}
       </instructions>
     </custom_agent>
     ```

5. **User Experience**
   ```
   User types: "Hey @"
   → Dropdown shows all enabled agents
   
   User types: "@marketi"
   → Filters to: "Marketing Assistant", "Marketing Writer"
   
   User selects: "Marketing Assistant"
   → Text shows: "Hey @Marketing_Assistant write a blog post"
   
   On send:
   → Agent prompt injected into system prompt
   → LLM receives agent personality/instructions
   → Message sent: "write a blog post"
   ```

6. **Multiple Agents**
   - Support multiple `@agent` mentions per message
   - Combine agent prompts in system prompt
   - Example: "Compare @Technical_Writer and @Creative_Writer styles"

7. **Reference Files**
   - Agent storage: `src/agents/agentManager/services/CustomPromptStorageService.ts`
   - Agent types: `src/agents/agentManager/modes/listAgents/ListAgentsMode.ts`
   - System prompt building: `src/ui/chat/services/ModelAgentManager.ts:465-550`

---

#### 2c. `[[` - Note Link Injection
**Trigger:** Type `[[` anywhere in message  
**Behavior:** Opens fuzzy search for vault notes, injects content into context

##### Technical Specification

**Implementation:**
1. **UI Component: NoteSuggester**
   - Create: `src/ui/chat/components/suggesters/NoteSuggester.ts`
   - Use Obsidian's native file suggester if possible
   - Fuzzy match on note titles and paths

2. **Data Source**
   - Query: `app.vault.getMarkdownFiles()`
   - Filter with fuzzy search: `prepareFuzzySearch` (Obsidian API)
   - Sort by relevance score

3. **Integration Points**
   - Modify: `src/ui/chat/components/ChatInput.ts`
   - Detect `[[` sequence
   - Show file suggester
   - On selection, complete with `]]` and store reference

4. **Content Injection Strategy**
   - **On send**, read note content via `vaultManager`
   - Inject into system prompt in existing `<files>` section
   - Reuse: `ModelAgentManager.buildSystemPromptWithWorkspace()` structure

5. **User Experience**
   ```
   User types: "Analyze my [[proj"
   → Dropdown shows: "[[project-notes]]", "[[project-plan]]", etc.
   
   User selects: "[[project-notes]]"
   → Text shows: "Analyze my [[project-notes]]"
   
   On send:
   → System prompt includes:
   <files>
     <project-notes>
       path/to/project-notes.md
       
       [Full note content here]
     </project-notes>
   </files>
   
   → Message to LLM: "Analyze my project notes"
   ```

6. **Multiple Notes**
   - Support multiple `[[note]]` references per message
   - Each note added to `<files>` section
   - Limit: Check total token count, warn if too large

7. **Token Management**
   - Use: `src/ui/chat/utils/TokenCalculator.ts`
   - Estimate tokens before injecting
   - Warn user if context would exceed limits
   - Option to truncate or summarize large notes

8. **Reference Implementations**
   - Note picker modal: `src/ui/chat/components/ChatSettingsModal.ts:529-600`
   - Fuzzy file search: `src/components/workspace/WorkspaceEditModal.ts:276-330`
   - System prompt injection: `src/ui/chat/services/ModelAgentManager.ts:485-520`
   - File reading: `vaultManager.readFile` mode

9. **Visual Feedback**
   - Show `[[note-name]]` as styled pill/badge in input
   - Display estimated tokens after note name
   - Allow clicking to remove before sending

---

### 3. 🐛 Bug Fixes
**Status:** 🔴 To Do  
**Priority:** High  

#### Tracking List
*Add specific bugs here as they're discovered*

---

## 📚 Implementation Notes

### Shared Dependencies

All hotkey features will share:
- **Fuzzy Search Utility** - `prepareFuzzySearch` from Obsidian API
- **Token Estimation** - `TokenCalculator.ts`
- **System Prompt Builder** - `ModelAgentManager.buildSystemPromptWithWorkspace()`
- **Input Component** - `ChatInput.ts` (needs refactor to support suggesters)

### Obsidian API References

Key APIs to use:
- `EditorSuggest<T>` - Inline suggestion interface (for autocomplete)
- `SuggestModal<T>` - Modal suggestion interface (for command palette style)
- `prepareFuzzySearch(query: string)` - Fuzzy matching function
- `app.vault.getMarkdownFiles()` - Get all notes
- `app.vault.read(file: TFile)` - Read note content

### Testing Strategy

For each feature:
1. Unit tests for suggester components
2. Integration tests for injection logic
3. Manual testing for UX flows
4. Performance testing (especially for large vaults)

---

## 🚀 Recommended Implementation Order

1. **Phase 1: Foundation** (Week 1-2)
   - Refactor `ChatInput.ts` to support suggester architecture
   - Create base `BaseSuggester.ts` component
   - Implement token warning system

2. **Phase 2: Note Injection** (Week 3)
   - Implement `[[` note suggester
   - Add content injection to system prompt
   - Test with various note sizes

3. **Phase 3: Agent Mentions** (Week 4)
   - Implement `@` agent suggester
   - Add agent prompt injection
   - Test multi-agent scenarios

4. **Phase 4: Tool Discovery** (Week 5)
   - Implement `/` tool suggester
   - Test tool schema injection
   - Validate with complex tool calls

5. **Phase 5: Manager Consolidation** (Week 6-7)
   - Implement `get_manager_tools` meta-tool
   - Test dynamic tool discovery
   - Migrate existing tools gradually

---

## 💡 Future Enhancements

- **Smart Context**: Auto-suggest relevant notes based on conversation topic
- **Keyboard Navigation**: Full keyboard control for all suggesters
- **Slash Command Macros**: Save common tool combinations as shortcuts
- **Agent Chaining**: Special syntax for sequential agent calls
- **Context Presets**: Save common note combinations as named contexts
- **Token Budget UI**: Visual indicator of remaining context window

---

## 📖 Documentation Needs

- User guide for hotkey features
- Developer guide for adding new suggesters
- API documentation for manager consolidation
- Migration guide for tool system changes
