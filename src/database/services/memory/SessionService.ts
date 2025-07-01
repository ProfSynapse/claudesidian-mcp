import { Plugin } from 'obsidian';
import { WorkspaceSession } from '../../workspace-types';
import { SessionCollection } from '../../collections/SessionCollection';
import { DatabaseMaintenanceService } from './DatabaseMaintenanceService';
import { getErrorMessage } from '../../../utils/errorUtils';
import { generateSessionId } from '../../../utils/sessionUtils';

export interface SessionDeletionOptions {
  deleteMemoryTraces?: boolean;
  deleteSnapshots?: boolean;
}

export interface SessionDeletionResult {
  session: boolean;
  tracesDeleted: number;
  snapshotsDeleted: number;
}

/**
 * Service responsible for managing workspace sessions.
 * Handles session lifecycle, workspace associations, and auto-creation logic.
 * 
 * @remarks
 * This service follows the Single Responsibility Principle by focusing
 * solely on session management operations. It provides intelligent
 * auto-creation logic and proper workspace association for sessions.
 */
export class SessionService {
  /**
   * Creates a new SessionService instance
   * @param plugin - Obsidian plugin instance
   * @param sessions - Session collection
   * @param maintenanceService - Service for database maintenance
   */
  constructor(
    private readonly plugin: Plugin,
    private readonly sessions: SessionCollection,
    private readonly maintenanceService: DatabaseMaintenanceService,
    private memoryTraceService?: any, // Will be injected later to avoid circular dependency
    private snapshotService?: any // Will be injected later to avoid circular dependency
  ) {}

  /**
   * Set the memory trace service for cross-service operations
   * @param memoryTraceService - Memory trace service instance
   */
  setMemoryTraceService(memoryTraceService: any): void {
    this.memoryTraceService = memoryTraceService;
  }

  /**
   * Set the snapshot service for cross-service operations
   * @param snapshotService - Snapshot service instance
   */
  setSnapshotService(snapshotService: any): void {
    this.snapshotService = snapshotService;
  }

  /**
   * Create a new session with database size enforcement
   * @param session - Session data excluding ID
   * @returns Promise resolving to the created session
   */
  async createSession(session: Omit<WorkspaceSession, 'id'>): Promise<WorkspaceSession> {
    // Enforce database size limits before adding new data
    await this.maintenanceService.enforceDbSizeLimit();
    
    return this.sessions.createSession(session);
  }

  /**
   * Update an existing session with partial data
   * @param id - Session ID
   * @param updates - Partial session data to update
   * @returns Promise that resolves when update is complete
   */
  async updateSession(id: string, updates: Partial<WorkspaceSession>): Promise<void> {
    await this.sessions.update(id, updates);
  }

  /**
   * Get a session by ID with intelligent auto-creation logic.
   * If the session doesn't exist and auto-creation is enabled,
   * creates a new session with proper workspace association.
   * 
   * @param id - Session ID
   * @param autoCreate - Whether to auto-create the session if it doesn't exist
   * @returns Promise resolving to the session or undefined if not found and not auto-created
   * 
   * @remarks
   * Auto-creation logic:
   * - Attempts to get the most recently accessed workspace
   * - Falls back to creating a default workspace if none exists
   * - Uses sensible defaults for session properties
   * 
   * @example
   * ```typescript
   * // Get existing session or auto-create with default workspace
   * const session = await sessionService.getSession('session-123', true);
   * 
   * // Get existing session only (no auto-creation)
   * const existingSession = await sessionService.getSession('session-123', false);
   * ```
   */
  async getSession(id: string, autoCreate = true): Promise<WorkspaceSession | undefined> {
    try {
      // Try to get the existing session
      const session = await this.sessions.get(id);
      
      // If session exists, return it
      if (session) {
        return session;
      }
      
      // If auto-create is disabled or no ID was provided, return undefined
      if (!autoCreate || !id) {
        return undefined;
      }
      
      // Session doesn't exist and auto-create is enabled, create a new one
      console.log(`Auto-creating session with ID: ${id}`);
      
      // Try to get the default workspace
      let workspaceId: string;
      try {
        const plugin = this.plugin as any;
        const workspaceService = plugin.services?.workspaceService;
        
        if (workspaceService) {
          const workspaces = await workspaceService.getWorkspaces({ 
            sortBy: 'lastAccessed', 
            sortOrder: 'desc', 
          });
          
          if (workspaces && workspaces.length > 0) {
            workspaceId = workspaces[0].id;
          } else {
            // Create a default workspace if none exists
            const defaultWorkspace = await workspaceService.createWorkspace({
              name: 'Default Workspace',
              description: 'Automatically created default workspace',
              rootFolder: '/',
              hierarchyType: 'workspace',
              created: Date.now(),
              lastAccessed: Date.now(),
              childWorkspaces: [],
              path: [],
              relatedFolders: [],
              relevanceSettings: {
                folderProximityWeight: 0.5,
                recencyWeight: 0.7,
                frequencyWeight: 0.3
              },
              activityHistory: [],
              completionStatus: {},
              status: 'active'
            });
            workspaceId = defaultWorkspace.id;
          }
        } else {
          // No workspace service, use a default ID
          workspaceId = 'default-workspace';
        }
      } catch (error) {
        // Fallback to a default workspace ID
        console.warn(`Error getting default workspace: ${getErrorMessage(error)}`);
        workspaceId = 'default-workspace';
      }
      
      // Create a session object but pass the id parameter separately
      // Since createSession expects Omit<WorkspaceSession, "id">, we can't include id directly
      const sessionData = {
        workspaceId: workspaceId,
        name: `Session ${new Date().toLocaleString()}`,
        description: 'Auto-created session',
        startTime: Date.now(),
        isActive: true,
        toolCalls: 0
      };
      
      // The createSession method will handle the id correctly
      const newSession = await this.sessions.createSession({
        ...sessionData,
        id: id || generateSessionId() // This is handled properly by SessionCollection
      });
      
      return newSession;
    } catch (error) {
      console.error(`Error in getSession: ${getErrorMessage(error)}`);
      return undefined;
    }
  }

  /**
   * Get sessions for a specific workspace
   * @param workspaceId - Workspace identifier
   * @param activeOnly - Whether to only return active sessions
   * @returns Promise resolving to array of sessions
   */
  async getSessions(workspaceId: string, activeOnly?: boolean): Promise<WorkspaceSession[]> {
    return this.sessions.getSessionsByWorkspace(workspaceId, activeOnly);
  }

  /**
   * Get all currently active sessions across all workspaces
   * @returns Promise resolving to array of active sessions
   */
  async getActiveSessions(): Promise<WorkspaceSession[]> {
    return this.sessions.getActiveSessions();
  }

  /**
   * End an active session by setting it to inactive and adding optional summary
   * @param id - Session ID
   * @param summary - Optional session summary
   * @returns Promise that resolves when session is ended
   */
  async endSession(id: string, summary?: string): Promise<void> {
    await this.sessions.endSession(id, summary);
  }

  /**
   * Get all sessions with optional filtering by active status
   * @param activeOnly - Whether to only return active sessions
   * @returns Promise resolving to array of sessions
   */
  async getAllSessions(activeOnly = false): Promise<WorkspaceSession[]> {
    if (activeOnly) {
      return this.sessions.getActiveSessions();
    }
    
    // Get all sessions without filtering
    return this.sessions.getAll({});
  }

  /**
   * Delete a session and optionally its associated data.
   * Provides cascading deletion options for related memory traces and snapshots.
   * 
   * @param sessionId - Session ID to delete
   * @param options - Deletion options for related data
   * @returns Promise resolving to deletion statistics
   * @throws Error if session is not found or deletion fails
   * 
   * @example
   * ```typescript
   * // Delete session and all associated data
   * const result = await sessionService.deleteSession('session-123', {
   *   deleteMemoryTraces: true,
   *   deleteSnapshots: true
   * });
   * console.log(`Deleted ${result.tracesDeleted} traces and ${result.snapshotsDeleted} snapshots`);
   * ```
   */
  async deleteSession(sessionId: string, options?: SessionDeletionOptions): Promise<SessionDeletionResult> {
    try {
      // Get the session to verify it exists
      const session = await this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session with ID ${sessionId} not found`);
      }

      // Track deletion stats
      let tracesDeleted = 0;
      let snapshotsDeleted = 0;

      // If requested, delete associated memory traces
      if (options?.deleteMemoryTraces && this.memoryTraceService) {
        tracesDeleted = await this.memoryTraceService.deleteMemoryTracesBySession(sessionId);
      }

      // If requested, delete associated snapshots
      if (options?.deleteSnapshots && this.snapshotService) {
        // Get snapshots for this session
        const snapshots = await this.snapshotService.getSnapshotsBySession(sessionId);
        
        // Delete each snapshot
        const deletePromises = snapshots.map((snapshot: any) => 
          this.snapshotService.deleteSnapshot(snapshot.id)
        );
        await Promise.all(deletePromises);
        
        snapshotsDeleted = snapshots.length;
      }

      // Delete the session itself
      await this.sessions.delete(sessionId);

      return {
        session: true,
        tracesDeleted,
        snapshotsDeleted
      };
    } catch (error) {
      console.error(`Failed to delete session ${sessionId}:`, error);
      throw new Error(`Failed to delete session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Increment the tool call count for a session
   * @param sessionId - Session ID
   * @returns Promise that resolves when count is incremented
   */
  async incrementToolCalls(sessionId: string): Promise<void> {
    await this.sessions.incrementToolCalls(sessionId);
  }

  /**
   * Get the underlying session collection
   * @returns Session collection instance
   * @deprecated Use the service methods instead of accessing collection directly
   */
  getCollection(): SessionCollection {
    return this.sessions;
  }
}