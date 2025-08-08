/**
 * Location: /src/agents/memoryManager/modes/sessions/ManageSessionMode.ts
 * Purpose: Consolidated session management mode combining edit, delete, and list functionality
 * 
 * This file consolidates:
 * - Original editSessionMode.ts functionality
 * - Original deleteSessionMode.ts functionality  
 * - Original listSessionsMode.ts functionality
 * - Session validation and management logic
 * 
 * Used by: MemoryManager agent for session management operations
 */

import { App } from 'obsidian';
import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager';
import { EditSessionParams, DeleteSessionParams, ListSessionsParams, SessionResult } from '../../types';
import { createErrorMessage } from '../../../../utils/errorUtils';
import { extractContextFromParams } from '../../../../utils/contextUtils';
import { MemoryService } from "../../services/MemoryService";
import { WorkspaceService } from "../../services/WorkspaceService";
import { createServiceIntegration } from '../../services/ValidationService';
import { SchemaBuilder, SchemaType } from '../../../../utils/schemas/SchemaBuilder';

/**
 * Union type for all management parameters
 */
type ManageSessionParams = EditSessionParams | DeleteSessionParams | ListSessionsParams;

/**
 * Consolidated ManageSessionMode - combines all session management functionality
 */
export class ManageSessionMode extends BaseMode<ManageSessionParams, SessionResult> {
    private app: App;
    private serviceIntegration: ReturnType<typeof createServiceIntegration>;
    private schemaBuilder: SchemaBuilder;

    constructor(private agent: MemoryManagerAgent) {
        super(
            'manageSessions',
            'Manage Sessions',
            'Edit, delete, or list sessions with comprehensive management capabilities',
            '2.0.0'
        );

        this.app = agent.getApp();
        this.serviceIntegration = createServiceIntegration(this.app, {
            logLevel: 'warn',
            maxRetries: 2,
            fallbackBehavior: 'warn'
        });
        this.schemaBuilder = new SchemaBuilder();
    }

    /**
     * Execute session management based on operation type
     */
    async execute(params: ManageSessionParams): Promise<SessionResult> {
        try {
            // Determine operation type based on parameters
            const operation = this.determineOperation(params);
            
            switch (operation) {
                case 'edit':
                    return this.executeEdit(params as EditSessionParams);
                case 'delete':
                    return this.executeDelete(params as DeleteSessionParams);
                case 'list':
                    return this.executeList(params as ListSessionsParams);
                default:
                    return this.prepareResult(false, undefined, 'Unknown session management operation');
            }

        } catch (error) {
            return this.prepareResult(false, undefined, createErrorMessage('Error managing session: ', error));
        }
    }

    /**
     * Determine operation type from parameters
     */
    private determineOperation(params: ManageSessionParams): 'edit' | 'delete' | 'list' {
        // Check for edit-specific parameters
        if ('name' in params || 'description' in params || 'sessionGoal' in params || 'isActive' in params || 'addTags' in params || 'removeTags' in params) {
            return 'edit';
        }
        
        // Check for delete-specific parameters
        if ('deleteMemoryTraces' in params || 'deleteAssociatedStates' in params) {
            return 'delete';
        }
        
        // Check for list-specific parameters
        if ('activeOnly' in params || 'limit' in params || 'order' in params) {
            return 'list';
        }
        
        // Default to list if no specific parameters found
        return 'list';
    }

    /**
     * Execute edit session operation (consolidated from editSessionMode.ts)
     */
    private async executeEdit(params: EditSessionParams): Promise<SessionResult> {
        // Phase 1: Get services and validate
        const servicesResult = await this.getServices();
        if (!servicesResult.success) {
            return this.prepareResult(false, undefined, servicesResult.error);
        }

        const { memoryService } = servicesResult;
        if (!memoryService) {
            return this.prepareResult(false, undefined, 'Memory service not available');
        }

        // Phase 2: Get target session ID
        const targetSessionId = params.targetSessionId || params.sessionId;
        if (!targetSessionId) {
            return this.prepareResult(false, undefined, 'No session ID provided for editing');
        }

        // Phase 3: Load existing session
        const existingSession = await memoryService.getSession(targetSessionId);
        if (!existingSession) {
            return this.prepareResult(false, undefined, `Session not found: ${targetSessionId}`, extractContextFromParams(params));
        }

        // Phase 4: Prepare updates
        const updates: any = {};
        let hasUpdates = false;

        if (params.name !== undefined) {
            updates.name = params.name;
            hasUpdates = true;
        }

        if (params.description !== undefined) {
            updates.description = params.description;
            hasUpdates = true;
        }

        if (params.sessionGoal !== undefined) {
            updates.sessionGoal = params.sessionGoal;
            hasUpdates = true;
        }

        if (params.isActive !== undefined) {
            updates.isActive = params.isActive;
            if (!params.isActive && !updates.endTime) {
                updates.endTime = Date.now();
            }
            hasUpdates = true;
        }

        // Handle tags
        let updatedTags = existingSession.tags || [];
        if (params.addTags && params.addTags.length > 0) {
            updatedTags = [...new Set([...updatedTags, ...params.addTags])];
            hasUpdates = true;
        }
        if (params.removeTags && params.removeTags.length > 0) {
            updatedTags = updatedTags.filter(tag => !params.removeTags!.includes(tag));
            hasUpdates = true;
        }
        if (hasUpdates && (params.addTags || params.removeTags)) {
            updates.tags = updatedTags;
        }

        if (!hasUpdates) {
            return this.prepareResult(false, undefined, 'No updates provided for session');
        }

        // Phase 5: Update session
        const updatedSession = await memoryService.updateSession(targetSessionId, updates);

        // Phase 6: Prepare result
        return this.prepareResult(
            true,
            {
                sessionId: updatedSession.id,
                name: updatedSession.name,
                description: updatedSession.description,
                workspaceId: updatedSession.workspaceId,
                isActive: updatedSession.isActive,
                startTime: updatedSession.startTime,
                endTime: updatedSession.endTime,
                tags: updatedSession.tags
            },
            undefined,
            `Session "${updatedSession.name}" updated successfully`
        );
    }

    /**
     * Execute delete session operation (consolidated from deleteSessionMode.ts)
     */
    private async executeDelete(params: DeleteSessionParams): Promise<SessionResult> {
        // Phase 1: Get services and validate
        const servicesResult = await this.getServices();
        if (!servicesResult.success) {
            return this.prepareResult(false, undefined, servicesResult.error);
        }

        const { memoryService } = servicesResult;
        if (!memoryService) {
            return this.prepareResult(false, undefined, 'Memory service not available');
        }

        // Phase 2: Get target session ID
        const targetSessionId = params.targetSessionId || params.sessionId;
        if (!targetSessionId) {
            return this.prepareResult(false, undefined, 'No session ID provided for deletion');
        }

        // Phase 3: Load existing session for confirmation
        const existingSession = await memoryService.getSession(targetSessionId);
        if (!existingSession) {
            return this.prepareResult(false, undefined, `Session not found: ${targetSessionId}`, extractContextFromParams(params));
        }

        const sessionName = existingSession.name;
        const workspaceId = existingSession.workspaceId;

        // Phase 4: Delete memory traces if requested
        if (params.deleteMemoryTraces) {
            try {
                await memoryService.deleteSessionTraces(targetSessionId);
            } catch (error) {
                console.warn('Warning deleting memory traces:', error);
                // Continue with session deletion even if trace deletion fails
            }
        }

        // Phase 5: Delete associated states if requested
        if (params.deleteAssociatedStates) {
            try {
                const states = await memoryService.getStatesBySession(targetSessionId);
                for (const state of states) {
                    await memoryService.deleteSnapshot(state.id);
                }
            } catch (error) {
                console.warn('Warning deleting associated states:', error);
                // Continue with session deletion even if state deletion fails
            }
        }

        // Phase 6: Delete session
        await memoryService.deleteSession(targetSessionId);

        // Phase 7: Prepare result
        return this.prepareResult(
            true,
            {
                sessionId: targetSessionId,
                name: sessionName,
                workspaceId: workspaceId,
                deleted: true,
                deletedMemoryTraces: params.deleteMemoryTraces || false,
                deletedAssociatedStates: params.deleteAssociatedStates || false
            },
            undefined,
            `Session "${sessionName}" deleted successfully`
        );
    }

    /**
     * Execute list sessions operation (consolidated from listSessionsMode.ts)
     */
    private async executeList(params: ListSessionsParams): Promise<SessionResult> {
        // Phase 1: Get services and validate
        const servicesResult = await this.getServices();
        if (!servicesResult.success) {
            return this.prepareResult(false, undefined, servicesResult.error);
        }

        const { memoryService, workspaceService } = servicesResult;
        if (!memoryService) {
            return this.prepareResult(false, undefined, 'Memory service not available');
        }

        // Phase 2: Get workspace ID from context
        let workspaceId: string | undefined;
        const inheritedContext = this.getInheritedWorkspaceContext(params);
        if (inheritedContext?.workspaceId) {
            workspaceId = inheritedContext.workspaceId;
        }
        
        // Ensure workspaceId is defined
        const finalWorkspaceId = workspaceId || 'global-workspace-default';

        // Phase 3: Get sessions
        const sessions = await memoryService.getSessions(finalWorkspaceId, params.activeOnly);

        // Phase 4: Filter by tags if provided
        let filteredSessions = sessions;
        if (params.tags && params.tags.length > 0) {
            filteredSessions = sessions.filter(session => 
                session.tags && params.tags!.some(tag => session.tags!.includes(tag))
            );
        }

        // Phase 5: Sort sessions
        const sortedSessions = this.sortSessions(filteredSessions, params.order || 'desc');

        // Phase 6: Apply limit
        const limitedSessions = params.limit ? sortedSessions.slice(0, params.limit) : sortedSessions;

        // Phase 7: Enhance session data with workspace names
        if (!workspaceService) {
            throw new Error('Workspace service not available');
        }
        const enhancedSessions = await this.enhanceSessionsWithWorkspaceNames(limitedSessions, workspaceService);

        // Phase 8: Prepare result
        const contextString = workspaceId 
            ? `Found ${limitedSessions.length} session(s) in workspace ${workspaceId}`
            : `Found ${limitedSessions.length} session(s) across all workspaces`;

        return this.prepareResult(
            true,
            {
                sessions: enhancedSessions,
                total: sessions.length,
                filtered: limitedSessions.length,
                workspaceId: workspaceId,
                filters: {
                    activeOnly: params.activeOnly || false,
                    tags: params.tags || [],
                    order: params.order || 'desc',
                    limit: params.limit
                }
            },
            undefined,
            contextString,
            inheritedContext || undefined
        );
    }

    /**
     * Get required services with validation
     */
    private async getServices(): Promise<{success: boolean; error?: string; memoryService?: MemoryService; workspaceService?: WorkspaceService}> {
        const [memoryResult, workspaceResult] = await Promise.all([
            this.serviceIntegration.getMemoryService(),
            this.serviceIntegration.getWorkspaceService()
        ]);

        if (!memoryResult.success || !memoryResult.service) {
            return { success: false, error: `Memory service not available: ${memoryResult.error}` };
        }

        if (!workspaceResult.success || !workspaceResult.service) {
            return { success: false, error: `Workspace service not available: ${workspaceResult.error}` };
        }

        return { 
            success: true, 
            memoryService: memoryResult.service, 
            workspaceService: workspaceResult.service 
        };
    }

    /**
     * Sort sessions by the specified order
     */
    private sortSessions(sessions: any[], order: 'asc' | 'desc'): any[] {
        return sessions.sort((a, b) => {
            const timeA = a.startTime || 0;
            const timeB = b.startTime || 0;
            return order === 'asc' ? timeA - timeB : timeB - timeA;
        });
    }

    /**
     * Enhance sessions with workspace names
     */
    private async enhanceSessionsWithWorkspaceNames(sessions: any[], workspaceService: WorkspaceService): Promise<any[]> {
        const workspaceCache = new Map<string, string>();
        
        const enhanced = await Promise.all(sessions.map(async (session) => {
            let workspaceName = 'Unknown Workspace';
            
            if (!workspaceCache.has(session.workspaceId)) {
                try {
                    const workspace = await workspaceService.getWorkspace(session.workspaceId);
                    workspaceName = workspace?.name || 'Unknown Workspace';
                    workspaceCache.set(session.workspaceId, workspaceName);
                } catch {
                    workspaceCache.set(session.workspaceId, 'Unknown Workspace');
                }
            } else {
                workspaceName = workspaceCache.get(session.workspaceId)!;
            }

            return {
                ...session,
                workspaceName,
                age: this.calculateSessionAge(session.startTime),
                status: session.isActive ? 'active' : 'completed'
            };
        }));

        return enhanced;
    }

    /**
     * Calculate human-readable session age
     */
    private calculateSessionAge(startTime: number): string {
        const now = Date.now();
        const age = now - startTime;
        
        const days = Math.floor(age / (1000 * 60 * 60 * 24));
        if (days > 0) {
            return `${days} day${days === 1 ? '' : 's'} ago`;
        }
        
        const hours = Math.floor(age / (1000 * 60 * 60));
        if (hours > 0) {
            return `${hours} hour${hours === 1 ? '' : 's'} ago`;
        }
        
        const minutes = Math.floor(age / (1000 * 60));
        if (minutes > 0) {
            return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
        }
        
        return 'Just now';
    }

    /**
     * Schema methods - returns combined schema for all operations
     */
    getParameterSchema(): any {
        // Combined schema that supports all three operations
        return {
            type: 'object',
            properties: {
                // Common parameters
                sessionId: {
                    type: 'string',
                    description: 'Session ID for tracking this operation'
                },
                workspaceContext: {
                    type: 'object',
                    description: 'Workspace context for scoping operations'
                },

                // Edit operation parameters
                targetSessionId: {
                    type: 'string',
                    description: 'ID of session to edit or delete'
                },
                name: {
                    type: 'string',
                    description: 'New session name (for edit operations)'
                },
                description: {
                    type: 'string',
                    description: 'New session description (for edit operations)'
                },
                sessionGoal: {
                    type: 'string',
                    description: 'New session goal (for edit operations)'
                },
                isActive: {
                    type: 'boolean',
                    description: 'Whether session is active (for edit operations)'
                },
                addTags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tags to add to session (for edit operations)'
                },
                removeTags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tags to remove from session (for edit operations)'
                },

                // Delete operation parameters
                deleteMemoryTraces: {
                    type: 'boolean',
                    description: 'Whether to delete associated memory traces (for delete operations)'
                },
                deleteAssociatedStates: {
                    type: 'boolean',
                    description: 'Whether to delete associated states (for delete operations)'
                },

                // List operation parameters
                activeOnly: {
                    type: 'boolean',
                    description: 'Only list active sessions (for list operations)'
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of sessions to return (for list operations)'
                },
                order: {
                    type: 'string',
                    enum: ['asc', 'desc'],
                    description: 'Sort order for sessions (for list operations)'
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Filter by tags (for list operations)'
                }
            },
            additionalProperties: false
        };
    }

    getResultSchema(): any {
        return this.schemaBuilder.buildResultSchema(SchemaType.Session, {
            mode: 'manageSessions'
        });
    }
}