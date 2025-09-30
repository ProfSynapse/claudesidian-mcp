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
    fieldPath: string; // e.g., 'name', 'context.purpose', 'context.workflows[0].name'
    newValue: any; // The new value to set at the field path
}

export interface UpdateWorkspaceResult extends CommonResult {
    workspaceId: string;
    updated: boolean;
    fieldPath: string;
    oldValue?: any;
    newValue: any;
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
                    fieldPath: params.fieldPath,
                    newValue: params.newValue
                }, `Workspace service not available: ${serviceResult.error}`);
            }
            
            const workspaceService = serviceResult.service;
            
            // Validate workspace exists
            const existingWorkspace = await workspaceService.getWorkspace(params.workspaceId);
            if (!existingWorkspace) {
                return this.prepareResult(false, {
                    workspaceId: params.workspaceId,
                    updated: false,
                    fieldPath: params.fieldPath,
                    newValue: params.newValue
                }, `Workspace with ID ${params.workspaceId} not found`);
            }

            // Validate field path
            const pathValidation = this.validateFieldPath(params.fieldPath);
            if (!pathValidation.isValid) {
                return this.prepareResult(false, {
                    workspaceId: params.workspaceId,
                    updated: false,
                    fieldPath: params.fieldPath,
                    newValue: params.newValue
                }, `Invalid field path: ${pathValidation.error}`);
            }

            // Get current value at field path
            const oldValue = this.getValueAtPath(existingWorkspace, params.fieldPath);
            
            // Check if value actually changed
            if (this.deepEqual(oldValue, params.newValue)) {
                return this.prepareResult(true, {
                    workspaceId: params.workspaceId,
                    updated: false,
                    fieldPath: params.fieldPath,
                    oldValue: oldValue,
                    newValue: params.newValue,
                    workspace: existingWorkspace
                }, undefined, 'No changes detected - field value is already up to date');
            }

            // Special handling for rootFolder - ensure it exists
            if (params.fieldPath === 'rootFolder' && typeof params.newValue === 'string') {
                try {
                    const folder = this.app.vault.getAbstractFileByPath(params.newValue);
                    if (!folder) {
                        await this.app.vault.createFolder(params.newValue);
                    }
                } catch (folderError) {
                    console.warn(`Could not create new root folder: ${folderError}`);
                }
            }

            // Create a deep copy and update the field
            const workspaceCopy = JSON.parse(JSON.stringify(existingWorkspace));
            this.setValueAtPath(workspaceCopy, params.fieldPath, params.newValue);

            // Add activity history entry
            const now = Date.now();
            const activityEntry = {
                timestamp: now,
                action: 'update' as const,
                toolName: 'UpdateWorkspaceMode',
                context: `Updated ${params.fieldPath}: ${this.formatValueForLog(oldValue)} → ${this.formatValueForLog(params.newValue)}`
            };

            // Activity history not supported in split-file storage architecture
            workspaceCopy.lastAccessed = now;

            // Perform the update
            await workspaceService.updateWorkspace(params.workspaceId, workspaceCopy);
            
            // Get the updated workspace
            const updatedWorkspace = await workspaceService.getWorkspace(params.workspaceId);

            return this.prepareResult(true, {
                workspaceId: params.workspaceId,
                updated: true,
                fieldPath: params.fieldPath,
                oldValue: oldValue,
                newValue: params.newValue,
                workspace: updatedWorkspace
            }, undefined, `Successfully updated ${params.fieldPath} in workspace "${existingWorkspace.name}"`);
            
        } catch (error) {
            return this.prepareResult(false, {
                workspaceId: params.workspaceId,
                updated: false,
                fieldPath: params.fieldPath,
                newValue: params.newValue
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
                fieldPath: {
                    type: 'string',
                    description: 'Path to the field to update. Supports nested paths with dot notation and array indices in brackets. Examples: "name", "description", "context.purpose", "context.workflows[0].name", "context.keyFiles[0].files.resume"',
                    pattern: '^[a-zA-Z][a-zA-Z0-9_]*(?:\\.[a-zA-Z][a-zA-Z0-9_]*|\\[[0-9]+\\])*$'
                },
                newValue: {
                    description: 'The new value to set at the specified field path. Can be any type (string, number, boolean, array, object).'
                }
            },
            required: ['workspaceId', 'fieldPath', 'newValue']
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
                        fieldPath: { 
                            type: 'string', 
                            description: 'The field path that was updated'
                        },
                        oldValue: {
                            description: 'The previous value at the field path'
                        },
                        newValue: {
                            description: 'The new value that was set'
                        },
                        workspace: { 
                            type: 'object',
                            description: 'Updated workspace object'
                        }
                    },
                    required: ['workspaceId', 'updated', 'fieldPath', 'newValue']
                }
            }
        };
    }

    /**
     * Validate field path format and allowed fields
     */
    private validateFieldPath(path: string): { isValid: boolean; error?: string } {
        if (!path || path.trim() === '') {
            return { isValid: false, error: 'Field path cannot be empty' };
        }

        // Check basic pattern
        const validPattern = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*|\[[0-9]+\])*$/;
        if (!validPattern.test(path)) {
            return { 
                isValid: false, 
                error: 'Invalid path format. Use dot notation for nested fields and [index] for arrays. Example: "context.workflows[0].name"' 
            };
        }

        // Parse and validate allowed root fields
        const keys = this.parseFieldPath(path);
        const rootField = keys[0];
        
        const allowedRootFields = [
            'name', 'description', 'rootFolder', 'relatedFolders', 'relatedFiles', 
            'associatedNotes', 'keyFileInstructions', 'preferences', 'projectPlan',
            'context', 'activityHistory', 'checkpoints', 'completionStatus'
        ];
        
        if (!allowedRootFields.includes(rootField)) {
            return { 
                isValid: false, 
                error: `Invalid root field "${rootField}". Allowed fields: ${allowedRootFields.join(', ')}` 
            };
        }

        // Special validation for context fields
        if (rootField === 'context' && keys.length > 1) {
            const contextField = keys[1];
            const allowedContextFields = [
                'purpose', 'currentGoal', 'status', 'workflows', 'keyFiles', 'preferences', 'agents'
            ];
            
            if (!allowedContextFields.includes(contextField)) {
                return { 
                    isValid: false, 
                    error: `Invalid context field "${contextField}". Allowed context fields: ${allowedContextFields.join(', ')}` 
                };
            }
        }

        // Validate array indices are reasonable (0-999)
        for (const key of keys) {
            if (this.isArrayIndex(key)) {
                const index = parseInt(key, 10);
                if (index < 0 || index > 999) {
                    return { 
                        isValid: false, 
                        error: `Array index ${index} is out of reasonable range (0-999)` 
                    };
                }
            }
        }

        return { isValid: true };
    }

    /**
     * Get value at a nested field path (e.g., 'context.purpose', 'context.workflows[0].name')
     */
    private getValueAtPath(obj: any, path: string): any {
        if (!path) return obj;
        
        const keys = this.parseFieldPath(path);
        let current = obj;
        
        for (const key of keys) {
            if (current === null || current === undefined) {
                return undefined;
            }
            current = current[key];
        }
        
        return current;
    }

    /**
     * Set value at a nested field path, creating intermediate objects/arrays as needed
     */
    private setValueAtPath(obj: any, path: string, value: any): void {
        if (!path) return;
        
        const keys = this.parseFieldPath(path);
        let current = obj;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            const nextKey = keys[i + 1];
            
            if (!(key in current) || current[key] === null || current[key] === undefined) {
                // Create object or array based on next key
                current[key] = this.isArrayIndex(nextKey) ? [] : {};
            }
            
            current = current[key];
        }
        
        const finalKey = keys[keys.length - 1];
        current[finalKey] = value;
    }

    /**
     * Parse field path into individual keys, handling array indices
     * e.g., 'context.workflows[0].name' -> ['context', 'workflows', '0', 'name']
     */
    private parseFieldPath(path: string): string[] {
        const keys: string[] = [];
        let current = '';
        let i = 0;
        
        while (i < path.length) {
            const char = path[i];
            
            if (char === '.') {
                if (current) {
                    keys.push(current);
                    current = '';
                }
            } else if (char === '[') {
                if (current) {
                    keys.push(current);
                    current = '';
                }
                // Find closing bracket
                i++;
                while (i < path.length && path[i] !== ']') {
                    current += path[i];
                    i++;
                }
                if (current) {
                    keys.push(current);
                    current = '';
                }
            } else if (char !== ']') {
                current += char;
            }
            
            i++;
        }
        
        if (current) {
            keys.push(current);
        }
        
        return keys;
    }

    /**
     * Check if a key looks like an array index (all digits)
     */
    private isArrayIndex(key: string): boolean {
        return /^\d+$/.test(key);
    }

    /**
     * Deep equality check for values
     */
    private deepEqual(a: any, b: any): boolean {
        if (a === b) return true;
        
        if (a === null || b === null || a === undefined || b === undefined) {
            return a === b;
        }
        
        if (typeof a !== typeof b) return false;
        
        if (typeof a !== 'object') return a === b;
        
        if (Array.isArray(a) !== Array.isArray(b)) return false;
        
        if (Array.isArray(a)) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (!this.deepEqual(a[i], b[i])) return false;
            }
            return true;
        }
        
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        
        if (keysA.length !== keysB.length) return false;
        
        for (const key of keysA) {
            if (!keysB.includes(key)) return false;
            if (!this.deepEqual(a[key], b[key])) return false;
        }
        
        return true;
    }

    /**
     * Format value for logging (truncate if too long)
     */
    private formatValueForLog(value: any): string {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        
        let str: string;
        if (typeof value === 'string') {
            str = `"${value}"`;
        } else if (typeof value === 'object') {
            str = JSON.stringify(value);
        } else {
            str = String(value);
        }
        
        return str.length > 100 ? str.substring(0, 97) + '...' : str;
    }
}