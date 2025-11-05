/**
 * Location: /src/agents/memoryManager/services/WorkspaceDataFetcher.ts
 * Purpose: Fetches sessions and states data for workspaces
 *
 * This service handles fetching and filtering workspace-related data
 * including sessions and state snapshots from the memory service.
 *
 * Used by: LoadWorkspaceMode for retrieving workspace sessions and states
 * Integrates with: MemoryService for data access
 *
 * Responsibilities:
 * - Fetch workspace sessions with defensive validation
 * - Fetch workspace states with defensive validation
 * - Filter data to ensure workspace isolation
 */

/**
 * Session summary returned from fetch operations
 */
export interface SessionSummary {
  id: string;
  name: string;
  description?: string;
  created: number;
  workspaceId?: string;
}

/**
 * State summary returned from fetch operations
 */
export interface StateSummary {
  id: string;
  name: string;
  description?: string;
  sessionId: string;
  created: number;
  tags?: string[];
  workspaceId?: string;
}

/**
 * Service for fetching workspace sessions and states
 * Implements Single Responsibility Principle - only handles data fetching
 */
export class WorkspaceDataFetcher {
  /**
   * Fetch sessions for a workspace with defensive filtering
   * @param workspaceId The workspace ID
   * @param memoryService The memory service instance
   * @returns Array of session summaries
   */
  async fetchWorkspaceSessions(
    workspaceId: string,
    memoryService: any
  ): Promise<SessionSummary[]> {
    try {
      if (!memoryService) {
        return [];
      }

      // Validate workspace ID
      if (!workspaceId || workspaceId === 'unknown') {
        console.warn('[WorkspaceDataFetcher] Invalid workspace ID for session fetching');
        return [];
      }

      const sessions = await memoryService.getSessions(workspaceId);

      // Defensive validation: ensure all sessions belong to workspace
      const validSessions = sessions.filter((session: any) =>
        session.workspaceId === workspaceId
      );

      if (validSessions.length !== sessions.length) {
        console.error(
          `[WorkspaceDataFetcher] Database filtering failed! Retrieved ${sessions.length} sessions, ` +
          `only ${validSessions.length} belong to workspace ${workspaceId}`
        );
      }

      return validSessions.map((session: any) => ({
        id: session.id,
        name: session.name,
        description: session.description,
        created: session.startTime,
        workspaceId: session.workspaceId // Include for validation
      }));

    } catch (error) {
      console.error('[WorkspaceDataFetcher] Failed to fetch workspace sessions:', error);
      return [];
    }
  }

  /**
   * Fetch states for a workspace with defensive filtering
   * @param workspaceId The workspace ID
   * @param memoryService The memory service instance
   * @returns Array of state summaries
   */
  async fetchWorkspaceStates(
    workspaceId: string,
    memoryService: any
  ): Promise<StateSummary[]> {
    try {
      if (!memoryService) {
        return [];
      }

      // Validate workspace ID
      if (!workspaceId || workspaceId === 'unknown') {
        console.warn('[WorkspaceDataFetcher] Invalid workspace ID for state fetching');
        return [];
      }

      const states = await memoryService.getStateSnapshots(workspaceId);

      // Defensive validation: ensure all states belong to workspace
      const validStates = states.filter((state: any) =>
        state.workspaceId === workspaceId
      );

      if (validStates.length !== states.length) {
        console.error(
          `[WorkspaceDataFetcher] Filtered ${states.length - validStates.length} ` +
          `cross-workspace states`
        );
      }

      return validStates.map((state: any) => ({
        id: state.id,
        name: state.name,
        description: state.description,
        sessionId: state.sessionId,
        created: state.created || state.timestamp,
        tags: state.state?.metadata?.tags || [],
        workspaceId: state.workspaceId // Include for validation
      }));

    } catch (error) {
      console.error('[WorkspaceDataFetcher] Failed to fetch workspace states:', error);
      return [];
    }
  }
}
