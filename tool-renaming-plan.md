# Tool Renaming Plan

## Overview

This document outlines the plan for renaming several core tools in the codebase to better reflect their functionality.

## Renaming Map

| Current Name | New Name |
|-------------|-----------|
| AIGenerationTool | TextGeneratorTool |
| CommandPaletteTool | PaletteCommanderTool |
| ManageVaultTool | VaultManagerTool |
| NavigateVaultTool | VaultLibrarianTool |
| NoteDiffTool | NoteEditorTool |
| ProjectTool | ProjectManagerTool |

## Implementation Steps

### 1. File Name Changes
- Rename files in src/tools/core:
  - AIGenerationTool.ts → TextGeneratorTool.ts
  - CommandPaletteTool.ts → PaletteCommanderTool.ts
  - ManageVaultTool.ts → VaultManagerTool.ts
  - NavigateVaultTool.ts → VaultLibrarianTool.ts
  - NoteDiffTool.ts → NoteEditorTool.ts
  - ProjectTool.ts → ProjectManagerTool.ts

### 2. Class Name Updates
- Update class names in each tool file
- Update class names in test files
- Update import statements across all files

### 3. Tool Name String Updates
- Update tool name strings in constructor calls:
  - 'ai-generation' → 'textGenerator'
  - 'commandPalette' → 'paletteCommander'
  - 'manageVault' → 'vaultManager'
  - 'navigateVault' → 'vaultLibrarian'
  - 'noteDiff' → 'noteEditor'
  - 'project' → 'projectManager'

### 4. Update References
Key files to update:
- ToolRegistry.ts (imports and registrations)
- ServiceProvider.ts (imports and configurations)
- Test files referencing these tools
- Example files demonstrating tool usage

### 5. Verification
- Review all changes
- Run tests to ensure functionality is preserved
- Check for any missed references