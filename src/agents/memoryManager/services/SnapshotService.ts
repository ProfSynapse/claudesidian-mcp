import { Plugin } from 'obsidian';
import { WorkspaceStateSnapshot } from '../../../database/workspace-types';
import { WorkspaceContext } from '../../../database/types/workspace/WorkspaceTypes';
import { SnapshotCollection } from '../../../database/collections/SnapshotCollection';

export interface ContextSnapshotData {
  workspace?: any;
  recentTraces?: string[];
  contextFiles?: string[];
  metadata?: Record<string, any>;
}

export interface RestoredStateInfo {
  stateId: string;
  name: string;
  workspaceId: string;
  sessionId: string;
  sessionName?: string;
  timestamp: number;
  recentTraces: string[];
  contextFiles: string[];
  workspace: any;
  metadata: Record<string, any>;
}

/**
 * Service responsible for managing workspace state snapshots.
 * Handles snapshot creation, retrieval, restoration, and context management.
 * 
 * @remarks
 * This service follows the Single Responsibility Principle by focusing
 * solely on snapshot operations. It provides intelligent context gathering
 * and state restoration capabilities for workspace state management.
 */
export class SnapshotService {
  /**
   * Creates a new SnapshotService instance
   * @param plugin - Obsidian plugin instance
   * @param snapshots - Snapshot collection
   */
  constructor(
    private readonly plugin: Plugin,
    private readonly snapshots: SnapshotCollection,
    private memoryTraceService?: any // Will be injected later to avoid circular dependency
  ) {}

  /**
   * Set the memory trace service for cross-service operations
   * @param memoryTraceService - Memory trace service instance
   */
  setMemoryTraceService(memoryTraceService: any): void {
    this.memoryTraceService = memoryTraceService;
  }

  /**
   * Create a workspace state snapshot
   * @param snapshot - Snapshot data excluding ID
   * @returns Promise resolving to the created snapshot
   */
  async createSnapshot(snapshot: Omit<WorkspaceStateSnapshot, 'id'>): Promise<WorkspaceStateSnapshot> {
    return this.snapshots.createSnapshot(snapshot);
  }

  /**
   * Get a snapshot by its ID
   * @param id - Snapshot ID
   * @returns Promise resolving to the snapshot or undefined if not found
   */
  async getSnapshot(id: string): Promise<WorkspaceStateSnapshot | undefined> {
    return this.snapshots.get(id);
  }

  /**
   * Get snapshots with mandatory workspace filtering for security.
   * Ensures cross-workspace data isolation by requiring workspace context.
   * 
   * @param workspaceId - Required workspace ID for security isolation
   * @param sessionId - Optional session ID filter within workspace
   * @returns Promise resolving to array of snapshots filtered by workspace
   * 
   * @remarks
   * Security-first filter behavior:
   * - Workspace context is mandatory - prevents cross-workspace data leakage
   * - If sessionId provided: Returns session snapshots within specified workspace
   * - If only workspaceId provided: Returns all workspace snapshots
   * - Invalid workspace context results in empty array and warning
   * 
   * @example
   * ```typescript
   * // Get all snapshots for a workspace
   * const workspaceSnapshots = await snapshotService.getSnapshots('workspace-456');
   * 
   * // Get workspace snapshots for a specific session
   * const filteredSnapshots = await snapshotService.getSnapshots('workspace-456', 'session-123');
   * ```
   */
  async getSnapshots(workspaceId?: string, sessionId?: string): Promise<WorkspaceStateSnapshot[]> {
    try {
      // Validate workspace context - security requirement
      const validatedWorkspaceId = this.validateWorkspaceContext(workspaceId, 'getSnapshots');
      
      if (sessionId) {
        // Both session and workspace provided - use enhanced collection method
        const sessionSnapshots = await this.snapshots.getSnapshotsBySession(sessionId, validatedWorkspaceId);
        return this.validateWorkspaceResults(sessionSnapshots, validatedWorkspaceId, 'getSnapshots[session]');
      } else {
        // Only workspace provided - use existing workspace method
        const workspaceSnapshots = await this.snapshots.getSnapshotsByWorkspace(validatedWorkspaceId);
        return this.validateWorkspaceResults(workspaceSnapshots, validatedWorkspaceId, 'getSnapshots[workspace]');
      }
    } catch (error) {
      console.error('[SnapshotService] Error retrieving snapshots:', error);
      return [];
    }
  }

  /**
   * Get snapshots for a specific session with error handling
   * @param sessionId - Session ID
   * @returns Promise resolving to array of snapshots
   * 
   * @remarks
   * This method provides additional error handling and graceful degradation
   * compared to the generic getSnapshots method.
   */
  async getSnapshotsBySession(sessionId: string): Promise<WorkspaceStateSnapshot[]> {
    try {
      return this.snapshots.getSnapshotsBySession(sessionId);
    } catch (error) {
      console.error(`Error retrieving snapshots for session ${sessionId}:`, error);
      // Return empty array instead of throwing to avoid breaking UI
      return [];
    }
  }

  /**
   * Delete a snapshot by its ID
   * @param id - Snapshot ID
   * @returns Promise that resolves when deletion is complete
   */
  async deleteSnapshot(id: string): Promise<void> {
    await this.snapshots.delete(id);
  }

  /**
   * Update an existing snapshot with partial data
   * @param id - Snapshot ID
   * @param updates - Partial snapshot data to update
   * @returns Promise that resolves when update is complete
   * @throws Error if update fails
   */
  async updateSnapshot(id: string, updates: Partial<WorkspaceStateSnapshot>): Promise<void> {
    try {
      await this.snapshots.update(id, updates);
    } catch (error) {
      console.error(`Failed to update snapshot ${id}:`, error);
      throw new Error(`Failed to update snapshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a context-aware state snapshot with intelligent data gathering.
   * Automatically gathers workspace data and recent traces if not provided.
   * 
   * @param workspaceId - Workspace ID
   * @param sessionId - Session ID
   * @param name - Human-readable snapshot name
   * @param description - Optional snapshot description
   * @param context - Optional pre-gathered context data
   * @returns Promise resolving to the ID of the created snapshot
   * @throws Error if workspace is not found
   * 
   * @example
   * ```typescript
   * const snapshotId = await snapshotService.createContextSnapshot(
   *   'workspace-123',
   *   'session-456',
   *   'Pre-refactoring state',
   *   'State before starting the authentication module refactoring',
   *   {
   *     contextFiles: ['auth.ts', 'user.model.ts'],
   *     metadata: { refactoringTarget: 'authentication' }
   *   }
   * );
   * ```
   */
  async createContextSnapshot(
    workspaceId: string,
    sessionId: string,
    name: string,
    description?: string,
    context?: ContextSnapshotData
  ): Promise<string> {
    // Get workspace data - use provided context or create minimal workspace to avoid circular dependency
    const workspace = context?.workspace || {
      id: workspaceId,
      name: 'Default Workspace',
      description: 'Auto-created workspace for snapshot',
      created: Date.now(),
      lastAccessed: Date.now(),
      rootFolder: '/'
    };
    
    if (!workspace) {
      throw new Error(`Workspace with ID ${workspaceId} not found`);
    }
    
    // Get recent traces if not provided
    let recentTraces = context?.recentTraces || [];
    if (recentTraces.length === 0 && this.memoryTraceService) {
      const traces = await this.memoryTraceService.getMemoryTraces(workspaceId, 20);
      recentTraces = traces.map((t: any) => t.id);
    }
    
    // Create snapshot
    const now = Date.now();
    const snapshot = await this.createSnapshot({
      workspaceId,
      sessionId,
      timestamp: now,
      name,
      description,
      created: now,
      snapshot: {
        workspaceContext: {
          purpose: 'Manual state save',
          currentGoal: 'Save current workspace state',
          status: 'Saving state',
          workflows: [],
          keyFiles: [{
            category: 'Manual Save',
            files: {}
          }],
          preferences: [],
          agents: [],
        } as WorkspaceContext,
        conversationContext: description || 'Manual state save',
        activeTask: 'State save operation',
        activeFiles: context?.contextFiles || [],
        nextSteps: [],
        reasoning: description || 'Manual state save'
      },
      state: {
        workspace,
        recentTraces,
        contextFiles: context?.contextFiles || [],
        metadata: context?.metadata || {}
      }
    });
    
    return snapshot.id;
  }

  /**
   * Restore a state snapshot and return comprehensive state information.
   * Provides detailed information about the restored state including
   * session metadata and context data.
   * 
   * @param stateId - ID of the state to restore
   * @returns Promise resolving to restored state information
   * @throws Error if snapshot is not found or restoration fails
   * 
   * @example
   * ```typescript
   * const restoredState = await snapshotService.restoreStateSnapshot('snapshot-123');
   * console.log(`Restored state "${restoredState.name}" from ${new Date(restoredState.timestamp)}`);
   * console.log(`Context files: ${restoredState.contextFiles.join(', ')}`);
   * ```
   */
  async restoreStateSnapshot(stateId: string): Promise<RestoredStateInfo> {
    try {
      // Get the state snapshot
      const snapshot = await this.getSnapshot(stateId);
      if (!snapshot) {
        throw new Error(`State snapshot with ID ${stateId} not found`);
      }

      // Get information about the source session
      let sessionName: string | undefined;
      try {
        // Use injected memoryTraceService instead of accessing plugin.services to avoid circular dependency
        if (this.memoryTraceService) {
          const sourceSession = await this.memoryTraceService.getSession(snapshot.sessionId);
          if (sourceSession) {
            sessionName = sourceSession.name;
          }
        }
      } catch (error) {
        console.warn(`Failed to retrieve source session name: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Return the state data
      return {
        stateId: snapshot.id,
        name: snapshot.name || '',
        workspaceId: snapshot.workspaceId,
        sessionId: snapshot.sessionId || '',
        sessionName,
        timestamp: snapshot.timestamp || 0,
        recentTraces: snapshot.state?.recentTraces || [],
        contextFiles: snapshot.state?.contextFiles || [],
        workspace: snapshot.state?.workspace || {},
        metadata: snapshot.state?.metadata || {}
      };
    } catch (error) {
      console.error(`Failed to restore state snapshot ${stateId}:`, error);
      throw new Error(`Failed to restore state snapshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate workspace context to prevent security violations
   * @param workspaceId - Workspace ID to validate
   * @param operation - Operation name for logging
   * @returns Validated workspace ID
   * @throws Error if workspace context is invalid
   * @private
   */
  private validateWorkspaceContext(workspaceId: string | undefined, operation: string): string {
    if (!workspaceId || workspaceId === 'unknown' || workspaceId.trim() === '') {
      console.error(`[SnapshotService] ${operation} called without valid workspace context - security risk`);
      throw new Error(`Workspace context required for ${operation}`);
    }
    return workspaceId;
  }

  /**
   * Validate that results contain only workspace-scoped data
   * @param results - Results to validate
   * @param expectedWorkspaceId - Expected workspace ID
   * @param operation - Operation name for logging
   * @returns Filtered results with only valid workspace data
   * @private
   */
  private validateWorkspaceResults<T extends { workspaceId: string }>(
    results: T[], 
    expectedWorkspaceId: string, 
    operation: string
  ): T[] {
    const invalidResults = results.filter(r => r.workspaceId !== expectedWorkspaceId);
    
    if (invalidResults.length > 0) {
      console.error(`[SnapshotService] ${operation} returned ${invalidResults.length} cross-workspace results - filtering`);
      return results.filter(r => r.workspaceId === expectedWorkspaceId);
    }
    
    return results;
  }

  /**
   * Get the underlying snapshot collection
   * @returns Snapshot collection instance
   * @deprecated Use the service methods instead of accessing collection directly
   */
  getCollection(): SnapshotCollection {
    return this.snapshots;
  }
}