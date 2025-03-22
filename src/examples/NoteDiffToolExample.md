# NoteDiffTool Examples

The NoteDiffTool is the primary tool for all note editing operations in Obsidian. It uses Obsidian's APIs for more robust editing capabilities, especially for operations like inserting content under headings with wiki-links or replacing text.

> **Note:** The insert, replace, and edit actions have been removed from ManageNoteTool. Please use NoteDiffTool for all note editing operations.

> **Important:** When using the `replaceText` operation, be aware that it only replaces the first occurrence of the search text to prevent potential infinite recursion issues. If you need to replace all occurrences, use the `replaceAllText` operation instead.

## Basic Usage

The NoteDiffTool supports multiple operations in a single call:

```typescript
// Example: Insert content under a heading with wiki-links
const result = await toolRegistry.executeTool('noteDiff', {
  path: '🎵 The Shattered Crystal/🗺️ The Shattered Crystal.md',
  operations: [
    {
      type: 'insertAtHeading',
      heading: '## [[05. Interlude I]]',
      content: 'In the hidden underground city of Vareth\'Nal, young Ar\'Ivani awakens from a terrifying nightmare...'
    }
  ]
});
```

## Supported Operations

### 1. Insert at Heading

Inserts content under a specific heading, including headings with wiki-links:

```typescript
{
  type: 'insertAtHeading',
  heading: '## [[05. Interlude I]]',
  content: 'Content to insert under the heading'
}
```

### 2. Insert at Position

Inserts content at a specific position (line and character):

```typescript
{
  type: 'insertAtPosition',
  position: { line: 10, ch: 0 },
  content: 'Content to insert at line 10'
}
```

### 3. Replace Text

Replaces the first occurrence of specific text in the note:

```typescript
{
  type: 'replaceText',
  search: 'old text',
  replace: 'new text'
}
```

### 4. Replace All Text

Replaces all occurrences of specific text in the note:

```typescript
{
  type: 'replaceAllText',
  search: 'old text',
  replace: 'new text'
}
```

### 5. Append to File

Appends content to the end of the file:

```typescript
{
  type: 'appendToFile',
  content: 'Content to append to the end of the file'
}
```

### 6. Prepend to File

Prepends content to the beginning of the file:

```typescript
{
  type: 'prependToFile',
  content: 'Content to prepend to the beginning of the file'
}
```

## Multiple Operations

You can perform multiple operations in a single call:

```typescript
const result = await toolRegistry.executeTool('noteDiff', {
  path: 'Notes/Example.md',
  operations: [
    {
      type: 'insertAtHeading',
      heading: '## Section 1',
      content: 'Content under Section 1'
    },
    {
      type: 'replaceText',
      search: 'old text',
      replace: 'new text'
    },
    {
      type: 'replaceAllText',
      search: 'repeated text',
      replace: 'new repeated text'
    },
    {
      type: 'appendToFile',
      content: 'Content at the end of the file'
    }
  ]
});
```

## Error Handling

The NoteDiffTool provides clear error messages when operations fail:

- If a heading is not found, it will provide suggestions for checking the heading format
- If a position is out of range, it will show the valid range
- If text to replace is not found, it will indicate that the text was not found

## Undo Support

The NoteDiffTool supports undo functionality, allowing you to revert changes if needed.

## Implementation Details

The NoteDiffTool uses Obsidian's APIs for text manipulation:

- **Vault API**: For reading and writing files
- **Editor API concepts**: For position calculations and text manipulation

This approach provides more robust text manipulation capabilities and better integration with Obsidian.