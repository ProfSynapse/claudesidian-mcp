import { App, TFile } from 'obsidian';
import { MemoryService } from '../../database/services/MemoryService';
import { WorkspaceService } from '../../database/services/WorkspaceService';
import { HierarchyType } from '../../database/workspace-types';
import { sanitizePath } from '../../utils/pathUtils';
import { FileEvent } from './types';

/**
 * Manages workspace activity recording and memory traces
 */
export class WorkspaceActivityRecorder {
  // Session management
  private activeSessions: Record<string, string> = {}; // workspaceId -> sessionId
  
  // Cache for workspace relationships
  private fileWorkspaceCache: Map<string, { workspaceIds: string[]; timestamp: number }> = new Map();
  private workspaceRoots: Map<string, { id: string; rootFolder: string }> = new Map();
  
  // Rate limiting
  private lastActivityTimes: Record<string, number> = {};
  
  constructor(
    private app: App,
    private memoryService: MemoryService,
    private workspaceService: WorkspaceService,
    private cacheExpiry: number = 30 * 60 * 1000, // 30 minutes default
    private activityRateLimit: number = 5000 // 5 seconds default
  ) {}

  /**
   * Initialize workspace data
   */
  async initialize(): Promise<void> {
    await this.refreshWorkspaceRoots();
    await this.refreshActiveSessions();
  }

  /**
   * Record file activity in workspaces
   */
  async recordFileActivity(event: FileEvent): Promise<void> {
    // Skip system operations
    if (event.isSystemOperation) {
      return;
    }

    // Find workspaces for this file
    const workspaceIds = await this.findWorkspacesForFile(event.path);

    for (const workspaceId of workspaceIds) {
      // Check rate limiting
      const now = Date.now();
      const lastTime = this.lastActivityTimes[workspaceId] || 0;
      if (now - lastTime < this.activityRateLimit) {
        continue;
      }

      this.lastActivityTimes[workspaceId] = now;

      // Record activity
      const action = event.operation === 'create' ? 'create' : 'edit';

      try {
        await this.workspaceService.recordActivity(workspaceId, {
          action,
          timestamp: event.timestamp,
          hierarchyPath: [event.path],
          toolName: 'fileEventManager'
        });

        // Record memory trace if there's an active session
        const sessionId = this.activeSessions[workspaceId];
        if (sessionId) {
          await this.recordMemoryTrace(workspaceId, sessionId, event);
        }
      } catch (error) {
        console.error(`[WorkspaceActivityRecorder] Error recording activity for workspace ${workspaceId}:`, error);
      }
    }
  }

  /**
   * Record a memory trace for a file event
   */
  private async recordMemoryTrace(workspaceId: string, sessionId: string, event: FileEvent): Promise<void> {
    const actionText = event.operation === 'create' ? 'Created' : 'Modified';
    const content = `${actionText} file: ${event.path}`;

    // Get file content preview if available
    let fileContent: string | undefined;
    if (event.operation !== 'delete') {
      try {
        const file = this.app.vault.getAbstractFileByPath(event.path);
        if (file instanceof TFile) {
          fileContent = await this.app.vault.read(file);
          if (fileContent.length > 500) {
            fileContent = fileContent.substring(0, 500) + '...';
          }
        }
      } catch (err) {
        // Ignore errors reading file content
      }
    }

    await this.memoryService.storeMemoryTrace({
      workspaceId,
      workspacePath: [workspaceId],
      contextLevel: 'workspace' as HierarchyType,
      activityType: 'research',
      content: fileContent ? `${content}\n\nContent preview:\n${fileContent}` : content,
      metadata: {
        tool: 'FileEventManager',
        params: { path: event.path },
        result: { success: true },
        relatedFiles: [event.path]
      },
      sessionId,
      timestamp: event.timestamp,
      importance: event.operation === 'create' ? 0.8 : 0.6,
      tags: ['file', event.operation]
    });
  }

  /**
   * Find workspaces that contain a file
   */
  private async findWorkspacesForFile(filePath: string): Promise<string[]> {
    // Check cache first
    const cached = this.fileWorkspaceCache.get(filePath);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.workspaceIds;
    }

    // Refresh workspace roots if needed
    if (this.workspaceRoots.size === 0) {
      await this.refreshWorkspaceRoots();
    }

    const workspaceIds: string[] = [];

    // Find matching workspaces
    for (const [id, workspace] of this.workspaceRoots.entries()) {
      const normalizedFilePath = sanitizePath(filePath, false);
      const normalizedRootFolder = sanitizePath(workspace.rootFolder, false);
      const rootFolderWithSlash = normalizedRootFolder.endsWith('/') 
        ? normalizedRootFolder 
        : normalizedRootFolder + '/';

      if (normalizedFilePath === normalizedRootFolder || 
          normalizedFilePath.startsWith(rootFolderWithSlash)) {
        workspaceIds.push(id);
      }
    }

    // Update cache
    this.fileWorkspaceCache.set(filePath, {
      workspaceIds,
      timestamp: Date.now()
    });

    return workspaceIds;
  }

  /**
   * Refresh workspace roots cache
   */
  private async refreshWorkspaceRoots(): Promise<void> {
    try {
      this.workspaceRoots.clear();
      const workspaces = await this.workspaceService.getWorkspaces();

      for (const workspace of workspaces) {
        if (workspace.rootFolder) {
          this.workspaceRoots.set(workspace.id, {
            id: workspace.id,
            rootFolder: workspace.rootFolder
          });
        }
      }
    } catch (error) {
      console.error('[WorkspaceActivityRecorder] Error refreshing workspace roots:', error);
    }
  }

  /**
   * Refresh active sessions
   */
  private async refreshActiveSessions(): Promise<void> {
    try {
      const activeSessions = await this.memoryService.getActiveSessions();
      this.activeSessions = {};

      for (const session of activeSessions) {
        this.activeSessions[session.workspaceId] = session.id;
      }
    } catch (error) {
      console.error('[WorkspaceActivityRecorder] Error refreshing active sessions:', error);
    }
  }

  /**
   * Handle session creation
   */
  handleSessionCreate(data: { id: string; workspaceId: string }): void {
    this.activeSessions[data.workspaceId] = data.id;
  }

  /**
   * Handle session end
   */
  handleSessionEnd(data: { id: string; workspaceId: string }): void {
    if (this.activeSessions[data.workspaceId] === data.id) {
      delete this.activeSessions[data.workspaceId];
    }
  }

  /**
   * Clear file from cache
   */
  clearFileFromCache(filePath: string): void {
    this.fileWorkspaceCache.delete(filePath);
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.fileWorkspaceCache.clear();
    this.workspaceRoots.clear();
    this.activeSessions = {};
    this.lastActivityTimes = {};
  }
}