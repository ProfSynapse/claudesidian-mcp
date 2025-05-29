# FileEventManager Refactoring

This directory contains the modularized components of the FileEventManager, following the Single Responsibility Principle (SRP).

## Components

### FileEventManager (main.ts)
The main orchestrator that coordinates all file event processing. It's now much simpler and delegates specific responsibilities to specialized components.

### FileEventQueue
Handles event queueing, deduplication, and priority-based processing.
- Manages the queue of file events
- Handles event deduplication
- Tracks processing state
- Provides queue statistics

### FileContentCache  
Manages content caching for change detection.
- Caches file contents before modifications
- Tracks file modification times
- Provides periodic caching for recently accessed files
- Implements LRU eviction when cache is full

### WorkspaceActivityRecorder
Records file activities in workspaces and manages memory traces.
- Tracks which workspaces contain which files
- Records activities with rate limiting
- Creates memory traces for active sessions
- Manages workspace root cache

### EmbeddingProcessor
Handles all embedding-related operations.
- Processes file embeddings based on strategy
- Handles chunk-level updates for modifications
- Manages startup embedding
- Handles file deletion embeddings

### VaultReadyDetector
Detects when the vault has finished loading on startup.
- Monitors file event frequency
- Determines when vault is ready
- Prevents processing of startup file events

### FileEventHandlers
Handles Obsidian file system events and converts them to FileEvents.
- Listens to vault create/modify/delete events
- Filters events based on file type and exclusions
- Caches content when files are opened
- Checks for actual modifications vs touches

## Benefits of this refactoring

1. **Single Responsibility**: Each component has one clear purpose
2. **Testability**: Components can be tested in isolation
3. **Maintainability**: Easier to understand and modify individual features
4. **Reusability**: Components can be reused in other contexts
5. **Reduced Complexity**: The main FileEventManager is now much simpler
6. **Better Organization**: Related functionality is grouped together

## Usage

The FileEventManager still provides the same interface to the rest of the application, but internally delegates to these specialized components. This makes the codebase more modular and easier to maintain.