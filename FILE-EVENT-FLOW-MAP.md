# File Event Flow Map

## Overview
This document maps the complete flow of file events in Claudesidian MCP, from initial file change detection to embedding generation and workspace activity recording.

## Event Registration Points

### 1. FileEventManager (Primary Event Handler)
**Location**: `src/services/FileEventManager.ts`
**Initialized in**: `main.ts:274-281`

**Registered Events**:
- `vault.on('create')` → `handleFileCreated()`
- `vault.on('modify')` → `handleFileModified()`
- `vault.on('delete')` → `handleFileDeleted()`

**Additional Event Subscriptions**:
- `eventManager.on('session:create')` → Updates active sessions
- `eventManager.on('session:end')` → Removes active sessions

### 2. Main Plugin (Embedding Strategy Events)
**Location**: `src/main.ts:587-703`
**Initialized in**: `main.ts:313` via `initializeEmbeddingStrategy()`

**Registered Events** (based on embedding strategy):
- For 'idle' strategy:
  - `vault.on('create')` → Adds to `pendingFiles` queue
  - `vault.on('modify')` → Adds to `pendingFiles` queue  
  - `vault.on('delete')` → Removes from queue & deletes embedding
- For 'startup' strategy: No file events, runs on plugin load
- For 'manual' strategy: No automatic file events

## Event Processing Flow

### FileEventManager Flow

1. **File Event Detected** (create/modify/delete)
   ```
   handleFileCreated/Modified/Deleted()
   ↓
   queueFileEvent() - Adds to pendingEvents[]
   ↓
   processPendingEvents() [debounced by 2 seconds]
   ↓
   processFileEvent() for each event
   ```

2. **Process File Event**
   ```
   findWorkspacesForFile() - Determines which workspaces contain the file
   ↓
   Updates fileWorkspaceCache
   ↓
   For each workspace:
     ↓
     recordWorkspaceActivity()
       ↓
       workspaceService.recordActivity() - Updates workspace activity history
       ↓
       recordMemoryTrace() - If active session exists
   ↓
   eventManager.emit('file:activity') - Notifies other components
   ```

3. **Memory Trace Recording**
   ```
   recordMemoryTrace()
   ↓
   Reads file content (for create/modify)
   ↓
   memoryService.storeMemoryTrace()
     ↓
     Generates embedding if importance >= 0.8
     ↓
     Stores in memory_traces collection
   ```

### Main Plugin Embedding Flow

1. **Idle Strategy Processing**
   ```
   File event → Added to pendingFiles Set
   ↓
   processQueueAfterIdle() [debounced by idleTimeThreshold]
   ↓
   processFileQueue()
     ↓
     embeddingService.updateFileEmbeddings()
   ```

2. **Embedding Service Processing**
   ```
   updateFileEmbeddings()
   ↓
   For each file:
     - Delete existing embeddings
     - Read file content
     - Chunk text (paragraph/sentence strategy)
     - Generate embedding for each chunk
     - Store in file_embeddings collection
   ↓
   Update token usage stats
   ```

## Circular Dependencies & Issues

### 1. Duplicate File Event Handlers
- **Issue**: Both FileEventManager and Main Plugin register vault event listeners
- **Result**: Same file changes processed twice
- **Impact**: 
  - Duplicate activity recording
  - Redundant embedding generation
  - Race conditions

### 2. Recursive Activity Recording
- **Issue**: File operations trigger events which trigger more file operations
- **Prevention Mechanisms**:
  - `isRecordingActivity` flag in WorkspaceService
  - `isSystemOperation` flag in VectorStore
  - Rate limiting (1 second in WorkspaceService, 5 seconds in FileEventManager)

### 3. System vs User Operations
- **System Path Detection**: Checks for paths containing:
  - 'chroma-db'
  - '.obsidian'
  - '/data/'
  - '/collection'
- **Purpose**: Prevents indexing of plugin's own data files

## Embedding Generation Triggers

### Direct Triggers:
1. **Content Creation** (`createContentMode`)
   - Calls `searchService.indexFile()` immediately after file creation
   - Also records memory trace and workspace activity

2. **Manual Indexing**
   - Via settings UI
   - Via agent commands

### Indirect Triggers:
1. **File Modification Events** (idle strategy)
   - Queued and processed after idle timeout
   - Batch processed via `embeddingService.updateFileEmbeddings()`

2. **Startup Indexing** (startup strategy)
   - Runs `embeddingService.batchIndexFiles()` on plugin load
   - Only indexes non-indexed files

## Activity Recording Flow

### Workspace Activity:
```
FileEventManager.recordWorkspaceActivity()
↓
workspaceService.recordActivity()
  - Updates workspace.activityHistory[]
  - Updates workspace.lastAccessed
  - Rate limited to 1/second
```

### Memory Traces:
```
FileEventManager.recordMemoryTrace()
↓
memoryService.storeMemoryTrace()
  - Only if active session exists
  - Generates embedding if importance >= 0.8
  - Increments session tool calls
```

## Key Services & Their Roles

### FileEventManager
- Primary file event handler
- Manages workspace-file relationships
- Records activities and memory traces
- Maintains file-workspace cache

### EmbeddingService
- Generates embeddings via OpenAI API
- Manages chunking strategies
- Tracks token usage
- Handles batch indexing

### WorkspaceService
- Maintains workspace hierarchies
- Records activity history
- Prevents recursive updates

### MemoryService
- Stores memory traces with embeddings
- Manages sessions and snapshots
- Provides ChromaDB collection access

## Initialization Order

1. VectorStore initialization
2. Services initialization (Embedding, Search, Workspace, Memory)
3. FileEventManager initialization
4. Embedding strategy setup
5. Startup embedding (if configured)

## Flags & State Management

### System Operation Flags:
- `vectorStore.isSystemOperation` - Prevents indexing during system operations
- `fileEventManager.isInitializing` - Prevents activity recording during startup
- `workspaceService.isRecordingActivity` - Prevents recursive activity recording
- `plugin.isReindexing` - Prevents duplicate processing during reindexing

### Rate Limiting:
- FileEventManager: 5 seconds between activities per workspace
- WorkspaceService: 1 second between any activity recording
- Embedding processing: Configurable delay between batches

## Recommendations

1. **Consolidate Event Handling**: Remove duplicate vault event listeners, keep only FileEventManager
2. **Explicit Embedding Triggers**: Make embedding generation more explicit rather than automatic
3. **Better Circular Dependency Prevention**: Implement a global operation context
4. **Unified Activity Recording**: Single point of entry for all activity recording
5. **Clear Separation**: System operations vs user operations