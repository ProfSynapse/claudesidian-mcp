# Product Context: Chatsidian MCP Refactor

## 1. Problem Solved

The original Chatsidian plugin, while functional, likely suffered from tight coupling and monolithic design. This makes it:
*   Difficult to add new features or integrate new AI models/tools without impacting unrelated parts of the codebase.
*   Harder to test individual components in isolation.
*   Challenging for new developers to understand the system's flow and contribute effectively.
*   Less resilient, as errors in one area could potentially affect the entire plugin.

## 2. Project Purpose

This refactoring effort aims to address the limitations of the original design by introducing a modular, extensible, and maintainable architecture based on Bounded Context Packs (BCPs) and the Model Context Protocol (MCP).

The key goals are:
*   **Modularity:** Encapsulate distinct functionalities (interacting with notes, vault operations, command palette integration, project management) into self-contained BCPs.
*   **Extensibility:** Allow new capabilities (BCPs, tools, AI integrations) to be added easily without requiring significant changes to the core system.
*   **Maintainability:** Improve code clarity, reduce complexity, and make it easier to debug and update the plugin over time.
*   **Separation of Concerns:** Clearly delineate responsibilities between the core plugin infrastructure, the MCP layer managing BCPs/tools, the chat interface, and the individual BCPs providing specific functionalities.

## 3. User Experience Goals

While primarily an architectural refactor, the goal is to maintain or improve the end-user experience:
*   **Seamless Functionality:** Users should not experience disruptions or regressions in existing features.
*   **Potential for New Features:** The new architecture should facilitate the easier integration of new tools and capabilities requested by users.
*   **Improved Performance/Stability:** A cleaner architecture may lead to indirect improvements in performance and stability.
