/**
 * Agent Configuration for Bounded Context Tool Packs
 *
 * Location: /src/config/agentConfigs.ts
 * Purpose: Define agent descriptors for the bounded context tool discovery system
 *
 * This file contains simple agent descriptors with name and description,
 * used by the two-tier tool discovery system to expose agents to LLM providers.
 */

export interface AgentDescriptor {
  name: string;        // Agent identifier (e.g., "agentManager", "vaultLibrarian")
  description: string; // What this agent does (shown in enum description)
}

/**
 * The 6 core agents available in the Nexus plugin
 * These map directly to the agent implementations in /src/agents/
 */
export const AGENTS: AgentDescriptor[] = [
  {
    name: "agentManager",
    description: "Custom AI prompts, LLM integration, image generation, batch operations"
  },
  {
    name: "contentManager",
    description: "Note reading, editing, appending, replacing content in vault files"
  },
  {
    name: "vaultLibrarian",
    description: "Advanced search (universal, file search, directory search, memory search)"
  },
  {
    name: "vaultManager",
    description: "File/folder operations (create, move, duplicate, rename, delete)"
  },
  {
    name: "memoryManager",
    description: "Session management, workspace management, and states"
  }
  // Temporarily hidden (2025-11-06) - See /src/config/toolVisibility.ts
  // {
  //   name: "commandManager",
  //   description: "Obsidian command palette execution"
  // }
];
