# UpdateWorkspaceMode - Simplified Field Path Updates

The UpdateWorkspaceMode has been simplified to work like ReplaceContentMode - you specify a field path and new value, and it updates that specific field in the workspace JSON.

## How It Works

Instead of having separate parameters for each possible field, you now use:
- `workspaceId`: The workspace to update
- `fieldPath`: Path to the field (supports nested paths and arrays)  
- `newValue`: The new value to set

## Examples

### Basic Field Updates
```json
// Update workspace name
{
  "workspaceId": "my-workspace-123",
  "fieldPath": "name",
  "newValue": "My Updated Workspace"
}

// Update description  
{
  "workspaceId": "my-workspace-123", 
  "fieldPath": "description",
  "newValue": "New description for the workspace"
}
```

### Context Field Updates
```json
// Update purpose
{
  "workspaceId": "my-workspace-123",
  "fieldPath": "context.purpose", 
  "newValue": "Updated purpose for this workspace"
}

// Update current goal
{
  "workspaceId": "my-workspace-123",
  "fieldPath": "context.currentGoal",
  "newValue": "Complete the project by end of month"
}

// Update entire preferences array
{
  "workspaceId": "my-workspace-123",
  "fieldPath": "context.preferences",
  "newValue": ["Use professional tone", "Focus on efficiency", "Include examples"]
}
```

### Array Item Updates
```json
// Update a specific workflow name
{
  "workspaceId": "my-workspace-123", 
  "fieldPath": "context.workflows[0].name",
  "newValue": "Updated Workflow Name"
}

// Update workflow steps
{
  "workspaceId": "my-workspace-123",
  "fieldPath": "context.workflows[0].steps", 
  "newValue": ["Step 1", "Step 2", "Step 3"]
}

// Add new workflow (creates array if doesn't exist)
{
  "workspaceId": "my-workspace-123",
  "fieldPath": "context.workflows[1]",
  "newValue": {
    "name": "New Workflow",
    "when": "When starting new tasks", 
    "steps": ["Analyze", "Plan", "Execute"]
  }
}
```

### Complex Nested Updates
```json
// Update a specific key file path
{
  "workspaceId": "my-workspace-123",
  "fieldPath": "context.keyFiles[0].files.resume",
  "newValue": "documents/resume-updated.pdf"
}

// Update agent configuration
{
  "workspaceId": "my-workspace-123", 
  "fieldPath": "context.agents[0].purpose",
  "newValue": "Updated agent purpose with new capabilities"
}
```

## Benefits

1. **Consistency**: Works like ReplaceContentMode - simple field/value pattern
2. **Flexibility**: Can update any field in the workspace JSON structure  
3. **Deep Updates**: Supports nested paths and array indices
4. **Change Detection**: Only updates if value actually changed
5. **Auto-Creation**: Creates intermediate objects/arrays as needed
6. **Better Logging**: Shows exactly what changed (old value → new value)

## Comparison: Old vs New

### Old Way (Required many parameters)
```json
{
  "workspaceId": "123",
  "name": "New Name",
  "description": "New Description", 
  "purpose": "New Purpose",
  "currentGoal": "New Goal",
  "workflows": [...entire workflows array...],
  "preferences": [...entire preferences array...]
}
```

### New Way (One field at a time, precise)
```json
// Just update the name
{
  "workspaceId": "123",
  "fieldPath": "name", 
  "newValue": "New Name"
}

// Just update one workflow step
{
  "workspaceId": "123",
  "fieldPath": "context.workflows[0].steps[1]",
  "newValue": "Updated step 2"
}
```

This approach treats the workspace like a JSON document where you can update any field at any path, similar to how document databases work.