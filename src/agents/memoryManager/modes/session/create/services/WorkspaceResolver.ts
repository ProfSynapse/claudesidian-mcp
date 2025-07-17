/**
 * WorkspaceResolver - Handles workspace resolution and validation
 * Follows Single Responsibility Principle by focusing only on workspace operations
 */

import { MemoryManagerAgent } from '../../../../memoryManager';
import { CreateSessionParams } from '../../../../types';
import { createErrorMessage } from '../../../../../../utils/errorUtils';

export interface WorkspaceResolutionResult {
    workspaceId: string;
    workspace: any;
    error?: string;
}

/**
 * Service responsible for resolving workspace context
 * Follows SRP by focusing only on workspace resolution operations
 */
export class WorkspaceResolver {
    constructor(private agent: MemoryManagerAgent) {}

    /**
     * Resolve workspace from parameters or get default
     */
    async resolveWorkspace(params: CreateSessionParams, inheritedContext?: any): Promise<WorkspaceResolutionResult> {
        try {
            // Get the services
            const workspaceService = this.agent.getWorkspaceService();
            
            if (!workspaceService) {
                return {
                    workspaceId: '',
                    workspace: null,
                    error: 'Workspace service not available'
                };
            }

            // Set workspaceId either from context or generate a default one
            let workspaceId = inheritedContext?.workspaceId;

            // If no valid workspaceId was found, use default
            if (!workspaceId) {
                workspaceId = await this.getDefaultWorkspaceId(workspaceService);
            }

            // Get the workspace data
            const workspace = await workspaceService.getWorkspace(workspaceId);
            
            if (!workspace) {
                return {
                    workspaceId,
                    workspace: null,
                    error: `Workspace with ID ${workspaceId} not found`
                };
            }

            return {
                workspaceId,
                workspace
            };
        } catch (error) {
            return {
                workspaceId: '',
                workspace: null,
                error: createErrorMessage('Failed to resolve workspace: ', error)
            };
        }
    }

    /**
     * Get default workspace ID or create one if none exists
     */
    private async getDefaultWorkspaceId(workspaceService: any): Promise<string> {
        try {
            // Try to find the default workspace
            const workspaces = await workspaceService.getWorkspaces({ 
                sortBy: 'lastAccessed', 
                sortOrder: 'desc', 
            });
            
            if (workspaces && workspaces.length > 0) {
                return workspaces[0].id;
            } else {
                // Create a default workspace if none exists
                const defaultWorkspace = await this.createDefaultWorkspace(workspaceService);
                return defaultWorkspace.id;
            }
        } catch (error) {
            throw new Error(createErrorMessage('Failed to get default workspace: ', error));
        }
    }

    /**
     * Create a default workspace
     */
    private async createDefaultWorkspace(workspaceService: any): Promise<any> {
        return await workspaceService.createWorkspace({
            name: 'Default Workspace',
            description: 'Automatically created default workspace',
            rootFolder: '/',
            hierarchyType: 'workspace',
            created: Date.now(),
            lastAccessed: Date.now(),
            childWorkspaces: [],
            path: [],
            relatedFolders: [],
            relevanceSettings: {
                folderProximityWeight: 0.5,
                recencyWeight: 0.7,
                frequencyWeight: 0.3
            },
            activityHistory: [],
            completionStatus: {},
            status: 'active'
        });
    }

    /**
     * Validate workspace exists and is accessible
     */
    async validateWorkspace(workspaceId: string): Promise<{
        isValid: boolean;
        workspace?: any;
        error?: string;
    }> {
        try {
            const workspaceService = this.agent.getWorkspaceService();
            
            if (!workspaceService) {
                return {
                    isValid: false,
                    error: 'Workspace service not available'
                };
            }

            const workspace = await workspaceService.getWorkspace(workspaceId);
            
            if (!workspace) {
                return {
                    isValid: false,
                    error: `Workspace with ID ${workspaceId} not found`
                };
            }

            return {
                isValid: true,
                workspace
            };
        } catch (error) {
            return {
                isValid: false,
                error: createErrorMessage('Failed to validate workspace: ', error)
            };
        }
    }

    /**
     * Get workspace hierarchy information
     */
    async getWorkspaceHierarchy(workspace: any): Promise<{
        parentInfo?: string;
        childInfo?: string;
        hierarchyType: string;
    }> {
        const workspaceService = this.agent.getWorkspaceService();
        const result = {
            hierarchyType: workspace.hierarchyType || 'workspace',
            parentInfo: undefined as string | undefined,
            childInfo: undefined as string | undefined
        };

        // Get parent information
        if (workspace.parentId && workspaceService) {
            try {
                const parent = await workspaceService.getWorkspace(workspace.parentId);
                if (parent) {
                    result.parentInfo = `within "${parent.name}"`;
                }
            } catch (error) {
                console.warn(`Failed to retrieve parent workspace: ${error}`);
            }
        }

        // Get child information
        if (workspace.childWorkspaces && workspace.childWorkspaces.length > 0) {
            result.childInfo = `Contains ${workspace.childWorkspaces.length} sub-items`;
        }

        return result;
    }

    /**
     * Get workspace activity summary
     */
    getWorkspaceActivitySummary(workspace: any, contextDepth: string = 'standard'): string {
        if (contextDepth === 'minimal' || !workspace.activityHistory || workspace.activityHistory.length === 0) {
            return '';
        }

        // Get recent activities (last 5 for standard, last 10 for comprehensive)
        const recentActivities = workspace.activityHistory
            .sort((a: any, b: any) => b.timestamp - a.timestamp)
            .slice(0, contextDepth === 'comprehensive' ? 10 : 5);

        if (recentActivities.length === 0) {
            return '';
        }

        let summary = '\n\nRecent workspace activities:';
        recentActivities.forEach((activity: any) => {
            const date = new Date(activity.timestamp).toLocaleString();
            let activityDesc = `\n- ${date}: `;
            
            switch (activity.action) {
                case 'view':
                    activityDesc += 'Viewed content';
                    break;
                case 'edit':
                    activityDesc += 'Modified content';
                    break;
                case 'create':
                    activityDesc += 'Created content';
                    break;
                case 'tool':
                    activityDesc += `Used ${activity.toolName || 'a tool'}`;
                    break;
                default:
                    activityDesc += 'Interacted with workspace';
            }
            
            summary += activityDesc;
        });

        return summary;
    }

    /**
     * Get workspace tags
     */
    getWorkspaceTags(workspace: any): string[] {
        const tags: string[] = [];
        
        // Add workspace root folder to tags
        if (workspace.rootFolder) {
            tags.push(`folder:${workspace.rootFolder.split('/').pop()}`);
        }

        // Add workspace type tag
        if (workspace.hierarchyType) {
            tags.push(`type:${workspace.hierarchyType}`);
        }

        // Add status tag
        if (workspace.status) {
            tags.push(`status:${workspace.status}`);
        }

        return tags;
    }
}