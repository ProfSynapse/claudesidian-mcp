/**
 * Location: /src/agents/memoryManager/modes/workspaces/UpdateWorkspaceMode.ts
 * Purpose: Update existing workspace properties and context
 * 
 * This mode allows updating various aspects of an existing workspace including
 * name, description, context, and other metadata without recreating it.
 * 
 * Used by: MemoryManager agent for workspace modification operations
 */

import { App } from 'obsidian';
import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager';
import { createServiceIntegration } from '../../services/ValidationService';
import { createErrorMessage } from '../../../../utils/errorUtils';
import { CommonResult, CommonParameters } from '../../../../types/mcp/AgentTypes';

// Define parameter and result types for workspace updates
export interface UpdateWorkspaceParameters extends CommonParameters {
    workspaceId: string;
    name?: string;
    description?: string;
    rootFolder?: string;
    purpose?: string;
    currentGoal?: string;
    status?: string;
    workflows?: Array<{
        name: string;
        when: string;
        steps: string[];
    }>;
    preferences?: string[];
    agents?: Array<{
        name: string;
        when: string;
        purpose: string;
    }>;
    relatedFolders?: string[];
    relatedFiles?: string[];
    keyFileInstructions?: string;
    associatedNotes?: string[];
}

export interface UpdateWorkspaceResult extends CommonResult {
    workspaceId: string;
    updated: boolean;
    updatedFields: string[];
    workspace?: any;
}

/**
 * UpdateWorkspaceMode - Modify existing workspace properties
 */
export class UpdateWorkspaceMode extends BaseMode<UpdateWorkspaceParameters, UpdateWorkspaceResult> {
    private app: App;
    private serviceIntegration: ReturnType<typeof createServiceIntegration>;
    
    constructor(private agent: MemoryManagerAgent) {
        super(
            'updateWorkspace',
            'Update Workspace',
            'Update an existing workspace with new properties, context, or metadata',
            '2.0.0'
        );

        this.app = agent.getApp();
        this.serviceIntegration = createServiceIntegration(this.app, {
            logLevel: 'warn',
            maxRetries: 2,
            fallbackBehavior: 'warn'
        });
    }
    
    async execute(params: UpdateWorkspaceParameters): Promise<UpdateWorkspaceResult> {
        try {
            // Get workspace service
            const serviceResult = await this.serviceIntegration.getWorkspaceService();
            if (!serviceResult.success || !serviceResult.service) {
                return this.prepareResult(false, {
                    workspaceId: params.workspaceId,
                    updated: false,
                    updatedFields: []
                }, `Workspace service not available: ${serviceResult.error}`);
            }
            
            const workspaceService = serviceResult.service;
            
            // Validate workspace exists
            const existingWorkspace = await workspaceService.getWorkspace(params.workspaceId);
            if (!existingWorkspace) {
                return this.prepareResult(false, {
                    workspaceId: params.workspaceId,
                    updated: false,
                    updatedFields: []
                }, `Workspace with ID ${params.workspaceId} not found`);
            }

            // Build update object and track updated fields
            const updates: any = {};
            const updatedFields: string[] = [];

            // Update basic properties
            if (params.name && params.name !== existingWorkspace.name) {
                updates.name = params.name;
                updatedFields.push('name');
            }

            if (params.description && params.description !== existingWorkspace.description) {
                updates.description = params.description;
                updatedFields.push('description');
            }

            if (params.rootFolder && params.rootFolder !== existingWorkspace.rootFolder) {
                // Ensure new root folder exists
                try {
                    const folder = this.app.vault.getAbstractFileByPath(params.rootFolder);
                    if (!folder) {
                        await this.app.vault.createFolder(params.rootFolder);
                    }
                } catch (folderError) {
                    console.warn(`Could not create new root folder: ${folderError}`);
                }
                updates.rootFolder = params.rootFolder;
                updatedFields.push('rootFolder');
            }

            if (params.keyFileInstructions && params.keyFileInstructions !== existingWorkspace.keyFileInstructions) {
                updates.keyFileInstructions = params.keyFileInstructions;
                updatedFields.push('keyFileInstructions');
            }

            if (params.relatedFolders) {
                updates.relatedFolders = params.relatedFolders;
                updatedFields.push('relatedFolders');
            }

            if (params.relatedFiles) {
                updates.relatedFiles = params.relatedFiles;
                updatedFields.push('relatedFiles');
            }

            // Hierarchy-related updates removed

            // Update context properties
            const contextUpdates: any = {};
            let hasContextUpdates = false;

            if (params.purpose && params.purpose !== existingWorkspace.context?.purpose) {
                contextUpdates.purpose = params.purpose;
                hasContextUpdates = true;
                updatedFields.push('context.purpose');
            }

            if (params.currentGoal && params.currentGoal !== existingWorkspace.context?.currentGoal) {
                contextUpdates.currentGoal = params.currentGoal;
                hasContextUpdates = true;
                updatedFields.push('context.currentGoal');
            }

            if (params.status && params.status !== existingWorkspace.context?.status) {
                contextUpdates.status = params.status;
                hasContextUpdates = true;
                updatedFields.push('context.status');
            }

            if (params.workflows) {
                contextUpdates.workflows = params.workflows;
                hasContextUpdates = true;
                updatedFields.push('context.workflows');
            }

            if (params.preferences) {
                contextUpdates.preferences = params.preferences;
                hasContextUpdates = true;
                updatedFields.push('context.preferences');
            }

            if (params.agents) {
                contextUpdates.agents = params.agents;
                hasContextUpdates = true;
                updatedFields.push('context.agents');
            }


            // If there are context updates, merge them with existing context
            if (hasContextUpdates) {
                updates.context = {
                    ...existingWorkspace.context,
                    ...contextUpdates
                };
            }

            // Add activity history entry
            const now = Date.now();
            const activityEntry = {
                timestamp: now,
                action: 'update',
                toolName: 'UpdateWorkspaceMode',
                context: `Updated workspace fields: ${updatedFields.join(', ')}`
            };

            updates.activityHistory = [
                ...(existingWorkspace.activityHistory || []),
                activityEntry
            ];
            updates.lastAccessed = now;

            // Check if there are actually updates to make
            if (updatedFields.length === 0) {
                return this.prepareResult(true, {
                    workspaceId: params.workspaceId,
                    updated: false,
                    updatedFields: [],
                    workspace: existingWorkspace
                }, undefined, 'No changes detected - workspace is already up to date');
            }

            // Perform the update
            await workspaceService.updateWorkspace(params.workspaceId, updates);
            
            // Get the updated workspace
            const updatedWorkspace = await workspaceService.getWorkspace(params.workspaceId);

            return this.prepareResult(true, {
                workspaceId: params.workspaceId,
                updated: true,
                updatedFields: updatedFields,
                workspace: updatedWorkspace
            }, undefined, `Successfully updated workspace "${existingWorkspace.name}" - modified ${updatedFields.length} fields`);
            
        } catch (error) {
            return this.prepareResult(false, {
                workspaceId: params.workspaceId,
                updated: false,
                updatedFields: []
            }, createErrorMessage('Error updating workspace: ', error));
        }
    }

    getParameterSchema(): any {
        const customSchema = {
            type: 'object',
            properties: {
                workspaceId: { 
                    type: 'string', 
                    description: 'ID of the workspace to update (REQUIRED)' 
                },
                name: { 
                    type: 'string', 
                    description: 'New workspace name' 
                },
                description: { 
                    type: 'string', 
                    description: 'New workspace description' 
                },
                rootFolder: { 
                    type: 'string', 
                    description: 'New root folder path for this workspace' 
                },
                purpose: { 
                    type: 'string', 
                    description: 'Updated purpose for this workspace' 
                },
                currentGoal: { 
                    type: 'string', 
                    description: 'Updated current goal' 
                },
                status: { 
                    type: 'string', 
                    description: 'Updated status' 
                },
                workflows: {
                    type: 'array',
                    description: 'Updated workflows for different situations',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            when: { type: 'string' },
                            steps: { type: 'array', items: { type: 'string' } }
                        },
                        required: ['name', 'when', 'steps']
                    }
                },
                preferences: { 
                    type: 'array', 
                    items: { type: 'string' }, 
                    description: 'Updated user preferences' 
                },
                agents: {
                    type: 'array',
                    description: 'Updated associated agents',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            when: { type: 'string' },
                            purpose: { type: 'string' }
                        },
                        required: ['name', 'when', 'purpose']
                    }
                },
                relatedFolders: { 
                    type: 'array', 
                    items: { type: 'string' }, 
                    description: 'Updated related folders' 
                },
                relatedFiles: { 
                    type: 'array', 
                    items: { type: 'string' }, 
                    description: 'Updated related files' 
                },
                keyFileInstructions: { 
                    type: 'string', 
                    description: 'Updated key file instructions' 
                }
            },
            required: ['workspaceId']
        };
        
        return this.getMergedSchema(customSchema);
    }
    
    getResultSchema(): any {
        return {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                data: {
                    type: 'object',
                    properties: {
                        workspaceId: { type: 'string' },
                        updated: { type: 'boolean' },
                        updatedFields: { 
                            type: 'array', 
                            items: { type: 'string' },
                            description: 'List of fields that were updated'
                        },
                        workspace: { 
                            type: 'object',
                            description: 'Updated workspace object'
                        }
                    },
                    required: ['workspaceId', 'updated', 'updatedFields']
                }
            }
        };
    }
}