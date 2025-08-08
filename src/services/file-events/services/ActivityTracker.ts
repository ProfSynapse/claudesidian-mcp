import { App } from 'obsidian';
import { IActivityTracker, FileEvent, FileOperation } from '../interfaces/IFileEventServices';
import { MemoryService } from "../../agents/memoryManager/services/MemoryService";
import { WorkspaceService } from "../agents/memoryManager/services/WorkspaceService";

export class ActivityTracker implements IActivityTracker {
    private fileWorkspaceCache: Map<string, { workspaceIds: string[]; timestamp: number }> = new Map();
    private workspaceRoots: Map<string, { id: string; rootFolder: string }> = new Map();
    private cacheExpiry = 30 * 60 * 1000; // 30 minutes

    constructor(
        private app: App,
        private memoryService: MemoryService,
        private workspaceService: WorkspaceService
    ) {}

    async recordFileActivity(event: FileEvent): Promise<void> {
        try {
            
            // Get workspace associations for this file
            const workspaceIds = await this.getFileWorkspaceAssociations(event.path);
            
            // Record activity in each associated workspace
            for (const workspaceId of workspaceIds) {
                await this.trackWorkspaceActivity(event.path, event.operation);
            }
            
            // Also record general file activity
            await this.recordGeneralFileActivity(event);
            
        } catch (error) {
            console.error(`[ActivityTracker] Error recording activity for ${event.path}:`, error);
            throw error;
        }
    }

    async trackWorkspaceActivity(filePath: string, operation: FileOperation): Promise<void> {
        try {
            // Record workspace-specific activity
            // This would integrate with your workspace tracking system
            
            // Example implementation - adapt to your actual workspace service
            // await this.workspaceService.recordActivity(filePath, operation);
            
        } catch (error) {
            console.warn(`[ActivityTracker] Failed to track workspace activity:`, error);
        }
    }

    private async recordGeneralFileActivity(event: FileEvent): Promise<void> {
        try {
            // Record in memory traces if available
            const activityData = {
                type: 'file_activity',
                operation: event.operation,
                filePath: event.path,
                timestamp: event.timestamp,
                isSystemOperation: event.isSystemOperation,
                source: event.source
            };

            // This would integrate with your memory service
            
        } catch (error) {
            console.warn(`[ActivityTracker] Failed to record general activity:`, error);
        }
    }

    private async getFileWorkspaceAssociations(filePath: string): Promise<string[]> {
        // Check cache first
        const cached = this.fileWorkspaceCache.get(filePath);
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.workspaceIds;
        }

        try {
            // Get workspace associations for this file
            const workspaceIds = await this.findWorkspacesForFile(filePath);
            
            // Cache the result
            this.fileWorkspaceCache.set(filePath, {
                workspaceIds,
                timestamp: Date.now()
            });
            
            return workspaceIds;
        } catch (error) {
            console.warn(`[ActivityTracker] Failed to get workspace associations for ${filePath}:`, error);
            return [];
        }
    }

    private async findWorkspacesForFile(filePath: string): Promise<string[]> {
        try {
            // This would use your workspace service to find which workspaces contain this file
            // For now, return empty array as a placeholder
            return [];
            
            // Example implementation:
            // return await this.workspaceService.getWorkspacesContainingFile(filePath);
            
        } catch (error) {
            console.warn(`[ActivityTracker] Error finding workspaces for file ${filePath}:`, error);
            return [];
        }
    }

    // Cache management
    clearCache(): void {
        this.fileWorkspaceCache.clear();
        this.workspaceRoots.clear();
    }

    cleanExpiredCache(): void {
        const now = Date.now();
        for (const [key, value] of this.fileWorkspaceCache.entries()) {
            if (now - value.timestamp > this.cacheExpiry) {
                this.fileWorkspaceCache.delete(key);
            }
        }
    }

    getCacheStats(): { fileWorkspaceCache: number; workspaceRoots: number } {
        return {
            fileWorkspaceCache: this.fileWorkspaceCache.size,
            workspaceRoots: this.workspaceRoots.size
        };
    }
}