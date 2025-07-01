# Codebase Context - Claudesidian MCP Plugin

## Project Overview
This is an Obsidian plugin that implements a Model Context Protocol (MCP) server, providing AI agents with structured access to Obsidian vault operations through a sophisticated agent-based architecture.

## Architecture

### Agent-Based System
The plugin uses a modular agent architecture with the following key agents:
- **VaultManager**: File and folder operations (create, read, update, delete, list)
- **MemoryManager**: Embedding-based memory storage and retrieval 
- **ContentManager**: Content manipulation operations
- **VaultLibrarian**: Search and discovery operations
- **CommandManager**: Obsidian command execution
- **AgentManager**: Custom prompt and model management

### Core Components
- **BaseMode**: Abstract base class for all agent modes (`src/agents/baseMode.ts`)
- **CommonParameters/CommonResult**: Standardized interfaces for session tracking and workspace context (`src/types.ts`)
- **MCP Server**: HTTP and Unix socket server implementation

## Recent Changes

### Auto .md Extension Fix (2025-01-07)
**Problem**: LLMs sometimes provide file paths without extensions (e.g., `foldername/filename` instead of `foldername/filename.md`), causing operations to fail since Obsidian expects `.md` files.

**Solution Applied**:
1. **Enhanced Path Utilities** (`src/utils/pathUtils.ts`):
   - Added `smartNormalizePath()` function that automatically adds `.md` extension if no extension is present
   - Includes heuristics to distinguish between files and folders
   - Only adds `.md` if no other extension is detected
   - Preserves existing extensions (`.canvas`, `.pdf`, etc.)

2. **Integrated into Validation Service** (`src/handlers/services/ValidationService.ts`):
   - Added `normalizePathParameters()` method that processes common path parameters
   - Automatically applies smart normalization before validation
   - Handles arrays of paths and nested operations
   - Covers parameters: `path`, `filePath`, `sourcePath`, `targetPath`, `newPath`, `oldPath`, `paths`, `contextFiles`, `filepaths`

3. **Updated Key Components**:
   - **OpenNoteMode**: Now uses `smartNormalizePath()` for file opening operations
   - **FileOperations.createNote()**: Uses smart normalization for file creation

**Key Implementation Details**:
- **Non-breaking**: Only adds `.md` if no extension is present
- **Heuristic-based**: Uses folder indicators to avoid adding extensions to folder paths
- **Centralized**: Validation service ensures consistent application across all modes
- **Backwards compatible**: Existing behavior preserved for paths with extensions

**Files Modified**:
- `src/utils/pathUtils.ts` - Added smart normalization functions
- `src/handlers/services/ValidationService.ts` - Integrated automatic path processing
- `src/agents/vaultManager/modes/openNoteMode.ts` - Updated to use smart normalization
- `src/agents/vaultManager/utils/FileOperations.ts` - Updated createNote method

### ListFilesMode Path Parameter Fix (2025-01-07)
**Problem**: The `listFilesMode.ts` was experiencing errors because the `path` parameter was optional, causing MCP clients to omit it entirely.

**Solution Applied**:
1. **Made `path` parameter required** in TypeScript interface:
   - Changed `path?: string` to `path: string` in `ListFilesParameters`

2. **Updated JSON schema** to require the path parameter:
   - Added `'path'` to the `required` array in `getParameterSchema()`

3. **Enhanced documentation**:
   - Updated parameter description to clearly explain root directory options
   - Specified that empty string (""), "/" or "." all represent root directory

**Key Implementation Details**:
- The existing `normalizePath()` method properly handles all root directory representations
- Path validation ensures folder exists before listing
- Maintains backward compatibility with root directory access patterns
- Clear error messages for invalid paths

**Root Cause**: The `ValidationService` was applying `smartNormalizePath()` to the `path` parameter, which converted "/" to an empty string before validation, causing the required parameter check to fail.

**Additional Fix Applied**:
4. **Updated ValidationService path normalization**:
   - Removed `'path'` from the list of parameters that get normalized by `smartNormalizePath()`
   - Added comment explaining that directory listing operations need to preserve root indicators
   - This prevents "/" from being converted to "" before validation

**Final DRY Solution Applied**:
5. **Created BaseDirectoryMode class** (`src/agents/vaultManager/modes/baseDirectoryMode.ts`):
   - Centralized directory path normalization logic
   - Shared `getFolder()` method for consistent folder retrieval
   - Standardized directory path schema generation
   - Common root directory message generation

6. **Refactored both modes** to extend `BaseDirectoryMode`:
   - Eliminated duplicate code between `listFilesMode` and `listFoldersMode`
   - Both modes now use consistent path handling
   - Simplified implementation with shared base functionality

7. **Restored ValidationService** to original state:
   - Removed the workaround exclusion for 'path' parameter
   - Directory listing now handled properly by `BaseDirectoryMode`
   - Clean separation between file and directory path handling

**Files Modified**:
- `src/agents/vaultManager/modes/listFilesMode.ts`
- `src/agents/vaultManager/modes/listFoldersMode.ts` 
- `src/handlers/services/ValidationService.ts`
- `src/agents/vaultManager/modes/baseDirectoryMode.ts` (new)

### Code Cleanup - DRY Principle Applied (2025-01-07)
**Problem**: Multiple files contained duplicate `normalizePath` methods doing identical operations (removing leading slash), violating DRY principles and making maintenance difficult.

**Solution Applied**:
8. **Created centralized path normalization utility**:
   - Added `normalizePath()` function to `src/utils/pathUtils.ts`
   - Provides single source of truth for basic path normalization
   - Removes leading slashes for Obsidian compatibility

9. **Eliminated duplicate methods** across multiple files:
   - Removed private `normalizePath` method from `FileOperations.ts`
   - Removed private `normalizePath` method from `openNoteMode.ts`
   - Updated all method calls to use imported utility function
   - Fixed TypeScript compilation errors

10. **Maintained clean separation of concerns**:
    - Basic path normalization: `pathUtils.normalizePath()`
    - Smart file path handling: `pathUtils.smartNormalizePath()`
    - Directory path handling: `BaseDirectoryMode.normalizeDirectoryPath()`

**Files Modified**:
- `src/utils/pathUtils.ts` - Added centralized `normalizePath()` function
- `src/agents/vaultManager/utils/FileOperations.ts` - Removed duplicate method, uses shared utility
- `src/agents/vaultManager/modes/openNoteMode.ts` - Removed duplicate method

**Benefits Achieved**:
- ✅ Eliminated ~15 lines of duplicate code
- ✅ Single source of truth for path normalization
- ✅ Easier maintenance and consistent behavior
- ✅ Clean TypeScript compilation

## Code Patterns

### Mode Implementation Pattern
All modes follow this structure:
1. Extend `BaseMode<ParametersInterface, ResultInterface>`
2. Implement required methods: `execute()`, `getParameterSchema()`
3. Use `prepareResult()` for standardized responses
4. Handle workspace context inheritance via `getInheritedWorkspaceContext()`

### Path Handling Best Practices
- Always normalize paths using helper methods
- Handle root directory representations consistently ("", ".", "/")
- Provide clear error messages for invalid paths
- Use `app.vault.getRoot()` for root directory access
- Validate folder existence before operations

## Development Guidelines

### Parameter Schema Design
- Make parameters required when they're essential for operation
- Provide clear descriptions including valid values/formats
- Use appropriate defaults where sensible
- Follow CommonParameters pattern for session tracking

### Error Handling
- Use `createErrorMessage()` utility for consistent error formatting
- Provide specific, actionable error messages
- Handle edge cases gracefully (empty folders, permissions, etc.)

### Testing Considerations
When testing path-related functionality:
- Test with empty string, ".", and "/" for root access
- Test with valid subfolders
- Test with invalid/non-existent paths
- Verify proper error handling and messaging

## Key Dependencies
- **Obsidian API**: Core vault operations (App, TFile, TFolder)
- **MCP Protocol**: Model Context Protocol implementation
- **JSON Schema**: Parameter validation and documentation
