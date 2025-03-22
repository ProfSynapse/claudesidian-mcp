# Vault Tools Refactoring Plan

## Overview

Restructure vault management tools into two main tools:
1. NavigateVaultTool - For read-only operations (search, list, metadata)
2. ManageVaultTool - For write operations (create, delete, move)

## NavigateVaultTool

### Core Features
- Unified search across notes and folders using existing SearchUtil
- Maintain current search capabilities
- Add folder search integration
- Add dedicated metadata operations

### Implementation Details
1. Move existing search functionality from ManageNoteTool
   - Keep SearchUtil as core search engine
   - Maintain current search options (weights, thresholds)
   - Preserve rich metadata handling

2. Add folder search capabilities
   - Integrate folder search from ManageFolderTool
   - Unify scoring mechanisms

3. Add metadata-specific operations
   - Tag listing and search
   - Property listing and search
   - YAML frontmatter parsing

### Commands Structure
```typescript
class NavigateVaultTool extends BaseTool {
    // Core search
    search(query: string, options: SearchOptions)
    list(path?: string)
    
    // Metadata operations
    getTags()
    getProperties()
    searchByTag(tag: string)
    searchByProperty(key: string, value: any)
}

interface SearchOptions {
    path?: string
    weights?: SearchWeights
    searchFields?: string[]
    threshold?: number
    maxResults?: number
    includeFolders?: boolean
    includeMetadata?: boolean
}
```

## ManageVaultTool

### Core Features
- Unified create/delete/move operations
- Handle both notes and folders
- Maintain undo/redo support

### Implementation Details
1. Combine note and folder creation
   - Unified path handling
   - Parent folder creation
   - Error handling

2. Unified delete operations
   - Support force delete
   - Handle recursive deletion
   - Store state for undo

3. Move operations
   - Path validation
   - Parent folder creation
   - Undo support

### Commands Structure
```typescript
class ManageVaultTool extends BaseTool {
    // Note operations
    createNote(path: string, content: string)
    deleteNote(path: string, force?: boolean)
    moveNote(fromPath: string, toPath: string)
    
    // Folder operations
    createFolder(path: string)
    deleteFolder(path: string, force?: boolean)
    moveFolder(fromPath: string, toPath: string)
}
```

## Migration Steps

1. Create new tool classes
   - NavigateVaultTool
   - ManageVaultTool

2. Move existing functionality
   - Migrate search from ManageNoteTool to NavigateVaultTool
   - Migrate folder operations from ManageFolderTool
   - Update command handlers

3. Update dependencies
   - Remove old tools
   - Update service registrations
   - Update any importing modules

4. Testing
   - Verify all operations work as before
   - Test combined note/folder operations
   - Validate metadata handling