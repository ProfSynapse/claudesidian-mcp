/**
 * Default Workspace Manager
 * 
 * Manages the default workspace for tool calls that don't specify a workspace.
 * Ensures all tool calls have a valid workspace association for memory traces.
 */

import { App } from 'obsidian';

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

  constructor(private app: App) {
    this.defaultConfig = {
      id: this.defaultWorkspaceId,
      name: 'Default Workspace',
      rootFolder: '/',
      description: 'Default workspace for tool calls without explicit workspace context'
    };
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
      console.log('[DefaultWorkspaceManager] Initialized with default workspace:', this.defaultWorkspaceId);
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
   * Ensure the default workspace exists (basic implementation)
   */
  private async ensureDefaultWorkspace(): Promise<void> {
    try {
      // Check if root folder exists
      const rootFolder = this.app.vault.getAbstractFileByPath('/');
      if (!rootFolder) {
        console.warn('[DefaultWorkspaceManager] Root folder not accessible, using basic default workspace');
        return;
      }

      // Default workspace is conceptual - it represents the entire vault
      // No need to create physical folders or files for it
      console.log('[DefaultWorkspaceManager] Default workspace conceptually established for vault root');
      
    } catch (error) {
      console.warn('[DefaultWorkspaceManager] Could not verify default workspace setup:', error);
      // Continue - default workspace is conceptual anyway
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