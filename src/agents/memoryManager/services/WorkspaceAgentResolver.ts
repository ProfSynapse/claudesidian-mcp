/**
 * Location: /src/agents/memoryManager/services/WorkspaceAgentResolver.ts
 * Purpose: Resolves agent information from workspaces
 *
 * This service handles looking up agent data associated with workspaces,
 * supporting both ID-based and name-based agent lookup with backward
 * compatibility for legacy workspace structures.
 *
 * Used by: LoadWorkspaceMode for resolving workspace agents
 * Integrates with: CustomPromptStorageService via AgentManager
 *
 * Responsibilities:
 * - Resolve workspace agent from dedicatedAgent or legacy agents array
 * - Fetch agent data by ID (preferred method)
 * - Fetch agent data by name (legacy fallback)
 */

import { ProjectWorkspace } from '../../../database/types/workspace/WorkspaceTypes';

/**
 * Agent information returned from resolution operations
 */
export interface AgentInfo {
  id: string;
  name: string;
  systemPrompt: string;
}

/**
 * Service for resolving workspace agents
 * Implements Single Responsibility Principle - only handles agent resolution
 */
export class WorkspaceAgentResolver {
  /**
   * Fetch workspace agent data if available
   * Handles both new dedicatedAgent structure and legacy agents array
   * @param workspace The workspace to fetch agent from
   * @param app The Obsidian app instance
   * @returns Agent info or null if not available
   */
  async fetchWorkspaceAgent(
    workspace: ProjectWorkspace,
    app: any
  ): Promise<AgentInfo | null> {
    try {
      // Check if workspace has a dedicated agent
      if (!workspace.context?.dedicatedAgent) {
        // Fall back to legacy agents array for backward compatibility
        const legacyAgents = (workspace.context as any)?.agents;
        if (legacyAgents && Array.isArray(legacyAgents) && legacyAgents.length > 0) {
          const legacyAgentRef = legacyAgents[0];
          if (legacyAgentRef && legacyAgentRef.name) {
            return await this.fetchAgentByName(legacyAgentRef.name, app);
          }
        }
        return null;
      }

      // Use the new dedicated agent structure
      const { agentId, agentName } = workspace.context.dedicatedAgent;
      return await this.fetchAgentById(agentId, agentName, app);

    } catch (error) {
      console.warn('[WorkspaceAgentResolver] Failed to fetch workspace agent:', error);
      return null;
    }
  }

  /**
   * Fetch agent by ID (preferred method)
   * @param agentId The agent ID
   * @param agentName The agent name (for logging)
   * @param app The Obsidian app instance
   * @returns Agent info or null if not found
   */
  async fetchAgentById(
    agentId: string,
    agentName: string,
    app: any
  ): Promise<AgentInfo | null> {
    try {
      // Get CustomPromptStorageService through plugin's agentManager
      const plugin = app.plugins.getPlugin('claudesidian-mcp') as any;
      if (!plugin || !plugin.agentManager) {
        console.warn('[WorkspaceAgentResolver] AgentManager not available');
        return null;
      }

      const agentManagerAgent = plugin.agentManager.getAgent('agentManager');
      if (!agentManagerAgent || !agentManagerAgent.storageService) {
        console.warn('[WorkspaceAgentResolver] AgentManagerAgent or storage service not available');
        return null;
      }

      // Fetch agent by ID (more reliable)
      const agent = agentManagerAgent.storageService.getPromptById(agentId);
      if (!agent) {
        console.warn(`[WorkspaceAgentResolver] Agent with ID '${agentId}' not found in storage`);
        return null;
      }

      return {
        id: agent.id,
        name: agent.name,
        systemPrompt: agent.prompt
      };

    } catch (error) {
      console.warn(`[WorkspaceAgentResolver] Failed to fetch agent by ID '${agentId}':`, error);
      return null;
    }
  }

  /**
   * Fetch agent by name (legacy fallback)
   * @param agentName The agent name
   * @param app The Obsidian app instance
   * @returns Agent info or null if not found
   */
  async fetchAgentByName(
    agentName: string,
    app: any
  ): Promise<AgentInfo | null> {
    try {
      // Get CustomPromptStorageService through plugin's agentManager
      const plugin = app.plugins.getPlugin('claudesidian-mcp') as any;
      if (!plugin || !plugin.agentManager) {
        console.warn('[WorkspaceAgentResolver] AgentManager not available');
        return null;
      }

      const agentManagerAgent = plugin.agentManager.getAgent('agentManager');
      if (!agentManagerAgent || !agentManagerAgent.storageService) {
        console.warn('[WorkspaceAgentResolver] AgentManagerAgent or storage service not available');
        return null;
      }

      // Fetch agent by name (legacy method)
      const agent = agentManagerAgent.storageService.getPromptByName(agentName);
      if (!agent) {
        console.warn(`[WorkspaceAgentResolver] Agent '${agentName}' not found in storage`);
        return null;
      }

      return {
        id: agent.id,
        name: agent.name,
        systemPrompt: agent.prompt
      };

    } catch (error) {
      console.warn(`[WorkspaceAgentResolver] Failed to fetch agent by name '${agentName}':`, error);
      return null;
    }
  }
}
