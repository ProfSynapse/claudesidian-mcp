# Feature Ideas & Roadmap

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
**Status:** 🔴 To Do  
**Priority:** High  
**Estimated Effort:** Large

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
