# Updated Vault Tools Refactoring Plan

## NavigateVaultTool List Operation Update

### New List Operation Format
```typescript
interface VaultListResult {
    path: string;        // Current folder path
    parent: string;      // Parent folder path for easy navigation
    items: VaultItem[];  // Contents of the folder
}

interface VaultItem {
    type: "folder" | "note";
    name: string;        // Name of the item
    path: string;        // Full path to the item
}
```

### Example Response
```json
{
    "path": "🌌 The Universe/Locations",
    "items": [
        { 
            "type": "folder", 
            "name": "Earth", 
            "path": "🌌 The Universe/Locations/Earth" 
        },
        { 
            "type": "note", 
            "name": "Mars.md", 
            "path": "🌌 The Universe/Locations/Mars.md" 
        }
    ],
    "parent": "🌌 The Universe"
}
```

### Benefits
1. AI-friendly structure with explicit types
2. Consistent format for all vault items
3. Parent path included for easy navigation
4. Full paths for direct access
5. Clean separation between name and path

### Implementation Steps
1. Update NavigateVaultTool list operation
   - Add new interfaces for response structure
   - Implement parent path calculation
   - Update list command to use new format
   - Update type definitions

2. Update documentation to reflect new format
   - Update tool description
   - Add examples in schema
   - Document all fields

3. Migration support
   - Consider backward compatibility
   - Update any dependent tools
   - Add deprecation notices if needed

## Timeline
1. Update NavigateVaultTool implementation
2. Test with various folder structures
3. Update any AI prompts or documentation
4. Deploy changes

Would you like me to proceed with implementing these changes in code mode?