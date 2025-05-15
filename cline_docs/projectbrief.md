# Project Brief: Chatsidian MCP Refactor

## 1. Project Goal

Refactor the existing Chatsidian Obsidian plugin to utilize a modular architecture based on Bounded Context Packs (BCPs) and the Model Context Protocol (MCP). The primary aim is to improve maintainability, extensibility, and separation of concerns within the plugin's codebase.

## 2. Core Requirements

*   **BCP Architecture:** Decompose the plugin's functionality into distinct Bounded Context Packs (BCPs), each responsible for a specific domain (e.g., Notes, Vault, Palette, Project).
*   **MCP Integration:** Implement an MCP layer (`MCPClient`) responsible for dynamically discovering, loading, and managing BCPs and their associated tools.
*   **Dynamic Tool Execution:** Enable the execution of tools defined within BCPs, providing necessary context (Obsidian `App`, `StorageManager`, `EventEmitter`, etc.) to the tool handlers via an injection mechanism.
*   **Event-Driven Communication:** Utilize an `EventEmitter` for decoupled communication between core services and BCPs.
*   **Abstracted Storage:** Employ a `StorageManager` with adapters (initially `ObsidianStorageAdapter`) for persistent storage needs.
*   **Phased Implementation:** Execute the refactoring in distinct phases:
    1.  Core Infrastructure (Complete)
    2.  Chat Interface (Partially Stubbed)
    3.  MCP Integration & BCP Loading (Current Focus)
    4.  Settings & Configuration
    5.  BCP Implementation (Tool Handlers)

## 3. Scope

*   Refactor existing functionality into the new BCP/MCP architecture.
*   Implement the core infrastructure (`EventEmitter`, `StorageManager`, `Plugin` lifecycle).
*   Implement the `MCPClient` for BCP management and tool execution.
*   Define placeholder BCP structures.
*   Update the Chat interface to interact with the `MCPClient`.
*   Implement settings management.
*   (Future) Implement the actual logic within BCP tool handlers.

## 4. Success Criteria

*   Core infrastructure is stable and functional.
*   BCPs can be dynamically loaded and unloaded.
*   Tools defined in BCPs can be discovered and executed via the `MCPClient`.
*   Necessary context is successfully injected into BCP tool handlers.
*   The chat interface correctly utilizes the `MCPClient` to execute tools.
*   The plugin remains functional throughout and after the refactoring process.
*   The codebase is significantly more modular and easier to maintain.
