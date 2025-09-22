import { Plugin } from 'obsidian';
import { ProjectWorkspace } from '../../../database/workspace-types';
import { FileSystemService } from '../../../services/migration/FileSystemService';
import { WorkspaceDataStructure } from '../../../types/migration/MigrationTypes';
import { v4 as uuidv4 } from 'uuid';

export const GLOBAL_WORKSPACE_ID = 'global-workspace';

/**
 * Location: src/agents/memoryManager/services/WorkspaceService.ts
 *
 * WorkspaceService using the new FileSystemService and nested JSON structure.
 * Manages workspace data stored in .data/workspace-data.json with hierarchical
 * organization: workspaces → sessions → traces/states.
 *
 * Used by: MemoryManager agent modes for workspace operations
 * Integrates with: FileSystemService for data persistence, MemoryService for nested data
 */
export class WorkspaceService {
  private plugin: Plugin;
  private fileSystem: FileSystemService;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.fileSystem = new FileSystemService(plugin);
  }

  async getAllWorkspaces(): Promise<ProjectWorkspace[]> {
    try {
      console.log('[Claudesidian] Loading all workspaces...');
      const data = await this.loadWorkspaceData();
      const workspaces = Object.values(data.workspaces);
      console.log(`[Claudesidian] Loaded ${workspaces.length} workspaces`);
      return workspaces;
    } catch (error) {
      console.error('[Claudesidian] Error loading workspaces:', error);
      throw error;
    }
  }

  async getWorkspace(id: string): Promise<ProjectWorkspace | undefined> {
    const data = await this.loadWorkspaceData();
    return data.workspaces[id];
  }

  async createWorkspace(workspaceData: Omit<ProjectWorkspace, 'id'> | string, description?: string): Promise<ProjectWorkspace> {
    const data = await this.loadWorkspaceData();

    let newWorkspace: ProjectWorkspace;

    if (typeof workspaceData === 'string') {
      newWorkspace = {
        id: uuidv4(),
        name: workspaceData,
        description: description || '',
        rootFolder: '/',
        created: Date.now(),
        lastAccessed: Date.now(),
        isActive: true
      };
    } else {
      newWorkspace = {
        ...workspaceData,
        id: uuidv4(),
        created: Date.now(),
        lastAccessed: Date.now()
      };
    }

    // Add to nested structure
    data.workspaces[newWorkspace.id] = {
      ...newWorkspace,
      sessions: {} // Initialize empty sessions
    };

    await this.saveWorkspaceData(data);
    return newWorkspace;
  }

  async updateWorkspace(id: string, updates: Partial<ProjectWorkspace>): Promise<void> {
    const data = await this.loadWorkspaceData();

    if (!data.workspaces[id]) {
      throw new Error(`Workspace ${id} not found`);
    }

    // Update workspace data
    Object.assign(data.workspaces[id], updates, { lastAccessed: Date.now() });

    await this.saveWorkspaceData(data);
  }

  async deleteWorkspace(id: string): Promise<void> {
    const data = await this.loadWorkspaceData();

    if (!data.workspaces[id]) {
      throw new Error(`Workspace ${id} not found`);
    }

    delete data.workspaces[id];
    await this.saveWorkspaceData(data);
  }

  /**
   * Get all workspaces (alias for getAllWorkspaces for backward compatibility)
   */
  async getWorkspaces(): Promise<ProjectWorkspace[]> {
    return this.getAllWorkspaces();
  }

  /**
   * Add activity to workspace (legacy compatibility method)
   */
  async addActivity(workspaceId: string, activity: any): Promise<void> {
    // In the new structure, activities are stored as memory traces
    // This method maintains backward compatibility by creating a memory trace
    console.warn('[Claudesidian] addActivity is deprecated, use MemoryService.recordActivityTrace instead');

    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Update last accessed time
    await this.updateWorkspace(workspaceId, { lastAccessed: Date.now() });
  }

  private async loadWorkspaceData(): Promise<WorkspaceDataStructure> {
    const data = await this.fileSystem.readJSON('workspace-data.json');

    if (!data) {
      // Return empty structure
      return {
        workspaces: {},
        metadata: {
          version: '2.0.0',
          lastUpdated: Date.now()
        }
      };
    }

    return data;
  }

  private async saveWorkspaceData(data: WorkspaceDataStructure): Promise<void> {
    data.metadata.lastUpdated = Date.now();
    await this.fileSystem.writeJSON('workspace-data.json', data);
  }
}