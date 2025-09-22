import { Plugin } from 'obsidian';
import { WorkspaceMemoryTrace, WorkspaceSession, WorkspaceStateSnapshot } from '../../../database/workspace-types';
import { FileSystemService } from '../../../services/migration/FileSystemService';
import { WorkspaceDataStructure, ConversationDataStructure } from '../../../types/migration/MigrationTypes';

/**
 * Location: src/agents/memoryManager/services/MemoryService.ts
 *
 * MemoryService using the new FileSystemService and nested JSON structure.
 * Manages memory traces, sessions, and snapshots stored within the hierarchical
 * workspace data structure: workspaces → sessions → traces/states.
 *
 * Used by: MemoryManager agent modes for memory operations
 * Integrates with: FileSystemService for data persistence, WorkspaceService for workspace context
 */
export class MemoryService {
  private plugin: Plugin;
  private fileSystem: FileSystemService;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.fileSystem = new FileSystemService(plugin);
  }

  // Memory Traces
  async getMemoryTraces(workspaceId: string, sessionId?: string): Promise<WorkspaceMemoryTrace[]> {
    const data = await this.loadWorkspaceData();
    const workspace = data.workspaces[workspaceId];

    if (!workspace) return [];

    if (sessionId) {
      const session = workspace.sessions[sessionId];
      return session ? Object.values(session.memoryTraces).map(trace => ({
        ...trace,
        workspaceId: workspaceId,
        sessionId: sessionId
      })) : [];
    }

    // Return all traces from all sessions in workspace
    return Object.values(workspace.sessions)
      .flatMap(session => Object.values(session.memoryTraces).map(trace => ({
        ...trace,
        workspaceId: workspaceId,
        sessionId: session.id
      })));
  }

  async recordActivityTrace(trace: Omit<WorkspaceMemoryTrace, 'id'>): Promise<string> {
    const data = await this.loadWorkspaceData();

    // Ensure workspace exists
    if (!data.workspaces[trace.workspaceId]) {
      throw new Error(`Workspace ${trace.workspaceId} not found`);
    }

    // Ensure session exists (create default if needed)
    const sessionId = trace.sessionId || 'default-session';
    const workspace = data.workspaces[trace.workspaceId];

    if (!workspace.sessions[sessionId]) {
      workspace.sessions[sessionId] = {
        id: sessionId,
        name: 'Default Session',
        startTime: Date.now(),
        isActive: true,
        memoryTraces: {},
        states: {}
      };
    }

    // Add trace
    const traceId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const newTrace = { ...trace, id: traceId };

    workspace.sessions[sessionId].memoryTraces[traceId] = newTrace;

    await this.saveWorkspaceData(data);
    return traceId;
  }

  // Backward compatibility methods
  async createMemoryTrace(trace: Omit<WorkspaceMemoryTrace, 'id'>): Promise<WorkspaceMemoryTrace> {
    const traceId = await this.recordActivityTrace(trace);
    const data = await this.loadWorkspaceData();

    // Find and return the created trace
    const workspace = data.workspaces[trace.workspaceId];
    const sessionId = trace.sessionId || 'default-session';
    const session = workspace?.sessions[sessionId];

    if (!session || !session.memoryTraces[traceId]) {
      throw new Error('Failed to create memory trace');
    }

    return {
      ...session.memoryTraces[traceId],
      workspaceId: trace.workspaceId,
      sessionId: sessionId
    };
  }

  async storeMemoryTrace(trace: Omit<WorkspaceMemoryTrace, 'id'>): Promise<WorkspaceMemoryTrace> {
    return await this.createMemoryTrace(trace);
  }

  // Sessions
  async createSession(session: Omit<WorkspaceSession, 'id'>): Promise<WorkspaceSession> {
    const data = await this.loadWorkspaceData();

    // Ensure workspace exists
    if (!data.workspaces[session.workspaceId]) {
      throw new Error(`Workspace ${session.workspaceId} not found`);
    }

    const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const newSession = { ...session, id: sessionId };

    // Add to nested structure
    data.workspaces[session.workspaceId].sessions[sessionId] = {
      ...newSession,
      startTime: Date.now(),
      isActive: true,
      memoryTraces: {},
      states: {}
    };

    await this.saveWorkspaceData(data);
    return {
      ...newSession,
      workspaceId: session.workspaceId
    };
  }

  async getSession(id: string): Promise<WorkspaceSession | undefined> {
    const data = await this.loadWorkspaceData();

    // Search through all workspaces for the session
    for (const [workspaceId, workspace] of Object.entries(data.workspaces)) {
      if (workspace.sessions[id]) {
        return {
          ...workspace.sessions[id],
          workspaceId: workspaceId
        };
      }
    }

    return undefined;
  }

  async updateSession(session: WorkspaceSession): Promise<void> {
    const data = await this.loadWorkspaceData();

    // Find the session and update it
    for (const workspace of Object.values(data.workspaces)) {
      if (workspace.sessions[session.id]) {
        // Preserve the nested structure while updating session properties
        Object.assign(workspace.sessions[session.id], {
          name: session.name,
          description: session.description
        });
        await this.saveWorkspaceData(data);
        return;
      }
    }

    throw new Error(`Session ${session.id} not found`);
  }

  async getSessions(workspaceId?: string): Promise<WorkspaceSession[]> {
    const data = await this.loadWorkspaceData();

    if (workspaceId) {
      const workspace = data.workspaces[workspaceId];
      return workspace ? Object.values(workspace.sessions).map(session => ({
        ...session,
        workspaceId: workspaceId
      })) : [];
    }

    // Return all sessions from all workspaces
    return Object.entries(data.workspaces)
      .flatMap(([wId, workspace]) => Object.values(workspace.sessions).map(session => ({
        ...session,
        workspaceId: wId
      })));
  }

  async getSessionTraces(sessionId: string): Promise<WorkspaceMemoryTrace[]> {
    const data = await this.loadWorkspaceData();

    // Search through all workspaces for the session
    for (const [workspaceId, workspace] of Object.entries(data.workspaces)) {
      if (workspace.sessions[sessionId]) {
        return Object.values(workspace.sessions[sessionId].memoryTraces).map(trace => ({
          ...trace,
          workspaceId: workspaceId,
          sessionId: sessionId
        }));
      }
    }

    return [];
  }

  // Snapshots/States
  async saveSnapshot(snapshot: Omit<WorkspaceStateSnapshot, 'id'>): Promise<WorkspaceStateSnapshot> {
    const data = await this.loadWorkspaceData();

    // Find session or default
    const workspace = data.workspaces[snapshot.workspaceId];
    if (!workspace) {
      throw new Error(`Workspace ${snapshot.workspaceId} not found`);
    }

    const sessionId = snapshot.sessionId || 'default-session';
    if (!workspace.sessions[sessionId]) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const stateId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const newSnapshot = { ...snapshot, id: stateId };

    workspace.sessions[sessionId].states[stateId] = {
      id: stateId,
      name: newSnapshot.name,
      created: newSnapshot.created || Date.now(),
      snapshot: newSnapshot
    };

    await this.saveWorkspaceData(data);
    return {
      ...newSnapshot,
      id: stateId,
      workspaceId: snapshot.workspaceId,
      sessionId: sessionId
    };
  }

  async createSnapshot(snapshot: Omit<WorkspaceStateSnapshot, 'id'>): Promise<WorkspaceStateSnapshot> {
    return await this.saveSnapshot(snapshot);
  }

  async getSnapshot(id: string): Promise<WorkspaceStateSnapshot | undefined> {
    const data = await this.loadWorkspaceData();

    // Search through all workspaces and sessions for the snapshot
    for (const [workspaceId, workspace] of Object.entries(data.workspaces)) {
      for (const [sessionId, session] of Object.entries(workspace.sessions)) {
        if (session.states[id]) {
          const state = session.states[id];
          return {
            ...state.snapshot,
            id: state.id,
            workspaceId: workspaceId,
            sessionId: sessionId
          };
        }
      }
    }

    return undefined;
  }

  async updateSnapshot(snapshot: WorkspaceStateSnapshot): Promise<void> {
    const data = await this.loadWorkspaceData();

    // Find the snapshot and update it
    for (const workspace of Object.values(data.workspaces)) {
      for (const session of Object.values(workspace.sessions)) {
        if (session.states[snapshot.id]) {
          session.states[snapshot.id] = {
            id: snapshot.id,
            name: snapshot.name,
            created: snapshot.created,
            snapshot: snapshot
          };
          await this.saveWorkspaceData(data);
          return;
        }
      }
    }

    throw new Error(`Snapshot ${snapshot.id} not found`);
  }

  async deleteSnapshot(id: string): Promise<void> {
    const data = await this.loadWorkspaceData();

    // Find and delete the snapshot
    for (const workspace of Object.values(data.workspaces)) {
      for (const session of Object.values(workspace.sessions)) {
        if (session.states[id]) {
          delete session.states[id];
          await this.saveWorkspaceData(data);
          return;
        }
      }
    }

    throw new Error(`Snapshot ${id} not found`);
  }

  async getStates(workspaceId?: string, sessionId?: string): Promise<WorkspaceStateSnapshot[]> {
    const data = await this.loadWorkspaceData();

    if (workspaceId && sessionId) {
      const session = data.workspaces[workspaceId]?.sessions[sessionId];
      return session ? Object.values(session.states).map(state => ({
        ...state.snapshot,
        id: state.id,
        workspaceId: workspaceId,
        sessionId: sessionId
      })) : [];
    }

    if (workspaceId) {
      const workspace = data.workspaces[workspaceId];
      return workspace ?
        Object.entries(workspace.sessions).flatMap(([sId, session]) =>
          Object.values(session.states).map(state => ({
            ...state.snapshot,
            id: state.id,
            workspaceId: workspaceId,
            sessionId: sId
          }))
        ) : [];
    }

    // Return all states from all workspaces
    return Object.entries(data.workspaces)
      .flatMap(([wId, workspace]) =>
        Object.entries(workspace.sessions).flatMap(([sId, session]) =>
          Object.values(session.states).map(state => ({
            ...state.snapshot,
            id: state.id,
            workspaceId: wId,
            sessionId: sId
          }))
        )
      );
  }

  async getSnapshots(workspaceId?: string, sessionId?: string): Promise<WorkspaceStateSnapshot[]> {
    return await this.getStates(workspaceId, sessionId);
  }

  // Memory search
  async searchMemoryTraces(workspaceId: string, query?: string, limit?: number): Promise<WorkspaceMemoryTrace[]> {
    const traces = await this.getMemoryTraces(workspaceId);

    if (!query) {
      return limit ? traces.slice(0, limit) : traces;
    }

    const filtered = traces.filter(trace =>
      trace.content.toLowerCase().includes(query.toLowerCase()) ||
      trace.type.toLowerCase().includes(query.toLowerCase())
    );

    return limit ? filtered.slice(0, limit) : filtered;
  }

  private async loadWorkspaceData(): Promise<WorkspaceDataStructure> {
    const data = await this.fileSystem.readJSON('workspace-data.json');

    if (!data) {
      return {
        workspaces: {},
        metadata: { version: '2.0.0', lastUpdated: Date.now() }
      };
    }

    return data;
  }

  private async saveWorkspaceData(data: WorkspaceDataStructure): Promise<void> {
    data.metadata.lastUpdated = Date.now();
    await this.fileSystem.writeJSON('workspace-data.json', data);
  }
}