import { Plugin } from 'obsidian';
import { WorkspaceMemoryTrace, WorkspaceSession, WorkspaceStateSnapshot } from '../../../database/workspace-types';

/**
 * MemoryService using direct Obsidian data storage
 */
export class MemoryService {
  private plugin: Plugin;
  private readonly TRACES_KEY = 'memoryTraces';
  private readonly SESSIONS_KEY = 'sessions';
  private readonly SNAPSHOTS_KEY = 'snapshots';

  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  // Memory Traces
  async createMemoryTrace(trace: Omit<WorkspaceMemoryTrace, 'id'>): Promise<WorkspaceMemoryTrace> {
    const traces = await this.getAllTraces();
    const newTrace = {
      ...trace,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
    };

    traces.push(newTrace);
    await this.saveTraces(traces);
    return newTrace;
  }

  async getMemoryTraces(workspaceId: string): Promise<WorkspaceMemoryTrace[]> {
    const traces = await this.getAllTraces();
    return traces.filter(t => t.workspaceId === workspaceId);
  }

  async recordActivityTrace(trace: Omit<WorkspaceMemoryTrace, 'id'>): Promise<string> {
    const newTrace = await this.createMemoryTrace(trace);
    return newTrace.id;
  }

  async storeMemoryTrace(trace: Omit<WorkspaceMemoryTrace, 'id'>): Promise<WorkspaceMemoryTrace> {
    return await this.createMemoryTrace(trace);
  }

  // Sessions
  async createSession(session: Omit<WorkspaceSession, 'id'>): Promise<WorkspaceSession> {
    const sessions = await this.getAllSessions();
    const newSession = {
      ...session,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
    };

    sessions.push(newSession);
    await this.saveSessions(sessions);
    return newSession;
  }

  async getSession(id: string): Promise<WorkspaceSession | undefined> {
    const sessions = await this.getAllSessions();
    return sessions.find(s => s.id === id);
  }

  async updateSession(session: WorkspaceSession): Promise<void> {
    const sessions = await this.getAllSessions();
    const index = sessions.findIndex(s => s.id === session.id);

    if (index === -1) {
      throw new Error(`Session ${session.id} not found`);
    }

    sessions[index] = session;
    await this.saveSessions(sessions);
  }

  async getSessions(workspaceId?: string): Promise<WorkspaceSession[]> {
    const sessions = await this.getAllSessions();
    if (workspaceId) {
      return sessions.filter(s => s.workspaceId === workspaceId);
    }
    return sessions;
  }

  async getSessionTraces(sessionId: string): Promise<WorkspaceMemoryTrace[]> {
    const traces = await this.getAllTraces();
    return traces.filter(t => t.sessionId === sessionId);
  }

  // Snapshots
  async createSnapshot(snapshot: Omit<WorkspaceStateSnapshot, 'id'>): Promise<WorkspaceStateSnapshot> {
    const snapshots = await this.getAllSnapshots();
    const newSnapshot = {
      ...snapshot,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
    };

    snapshots.push(newSnapshot);
    await this.saveSnapshots(snapshots);
    return newSnapshot;
  }

  async getSnapshot(id: string): Promise<WorkspaceStateSnapshot | undefined> {
    const snapshots = await this.getAllSnapshots();
    return snapshots.find(s => s.id === id);
  }

  async updateSnapshot(snapshot: WorkspaceStateSnapshot): Promise<void> {
    const snapshots = await this.getAllSnapshots();
    const index = snapshots.findIndex(s => s.id === snapshot.id);

    if (index === -1) {
      throw new Error(`Snapshot ${snapshot.id} not found`);
    }

    snapshots[index] = snapshot;
    await this.saveSnapshots(snapshots);
  }

  async getStates(workspaceId?: string): Promise<WorkspaceStateSnapshot[]> {
    const snapshots = await this.getAllSnapshots();
    if (workspaceId) {
      return snapshots.filter(s => s.workspaceId === workspaceId);
    }
    return snapshots;
  }

  async deleteSnapshot(id: string): Promise<void> {
    const snapshots = await this.getAllSnapshots();
    const filtered = snapshots.filter(s => s.id !== id);
    await this.saveSnapshots(filtered);
  }

  async getSnapshots(workspaceId?: string, sessionId?: string): Promise<WorkspaceStateSnapshot[]> {
    const snapshots = await this.getAllSnapshots();
    let filtered = snapshots;

    if (workspaceId) {
      filtered = filtered.filter(s => s.workspaceId === workspaceId);
    }

    if (sessionId) {
      filtered = filtered.filter(s => s.sessionId === sessionId);
    }

    return filtered;
  }

  // Memory search methods
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

  // Private helpers
  private async getAllTraces(): Promise<WorkspaceMemoryTrace[]> {
    const data = await this.plugin.loadData();
    return data?.[this.TRACES_KEY] || [];
  }

  private async saveTraces(traces: WorkspaceMemoryTrace[]): Promise<void> {
    const data = await this.plugin.loadData() || {};
    data[this.TRACES_KEY] = traces;
    await this.plugin.saveData(data);
  }

  private async getAllSessions(): Promise<WorkspaceSession[]> {
    const data = await this.plugin.loadData();
    return data?.[this.SESSIONS_KEY] || [];
  }

  private async saveSessions(sessions: WorkspaceSession[]): Promise<void> {
    const data = await this.plugin.loadData() || {};
    data[this.SESSIONS_KEY] = sessions;
    await this.plugin.saveData(data);
  }

  private async getAllSnapshots(): Promise<WorkspaceStateSnapshot[]> {
    const data = await this.plugin.loadData();
    return data?.[this.SNAPSHOTS_KEY] || [];
  }

  private async saveSnapshots(snapshots: WorkspaceStateSnapshot[]): Promise<void> {
    const data = await this.plugin.loadData() || {};
    data[this.SNAPSHOTS_KEY] = snapshots;
    await this.plugin.saveData(data);
  }
}