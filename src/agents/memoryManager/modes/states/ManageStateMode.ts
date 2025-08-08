/**
 * Location: /src/agents/memoryManager/modes/states/ManageStateMode.ts
 * Purpose: Consolidated state management mode combining edit, delete, and list functionality
 * 
 * This file consolidates:
 * - Original editStateMode.ts functionality
 * - Original deleteStateMode.ts functionality  
 * - Original listStatesMode.ts functionality
 * - State validation and management logic
 * 
 * Used by: MemoryManager agent for state management operations
 */

import { App } from 'obsidian';
import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager';
import { EditStateParams, DeleteStateParams, ListStatesParams, StateResult } from '../../types';
import { createErrorMessage } from '../../../../utils/errorUtils';
import { extractContextFromParams } from '../../../../utils/contextUtils';
import { MemoryService } from "../../services/MemoryService";
import { WorkspaceService } from "../../services/WorkspaceService";
import { createServiceIntegration } from '../../services/ValidationService';
import { SchemaBuilder, SchemaType } from '../../../../utils/schemas/SchemaBuilder';

type ManageStateParams = EditStateParams | DeleteStateParams | ListStatesParams;

/**
 * Consolidated ManageStateMode - combines all state management functionality
 */
export class ManageStateMode extends BaseMode<ManageStateParams, StateResult> {
    private app: App;
    private serviceIntegration: ReturnType<typeof createServiceIntegration>;
    private schemaBuilder: SchemaBuilder;

    constructor(private agent: MemoryManagerAgent) {
        super(
            'manageStates',
            'Manage States',
            'Edit, delete, or list states with comprehensive management capabilities',
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

    async execute(params: ManageStateParams): Promise<StateResult> {
        try {
            const operation = this.determineOperation(params);
            
            switch (operation) {
                case 'edit':
                    return this.executeEdit(params as EditStateParams);
                case 'delete':
                    return this.executeDelete(params as DeleteStateParams);
                case 'list':
                    return this.executeList(params as ListStatesParams);
                default:
                    return this.prepareResult(false, undefined, 'Unknown state management operation');
            }
        } catch (error) {
            return this.prepareResult(false, undefined, createErrorMessage('Error managing state: ', error));
        }
    }

    private determineOperation(params: ManageStateParams): 'edit' | 'delete' | 'list' {
        if ('name' in params || 'description' in params || 'addTags' in params || 'removeTags' in params) {
            return 'edit';
        }
        if ('stateId' in params && !('includeContext' in params) && !('limit' in params)) {
            return 'delete';
        }
        return 'list';
    }

    private async executeEdit(params: EditStateParams): Promise<StateResult> {
        const servicesResult = await this.getServices();
        if (!servicesResult.success) {
            return this.prepareResult(false, undefined, servicesResult.error);
        }

        const { memoryService } = servicesResult;
        const existingState = await memoryService!.getSnapshot(params.stateId);
        if (!existingState) {
            return this.prepareResult(false, undefined, `State not found: ${params.stateId}`);
        }

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

        // Handle tags
        let updatedTags = existingState.state?.metadata?.tags || [];
        if (params.addTags && params.addTags.length > 0) {
            updatedTags = [...new Set([...updatedTags, ...params.addTags])];
            hasUpdates = true;
        }
        if (params.removeTags && params.removeTags.length > 0) {
            updatedTags = updatedTags.filter(tag => !params.removeTags!.includes(tag));
            hasUpdates = true;
        }
        if (hasUpdates && (params.addTags || params.removeTags)) {
            updates['state.metadata.tags'] = updatedTags;
        }

        if (!hasUpdates) {
            return this.prepareResult(false, undefined, 'No updates provided for state');
        }

        const updatedState = await memoryService!.updateSnapshot(params.stateId, updates);
        return this.prepareResult(true, {
            stateId: updatedState.id,
            name: updatedState.name,
            description: updatedState.description,
            workspaceId: updatedState.workspaceId,
            timestamp: updatedState.timestamp,
            tags: updatedTags
        }, undefined, `State "${updatedState.name}" updated successfully`);
    }

    private async executeDelete(params: DeleteStateParams): Promise<StateResult> {
        const servicesResult = await this.getServices();
        if (!servicesResult.success) {
            return this.prepareResult(false, undefined, servicesResult.error);
        }

        const { memoryService } = servicesResult;
        const existingState = await memoryService!.getSnapshot(params.stateId);
        if (!existingState) {
            return this.prepareResult(false, undefined, `State not found: ${params.stateId}`);
        }

        const stateName = existingState.name;
        const workspaceId = existingState.workspaceId;

        await memoryService!.deleteSnapshot(params.stateId);

        return this.prepareResult(true, {
            stateId: params.stateId,
            name: stateName,
            workspaceId: workspaceId,
            deleted: true
        }, undefined, `State "${stateName}" deleted successfully`);
    }

    private async executeList(params: ListStatesParams): Promise<StateResult> {
        const servicesResult = await this.getServices();
        if (!servicesResult.success) {
            return this.prepareResult(false, undefined, servicesResult.error);
        }

        const { memoryService, workspaceService } = servicesResult;

        // Get workspace ID from context
        let workspaceId: string | undefined;
        const inheritedContext = this.getInheritedWorkspaceContext(params);
        if (inheritedContext?.workspaceId) {
            workspaceId = inheritedContext.workspaceId;
        }

        // Get states
        const states = await memoryService!.getStates(workspaceId, params.targetSessionId);

        // Filter by tags if provided
        let filteredStates = states;
        if (params.tags && params.tags.length > 0) {
            filteredStates = states.filter(state => {
                const stateTags = state.state?.metadata?.tags || [];
                return params.tags!.some(tag => stateTags.includes(tag));
            });
        }

        // Sort states
        const sortedStates = this.sortStates(filteredStates, params.order || 'desc');

        // Apply limit
        const limitedStates = params.limit ? sortedStates.slice(0, params.limit) : sortedStates;

        // Enhance state data
        const enhancedStates = await this.enhanceStatesWithContext(limitedStates, workspaceService!, params.includeContext);

        const contextString = workspaceId 
            ? `Found ${limitedStates.length} state(s) in workspace ${workspaceId}`
            : `Found ${limitedStates.length} state(s) across all workspaces`;

        return this.prepareResult(true, {
            states: enhancedStates,
            total: states.length,
            filtered: limitedStates.length,
            workspaceId: workspaceId
        }, undefined, contextString, inheritedContext);
    }

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

    private sortStates(states: any[], order: 'asc' | 'desc'): any[] {
        return states.sort((a, b) => {
            const timeA = a.timestamp || a.created || 0;
            const timeB = b.timestamp || b.created || 0;
            return order === 'asc' ? timeA - timeB : timeB - timeA;
        });
    }

    private async enhanceStatesWithContext(states: any[], workspaceService: WorkspaceService, includeContext?: boolean): Promise<any[]> {
        const workspaceCache = new Map<string, string>();
        
        return await Promise.all(states.map(async (state) => {
            let workspaceName = 'Unknown Workspace';
            
            if (!workspaceCache.has(state.workspaceId)) {
                try {
                    const workspace = await workspaceService.getWorkspace(state.workspaceId);
                    workspaceName = workspace?.name || 'Unknown Workspace';
                    workspaceCache.set(state.workspaceId, workspaceName);
                } catch {
                    workspaceCache.set(state.workspaceId, 'Unknown Workspace');
                }
            } else {
                workspaceName = workspaceCache.get(state.workspaceId)!;
            }

            const enhanced: any = {
                ...state,
                workspaceName,
                age: this.calculateStateAge(state.created || state.timestamp)
            };

            if (includeContext && state.snapshot) {
                enhanced.context = {
                    files: state.snapshot.activeFiles || [],
                    traceCount: 0, // Could be enhanced to count related traces
                    tags: state.state?.metadata?.tags || [],
                    summary: state.snapshot.activeTask || 'No active task recorded'
                };
            }

            return enhanced;
        }));
    }

    private calculateStateAge(timestamp: number): string {
        const now = Date.now();
        const age = now - timestamp;
        
        const days = Math.floor(age / (1000 * 60 * 60 * 24));
        if (days > 0) return `${days} day${days === 1 ? '' : 's'} ago`;
        
        const hours = Math.floor(age / (1000 * 60 * 60));
        if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
        
        const minutes = Math.floor(age / (1000 * 60));
        if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
        
        return 'Just now';
    }

    getParameterSchema(): any {
        return {
            type: 'object',
            properties: {
                // Edit parameters
                stateId: { type: 'string', description: 'ID of state to edit or delete' },
                name: { type: 'string', description: 'New state name (for edit operations)' },
                description: { type: 'string', description: 'New state description (for edit operations)' },
                addTags: { type: 'array', items: { type: 'string' }, description: 'Tags to add (for edit operations)' },
                removeTags: { type: 'array', items: { type: 'string' }, description: 'Tags to remove (for edit operations)' },

                // List parameters
                includeContext: { type: 'boolean', description: 'Include context information (for list operations)' },
                limit: { type: 'number', description: 'Maximum number of states to return (for list operations)' },
                targetSessionId: { type: 'string', description: 'Filter by session ID (for list operations)' },
                order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order (for list operations)' },
                tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags (for list operations)' }
            },
            additionalProperties: false
        };
    }

    getResultSchema(): any {
        return this.schemaBuilder.buildResultSchema(SchemaType.State, {
            mode: 'manageStates'
        });
    }
}