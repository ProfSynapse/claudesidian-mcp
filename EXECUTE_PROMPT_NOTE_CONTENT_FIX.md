# Execute Prompt Tool - Note Content Fix

## Issue
The execute prompt tool was only accepting file paths through the `filepaths` parameter, requiring notes to exist as files in the vault before they could be included as context.

## Solution
Added a new `noteContent` parameter that allows sending note content directly to the execute prompt tool without needing file paths.

## Changes Made

### 1. Updated ExecutePromptParams Interface
Added `noteContent?: string` parameter to the interface in `executePromptMode.ts`:
```typescript
export interface ExecutePromptParams {
  // ... existing parameters ...
  filepaths?: string[];
  noteContent?: string; // NEW: Direct note content to include
  // ... rest of parameters ...
}
```

### 2. Updated LLMExecutionOptions Interface
Added `noteContent?: string` to the LLM service interface in `LLMService.ts`:
```typescript
export interface LLMExecutionOptions extends GenerateOptions {
  // ... existing parameters ...
  filepaths?: string[];
  noteContent?: string; // NEW: Direct note content
  // ... rest of parameters ...
}
```

### 3. Modified LLMService Implementation
Updated the `executePrompt` method to handle both `noteContent` and `filepaths`:
- Direct note content is now processed first
- File paths are still supported for backward compatibility
- Both sources are combined when provided
- Context is prefixed with "Context from notes:" for clarity

## Usage Examples

### Using Direct Note Content
```json
{
  "agent": "myAgent",
  "prompt": "Analyze this information",
  "noteContent": "This is my note content that I want to analyze without saving to a file first",
  "sessionId": "session123",
  "context": "context"
}
```

### Using Both Note Content and File Paths
```json
{
  "agent": "myAgent", 
  "prompt": "Compare these notes",
  "noteContent": "Direct content from clipboard or other source",
  "filepaths": ["Notes/existing-note.md"],
  "sessionId": "session123",
  "context": "context"
}
```

### Backward Compatible (Files Only)
```json
{
  "agent": "myAgent",
  "prompt": "Analyze these files",
  "filepaths": ["Notes/note1.md", "Notes/note2.md"],
  "sessionId": "session123",
  "context": "context"
}
```

## Benefits
- **Flexibility**: Send note content directly without creating temporary files
- **Efficiency**: No need to save content to vault before processing
- **Backward Compatible**: Existing workflows using `filepaths` continue to work
- **Combined Context**: Can use both direct content and file paths together

## Technical Details
- The `noteContent` parameter is optional
- When both `noteContent` and `filepaths` are provided, they are combined
- The prompt format remains consistent with "Context from notes:" prefix
- No breaking changes to existing functionality