// Location: src/agents/memoryManager/services/MemoryService.ts
// Agent-specific memory management service that delegates to WorkspaceService
// Used by: MemoryManager agent modes for memory operations
// Dependencies: WorkspaceService for all data access

import { Plugin } from 'obsidian';
import { WorkspaceService } from '../../../services/WorkspaceService';
import { WorkspaceMemoryTrace, WorkspaceSession, WorkspaceStateSnapshot } from '../../../database/workspace-types';

/**
 * MemoryService provides agent-specific logic for memory management
 * All data access is delegated to the centralized WorkspaceService
 */
export class MemoryService {
  constructor(
    private plugin: Plugin,
    private workspaceService: WorkspaceService
  ) {}

  /**
   * Get memory traces from a workspace/session
   */
  async getMemoryTraces(workspaceId: string, sessionId?: string): Promise<WorkspaceMemoryTrace[]> {
    if (sessionId) {
      // Get traces from specific session
      const traces = await this.workspaceService.getMemoryTraces(workspaceId, sessionId);
      return traces.map(trace => ({
        ...trace,
        workspaceId,
        sessionId
      }));
    }

    // Get all traces from all sessions in workspace
    const workspace = await this.workspaceService.getWorkspace(workspaceId);

    if (!workspace) {
      return [];
    }

    const allTraces: WorkspaceMemoryTrace[] = [];

    for (const [sid, session] of Object.entries(workspace.sessions)) {
      const sessionTraces = Object.values(session.memoryTraces).map(trace => ({
        ...trace,
        workspaceId,
        sessionId: sid
      }));
      allTraces.push(...sessionTraces);
    }

    return allTraces;
  }

  /**
   * Record activity trace in a session
   */
  async recordActivityTrace(trace: Omit<WorkspaceMemoryTrace, 'id'>): Promise<string> {
    const workspaceId = trace.workspaceId;
    let sessionId = trace.sessionId || 'default-session';

    // Ensure workspace exists
    const workspace = await this.workspaceService.getWorkspace(workspaceId);

    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Create session if it doesn't exist
    if (!workspace.sessions[sessionId]) {
      await this.workspaceService.addSession(workspaceId, {
        id: sessionId,
        name: 'Default Session',
        startTime: Date.now(),
        isActive: true,
        memoryTraces: {},
        states: {}
      });
    }

    // Add trace to session
    const createdTrace = await this.workspaceService.addMemoryTrace(workspaceId, sessionId, {
      timestamp: trace.timestamp || Date.now(),
      type: trace.type || 'generic',
      content: trace.content || '',
      metadata: trace.metadata
    });

    return createdTrace.id;
  }

  /**
   * Create memory trace
   */
  async createMemoryTrace(trace: Omit<WorkspaceMemoryTrace, 'id'>): Promise<WorkspaceMemoryTrace> {
    const traceId = await this.recordActivityTrace(trace);
    const workspaceId = trace.workspaceId;
    const sessionId = trace.sessionId || 'default-session';

    // Retrieve the created trace
    const traces = await this.workspaceService.getMemoryTraces(workspaceId, sessionId);
    const createdTrace = traces.find(t => t.id === traceId);

    if (!createdTrace) {
      throw new Error('Failed to retrieve created memory trace');
    }

    return {
      ...createdTrace,
      workspaceId,
      sessionId
    };
  }

  /**
   * Get sessions for a workspace
   */
  async getSessions(workspaceId: string): Promise<WorkspaceSession[]> {
    const workspace = await this.workspaceService.getWorkspace(workspaceId);

    if (!workspace) {
      return [];
    }

    return Object.values(workspace.sessions).map(session => ({
      ...session,
      workspaceId
    }));
  }

  /**
   * Create session in workspace
   */
  async createSession(session: Omit<WorkspaceSession, 'id'>): Promise<WorkspaceSession> {
    const workspaceId = (session as any).workspaceId;

    const createdSession = await this.workspaceService.addSession(workspaceId, {
      name: session.name,
      description: session.description,
      startTime: (session as any).startTime || Date.now(),
      endTime: (session as any).endTime,
      isActive: (session as any).isActive ?? true,
      memoryTraces: {},
      states: {}
    });

    return {
      ...createdSession,
      workspaceId
    };
  }

  /**
   * Update session
   */
  async updateSession(workspaceId: string, sessionId: string, updates: Partial<WorkspaceSession>): Promise<void> {
    await this.workspaceService.updateSession(workspaceId, sessionId, updates);
  }

  /**
   * Get session by ID
   */
  async getSession(workspaceId: string, sessionId: string): Promise<WorkspaceSession | null> {
    const session = await this.workspaceService.getSession(workspaceId, sessionId);

    if (!session) {
      return null;
    }

    return {
      ...session,
      workspaceId
    };
  }

  /**
   * Save state snapshot to session
   */
  async saveStateSnapshot(
    workspaceId: string,
    sessionId: string,
    snapshot: WorkspaceStateSnapshot,
    name?: string
  ): Promise<string> {
    const state = await this.workspaceService.addState(workspaceId, sessionId, {
      name: name || 'Unnamed State',
      created: Date.now(),
      snapshot
    });

    return state.id;
  }

  /**
   * Get state snapshot from session
   */
  async getStateSnapshot(
    workspaceId: string,
    sessionId: string,
    stateId: string
  ): Promise<WorkspaceStateSnapshot | null> {
    const state = await this.workspaceService.getState(workspaceId, sessionId, stateId);

    if (!state) {
      return null;
    }

    return state.snapshot;
  }

  /**
   * Get all state snapshots for a session (or all sessions in workspace if sessionId not provided)
   */
  async getStateSnapshots(workspaceId: string, sessionId?: string): Promise<Array<{
    id: string;
    name: string;
    created: number;
    snapshot: WorkspaceStateSnapshot;
  }>> {
    const workspace = await this.workspaceService.getWorkspace(workspaceId);

    if (!workspace) {
      return [];
    }

    // If sessionId provided, get states for that session only
    if (sessionId) {
      if (!workspace.sessions[sessionId]) {
        return [];
      }
      return Object.values(workspace.sessions[sessionId].states);
    }

    // Get all states from all sessions in workspace
    const allStates: Array<{
      id: string;
      name: string;
      created: number;
      snapshot: WorkspaceStateSnapshot;
    }> = [];

    for (const session of Object.values(workspace.sessions)) {
      allStates.push(...Object.values(session.states));
    }

    return allStates;
  }

  /**
   * Update state snapshot
   */
  async updateSnapshot(
    workspaceId: string,
    sessionId: string,
    stateId: string,
    updates: Partial<{
      name: string;
      snapshot: WorkspaceStateSnapshot;
    }>
  ): Promise<void> {
    const workspace = await this.workspaceService.getWorkspace(workspaceId);

    if (!workspace || !workspace.sessions[sessionId] || !workspace.sessions[sessionId].states[stateId]) {
      throw new Error('State not found');
    }

    // Update the state
    const state = workspace.sessions[sessionId].states[stateId];
    workspace.sessions[sessionId].states[stateId] = {
      ...state,
      ...updates
    };

    // Save workspace
    await this.workspaceService.updateWorkspace(workspaceId, workspace);
  }

  /**
   * Delete state snapshot
   */
  async deleteSnapshot(
    workspaceId: string,
    sessionId: string,
    stateId: string
  ): Promise<void> {
    const workspace = await this.workspaceService.getWorkspace(workspaceId);

    if (!workspace || !workspace.sessions[sessionId]) {
      throw new Error('Session not found');
    }

    // Delete the state
    delete workspace.sessions[sessionId].states[stateId];

    // Save workspace
    await this.workspaceService.updateWorkspace(workspaceId, workspace);
  }
}