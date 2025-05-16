# Workspace Sessions and State Management

This document outlines the session-based workspace implementation and state persistence in Claudesidian MCP.

## Overview

The session-based system enables:
1. Tracking related tool calls within a session
2. Creating workspace state snapshots for later restoration
3. Automatically propagating session context between tool calls

## Key Components

### 1. Data Model Extensions

The workspace types have been extended to include:

- **WorkspaceSession**: Tracks a sequence of tool calls within a workspace
  - ID, name, description, timestamps, activity count, etc.
  - Sessions can be active or completed
  
- **WorkspaceStateSnapshot**: Captures the complete state of a workspace
  - Includes workspace data, recent tool activities, and context files
  - Allows restoring to a specific point in time

### 2. Tool Call Tracking

Tool calls are now tracked with:
- Session ID assignment (automatic or manual)
- Sequence numbers within a session
- Activity recording in session context

### 3. Automatic Session Management

The system automatically:
- Creates sessions when needed for workspace operations
- Maintains session continuity across tool calls
- Propagates session ID through handoffs to other tools

### 4. Parameter Schema Enhancements

All tool schemas now include:
- `workspaceContext.sessionId`: Track related tool calls
- `workspaceContext.contextDepth`: Control context inclusion level

## New Capabilities

### Creating Sessions

```json
{
  "agent": "projectManager",
  "mode": "createSession",
  "params": {
    "name": "My coding session",
    "description": "Working on feature X",
    "workspaceContext": {
      "workspaceId": "ws123"
    }
  }
}
```

### Creating State Snapshots

```json
{
  "agent": "projectManager",
  "mode": "createSnapshot",
  "params": {
    "name": "Before refactoring",
    "workspaceContext": {
      "workspaceId": "ws123",
      "sessionId": "sess456"
    }
  }
}
```

### Restoring State

```json
{
  "agent": "projectManager",
  "mode": "restoreSnapshot",
  "params": {
    "snapshotId": "snap789"
  }
}
```

### Session-Aware Semantic Search

```json
{
  "agent": "vaultLibrarian",
  "mode": "semanticSearch",
  "params": {
    "query": "embedding example",
    "workspaceContext": {
      "workspaceId": "ws123",
      "sessionId": "sess456" 
    }
  }
}
```

## Implementation Details

1. **Session Tracking**: 
   - The `ToolActivityEmbedder` maintains session state
   - `activeSessions` maps workspaceId → current sessionId
   - `sequenceCounts` tracks ordering within sessions

2. **Schema Propagation**:
   - All mode schemas include session parameters
   - Context is preserved through handoffs
   - Default values applied when not specified

3. **Automatic Session Creation**:
   - ProjectManager handles auto-creation of sessions
   - Each workspace operation can trigger session creation when needed

4. **State Persistence**:
   - Implemented in IndexedDB with dedicated object stores
   - Sessions and snapshots are stored separately from workspaces
   - Cross-references maintain relational integrity