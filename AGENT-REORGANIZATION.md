# Claudesidian Agent Reorganization Plan

This document outlines the reorganization of Claudesidian agents to provide clearer boundaries, reduce redundancy, and support workspace functionality consistently across all tools.

## Core Principles

1. **Clear Responsibility Boundaries**: Each agent has a specific domain with no overlap
2. **Standardized Parameters**: Common parameter structure across all agents
3. **Workspace Context Support**: All agents accept and respect workspace context
4. **Handoff Mechanism**: Each agent can hand off to another agent for workflow chaining
5. **Consistent Return Values**: Standardized result structure across all agents

## Agent Structure and Responsibilities

### vaultManager
**Purpose**: File system operations only

| Mode | Description | Parameters |
|------|-------------|------------|
| `listFiles` | List files in a directory | path, filter, workspaceContext, handoff |
| `listFolders` | List folders in a directory | path, filter, workspaceContext, handoff |
| `createFolder` | Create a new folder | path, workspaceContext, handoff |
| `editFolder` | Rename a folder | path, newName, workspaceContext, handoff |
| `deleteFolder` | Delete an existing folder | path, recursive, workspaceContext, handoff |
| `moveFile` | Move a file to a new location | sourcePath, destinationPath, workspaceContext, handoff |
| `moveFolder` | Move a folder to a new location | sourcePath, destinationPath, workspaceContext, handoff |

### contentManager
**Purpose**: Content operations only

| Mode | Description | Parameters |
|------|-------------|------------|
| `readContent` | Read file content | filePath, limit, offset, workspaceContext, handoff |
| `createContent` | Create new file with content | filePath, content, workspaceContext, handoff |
| `appendContent` | Append to file | filePath, content, workspaceContext, handoff |
| `prependContent` | Prepend to file | filePath, content, workspaceContext, handoff |
| `replaceContent` | Replace content in file | filePath, oldContent, newContent, workspaceContext, handoff |
| `replaceByLine` | Replace specific lines | filePath, startLine, endLine, newContent, workspaceContext, handoff |
| `deleteContent` | Delete content from file | filePath, content, workspaceContext, handoff |
| `batchContent` | Multiple content operations | operations[], workspaceContext, handoff |

### vaultLibrarian
**Purpose**: Search and embeddings operations

| Mode | Description | Parameters |
|------|-------------|------------|
| `createEmbeddings` | Index content for semantic search | filePath, force, workspaceContext, handoff |
| `batchCreateEmbeddings` | Index multiple files | filePaths[], force, workspaceContext, handoff |
| `searchContent` | Search by content | query, limit, workspaceContext, handoff |
| `searchTags` | Search by tags | tags[], workspaceContext, handoff |
| `searchProperties` | Search by frontmatter properties | properties, workspaceContext, handoff |
| `semanticSearch` | Search using vector embeddings | query, limit, threshold, workspaceContext, handoff |
| `combinedSearch` | Hybrid metadata/semantic search | query, filters, limit, workspaceContext, handoff |

### commandManager
**Purpose**: Command palette operations

| Mode | Description | Parameters |
|------|-------------|------------|
| `listCommands` | List available Obsidian commands | filter, workspaceContext, handoff |
| `executeCommand` | Run an Obsidian command | commandId, workspaceContext, handoff |

### projectManager
**Purpose**: Workspace and project management

| Mode | Description | Parameters |
|------|-------------|------------|
| `listWorkspaces` | List available workspaces | sortBy, order, parentId, hierarchyType, workspaceContext, handoff |
| `createWorkspace` | Create new workspace | name, description, rootFolder, hierarchyType, parentId, workspaceContext, handoff |
| `editWorkspace` | Modify workspace | id, name, description, status, parentId, workspaceContext, handoff |
| `deleteWorkspace` | Remove workspace | id, deleteChildren, preserveSettings, workspaceContext, handoff |
| `loadWorkspace` | Load workspace as active context | id, contextDepth, includeChildren, specificPhaseId, handoff |
| `askQuestion` | Ask question in workspace context | question, context, workspaceContext, handoff |
| `checkpoint` | Create milestone in workspace | description, workspaceContext, handoff |
| `complete` | Mark completion in workspace | summary, updateStatus, workspaceContext, handoff |
| `projectPlan` | Create or update project plan | title, goals, tasks, deadlines, workspaceContext, handoff |

## Standardized Parameter Structure

### Common Parameter Object

```typescript
interface CommonParameters {
  // Workspace context (optional but recommended)
  workspaceContext?: {
    workspaceId: string;
    workspacePath?: string[]; // For hierarchical workspaces
  };
  
  // Handoff to another tool (optional)
  handoff?: {
    tool: string;        // Name of tool to hand off to
    mode: string;        // Mode to execute
    parameters: any;     // Parameters to pass
    returnHere?: boolean; // Whether to return results to original tool
  };
}
```

### Common Result Structure

```typescript
interface CommonResult {
  success: boolean;      // Whether the operation succeeded
  error?: string;        // Error message if success is false
  data?: any;            // Operation-specific result data
  
  // Workspace context that was used (for continuity)
  workspaceContext?: {
    workspaceId: string;
    workspacePath?: string[];
    activeWorkspace?: boolean;
  };
  
  // Handoff result if a handoff was processed
  handoffResult?: any;
}
```

## Handoff Flow Examples

### Example 1: Create Workspace → Add Content → Set Checkpoint

```javascript
{
  "tool": "projectManager",
  "mode": "createWorkspace",
  "parameters": {
    "name": "Book Project",
    "description": "My new novel",
    "rootFolder": "Book Project",
    "handoff": {
      "tool": "contentManager",
      "mode": "createContent",
      "parameters": {
        "filePath": "Book Project/outline.md",
        "content": "# Book Outline\n\n## Chapter 1\n...",
        "handoff": {
          "tool": "projectManager",
          "mode": "checkpoint",
          "parameters": {
            "description": "Created initial outline",
            "workspaceContext": {
              "workspaceId": "${result.data.workspaceId}"
            }
          }
        }
      }
    }
  }
}
```

### Example 2: Load Workspace → Search → Read Content

```javascript
{
  "tool": "projectManager",
  "mode": "loadWorkspace",
  "parameters": {
    "id": "book-project",
    "handoff": {
      "tool": "vaultLibrarian",
      "mode": "semanticSearch",
      "parameters": {
        "query": "character development",
        "limit": 5,
        "workspaceContext": {
          "workspaceId": "book-project"
        },
        "handoff": {
          "tool": "contentManager",
          "mode": "readContent",
          "parameters": {
            "filePath": "${result.data.matches[0].filePath}"
          }
        }
      }
    }
  }
}
```

## Implementation Roadmap

### Phase 1: Agent Refactoring (2-3 weeks)
- Define clear boundaries between agents
- Convert existing agents to new structure
- Implement standardized parameter handling
- Add workspace context support to all agents

### Phase 2: Handoff Mechanism (1-2 weeks)
- Implement handoff system in base agent class
- Add result processing and chaining
- Test complex multi-agent workflows
- Document common handoff patterns

### Phase 3: Documentation and Training (1 week)
- Update MCP schemas for all agents
- Create documentation with clear examples
- Provide example workflows for Claude Desktop
- Add inline code comments for maintainability

### Phase 4: Migration and Testing (1-2 weeks)
- Create compatibility layer for existing clients
- Test with Claude Desktop
- Gather feedback on usability
- Refine based on real-world usage

## Benefits of Reorganization

1. **Reduced Redundancy**: Clear separation of responsibilities eliminates duplicate functionality
2. **Improved Discoverability**: Easier for Claude Desktop to determine the right tool for each task
3. **Workspace Integration**: All operations naturally fit within workspace contexts
4. **Workflow Efficiency**: Handoff mechanism enables complex operations without multiple round-trips
5. **Future Extensibility**: Clean structure allows adding new capabilities without disrupting existing ones

## MCP Schema Example

```json
{
  "tools": [
    {
      "name": "vaultManager",
      "description": "File system operations for Obsidian vault",
      "modes": [
        {
          "name": "listFiles",
          "description": "List files in a specified directory",
          "parameters": {
            "type": "object",
            "properties": {
              "path": {
                "type": "string",
                "description": "Directory path to list files from"
              },
              "filter": {
                "type": "string",
                "description": "Optional filter pattern for files"
              },
              "workspaceContext": {
                "type": "object",
                "properties": {
                  "workspaceId": { "type": "string" },
                  "workspacePath": { 
                    "type": "array", 
                    "items": { "type": "string" }
                  }
                },
                "description": "Optional workspace context"
              },
              "handoff": {
                "type": "object",
                "properties": {
                  "tool": { "type": "string" },
                  "mode": { "type": "string" },
                  "parameters": { "type": "object" },
                  "returnHere": { "type": "boolean" }
                },
                "description": "Optional handoff to another tool"
              }
            },
            "required": ["path"]
          },
          "result": {
            "type": "object",
            "properties": {
              "success": { "type": "boolean" },
              "error": { "type": "string" },
              "data": {
                "type": "object",
                "properties": {
                  "files": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "properties": {
                        "name": { "type": "string" },
                        "path": { "type": "string" },
                        "size": { "type": "number" },
                        "created": { "type": "number" },
                        "modified": { "type": "number" }
                      }
                    }
                  }
                }
              },
              "workspaceContext": {
                "type": "object",
                "properties": {
                  "workspaceId": { "type": "string" },
                  "workspacePath": { 
                    "type": "array", 
                    "items": { "type": "string" }
                  },
                  "activeWorkspace": { "type": "boolean" }
                }
              },
              "handoffResult": { "type": "object" }
            },
            "required": ["success"]
          }
        }
        // Other modes...
      ]
    }
    // Other tools...
  ]
}
```

## Guidance for Claude Desktop Integration

When using Claudesidian with Claude Desktop, follow these best practices:

1. **Start with Workspace Context**: Begin conversations by loading or creating a workspace
2. **Maintain Context**: Pass workspace context between operations
3. **Use Handoffs**: Chain operations together with handoffs for complex workflows
4. **Respect Boundaries**: Use the appropriate agent for each type of operation
5. **Check Results**: Handle success/error statuses appropriately

Example templates should be provided in the documentation to encourage proper usage patterns.