/**
 * StateRetriever - Handles state data retrieval and validation
 * Follows Single Responsibility Principle by focusing only on state retrieval
 */

import { MemoryService } from "../services/MemoryService";
import { WorkspaceStateSnapshot } from '../../../../../../database/types/session/SessionTypes';

export interface StateRetrievalResult {
  success: boolean;
  state?: WorkspaceStateSnapshot;
  error?: string;
  metadata?: {
    workspaceId: string;
    originalSessionId: string;
    stateTimestamp: number;
    stateName: string;
    stateCreatedAt: string;
    originalSessionName: string;
  };
}

/**
 * Service responsible for retrieving and validating state data
 * Follows SRP by focusing only on state retrieval operations
 */
export class StateRetriever {
  constructor(private memoryService: MemoryService) {}

  /**
   * Retrieve and validate state data
   */
  async retrieveState(stateId: string): Promise<StateRetrievalResult> {
    try {
      // Get the state data first to provide better context and error handling
      const state = await this.memoryService.getSnapshot(stateId);
      
      if (!state) {
        return {
          success: false,
          error: `State with ID ${stateId} not found`
        };
      }

      // Store original state information for context
      const workspaceId = state.workspaceId;
      const originalSessionId = state.sessionId;
      const stateTimestamp = state.timestamp;
      const stateName = state.name;
      const stateCreatedAt = new Date(stateTimestamp || Date.now()).toLocaleString();
      
      // Try to get the original session information
      let originalSessionName = 'Unknown session';
      try {
        const originalSession = await this.memoryService.getSession(originalSessionId || '');
        if (originalSession) {
          originalSessionName = originalSession.name || 'Unnamed session';
        }
      } catch (error) {
        console.warn(`Failed to retrieve original session: ${error instanceof Error ? error.message : String(error)}`);
      }

      return {
        success: true,
        state,
        metadata: {
          workspaceId,
          originalSessionId: originalSessionId || '',
          stateTimestamp: stateTimestamp || 0,
          stateName: stateName || '',
          stateCreatedAt,
          originalSessionName
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to retrieve state: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Restore state using MemoryService
   */
  async restoreState(stateId: string): Promise<{
    success: boolean;
    restoredState?: any;
    error?: string;
  }> {
    try {
      const restoredState = await this.memoryService.restoreStateSnapshot(stateId);
      console.log(`Successfully restored state "${restoredState.name}" from workspace ${restoredState.workspaceId}`);
      
      return {
        success: true,
        restoredState
      };
    } catch (error) {
      console.error(`Failed to restore state: ${error instanceof Error ? error.message : String(error)}`);
      
      return {
        success: false,
        error: `Failed to restore state: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Get all states for workspace to build continuity history
   */
  async getWorkspaceStateHistory(workspaceId: string): Promise<{
    success: boolean;
    states?: WorkspaceStateSnapshot[];
    continuationHistory?: Array<{ timestamp: number; description: string }>;
    error?: string;
  }> {
    try {
      const historyStates = await this.memoryService.getSnapshots(workspaceId);
      
      // Sort by timestamp
      historyStates.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
      
      // Build history timeline
      const continuationHistory = historyStates.map(snap => ({
        timestamp: snap.timestamp || 0,
        description: `State: "${snap.name}"`
      }));
      
      return {
        success: true,
        states: historyStates,
        continuationHistory
      };
    } catch (error) {
      console.warn(`Failed to build state history: ${error instanceof Error ? error.message : String(error)}`);
      
      return {
        success: false,
        error: `Failed to build state history: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}