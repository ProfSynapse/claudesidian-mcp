/**
 * Default Workspace Manager
 *
 * Manages the default workspace for tool calls that don't specify a workspace.
 * Ensures all tool calls have a valid workspace association for memory traces.
 */

import { App } from 'obsidian';
import type { WorkspaceService } from '../WorkspaceService';

export interface DefaultWorkspaceConfig {
  id: string;
  name: string;
  rootFolder: string;
  description: string;
}

/**
 * Service to manage default workspace fallback for tool call associations
 */
export class DefaultWorkspaceManager {
  private defaultWorkspaceId = 'default';
  private defaultConfig: DefaultWorkspaceConfig;
  private initialized = false;
  private workspaceService?: WorkspaceService;

  constructor(private app: App, workspaceService?: WorkspaceService) {
    this.defaultConfig = {
      id: this.defaultWorkspaceId,
      name: 'Default Workspace',
      rootFolder: '/',
      description: 'Default workspace for tool calls without explicit workspace context'
    };
    this.workspaceService = workspaceService;
  }

  /**
   * Set workspace service (for lazy injection after construction)
   */
  setWorkspaceService(workspaceService: WorkspaceService): void {
    this.workspaceService = workspaceService;
  }

  /**
   * Initialize the default workspace manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Ensure default workspace exists
      await this.ensureDefaultWorkspace();
      this.initialized = true;
    } catch (error) {
      console.error('[DefaultWorkspaceManager] Failed to initialize:', error);
      // Continue with basic functionality even if workspace creation fails
      this.initialized = true;
    }
  }

  /**
   * Get the default workspace ID
   */
  getDefaultWorkspaceId(): string {
    return this.defaultWorkspaceId;
  }

  /**
   * Get the default workspace configuration
   */
  getDefaultWorkspaceConfig(): DefaultWorkspaceConfig {
    return { ...this.defaultConfig };
  }

  /**
   * Set a custom default workspace ID
   */
  setDefaultWorkspaceId(workspaceId: string): void {
    if (!workspaceId || workspaceId.trim() === '') {
      console.warn('[DefaultWorkspaceManager] Invalid workspace ID provided, keeping current default');
      return;
    }
    
    this.defaultWorkspaceId = workspaceId.trim();
    this.defaultConfig.id = this.defaultWorkspaceId;
    console.log('[DefaultWorkspaceManager] Default workspace updated to:', this.defaultWorkspaceId);
  }

  /**
   * Validate if a workspace ID exists, return default if not
   */
  async validateWorkspaceId(workspaceId: string | undefined): Promise<string> {
    // If no workspace ID provided, use default
    if (!workspaceId || workspaceId.trim() === '') {
      return this.defaultWorkspaceId;
    }

    // If it's already the default, return as-is
    if (workspaceId === this.defaultWorkspaceId) {
      return workspaceId;
    }

    // For now, return the provided workspace ID
    // In the future, we could validate against actual workspace storage
    return workspaceId.trim();
  }

  /**
   * Ensure the default workspace exists - creates workspace JSON if missing
   */
  private async ensureDefaultWorkspace(): Promise<void> {
    if (!this.workspaceService) {
      console.warn('[DefaultWorkspaceManager] WorkspaceService not available, skipping default workspace creation');
      return;
    }

    try {
      // Check if default workspace JSON already exists
      const existingWorkspace = await this.workspaceService.getWorkspace(this.defaultWorkspaceId);

      if (existingWorkspace) {
        return;
      }

      // Create default workspace JSON
      console.log('[DefaultWorkspaceManager] Creating default workspace JSON...');

      await this.workspaceService.createWorkspace({
        id: this.defaultWorkspaceId,
        name: this.defaultConfig.name,
        description: this.defaultConfig.description,
        rootFolder: this.defaultConfig.rootFolder,
        created: Date.now(),
        lastAccessed: Date.now(),
        isActive: true,
        sessions: {} // Empty sessions object to start
      });

      console.log('[DefaultWorkspaceManager] Default workspace created successfully');

    } catch (error) {
      console.error('[DefaultWorkspaceManager] Failed to create default workspace:', error);
      // Don't throw - allow plugin to continue even if workspace creation fails
    }
  }

  /**
   * Check if this is the default workspace
   */
  isDefaultWorkspace(workspaceId: string): boolean {
    return workspaceId === this.defaultWorkspaceId;
  }

  /**
   * Get workspace info for tool call context
   */
  getWorkspaceContextInfo(workspaceId: string): { workspaceId: string; isDefault: boolean } {
    const validatedId = workspaceId || this.defaultWorkspaceId;
    return {
      workspaceId: validatedId,
      isDefault: this.isDefaultWorkspace(validatedId)
    };
  }
}