# UpdateWorkspaceMode - Validation & Deep Path Tests

## Validation Features

The UpdateWorkspaceMode now includes comprehensive validation with helpful error messages:

### 1. **Path Format Validation**
```json
// ❌ Invalid - empty path
{
  "workspaceId": "test-123",
  "fieldPath": "",
  "newValue": "test"
}
// Error: "Field path cannot be empty"

// ❌ Invalid - starts with number
{
  "workspaceId": "test-123", 
  "fieldPath": "2context.purpose",
  "newValue": "test"
}
// Error: "Invalid path format. Use dot notation for nested fields and [index] for arrays. Example: 'context.workflows[0].name'"

// ❌ Invalid - special characters
{
  "workspaceId": "test-123",
  "fieldPath": "context.purpose@home",
  "newValue": "test"
}
// Error: "Invalid path format. Use dot notation for nested fields and [index] for arrays. Example: 'context.workflows[0].name'"
```

### 2. **Root Field Validation**
```json
// ❌ Invalid root field
{
  "workspaceId": "test-123",
  "fieldPath": "invalidField",
  "newValue": "test"
}
// Error: "Invalid root field 'invalidField'. Allowed fields: name, description, rootFolder, relatedFolders, relatedFiles, associatedNotes, keyFileInstructions, preferences, projectPlan, context, activityHistory, checkpoints, completionStatus"

// ✅ Valid root fields
{
  "workspaceId": "test-123",
  "fieldPath": "name", // ✅ Basic field
  "newValue": "New Workspace Name"
}
```

### 3. **Context Field Validation** 
```json
// ❌ Invalid context subfield
{
  "workspaceId": "test-123",
  "fieldPath": "context.invalidSubfield",
  "newValue": "test"
}
// Error: "Invalid context field 'invalidSubfield'. Allowed context fields: purpose, currentGoal, status, workflows, keyFiles, preferences, agents"

// ✅ Valid context fields
{
  "workspaceId": "test-123",
  "fieldPath": "context.purpose", // ✅ Valid context field
  "newValue": "Updated purpose"
}
```

### 4. **Array Index Validation**
```json
// ❌ Invalid array index - too high
{
  "workspaceId": "test-123",
  "fieldPath": "context.workflows[1000]",
  "newValue": {...}
}
// Error: "Array index 1000 is out of reasonable range (0-999)"

// ✅ Valid array indices
{
  "workspaceId": "test-123", 
  "fieldPath": "context.workflows[0]", // ✅ Valid index
  "newValue": {...}
}
```

## Deep Path Support Examples

### **Example 1: Basic Field Updates**
```json
// Update workspace name
{
  "workspaceId": "demo-workspace",
  "fieldPath": "name",
  "newValue": "My Updated Project"
}

// Update description
{
  "workspaceId": "demo-workspace",
  "fieldPath": "description", 
  "newValue": "This is my updated project description"
}
```

### **Example 2: Context Field Updates**
```json
// Update purpose
{
  "workspaceId": "demo-workspace",
  "fieldPath": "context.purpose",
  "newValue": "Build a revolutionary productivity app"
}

// Update current goal
{
  "workspaceId": "demo-workspace", 
  "fieldPath": "context.currentGoal",
  "newValue": "Complete MVP by end of Q1"
}

// Update status
{
  "workspaceId": "demo-workspace",
  "fieldPath": "context.status", 
  "newValue": "In progress - 65% complete"
}
```

### **Example 3: Array Operations**
```json
// Replace entire workflows array
{
  "workspaceId": "demo-workspace",
  "fieldPath": "context.workflows",
  "newValue": [
    {
      "name": "Development Workflow", 
      "when": "When implementing new features",
      "steps": ["Design", "Code", "Test", "Review", "Deploy"]
    },
    {
      "name": "Bug Fix Workflow",
      "when": "When fixing reported bugs", 
      "steps": ["Reproduce", "Debug", "Fix", "Test", "Deploy"]
    }
  ]
}

// Update specific workflow name
{
  "workspaceId": "demo-workspace",
  "fieldPath": "context.workflows[0].name",
  "newValue": "Enhanced Development Workflow"
}

// Update specific step in workflow
{
  "workspaceId": "demo-workspace", 
  "fieldPath": "context.workflows[0].steps[2]",
  "newValue": "Unit Test & Integration Test"
}

// Add new workflow (auto-creates if index doesn't exist)
{
  "workspaceId": "demo-workspace",
  "fieldPath": "context.workflows[2]",
  "newValue": {
    "name": "Release Workflow",
    "when": "When preparing for release", 
    "steps": ["Version bump", "Tag release", "Build", "Deploy to production"]
  }
}
```

### **Example 4: Complex Nested Structures**
```json
// Update keyFiles structure
{
  "workspaceId": "demo-workspace",
  "fieldPath": "context.keyFiles",
  "newValue": [
    {
      "category": "Documentation",
      "files": {
        "readme": "docs/README.md",
        "api": "docs/api-spec.md" 
      }
    },
    {
      "category": "Configuration", 
      "files": {
        "package": "package.json",
        "tsconfig": "tsconfig.json"
      }
    }
  ]
}

// Update specific file path in keyFiles
{
  "workspaceId": "demo-workspace",
  "fieldPath": "context.keyFiles[0].files.readme",
  "newValue": "documentation/README-updated.md"
}

// Add new file to existing category
{
  "workspaceId": "demo-workspace", 
  "fieldPath": "context.keyFiles[0].files.changelog",
  "newValue": "docs/CHANGELOG.md"
}
```

### **Example 5: Agent Configuration**
```json
// Update agents array
{
  "workspaceId": "demo-workspace",
  "fieldPath": "context.agents", 
  "newValue": [
    {
      "name": "CodeReviewer", 
      "when": "When reviewing pull requests",
      "purpose": "Analyze code quality, security, and best practices"
    },
    {
      "name": "TestGenerator",
      "when": "When writing new features", 
      "purpose": "Generate comprehensive unit and integration tests"
    }
  ]
}

// Update specific agent purpose 
{
  "workspaceId": "demo-workspace",
  "fieldPath": "context.agents[0].purpose",
  "newValue": "Advanced code analysis including performance optimization suggestions"
}
```

### **Example 6: Preferences Update**
```json
// Update preferences array
{
  "workspaceId": "demo-workspace", 
  "fieldPath": "context.preferences",
  "newValue": [
    "Use TypeScript for all new code",
    "Follow clean code principles", 
    "Write comprehensive documentation",
    "Prioritize performance optimization",
    "Include error handling in all functions"
  ]
}
```

## Error Handling Examples

The validation provides specific, actionable error messages:

### **Invalid Path Formats**
```
❌ "context..purpose" → "Invalid path format. Use dot notation for nested fields and [index] for arrays. Example: 'context.workflows[0].name'"
❌ "context.[0].workflows" → "Invalid path format. Use dot notation for nested fields and [index] for arrays. Example: 'context.workflows[0].name'" 
❌ "context.workflows[]" → "Invalid path format. Use dot notation for nested fields and [index] for arrays. Example: 'context.workflows[0].name'"
```

### **Invalid Field Names**
```
❌ "invalidRootField" → "Invalid root field 'invalidRootField'. Allowed fields: name, description, rootFolder, relatedFolders, relatedFiles, associatedNotes, keyFileInstructions, preferences, projectPlan, context, activityHistory, checkpoints, completionStatus"
❌ "context.invalidContextField" → "Invalid context field 'invalidContextField'. Allowed context fields: purpose, currentGoal, status, workflows, keyFiles, preferences, agents"
```

### **Invalid Array Indices**  
```
❌ "context.workflows[1001]" → "Array index 1001 is out of reasonable range (0-999)"
❌ "context.workflows[-1]" → "Invalid path format. Use dot notation for nested fields and [index] for arrays. Example: 'context.workflows[0].name'"
```

## Change Detection

The system only performs updates if the value actually changes:

```json
// If current value is already "My Project", this returns:
{
  "workspaceId": "demo-workspace",
  "fieldPath": "name", 
  "newValue": "My Project"
}
// Result: { "updated": false, "message": "No changes detected - field value is already up to date" }
```

This validation ensures robust, safe updates while providing clear feedback when things go wrong!