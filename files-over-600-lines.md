# Files Over 600 Lines - Refactoring Plans

This document lists all files in the project that exceed 600 lines of code and provides comprehensive refactoring plans for each.

## TypeScript Files (.ts)

| Lines | File Path |
|-------|-----------|
| 1151 | `./src/agents/agentManager/modes/batchExecutePromptMode.ts` |
| 1143 | `./src/database/services/hnsw/HnswSearchService.ts` |
| 887 | `./src/agents/memoryManager/modes/state/createStateMode.ts` |
| 866 | `./src/agents/memoryManager/modes/workspace/loadWorkspaceMode.ts` |
| 808 | `./src/database/providers/chroma/PersistentChromaClient.ts` |
| 796 | `./src/agents/vaultLibrarian/modes/services/UniversalSearchService.ts` |
| 787 | `./src/agents/memoryManager/modes/state/loadStateMode.ts` |
| 771 | `./src/database/workspace-types.ts` |
| 757 | `./src/types.ts` |
| 677 | `./src/agents/contentManager/modes/batchContentMode.ts` |
| 664 | `./src/components/memory-settings/ApiSettingsTab.ts` |
| 650 | `./src/server.ts` |
| 632 | `./src/agents/memoryManager/modes/session/createSessionMode.ts` |
| 621 | `./src/agents/agentManager/modes/executePromptMode.ts` |
| 608 | `./src/database/utils/TextChunker.ts` |

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
├── indexing/
│   ├── IndexPopulator.ts (120 lines) - Index population
│   └── IndexValidator.ts (80 lines) - Index validation
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