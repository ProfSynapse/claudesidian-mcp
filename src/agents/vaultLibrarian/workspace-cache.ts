import { IndexedDBWorkspaceDatabase } from './db/workspace-db';

/**
 * Class to manage workspace caching for improved performance
 */
export class WorkspaceCacheManager {
  private db: IndexedDBWorkspaceDatabase;
  private cache: Map<string, any>;
  private initialized: boolean = false;

  /**
   * Create a new WorkspaceCacheManager
   */
  constructor() {
    this.db = new IndexedDBWorkspaceDatabase();
    this.cache = new Map<string, any>();
  }

  /**
   * Initialize the cache manager
   */
  async initialize(): Promise<void> {
    if (!this.initialized) {
      await this.db.initialize();
      this.initialized = true;
    }
  }

  /**
   * Get the workspace cache for a specific workspace
   * @param workspaceId The workspace ID
   * @param maxItems Maximum number of items to load
   * @returns Object containing cached workspace data
   */
  async getWorkspaceCache(workspaceId: string, maxItems: number = 50): Promise<any> {
    // Get the base workspace
    const workspace = await this.db.getWorkspace(workspaceId);
    if (!workspace) {
      return null;
    }

    // Cache the workspace data
    this.cache.set(workspaceId, workspace);

    // Get child workspaces
    const childData: any[] = [];
    for (const childId of workspace.childWorkspaces) {
      if (childData.length >= maxItems) break;
      
      const child = await this.db.getWorkspace(childId);
      if (child) {
        childData.push({
          id: child.id,
          name: child.name,
          description: child.description,
          hierarchyType: child.hierarchyType,
          status: child.status
        });
        this.cache.set(childId, child);
      }
    }

    // Get activity history (limited by maxItems)
    let activityHistory = workspace.activityHistory || [];
    if (activityHistory.length > maxItems) {
      activityHistory = activityHistory.slice(-maxItems);
    }

    // Return the cache
    return {
      workspace,
      children: childData,
      activityHistory
    };
  }

  /**
   * Clear the cache for a specific workspace
   * @param workspaceId The workspace ID
   */
  clearCache(workspaceId: string): void {
    this.cache.delete(workspaceId);
  }

  /**
   * Clear the entire cache
   */
  clearAllCache(): void {
    this.cache.clear();
  }
}