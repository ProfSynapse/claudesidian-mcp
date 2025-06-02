# Claudesidian MCP Plugin - Codebase Context

## Project Overview
Claudesidian MCP is an Obsidian plugin that enables AI assistants to interact with Obsidian vaults through the Model Context Protocol (MCP). The plugin uses an Agent-Mode Architecture organizing functionality into logical domains (agents) with specific operations (modes).

## Current Issue Being Addressed
**Multi-Vault Tool Naming Conflicts**: When multiple Obsidian vaults are running simultaneously, all vaults register tools with identical names (e.g., `vaultManager`, `contentManager`), causing:
1. Tool name conflicts in Claude Desktop
2. Vault isolation breaches where disabling tools for one vault affects others

## Architecture Overview
- **Agents**: Functional domains (VaultManager, ContentManager, etc.)
- **Modes**: Specific operations within each agent
- **MCP Server**: Routes requests to appropriate agents/modes
- **Multi-Vault Support**: Each vault runs isolated MCP server with unique IPC paths

## Key Components
- `src/main.ts`: Plugin bootstrap and service initialization
- `src/connector.ts`: Agent registration and MCP communication
- `src/server.ts`: MCP server implementation with vault-specific identifiers
- `src/handlers/requestHandlers.ts`: Tool registration and execution handling
- `src/utils/vaultUtils.ts`: Vault name sanitization utilities

## Solution Implementation Status
### Changes Made:
1. ✅ Enhanced `src/utils/vaultUtils.ts` with tool name manipulation utilities
2. ✅ Updated `src/handlers/requestHandlers.ts` to use vault-specific tool names
3. ✅ Added vault identifier extraction methods to `src/server.ts`

### Expected Result:
- Tools will be named: `agentName_vaultIdentifier` (e.g., `vaultManager_my-vault`)
- Each vault will have completely isolated tool sets in Claude Desktop
- Disabling tools for one vault won't affect other vaults

## Agent Structure
- **ContentManager**: Note content operations
- **CommandManager**: Obsidian command execution  
- **ProjectManager**: Project planning and completion tracking
- **VaultManager**: File/folder operations
- **VaultLibrarian**: Search operations
- **MemoryManager**: Session and workspace memory
- **VectorManager**: Vector database operations

## Database Integration
- ChromaDB for vector storage and embeddings
- Services layer for memory, workspace management, and file events
- Multi-vault support with isolated database instances per vault
