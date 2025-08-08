import { App } from 'obsidian';
import { WorkspaceService } from '../../agents/memoryManager/services/WorkspaceService';
import { FileEmbeddingAccessService } from '../../database/services/indexing/FileEmbeddingAccessService';

/**
 * Workspace-aware caching service
 */
export interface WorkspaceCacheEntry {
    workspaceId: string;
    relatedFiles: Set<string>;
    embeddings: Map<string, any>;
    lastAccessed: number;
}

/**
 * Workspace Cache Manager - Handles workspace-specific caching
 * Follows Single Responsibility Principle
 */
export class WorkspaceCacheManager {
    private workspaceCache = new Map<string, WorkspaceCacheEntry>();
    private activeWorkspace: string | null = null;

    constructor(private app: App) {}

    /**
     * Handle workspace load event
     */
    async onWorkspaceLoad(workspaceId: string, workspacePath?: string[]): Promise<void> {
        this.activeWorkspace = workspaceId;
        
        // Start intelligent workspace caching
        this.scheduleWorkspaceCaching(workspaceId, workspacePath);
    }

    /**
     * Get workspace cache entry
     */
    getWorkspaceCache(workspaceId: string): WorkspaceCacheEntry | undefined {
        return this.workspaceCache.get(workspaceId);
    }

    /**
     * Clear workspace cache
     */
    clearWorkspaceCache(workspaceId?: string): void {
        if (workspaceId) {
            this.workspaceCache.delete(workspaceId);
        } else {
            this.workspaceCache.clear();
        }
    }

    /**
     * Get active workspace
     */
    getActiveWorkspace(): string | null {
        return this.activeWorkspace;
    }

    /**
     * Schedule intelligent workspace caching
     */
    private async scheduleWorkspaceCaching(workspaceId: string, workspacePath?: string[]): Promise<void> {
        setTimeout(async () => {
            try {
                await this.cacheWorkspaceFiles(workspaceId, workspacePath);
            } catch (error) {
                console.warn(`[WorkspaceCacheManager] Error caching workspace ${workspaceId}:`, error);
            }
        }, 200); // Delay to let initial workspace load complete
    }

    /**
     * Cache files related to the workspace for fast access
     */
    private async cacheWorkspaceFiles(workspaceId: string, workspacePath?: string[]): Promise<void> {
        // This method would need to be injected with dependencies
        // For now, it's a placeholder that can be extended
        console.log(`[WorkspaceCacheManager] Caching workspace: ${workspaceId}`);
    }

    /**
     * Find files related to a workspace based on its configuration
     */
    private async findWorkspaceRelatedFiles(workspace: any, workspacePath?: string[]): Promise<Set<string>> {
        const relatedFiles = new Set<string>();
        
        // Add files from workspace root path if specified
        if (workspace.rootPath) {
            const files = this.app.vault.getFiles()
                .filter(file => file.path.startsWith(workspace.rootPath))
                .map(file => file.path);
            files.forEach(file => relatedFiles.add(file));
        }
        
        // Add files from workspace path if specified
        if (workspacePath && workspacePath.length > 0) {
            const pathPrefix = workspacePath.join('/');
            const files = this.app.vault.getFiles()
                .filter(file => file.path.startsWith(pathPrefix))
                .map(file => file.path);
            files.forEach(file => relatedFiles.add(file));
        }
        
        // Add files from workspace tags if available
        if (workspace.tags && Array.isArray(workspace.tags)) {
            for (const tag of workspace.tags) {
                const taggedFiles = this.app.vault.getFiles()
                    .filter(file => {
                        const cache = this.app.metadataCache.getFileCache(file);
                        return cache?.tags?.some(t => t.tag === tag);
                    })
                    .map(file => file.path);
                taggedFiles.forEach(file => relatedFiles.add(file));
            }
        }
        
        return relatedFiles;
    }

    /**
     * Set dependency injection for workspace and file embedding services
     */
    setDependencies(
        workspaceService: WorkspaceService,
        fileEmbeddingService: FileEmbeddingAccessService
    ): void {
        // This allows for dependency injection while maintaining separation of concerns
        // The actual caching logic would be implemented here
    }
}