// Location: src/services/WorkspaceService.ts
// Centralized workspace management service with split-file storage
// Used by: MemoryManager agents, WorkspaceEditModal, UI components
// Dependencies: FileSystemService, IndexManager for data access

import { Plugin } from 'obsidian';
import { FileSystemService } from './storage/FileSystemService';
import { IndexManager } from './storage/IndexManager';
import { IndividualWorkspace, WorkspaceMetadata, SessionData, MemoryTrace, StateData } from '../types/storage/StorageTypes';

// Export constant for backward compatibility
export const GLOBAL_WORKSPACE_ID = 'default';

export class WorkspaceService {
  constructor(
    private plugin: Plugin,
    private fileSystem: FileSystemService,
    private indexManager: IndexManager
  ) {}

  /**
   * List workspaces (uses index only - lightweight and fast)
   */
  async listWorkspaces(limit?: number): Promise<WorkspaceMetadata[]> {
    const index = await this.indexManager.loadWorkspaceIndex();

    let workspaces = Object.values(index.workspaces);

    // Sort by last accessed (most recent first)
    workspaces.sort((a, b) => b.lastAccessed - a.lastAccessed);

    // Apply limit if specified
    if (limit) {
      workspaces = workspaces.slice(0, limit);
    }

    return workspaces;
  }

  /**
   * Get workspaces with flexible sorting and filtering (uses index only - lightweight and fast)
   */
  async getWorkspaces(options?: {
    sortBy?: 'name' | 'created' | 'lastAccessed',
    sortOrder?: 'asc' | 'desc',
    limit?: number
  }): Promise<WorkspaceMetadata[]> {
    const index = await this.indexManager.loadWorkspaceIndex();
    let workspaces = Object.values(index.workspaces);

    // Apply sorting
    const sortBy = options?.sortBy || 'lastAccessed';
    const sortOrder = options?.sortOrder || 'desc';

    workspaces.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'created':
          comparison = a.created - b.created;
          break;
        case 'lastAccessed':
        default:
          comparison = a.lastAccessed - b.lastAccessed;
          break;
      }

      // Apply sort order
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Apply limit if specified
    if (options?.limit) {
      workspaces = workspaces.slice(0, options.limit);
    }

    return workspaces;
  }

  /**
   * Get full workspace with sessions and traces (loads individual file)
   */
  async getWorkspace(id: string): Promise<IndividualWorkspace | null> {
    const workspace = await this.fileSystem.readWorkspace(id);

    if (!workspace) {
      return null;
    }

    // Migrate legacy array-based workflow steps to string format
    const migrated = this.migrateWorkflowSteps(workspace);
    if (migrated) {
      // Save migrated workspace back to storage
      await this.fileSystem.writeWorkspace(id, workspace);
    }

    return workspace;
  }

  /**
   * Get all workspaces with full data (expensive - avoid if possible)
   */
  async getAllWorkspaces(): Promise<IndividualWorkspace[]> {
    const workspaceIds = await this.fileSystem.listWorkspaceIds();
    const workspaces: IndividualWorkspace[] = [];

    for (const id of workspaceIds) {
      const workspace = await this.fileSystem.readWorkspace(id);
      if (workspace) {
        // Migrate legacy array-based workflow steps to string format
        const migrated = this.migrateWorkflowSteps(workspace);
        if (migrated) {
          // Save migrated workspace back to storage
          await this.fileSystem.writeWorkspace(id, workspace);
        }
        workspaces.push(workspace);
      }
    }

    return workspaces;
  }

  /**
   * Create new workspace (writes file + updates index)
   */
  async createWorkspace(data: Partial<IndividualWorkspace>): Promise<IndividualWorkspace> {
    const id = data.id || `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const workspace: IndividualWorkspace = {
      id,
      name: data.name || 'Untitled Workspace',
      description: data.description,
      rootFolder: data.rootFolder || '/',
      created: data.created || Date.now(),
      lastAccessed: data.lastAccessed || Date.now(),
      isActive: data.isActive ?? true,
      context: data.context,
      sessions: data.sessions || {}
    };

    // Write workspace file
    await this.fileSystem.writeWorkspace(id, workspace);

    // Update index
    await this.indexManager.updateWorkspaceInIndex(workspace);

    return workspace;
  }

  /**
   * Update workspace (updates file + index metadata)
   */
  async updateWorkspace(id: string, updates: Partial<IndividualWorkspace>): Promise<void> {
    // Load existing workspace
    const workspace = await this.fileSystem.readWorkspace(id);

    if (!workspace) {
      throw new Error(`Workspace ${id} not found`);
    }

    // Apply updates
    const updatedWorkspace: IndividualWorkspace = {
      ...workspace,
      ...updates,
      id, // Preserve ID
      lastAccessed: Date.now()
    };

    // Write updated workspace
    await this.fileSystem.writeWorkspace(id, updatedWorkspace);

    // Update index
    await this.indexManager.updateWorkspaceInIndex(updatedWorkspace);
  }

  /**
   * Update last accessed timestamp for a workspace
   * Lightweight operation that only updates the timestamp in both file and index
   */
  async updateLastAccessed(id: string): Promise<void> {
    // Load existing workspace
    const workspace = await this.fileSystem.readWorkspace(id);

    if (!workspace) {
      throw new Error(`Workspace ${id} not found`);
    }

    // Update only the lastAccessed timestamp
    workspace.lastAccessed = Date.now();

    // Write updated workspace
    await this.fileSystem.writeWorkspace(id, workspace);

    // Update index
    await this.indexManager.updateWorkspaceInIndex(workspace);
  }

  /**
   * Delete workspace (deletes file + removes from index)
   */
  async deleteWorkspace(id: string): Promise<void> {
    // Delete workspace file
    await this.fileSystem.deleteWorkspace(id);

    // Remove from index
    await this.indexManager.removeWorkspaceFromIndex(id);
  }

  /**
   * Add session to workspace
   */
  async addSession(workspaceId: string, sessionData: Partial<SessionData>): Promise<SessionData> {
    // Load workspace
    const workspace = await this.fileSystem.readWorkspace(workspaceId);

    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Create session
    const sessionId = sessionData.id || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session: SessionData = {
      id: sessionId,
      name: sessionData.name,
      description: sessionData.description,
      startTime: sessionData.startTime || Date.now(),
      endTime: sessionData.endTime,
      isActive: sessionData.isActive ?? true,
      memoryTraces: sessionData.memoryTraces || {},
      states: sessionData.states || {}
    };

    // Add to workspace
    workspace.sessions[sessionId] = session;
    workspace.lastAccessed = Date.now();

    // Save workspace
    await this.fileSystem.writeWorkspace(workspaceId, workspace);

    // Update index
    await this.indexManager.updateWorkspaceInIndex(workspace);

    return session;
  }

  /**
   * Update session in workspace
   */
  async updateSession(workspaceId: string, sessionId: string, updates: Partial<SessionData>): Promise<void> {
    // Load workspace
    const workspace = await this.fileSystem.readWorkspace(workspaceId);

    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    if (!workspace.sessions[sessionId]) {
      throw new Error(`Session ${sessionId} not found in workspace ${workspaceId}`);
    }

    // Apply updates
    workspace.sessions[sessionId] = {
      ...workspace.sessions[sessionId],
      ...updates,
      id: sessionId // Preserve ID
    };

    workspace.lastAccessed = Date.now();

    // Save workspace
    await this.fileSystem.writeWorkspace(workspaceId, workspace);

    // Update index
    await this.indexManager.updateWorkspaceInIndex(workspace);
  }

  /**
   * Delete session from workspace
   */
  async deleteSession(workspaceId: string, sessionId: string): Promise<void> {
    // Load workspace
    const workspace = await this.fileSystem.readWorkspace(workspaceId);

    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Delete session
    delete workspace.sessions[sessionId];
    workspace.lastAccessed = Date.now();

    // Save workspace
    await this.fileSystem.writeWorkspace(workspaceId, workspace);

    // Update index
    await this.indexManager.updateWorkspaceInIndex(workspace);
  }

  /**
   * Get session from workspace
   */
  async getSession(workspaceId: string, sessionId: string): Promise<SessionData | null> {
    const workspace = await this.fileSystem.readWorkspace(workspaceId);

    if (!workspace) {
      return null;
    }

    const session = workspace.sessions[sessionId];

    if (!session) {
      return null;
    }

    return session;
  }

  /**
   * Add memory trace to session
   */
  async addMemoryTrace(workspaceId: string, sessionId: string, traceData: Partial<MemoryTrace>): Promise<MemoryTrace> {
    // Load workspace
    const workspace = await this.fileSystem.readWorkspace(workspaceId);

    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    if (!workspace.sessions[sessionId]) {
      throw new Error(`Session ${sessionId} not found in workspace ${workspaceId}`);
    }

    // Create trace
    const traceId = traceData.id || `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const trace: MemoryTrace = {
      id: traceId,
      timestamp: traceData.timestamp || Date.now(),
      type: traceData.type || 'generic',
      content: traceData.content || '',
      metadata: traceData.metadata
    };

    // Add to session
    workspace.sessions[sessionId].memoryTraces[traceId] = trace;
    workspace.lastAccessed = Date.now();

    // Save workspace
    await this.fileSystem.writeWorkspace(workspaceId, workspace);

    // Update index
    await this.indexManager.updateWorkspaceInIndex(workspace);

    return trace;
  }

  /**
   * Get memory traces from session
   */
  async getMemoryTraces(workspaceId: string, sessionId: string): Promise<MemoryTrace[]> {
    const workspace = await this.fileSystem.readWorkspace(workspaceId);

    if (!workspace || !workspace.sessions[sessionId]) {
      return [];
    }

    return Object.values(workspace.sessions[sessionId].memoryTraces);
  }

  /**
   * Add state to session
   */
  async addState(workspaceId: string, sessionId: string, stateData: Partial<StateData>): Promise<StateData> {
    // Load workspace
    const workspace = await this.fileSystem.readWorkspace(workspaceId);

    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    if (!workspace.sessions[sessionId]) {
      throw new Error(`Session ${sessionId} not found in workspace ${workspaceId}`);
    }

    // Create state
    const stateId = stateData.id || `state_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const state: StateData = {
      id: stateId,
      name: stateData.name || 'Untitled State',
      created: stateData.created || Date.now(),
      snapshot: stateData.snapshot || {} as any
    };

    // Add to session
    workspace.sessions[sessionId].states[stateId] = state;
    workspace.lastAccessed = Date.now();

    // Save workspace
    await this.fileSystem.writeWorkspace(workspaceId, workspace);

    // Update index
    await this.indexManager.updateWorkspaceInIndex(workspace);

    return state;
  }

  /**
   * Get state from session
   */
  async getState(workspaceId: string, sessionId: string, stateId: string): Promise<StateData | null> {
    const workspace = await this.fileSystem.readWorkspace(workspaceId);

    if (!workspace || !workspace.sessions[sessionId]) {
      return null;
    }

    const state = workspace.sessions[sessionId].states[stateId];
    return state || null;
  }

  /**
   * Search workspaces (uses index search data)
   */
  async searchWorkspaces(query: string, limit?: number): Promise<WorkspaceMetadata[]> {
    if (!query) {
      return this.listWorkspaces(limit);
    }

    const index = await this.indexManager.loadWorkspaceIndex();
    const words = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    const matchedIds = new Set<string>();

    // Search name and description indices
    for (const word of words) {
      // Search names
      if (index.byName[word]) {
        index.byName[word].forEach(id => matchedIds.add(id));
      }

      // Search descriptions
      if (index.byDescription[word]) {
        index.byDescription[word].forEach(id => matchedIds.add(id));
      }
    }

    // Get metadata for matched workspaces
    const results = Array.from(matchedIds)
      .map(id => index.workspaces[id])
      .filter(ws => ws !== undefined)
      .sort((a, b) => b.lastAccessed - a.lastAccessed);

    // Apply limit
    const limited = limit ? results.slice(0, limit) : results;

    return limited;
  }

  /**
   * Get workspace by folder (uses index)
   */
  async getWorkspaceByFolder(folder: string): Promise<WorkspaceMetadata | null> {
    const index = await this.indexManager.loadWorkspaceIndex();
    const workspaceId = index.byFolder[folder];

    if (!workspaceId) {
      return null;
    }

    return index.workspaces[workspaceId] || null;
  }

  /**
   * Get active workspace (uses index)
   */
  async getActiveWorkspace(): Promise<WorkspaceMetadata | null> {
    const index = await this.indexManager.loadWorkspaceIndex();
    const workspaces = Object.values(index.workspaces);
    const active = workspaces.find(ws => ws.isActive);

    return active || null;
  }

  /**
   * Migrate legacy array-based workflow steps to string format
   * @param workspace Workspace to migrate
   * @returns true if migration was performed, false otherwise
   */
  private migrateWorkflowSteps(workspace: IndividualWorkspace): boolean {
    if (!workspace.context?.workflows || workspace.context.workflows.length === 0) {
      return false;
    }

    let migrated = false;

    for (const workflow of workspace.context.workflows) {
      // Check if steps is an array (legacy format)
      if (Array.isArray(workflow.steps)) {
        // Convert array to string with newlines
        (workflow.steps as any) = (workflow.steps as string[]).join('\n');
        migrated = true;
      }
    }

    return migrated;
  }
}