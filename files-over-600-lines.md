# Files Over 600 Lines - Refactoring Plans

This document lists all files in the project that exceed 600 lines of code and provides comprehensive refactoring plans for each.

## TypeScript Files (.ts)

| Status | Lines | File Path |
|--------|-------|-----------|
| ✅ **COMPLETED** | ~~1151~~ | ~~`./src/agents/agentManager/modes/batchExecutePromptMode.ts`~~ |
| ✅ **COMPLETED** | ~~1143~~ | ~~`./src/database/services/hnsw/HnswSearchService.ts`~~ |
| ✅ **COMPLETED** | ~~887~~ | ~~`./src/agents/memoryManager/modes/state/createStateMode.ts`~~ |
| ✅ **COMPLETED** | ~~866~~ | ~~`./src/agents/memoryManager/modes/workspace/loadWorkspaceMode.ts`~~ |
| ✅ **COMPLETED** | ~~808~~ | ~~`./src/database/providers/chroma/PersistentChromaClient.ts`~~ |
| ✅ **COMPLETED** | ~~796~~ | ~~`./src/agents/vaultLibrarian/modes/services/UniversalSearchService.ts`~~ |
| ✅ **COMPLETED** | ~~787~~ | ~~`./src/agents/memoryManager/modes/state/loadStateMode.ts`~~ |
| ✅ **COMPLETED** | ~~771~~ | ~~`./src/database/workspace-types.ts`~~ |
| ✅ **COMPLETED** | ~~757~~ | ~~`./src/types.ts`~~ |
| ✅ **COMPLETED** | ~~677~~ | ~~`./src/agents/contentManager/modes/batchContentMode.ts`~~ |
| ✅ **COMPLETED** | ~~664~~ | ~~`./src/components/memory-settings/ApiSettingsTab.ts`~~ |
| ✅ **COMPLETED** | ~~650~~ | ~~`./src/server.ts`~~ |
| 📋 **PLANNED** | 632 | `./src/agents/memoryManager/modes/session/createSessionMode.ts` |
| 📋 **PLANNED** | 621 | `./src/agents/agentManager/modes/executePromptMode.ts` |
| 📋 **PLANNED** | 608 | `./src/database/utils/TextChunker.ts` |

## Progress Summary

### ✅ Completed Refactoring (12/15 files - 80%)
- **BatchExecutePromptMode.ts** (1151 → 150 lines + modular services)
- **HnswSearchService.ts** (1143 → 520 lines + 5 specialized services)
- **createStateMode.ts** (887 → 200 lines + 6 specialized services)
- **loadWorkspaceMode.ts** (866 → 150 lines + 7 specialized services)
- **PersistentChromaClient.ts** (808 → 116 lines + 13 specialized services)
- **UniversalSearchService.ts** (796 → 24 lines + 7 specialized services)
- **loadStateMode.ts** (787 → 150 lines + 7 specialized services)
- **types.ts** (757 → 100 lines + domain-organized modules)  
- **workspace-types.ts** (771 → 20 lines + domain-organized modules)
- **batchContentMode.ts** (677 → 12 lines + 5 specialized services)
- **ApiSettingsTab.ts** (664 → 144 lines + 9 specialized services)
- **server.ts** (650 → 19 lines + 7 specialized services)

### 🔄 Currently In Progress (0/15 files)
- None - Ready for next target

### 📊 Total Progress
- **Files Completed**: 12 out of 15 (80%)
- **Lines Refactored**: 9,957 out of 11,181 total lines (89%)
- **Estimated Remaining**: ~1,224 lines across 3 files

---

## ✅ Completed Refactoring Details

### 1. BatchExecutePromptMode.ts ✅ **COMPLETED**
**Original**: 1151 lines → **Refactored**: 150 lines + 10 modular files

**Implementation**: Successfully extracted services following SOLID principles:
```
src/agents/agentManager/modes/batchExecutePrompt/
├── BatchExecutePromptMode.ts (150 lines) - Main orchestrator ✅
├── services/
│   ├── PromptExecutor.ts (200 lines) - Core prompt execution ✅
│   ├── SequenceManager.ts (150 lines) - Sequence and parallel groups ✅
│   ├── ResultProcessor.ts (120 lines) - Result merging ✅
│   ├── ActionExecutor.ts (180 lines) - Content actions ✅
│   ├── BudgetValidator.ts (80 lines) - Budget validation ✅
│   └── ContextBuilder.ts (100 lines) - Context building ✅
├── types/ - Interface definitions ✅
└── utils/ - Parsing and schema utilities ✅
```

**Benefits Achieved**:
- ✅ **SRP**: Each service has single responsibility
- ✅ **DRY**: Eliminated duplicate execution logic
- ✅ **OCP**: Easy to extend with new execution strategies
- ✅ **DIP**: Depends on abstractions, not concrete implementations
- ✅ **Backward Compatibility**: Original file now re-exports refactored components

### 2. types.ts ✅ **COMPLETED**  
**Original**: 757 lines → **Refactored**: 100 lines + 15 domain-organized files

**Implementation**: Organized types by functional domain:
```
src/types/
├── index.ts - Main export barrel ✅
├── llm/ - LLM provider and embedding types ✅
│   ├── ProviderTypes.ts - Provider configurations ✅
│   ├── EmbeddingTypes.ts - Memory and embedding types ✅
│   └── index.ts - LLM export barrel ✅
├── mcp/ - MCP protocol types ✅
│   ├── AgentTypes.ts - Agent and mode interfaces ✅
│   ├── CustomPromptTypes.ts - Custom prompt definitions ✅
│   ├── ServerTypes.ts - Server interfaces ✅
│   └── index.ts - MCP export barrel ✅
├── search/ - Search and memory types ✅
├── plugin/ - Plugin configuration types ✅
└── common/ - Shared types ✅
```

**Benefits Achieved**:
- ✅ **Domain Separation**: Types organized by functional area
- ✅ **Selective Imports**: Import only needed types
- ✅ **Reduced Conflicts**: Namespaced by domain
- ✅ **Maintainability**: Easy to locate and modify types
- ✅ **No Circular Dependencies**: Clean dependency structure

### 3. workspace-types.ts ✅ **COMPLETED**
**Original**: 771 lines → **Refactored**: 20 lines + 12 domain-organized files  

**Implementation**: Separated by domain concerns:
```
src/database/types/
├── index.ts - Export barrel ✅
├── workspace/ - Core workspace types ✅
│   ├── WorkspaceTypes.ts - Core interfaces ✅
│   └── ParameterTypes.ts - Operation parameters ✅
├── session/ - Session management ✅
├── memory/ - Memory traces and embeddings ✅
└── cache/ - Cache management ✅
```

**Benefits Achieved**:
- ✅ **Organization**: Types grouped by domain and responsibility
- ✅ **Maintainability**: Easier to find and modify related types
- ✅ **Dependency Management**: Reduced risk of circular dependencies
- ✅ **Reusability**: Types can be imported selectively

### 4. HnswSearchService.ts ✅ **COMPLETED**
**Original**: 1143 lines → **Refactored**: 520 lines + 5 specialized services

**Implementation**: Extracted specialized services following SOLID principles:
```
src/database/services/hnsw/
├── HnswSearchService.ts (520 lines) - Main orchestrator with compatibility ✅
├── conversion/DataConversionService.ts (150 lines) - Format conversion ✅
├── discovery/IndexDiscoveryService.ts (318 lines) - Index discovery ✅
├── discovery/CollectionProcessingService.ts (274 lines) - Collection processing ✅
├── initialization/FullInitializationOrchestrator.ts (355 lines) - Phased init ✅
└── HnswSearchService_ORIGINAL.ts - Backup reference ✅
```

**Benefits Achieved**:
- ✅ **SRP**: Each service handles one concern (conversion, discovery, initialization)
- ✅ **Backward Compatibility**: Added legacy interface methods for existing services
- ✅ **Service Composition**: Main service orchestrates specialized services
- ✅ **Interface Compatibility**: Fixed all build errors with adapter methods
- ✅ **High-Level Interface**: Added string query support for UniversalSearchService
- ✅ **Clean Architecture**: Dependency injection and service composition patterns

### 5. createStateMode.ts ✅ **COMPLETED**
**Original**: 887 lines → **Refactored**: 200 lines + 6 specialized services

**Implementation**: Extracted workflow services following SOLID principles:
```
src/agents/memoryManager/modes/state/create/
├── createStateMode.ts (200 lines) - Main orchestrator using service composition ✅
├── validation/
│   ├── ParameterValidator.ts (120 lines) - Input parameter validation ✅
│   ├── WorkspaceValidator.ts (150 lines) - Workspace resolution and validation ✅
│   └── SessionValidator.ts (180 lines) - Session management and creation ✅
├── context/
│   ├── ContextBuilder.ts (170 lines) - Context gathering and enhancement ✅
│   └── SummaryGenerator.ts (200 lines) - Comprehensive summary generation ✅
├── state/StateCreator.ts (120 lines) - State snapshot creation ✅
├── tracing/MemoryTracer.ts (160 lines) - Memory trace recording ✅
└── createStateMode_ORIGINAL.ts - Backup reference ✅
```

**Benefits Achieved**:
- ✅ **SRP**: Each service handles one concern (validation, context, state creation, tracing)
- ✅ **Phased Execution**: Clear 7-phase workflow with proper error handling
- ✅ **Service Composition**: Main mode orchestrates specialized services
- ✅ **Comprehensive Validation**: Parameter, workspace, and session validation
- ✅ **Rich Context**: Enhanced context gathering with metadata and summaries
- ✅ **Memory Tracing**: Detailed activity recording for state operations
- ✅ **Backward Compatibility**: Maintains original interface and behavior

### 6. loadWorkspaceMode.ts ✅ **COMPLETED**
**Original**: 866 lines → **Refactored**: 150 lines + 7 specialized services

**Implementation**: Extracted workspace loading services following SOLID principles:
```
src/agents/memoryManager/modes/workspace/load/
├── LoadWorkspaceMode.ts (150 lines) - Main orchestrator using service composition ✅
├── workspace/
│   ├── WorkspaceRetriever.ts (120 lines) - Workspace data retrieval and validation ✅
│   └── SummaryGenerator.ts (200 lines) - Workspace summary generation ✅
├── files/
│   ├── RecentFilesCollector.ts (280 lines) - Recent files discovery and management ✅
│   └── KeyFilesCollector.ts (350 lines) - Key files identification and analysis ✅
├── structure/
│   └── DirectoryStructureBuilder.ts (440 lines) - Directory tree generation ✅
├── context/
│   └── SessionCollector.ts (300 lines) - Session data collection and formatting ✅
└── state/StateCollector.ts (280 lines) - State data collection and statistics ✅
```

**Benefits Achieved**:
- ✅ **SRP**: Each service handles one concern (workspace, files, structure, context, state)
- ✅ **Phased Execution**: Clear 6-phase workflow with proper error handling
- ✅ **Service Composition**: Main mode orchestrates specialized collectors
- ✅ **Comprehensive Data Collection**: Files, structure, sessions, and states
- ✅ **Rich Context**: Enhanced context gathering with metadata and summaries
- ✅ **Flexible Options**: Configurable collection options for different use cases
- ✅ **Backward Compatibility**: Maintains original interface and behavior

### 7. loadStateMode.ts ✅ **COMPLETED**
**Original**: 787 lines → **Refactored**: 150 lines + 7 specialized services

**Implementation**: Extracted state restoration services following SOLID principles:
```
src/agents/memoryManager/modes/state/load/
├── LoadStateMode.ts (150 lines) - Main orchestrator using service composition ✅
├── retrieval/
│   └── StateRetriever.ts (120 lines) - State data retrieval and validation ✅
├── restoration/
│   ├── SessionManager.ts (150 lines) - Session creation and management ✅
│   └── WorkspaceContextBuilder.ts (100 lines) - Workspace context building ✅
├── processing/
│   ├── FileCollector.ts (100 lines) - Associated files collection ✅
│   └── TraceProcessor.ts (120 lines) - Memory trace processing ✅
├── summary/
│   └── RestorationSummaryGenerator.ts (200 lines) - Summary generation ✅
└── tracing/
    └── RestorationTracer.ts (100 lines) - Restoration activity tracing ✅
```

**Benefits Achieved**:
- ✅ **SRP**: Each service handles one concern (retrieval, restoration, processing, summary, tracing)
- ✅ **Phased Execution**: Clear 9-phase workflow with proper error handling
- ✅ **Service Composition**: Main mode orchestrates specialized services
- ✅ **State Restoration**: Comprehensive state loading with session management
- ✅ **Context Processing**: Rich context gathering with files and traces
- ✅ **Summary Generation**: Detailed restoration summaries with multiple depth levels
- ✅ **Backward Compatibility**: Maintains original interface and behavior

### 8. UniversalSearchService.ts ✅ **COMPLETED**
**Original**: 796 lines → **Refactored**: 24 lines + 7 specialized services

**Implementation**: Extracted search strategies and result processing following SOLID principles:
```
src/agents/vaultLibrarian/modes/services/universal/
├── UniversalSearchService.ts (24 lines) - Main orchestrator using service composition ✅
├── strategies/
│   ├── ContentSearchStrategy.ts (243 lines) - Content/semantic search with hybrid support ✅
│   ├── FileSearchStrategy.ts (290 lines) - File name search using Obsidian's fuzzy search ✅
│   └── MetadataSearchStrategy.ts (331 lines) - Tag and property search with statistics ✅
├── query/
│   └── QueryParser.ts (202 lines) - Query parsing and normalization ✅
├── results/
│   ├── ResultConsolidator.ts (200+ lines) - Result consolidation by file ✅
│   └── ResultFormatter.ts (410 lines) - Result formatting with search strategy info ✅
└── initialization/
    └── ServiceInitializer.ts (374 lines) - Service initialization and dependency management ✅
```

**Benefits Achieved**:
- ✅ **Strategy Pattern**: Different search strategies as separate classes
- ✅ **SRP**: Each service handles one concern (content, files, metadata, query parsing, results)
- ✅ **Service Composition**: Main service orchestrates specialized strategies
- ✅ **Hybrid Search**: Advanced hybrid search with semantic, keyword, and fuzzy strategies
- ✅ **Result Consolidation**: Sophisticated result processing and formatting
- ✅ **Service Initialization**: Lazy initialization with fallback strategies
- ✅ **Backward Compatibility**: Maintains original interface and behavior

### 9. batchContentMode.ts ✅ **COMPLETED**
**Original**: 677 lines → **Refactored**: 12 lines + 5 specialized services

**Implementation**: Extracted batch operations into focused services following SOLID principles:
```
src/agents/contentManager/modes/batch/
├── BatchContentMode.ts (12 lines) - Main orchestrator using service composition ✅
├── validation/
│   └── OperationValidator.ts (225 lines) - Operation validation with detailed error messages ✅
├── execution/
│   └── BatchExecutor.ts (290 lines) - Sequential operation execution ✅
├── results/
│   └── ResultCollector.ts (180 lines) - Result collection and statistics ✅
├── activity/
│   └── ActivityRecorder.ts (120 lines) - Activity recording for workspace memory ✅
└── schemas/
    └── SchemaBuilder.ts (280 lines) - JSON schema generation ✅
```

**Benefits Achieved**:
- ✅ **SRP**: Each service handles one concern (validation, execution, results, activity, schemas)
- ✅ **Service Composition**: Main mode orchestrates specialized services
- ✅ **Comprehensive Validation**: Detailed validation with specific error messages
- ✅ **Sequential Execution**: Safe operation execution to avoid file conflicts
- ✅ **Result Processing**: Rich result collection with statistics and filtering
- ✅ **Activity Recording**: Workspace memory integration for batch operations
- ✅ **Schema Generation**: Modular schema building for different operation types
- ✅ **Backward Compatibility**: Maintains original API interface

### 10. PersistentChromaClient.ts ✅ **COMPLETED**
**Original**: 808 lines → **Refactored**: 116 lines + 13 specialized services

**Implementation**: Extracted client and collection services following SOLID principles:
```
src/database/providers/chroma/
├── PersistentChromaClient.ts (116 lines) - Main interface with backward compatibility ✅
├── collection/
│   ├── StrictPersistentCollection.ts (150 lines) - Collection orchestrator ✅
│   ├── operations/
│   │   ├── CollectionOperations.ts (120 lines) - CRUD operations ✅
│   │   ├── QueryProcessor.ts (120 lines) - Query execution and processing ✅
│   │   └── DataValidator.ts (200 lines) - Input validation and normalization ✅
│   ├── persistence/
│   │   ├── CollectionPersistence.ts (150 lines) - Save/load operations ✅
│   │   └── QueuedSaveManager.ts (150 lines) - Queued save management ✅
│   └── metadata/
│       └── MetadataManager.ts (150 lines) - Metadata operations ✅
└── client/
    ├── StrictPersistenceChromaClient.ts (350 lines) - Client orchestrator ✅
    ├── lifecycle/
    │   ├── ClientInitializer.ts (150 lines) - Client initialization ✅
    │   ├── CollectionLoader.ts (250 lines) - Collection loading from disk ✅
    │   └── ResourceManager.ts (250 lines) - Resource cleanup and management ✅
    └── management/
        ├── CollectionManager.ts (350 lines) - Collection CRUD operations ✅
        ├── CollectionCache.ts (300 lines) - Collection caching and lifecycle ✅
        └── ErrorHandler.ts (300 lines) - Centralized error handling ✅
```

**Benefits Achieved**:
- ✅ **SRP**: Each service handles one concern (operations, persistence, lifecycle, management)
- ✅ **Service Composition**: Client orchestrates specialized services
- ✅ **Error Handling**: Centralized error management with logging and recovery
- ✅ **Resource Management**: Proper cleanup and memory management
- ✅ **Caching**: Efficient collection caching with statistics
- ✅ **Persistence**: Queued saves and robust disk operations
- ✅ **Backward Compatibility**: Maintains original API interface

### 11. ApiSettingsTab.ts ✅ **COMPLETED**
**Original**: 664 lines → **Refactored**: 144 lines + 9 specialized services

**Implementation**: Extracted specialized UI renderers and services following SOLID principles:
```
src/components/memory-settings/api/
├── ApiSettingsTab.ts (144 lines) - Main orchestrator using service composition ✅
├── services/
│   ├── EmbeddingChecker.ts (159 lines) - Embedding existence checks and statistics ✅
│   ├── SettingsValidator.ts (284 lines) - Settings validation and normalization ✅
│   └── ApiConnectionTester.ts (206 lines) - API connection testing for providers ✅
├── ui/
│   ├── EmbeddingToggleRenderer.ts (168 lines) - Embedding toggle UI with validation ✅
│   ├── StatusSectionRenderer.ts (264 lines) - Status section with embedding stats ✅
│   ├── ProviderConfigRenderer.ts (384 lines) - Provider configuration UI ✅
│   ├── ModelConfigRenderer.ts (488 lines) - Model configuration with validation ✅
│   └── RateLimitRenderer.ts (380 lines) - Rate limit configuration UI ✅
```

**Benefits Achieved**:
- ✅ **SRP**: Each service handles one concern (validation, connection testing, UI rendering)
- ✅ **Service Composition**: Main tab orchestrates specialized UI renderers
- ✅ **Dependency Injection**: Services injected into UI components
- ✅ **UI Separation**: Each UI section has dedicated renderer
- ✅ **Comprehensive Validation**: Settings validation with provider compatibility
- ✅ **Connection Testing**: API connection testing for all providers
- ✅ **User Experience**: Rich status displays and confirmation dialogs
- ✅ **Backward Compatibility**: Maintains original settings interface

### 12. server.ts ✅ **COMPLETED**
**Original**: 650 lines → **Refactored**: 19 lines + 7 specialized services

**Implementation**: Extracted specialized services following SOLID principles:
```
src/server/
├── MCPServer.ts (201 lines) - Main orchestrator using service composition ✅
├── services/
│   ├── ServerConfiguration.ts (121 lines) - Server configuration and identification ✅
│   └── AgentRegistry.ts (241 lines) - Agent registration and management ✅
├── transport/
│   ├── StdioTransportManager.ts (157 lines) - STDIO transport management ✅
│   └── IPCTransportManager.ts (289 lines) - IPC transport management ✅
├── handlers/
│   └── RequestHandlerFactory.ts (205 lines) - Request handler setup ✅
├── lifecycle/
│   └── ServerLifecycleManager.ts (296 lines) - Server lifecycle operations ✅
└── execution/
    └── AgentExecutionManager.ts (331 lines) - Agent execution and session management ✅
```

**Benefits Achieved**:
- ✅ **SRP**: Each service handles one concern (configuration, agents, transport, handlers, lifecycle, execution)
- ✅ **Service Composition**: Main server orchestrates specialized services
- ✅ **Transport Abstraction**: Separate managers for STDIO and IPC transports
- ✅ **Lifecycle Management**: Dedicated service for server start/stop operations
- ✅ **Agent Management**: Centralized agent registry with validation
- ✅ **Request Handling**: Factory pattern for request handler setup
- ✅ **Session Management**: Dedicated execution manager with context handling
- ✅ **Backward Compatibility**: Maintains original server interface

### Key Refactoring Principles Applied ✅

1. **Single Responsibility Principle (SRP)**: Each file/service handles one concern
2. **Open/Closed Principle (OCP)**: Easy to extend without modifying existing code
3. **Liskov Substitution Principle (LSP)**: Consistent interfaces throughout
4. **Interface Segregation Principle (ISP)**: Clients depend only on what they use
5. **Dependency Inversion Principle (DIP)**: Depend on abstractions, not implementations
6. **Don't Repeat Yourself (DRY)**: Eliminated duplicate code patterns
7. **Backward Compatibility**: All existing imports continue to work
8. **Build Verification**: All TypeScript compilation passes without errors

---

## 🔄 Current Priority: ApiSettingsTab.ts (664 lines)

**Status**: NEXT TARGET - Ready for refactoring
**Complexity**: Medium - Settings UI with form validation and state management
**Priority**: High - Core configuration functionality

---

## Refactoring Plans

### 1. `./src/agents/agentManager/modes/batchExecutePromptMode.ts` (1151 lines)

**Current Issues:**
- Single massive class violating SRP (Single Responsibility Principle)
- Complex execution logic mixed with validation, result processing, and action execution
- Duplicate code in prompt execution methods
- Heavy dependency on multiple external services

**Refactoring Plan:**

#### Extract Services (Following SRP):
```
src/agents/agentManager/modes/batchExecutePrompt/
├── BatchExecutePromptMode.ts (150 lines) - Main orchestrator
├── services/
│   ├── PromptExecutor.ts (200 lines) - Core prompt execution
│   ├── SequenceManager.ts (150 lines) - Sequence and parallel group handling
│   ├── ResultProcessor.ts (120 lines) - Result merging and processing
│   ├── ActionExecutor.ts (180 lines) - Content action execution
│   ├── BudgetValidator.ts (80 lines) - Budget checking and usage tracking
│   └── ContextBuilder.ts (100 lines) - Previous results context building
├── types/
│   ├── BatchExecuteTypes.ts (80 lines) - Interface definitions
│   └── ExecutionResult.ts (50 lines) - Result type definitions
└── utils/
    ├── PromptParser.ts (60 lines) - Prompt configuration parsing
    └── SchemaBuilder.ts (100 lines) - Parameter/result schema generation
```

#### Key Improvements:
- **SRP**: Each service has single responsibility
- **DRY**: Eliminate duplicate execution logic
- **OCP**: Easy to extend with new execution strategies
- **DIP**: Depend on abstractions, not concrete implementations
- **ISP**: Interface segregation for different execution contexts

#### Implementation Strategy:
1. Extract `PromptExecutor` service first (handles individual prompt execution)
2. Create `SequenceManager` for complex orchestration logic
3. Move result processing to dedicated `ResultProcessor`
4. Extract action execution to `ActionExecutor`
5. Create utility classes for parsing and validation
6. Update main mode to orchestrate services

---

### 2. `./src/database/services/hnsw/HnswSearchService.ts` (1143 lines)

**Current Issues:**
- Service orchestrator doing too much direct implementation
- Mixed concerns: initialization, indexing, searching, persistence
- Complex initialization logic intertwined with business logic
- Error handling scattered throughout

**Refactoring Plan:**

#### Reorganize into Focused Services:
```
src/database/services/hnsw/
├── HnswSearchService.ts (200 lines) - Main service orchestrator
├── initialization/
│   ├── ServiceInitializer.ts (150 lines) - Service initialization logic
│   ├── IndexDiscovery.ts (120 lines) - Index discovery and recovery
│   └── CollectionProcessor.ts (180 lines) - Collection processing
├── indexing/
│   ├── IndexBuilder.ts (150 lines) - Index building operations
│   ├── ItemMapper.ts (100 lines) - Item to HNSW ID mapping
│   └── PartitionHandler.ts (120 lines) - Partition-specific operations
├── search/
│   ├── SearchOrchestrator.ts (120 lines) - Search execution
│   └── ParameterParser.ts (80 lines) - Search parameter parsing
├── persistence/
│   ├── StatePersistence.ts (150 lines) - State save/load operations
│   └── MetadataManager.ts (100 lines) - Metadata handling
└── diagnostics/
    ├── HealthChecker.ts (80 lines) - Service diagnostics
    └── PerformanceEstimator.ts (60 lines) - Performance estimation
```

#### Key Improvements:
- **SRP**: Separate initialization, indexing, searching, and persistence
- **OCP**: Easy to add new search strategies or persistence mechanisms
- **LSP**: All implementations follow consistent interfaces
- **DIP**: Main service depends on abstractions

#### Implementation Strategy:
1. Extract initialization logic to separate services
2. Create focused indexing services
3. Separate search execution from orchestration
4. Move persistence operations to dedicated handlers
5. Create diagnostic utilities
6. Update main service to coordinate specialized services

---

### 3. `./src/agents/memoryManager/modes/state/createStateMode.ts` (887 lines)

**Current Issues:**
- Single method (`execute`) handling entire state creation workflow
- Complex workspace/session validation logic mixed with business logic
- Duplicated session creation patterns
- Hard to test individual components

**Refactoring Plan:**

#### Extract Workflow Components:
```
src/agents/memoryManager/modes/state/create/
├── CreateStateMode.ts (150 lines) - Main mode orchestrator
├── validation/
│   ├── ParameterValidator.ts (80 lines) - Input validation
│   ├── WorkspaceValidator.ts (100 lines) - Workspace context validation
│   └── SessionValidator.ts (120 lines) - Session validation and creation
├── context/
│   ├── ContextBuilder.ts (150 lines) - Context gathering and enhancement
│   ├── FileCollector.ts (120 lines) - File collection logic
│   └── SummaryGenerator.ts (100 lines) - Context summary generation
├── state/
│   ├── StateCreator.ts (120 lines) - State snapshot creation
│   └── MetadataBuilder.ts (80 lines) - Enhanced metadata creation
└── tracing/
    ├── MemoryTracer.ts (100 lines) - Memory trace creation
    └── ActivityRecorder.ts (80 lines) - Activity recording
```

#### Key Improvements:
- **SRP**: Each component has focused responsibility
- **DRY**: Eliminate duplicate validation and session creation code
- **Testability**: Small, focused components are easier to test
- **Maintainability**: Changes to validation don't affect state creation

#### Implementation Strategy:
1. Extract validation logic into separate validators
2. Create context building pipeline
3. Move state creation to dedicated service
4. Extract tracing into specialized components
5. Update mode to orchestrate workflow

---

### 4. `./src/agents/memoryManager/modes/workspace/loadWorkspaceMode.ts` (866 lines)

**Current Issues:**
- Large execute method handling multiple concerns
- File discovery mixed with directory structure generation
- Duplicated path normalization logic
- Complex metadata gathering spread throughout

**Refactoring Plan:**

#### Modularize Workspace Loading:
```
src/agents/memoryManager/modes/workspace/load/
├── LoadWorkspaceMode.ts (150 lines) - Main orchestrator
├── workspace/
│   ├── WorkspaceRetriever.ts (120 lines) - Workspace data retrieval
│   ├── SummaryGenerator.ts (100 lines) - Workspace summary generation
│   └── ChildrenResolver.ts (80 lines) - Child workspace resolution
├── files/
│   ├── RecentFilesCollector.ts (150 lines) - Recent files discovery
│   ├── KeyFilesCollector.ts (120 lines) - Key files identification
│   └── PathNormalizer.ts (60 lines) - Path normalization utilities
├── structure/
│   ├── DirectoryStructureBuilder.ts (150 lines) - Directory tree generation
│   └── StructureFormatter.ts (80 lines) - Structure formatting
└── context/
    ├── SessionCollector.ts (100 lines) - Session data collection
    └── StateCollector.ts (80 lines) - State data collection
```

#### Key Improvements:
- **SRP**: Separate concerns for workspace, files, structure, and context
- **DRY**: Centralize path normalization and file pattern matching
- **Reusability**: Components can be reused by other workspace operations
- **Performance**: Lazy loading and caching opportunities

#### Implementation Strategy:
1. Extract workspace retrieval and summary generation
2. Create specialized file collectors with shared utilities
3. Move directory structure logic to dedicated builder
4. Extract session and state collection logic
5. Update mode to coordinate specialized collectors

---

### 5. `./src/database/providers/chroma/PersistentChromaClient.ts` (808 lines)

**Current Issues:**
- Single client class handling both ChromaDB API and persistence logic
- Collection class mixing data operations with persistence
- Complex file system operations scattered throughout
- Duplicate error handling patterns

**Refactoring Plan:**

#### Separate API from Persistence:
```
src/database/providers/chroma/
├── PersistentChromaClient.ts (200 lines) - Main client interface
├── api/
│   ├── ChromaApiClient.ts (150 lines) - Core ChromaDB API operations
│   ├── CollectionManager.ts (120 lines) - Collection lifecycle management
│   └── QueryProcessor.ts (100 lines) - Query execution and result processing
├── persistence/
│   ├── FilePersistenceManager.ts (150 lines) - File system operations
│   ├── CollectionSerializer.ts (100 lines) - Collection serialization
│   └── RecoveryManager.ts (120 lines) - Collection recovery logic
├── collections/
│   ├── StrictPersistentCollection.ts (200 lines) - Collection implementation
│   ├── CollectionOperations.ts (150 lines) - CRUD operations
│   └── CollectionCache.ts (80 lines) - Collection caching
└── utils/
    ├── ErrorHandler.ts (60 lines) - Centralized error handling
    └── PathUtils.ts (40 lines) - Path manipulation utilities
```

#### Key Improvements:
- **SRP**: Separate API operations from persistence concerns
- **OCP**: Easy to add new persistence strategies
- **DIP**: Client depends on abstractions
- **Error Handling**: Centralized and consistent

#### Implementation Strategy:
1. Extract file system operations to dedicated persistence manager
2. Separate collection CRUD operations from persistence logic
3. Create specialized query processing
4. Implement centralized error handling
5. Add caching layer for performance

---

### 6. `./src/agents/vaultLibrarian/modes/services/UniversalSearchService.ts` (796 lines)

**Current Issues:**
- Multiple search strategies implemented in single service
- Complex result consolidation mixed with search execution
- Duplicated query parsing and result formatting
- Hard to extend with new search types
- duplicate indexing (this does not need to trigger the hnsw indexing can remove)

**Refactoring Plan:**

#### Separate Search Strategies:
```
src/agents/vaultLibrarian/modes/services/universal/
├── UniversalSearchService.ts (200 lines) - Main search orchestrator
├── strategies/
│   ├── ContentSearchStrategy.ts (150 lines) - Content/semantic search
│   ├── FileSearchStrategy.ts (100 lines) - File name search
│   ├── MetadataSearchStrategy.ts (120 lines) - Tag/property search
│   └── GraphSearchStrategy.ts (100 lines) - Graph-based search
├── query/
│   ├── QueryParser.ts (100 lines) - Query parsing and normalization
│   ├── QueryPlanner.ts (80 lines) - Search strategy planning
│   └── QueryValidator.ts (60 lines) - Query validation
├── results/
│   ├── ResultConsolidator.ts (120 lines) - Result consolidation by file
│   ├── ResultFormatter.ts (100 lines) - Result formatting
│   └── ResultRanker.ts (80 lines) - Result ranking and scoring
└── utils/
    ├── SearchUtils.ts (80 lines) - Common search utilities
    └── LinkExtractor.ts (60 lines) - Link and connection utilities
```

#### Key Improvements:
- **Strategy Pattern**: Different search strategies as separate classes
- **SRP**: Each component focused on specific aspect of search
- **OCP**: Easy to add new search strategies
- **DRY**: Eliminate duplicate query parsing and result processing

#### Implementation Strategy:
1. Extract search strategies into separate classes
2. Create query parsing and planning pipeline
3. Implement result consolidation system
4. Add indexing management components
5. Create utility classes for common operations

---

### 7. `./src/agents/memoryManager/modes/state/loadStateMode.ts` (787 lines)

**Current Issues:**
- Complex state restoration mixed with session management
- Duplicate trace processing and summary generation
- Validation logic scattered throughout execution
- Hard to extend with new restoration features

**Refactoring Plan:**

#### Separate Restoration Concerns:
```
src/agents/memoryManager/modes/state/load/
├── LoadStateMode.ts (150 lines) - Main orchestrator
├── retrieval/
│   ├── StateRetriever.ts (120 lines) - State data retrieval and validation
│   ├── WorkspaceRetriever.ts (100 lines) - Workspace context retrieval
│   └── SessionRetriever.ts (100 lines) - Session information retrieval
├── restoration/
│   ├── StateRestorer.ts (120 lines) - Core state restoration logic
│   ├── SessionManager.ts (150 lines) - Session creation and management
│   └── ContextRestorer.ts (100 lines) - Context restoration
├── processing/
│   ├── TraceProcessor.ts (120 lines) - Memory trace processing
│   ├── FileCollector.ts (100 lines) - Associated files collection
│   └── HistoryBuilder.ts (80 lines) - Continuation history building
├── summary/
│   ├── SummaryGenerator.ts (150 lines) - Restoration summary generation
│   └── MetadataBuilder.ts (80 lines) - Enhanced metadata building
└── tracing/
    ├── RestorationTracer.ts (100 lines) - Restoration activity tracing
    └── MemoryRecorder.ts (80 lines) - Memory trace recording
```

#### Key Improvements:
- **SRP**: Separate retrieval, restoration, processing, and tracing
- **DRY**: Eliminate duplicate session and context processing
- **Extensibility**: Easy to add new restoration features
- **Testing**: Focused components easier to test

#### Implementation Strategy:
1. Extract state and workspace retrieval logic
2. Create dedicated restoration services
3. Separate trace and file processing
4. Move summary generation to specialized component
5. Extract tracing logic to dedicated services

---

### 8. `./src/database/workspace-types.ts` (771 lines)

**Current Issues:**
- Single file containing all workspace-related types
- Mixed concerns: basic types, complex interfaces, parameters
- Hard to maintain as types grow
- Potential circular dependencies

**Refactoring Plan:**

#### Organize by Domain:
```
src/database/workspace/types/
├── index.ts (50 lines) - Re-export all types
├── core/
│   ├── WorkspaceCore.ts (150 lines) - Core workspace interfaces
│   ├── HierarchyTypes.ts (80 lines) - Hierarchy and status types
│   └── ActivityTypes.ts (100 lines) - Activity and history types
├── memory/
│   ├── MemoryTrace.ts (120 lines) - Memory trace interfaces
│   ├── StateSnapshot.ts (100 lines) - State snapshot interfaces
│   └── SessionTypes.ts (80 lines) - Session-related types
├── embedding/
│   ├── FileEmbedding.ts (100 lines) - File embedding interfaces
│   └── EmbeddingTypes.ts (60 lines) - Embedding-related types
├── parameters/
│   ├── WorkspaceParams.ts (120 lines) - Workspace operation parameters
│   ├── MemoryParams.ts (100 lines) - Memory operation parameters
│   └── SearchParams.ts (80 lines) - Search-related parameters
└── results/
    ├── WorkspaceResults.ts (100 lines) - Workspace operation results
    └── MemoryResults.ts (80 lines) - Memory operation results
```

#### Key Improvements:
- **Organization**: Types grouped by domain and responsibility
- **Maintainability**: Easier to find and modify related types
- **Dependency Management**: Reduced risk of circular dependencies
- **Reusability**: Types can be imported selectively

#### Implementation Strategy:
1. Group related types by domain
2. Create focused type files
3. Set up barrel exports in index.ts
4. Update imports across codebase
5. Verify no circular dependencies

---

### 9. `./src/types.ts` (757 lines)

**Current Issues:**
- Massive type file containing unrelated interfaces
- Mixed concerns: LLM, MCP, agents, plugins
- Hard to navigate and maintain
- Potential for naming conflicts

**Refactoring Plan:**

#### Organize by Functional Domain:
```
src/types/
├── index.ts (80 lines) - Re-export core types
├── agents/
│   ├── AgentTypes.ts (100 lines) - Agent and mode interfaces
│   ├── ModeTypes.ts (80 lines) - Mode execution types
│   └── CallTypes.ts (60 lines) - Mode call interfaces
├── llm/
│   ├── ProviderTypes.ts (120 lines) - LLM provider configurations
│   ├── ModelTypes.ts (80 lines) - Model and usage types
│   └── ResponseTypes.ts (100 lines) - LLM response interfaces
├── mcp/
│   ├── McpCore.ts (100 lines) - Core MCP interfaces
│   ├── McpTools.ts (80 lines) - Tool and resource types
│   └── McpResults.ts (60 lines) - MCP result types
├── plugin/
│   ├── PluginTypes.ts (100 lines) - Plugin configuration
│   ├── SettingsTypes.ts (120 lines) - Settings interfaces
│   └── ComponentTypes.ts (80 lines) - Component types
├── search/
│   ├── SearchTypes.ts (100 lines) - Search interfaces
│   └── ResultTypes.ts (80 lines) - Search result types
└── common/
    ├── CommonTypes.ts (80 lines) - Shared common types
    └── UtilityTypes.ts (60 lines) - Utility type definitions
```

#### Key Improvements:
- **Domain Separation**: Types organized by functional area
- **Selective Imports**: Import only needed types
- **Reduced Conflicts**: Namespaced by domain
- **Maintainability**: Easier to locate and modify types

#### Implementation Strategy:
1. Categorize existing types by domain
2. Create domain-specific type files
3. Set up structured exports
4. Update all imports across codebase
5. Verify type consistency

---

### 10. `./src/agents/contentManager/modes/batchContentMode.ts` (677 lines)

**Current Issues:**
- Single mode handling multiple content operations
- Complex validation and execution logic mixed together
- Duplicate file operation patterns
- Hard to extend with new content operations

**Refactoring Plan:**

#### Extract Content Operations:
```
src/agents/contentManager/modes/batch/
├── BatchContentMode.ts (150 lines) - Main orchestrator
├── operations/
│   ├── ContentOperationFactory.ts (80 lines) - Operation factory
│   ├── CreateOperation.ts (100 lines) - File creation operation
│   ├── ReadOperation.ts (80 lines) - File reading operation
│   ├── UpdateOperation.ts (120 lines) - File update operations
│   └── DeleteOperation.ts (80 lines) - File deletion operation
├── validation/
│   ├── OperationValidator.ts (100 lines) - Operation validation
│   ├── PathValidator.ts (80 lines) - Path validation
│   └── ContentValidator.ts (60 lines) - Content validation
├── execution/
│   ├── BatchExecutor.ts (120 lines) - Batch execution logic
│   └── ResultCollector.ts (80 lines) - Result collection and formatting
└── utils/
    ├── FileUtils.ts (80 lines) - File operation utilities
    └── ErrorHandler.ts (60 lines) - Error handling utilities
```

#### Key Improvements:
- **Command Pattern**: Each operation as separate command
- **SRP**: Focused validation and execution components
- **Factory Pattern**: Create operations dynamically
- **DRY**: Eliminate duplicate file operation code

#### Implementation Strategy:
1. Extract content operations into separate classes
2. Create validation pipeline
3. Implement batch execution framework
4. Add result collection and formatting
5. Create utility classes for common operations

---

## Organization Strategy

### Directory Structure
The refactored code will follow this organizational pattern:
- Main service/mode files remain in original locations (150-200 lines max)
- Extract specialized services into subdirectories
- Group related utilities and types together
- Maintain clear separation of concerns

### Migration Strategy
1. **Phase 1**: Extract largest, most complex files first
2. **Phase 2**: Create shared utilities and types
3. **Phase 3**: Update remaining files to use new structure
4. **Phase 4**: Add comprehensive tests for new components
5. **Phase 5**: Remove deprecated code and update documentation

### Benefits
- **Maintainability**: Smaller, focused files easier to understand and modify
- **Testability**: Individual components can be tested in isolation
- **Reusability**: Extracted services can be reused across different modes
- **Extensibility**: New features can be added without modifying existing code
- **Performance**: Opportunity for lazy loading and better caching

### Risk Mitigation
- Maintain backward compatibility during transition
- Implement comprehensive tests before refactoring
- Use dependency injection to avoid tight coupling
- Create clear interfaces between components
- Keep original files as reference during development