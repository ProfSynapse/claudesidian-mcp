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
import { MemoryManagerAgent } from '../../memoryManager'
import { EditSessionParams, SessionResult } from '../../types';
import { createErrorMessage } from '../../../../utils/errorUtils';
import { extractContextFromParams } from '../../../../utils/contextUtils';
import { MemoryService } from "../../services/MemoryService";
import { WorkspaceService } from '../../../../services/WorkspaceService';
import { createServiceIntegration } from '../../services/ValidationService';
import { SchemaBuilder, SchemaType } from '../../../../utils/schemas/SchemaBuilder';

/**
 * Union type for all management parameters
 */
type UpdateSessionParams = EditSessionParams;

/**
 * Consolidated UpdateSessionMode - combines all session update functionality
 */
export class UpdateSessionMode extends BaseMode<UpdateSessionParams, SessionResult> {
    private app: App;
    private serviceIntegration: ReturnType<typeof createServiceIntegration>;
    private schemaBuilder: SchemaBuilder;

    constructor(private agent: MemoryManagerAgent) {
        super(
            'updateSession',
            'Update Session',
            'Edit, delete, or list sessions with comprehensive update capabilities',
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
    async execute(params: UpdateSessionParams): Promise<SessionResult> {
        try {
            // Determine operation type based on parameters
            const operation = this.determineOperation(params);
            
            // Only edit operation supported
            return this.executeEdit(params);

        } catch (error) {
            return this.prepareResult(false, undefined, createErrorMessage('Error managing session: ', error));
        }
    }

    /**
     * Determine operation type from parameters
     */
    private determineOperation(params: UpdateSessionParams): 'edit' {
        // Only edit operation supported
        return 'edit';
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

        // Phase 2: Get target session ID and workspaceId
        const targetSessionId = params.targetSessionId || params.sessionId;
        if (!targetSessionId) {
            return this.prepareResult(false, undefined, 'No session ID provided for editing');
        }

        // Extract workspaceId from params
        const parsedContext = params.workspaceContext ?
            (typeof params.workspaceContext === 'string' ? JSON.parse(params.workspaceContext) : params.workspaceContext) : null;
        const workspaceId = parsedContext?.workspaceId || 'default-workspace';

        // Phase 3: Load existing session
        const existingSession = await memoryService.getSession(workspaceId, targetSessionId);
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

        if (!hasUpdates) {
            return this.prepareResult(false, undefined, 'No updates provided for session');
        }

        // Phase 5: Get current session and apply updates
        const currentSession = await memoryService.getSession(workspaceId, targetSessionId);
        if (!currentSession) {
            return this.prepareResult(false, undefined, `Session ${targetSessionId} not found`);
        }

        const updatedSession = { ...currentSession, ...updates };
        await memoryService.updateSession(workspaceId, targetSessionId, updatedSession);

        // Phase 6: Prepare result
        return this.prepareResult(
            true,
            {
                sessionId: updatedSession.id,
                name: updatedSession.name,
                description: updatedSession.description,
                workspaceId: updatedSession.workspaceId
            },
            undefined,
            `Session "${updatedSession.name}" updated successfully`
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
     * Schema methods - returns combined schema for all operations
     */
    getParameterSchema(): any {
        // Combined schema that supports edit and delete operations
        const customSchema = {
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
                    description: 'ID of session to edit'
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
                }
            },
            additionalProperties: false
        };
        
        return this.getMergedSchema(customSchema);
    }

    getResultSchema(): any {
        return this.schemaBuilder.buildResultSchema(SchemaType.Session, {
            mode: 'manageSessions'
        });
    }
}