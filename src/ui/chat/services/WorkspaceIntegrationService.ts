/**
 * Location: /src/ui/chat/services/WorkspaceIntegrationService.ts
 *
 * Purpose: Handles workspace loading and session binding
 * Extracted from ModelAgentManager.ts to follow Single Responsibility Principle
 *
 * Used by: ModelAgentManager for workspace operations
 * Dependencies: WorkspaceService, SessionContextManager
 */

import { WorkspaceContext } from '../../../database/types/workspace/WorkspaceTypes';
import { TFile } from 'obsidian';

/**
 * Service for workspace integration with chat
 */
export class WorkspaceIntegrationService {
  constructor(private app: any) {}

  /**
   * Load workspace by ID with full context (like loadWorkspace tool)
   * This executes the LoadWorkspaceMode to get comprehensive data including file structure
   */
  async loadWorkspace(workspaceId: string): Promise<any> {
    try {
      const plugin = this.app.plugins.plugins['claudesidian-mcp'];

      // Try to get the memoryManager agent and execute LoadWorkspaceMode
      const memoryManager = plugin?.agentManager?.getAgent('memoryManager');

      if (memoryManager) {
        // Execute LoadWorkspaceMode to get comprehensive workspace data
        const result = await memoryManager.executeMode('loadWorkspace', {
          id: workspaceId,
          limit: 3 // Get recent sessions, states, and activity
        });

        if (result.success && result.data) {
          // Return the comprehensive workspace data from the tool
          return {
            id: workspaceId,
            ...result.data,
            // Keep the workspace context from the result
            workspaceContext: result.workspaceContext
          };
        }
      }

      // Fallback: just load basic workspace data if LoadWorkspaceMode fails
      const workspaceService = await plugin?.getService('workspaceService');
      if (workspaceService) {
        const workspace = await workspaceService.getWorkspace(workspaceId);
        return workspace;
      }

      return null;
    } catch (error) {
      console.error(`Error loading workspace ${workspaceId}:`, error);

      // Fallback: try basic workspace loading
      try {
        const plugin = this.app.plugins.plugins['claudesidian-mcp'];
        const workspaceService = await plugin?.getService('workspaceService');
        if (workspaceService) {
          return await workspaceService.getWorkspace(workspaceId);
        }
      } catch (fallbackError) {
        console.error(`Fallback workspace loading also failed:`, fallbackError);
      }

      return null;
    }
  }

  /**
   * Read note content from vault
   */
  async readNoteContent(notePath: string): Promise<string> {
    try {
      const file = this.app.vault.getAbstractFileByPath(notePath);

      if (file instanceof TFile) {
        const content = await this.app.vault.read(file);
        return content;
      }

      return '[File not found]';
    } catch (error) {
      return '[Error reading file]';
    }
  }

  /**
   * Bind a session to a workspace in SessionContextManager
   */
  async bindSessionToWorkspace(sessionId: string | undefined, workspaceId: string): Promise<void> {
    if (!sessionId) {
      return;
    }

    try {
      const plugin = this.app.plugins.plugins['claudesidian-mcp'];
      const sessionContextManager = await plugin.getService('sessionContextManager');

      if (sessionContextManager) {
        sessionContextManager.setWorkspaceContext(sessionId, {
          workspaceId: workspaceId,
          activeWorkspace: true
        });
      }
    } catch (error) {
      console.error('[WorkspaceIntegrationService] Failed to bind session to workspace:', error);
    }
  }
}
