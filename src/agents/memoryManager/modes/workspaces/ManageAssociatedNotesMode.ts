/**
 * Location: /src/agents/memoryManager/modes/workspaces/ManageAssociatedNotesMode.ts
 * Purpose: Handle managing note associations with workspaces (add/remove/list operations)
 * 
 * This mode allows adding, removing, and listing notes associated with a workspace.
 * It validates file paths, manages workspace-note relationships, and handles bulk operations.
 * 
 * Used by: MemoryManagerAgent for workspace note association operations
 * Integrates with: WorkspaceService for workspace operations, Obsidian Vault API for file validation
 */

import { App } from 'obsidian';
import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager'
import { createServiceIntegration } from '../../services/ValidationService';
import { CommonParameters, CommonResult } from '../../../../types/mcp';
import { createErrorMessage } from '../../../../utils/errorUtils';

/**
 * Parameters for managing associated notes
 */
interface ManageAssociatedNotesParameters extends CommonParameters {
  /**
   * Workspace identifier
   */
  workspaceId: string;
  
  /**
   * Operation to perform
   */
  operation: 'add' | 'remove' | 'list';
  
  /**
   * Note paths for add/remove operations
   */
  notePaths?: string[];
}

/**
 * Result for managing associated notes operations
 */
interface ManageAssociatedNotesResult extends CommonResult {
  data: {
    operation: string;
    workspaceId: string;
    notePaths: string[];
    addedNotes?: string[];
    removedNotes?: string[];
    existingNotes?: string[];
    errors?: string[];
  };
}

/**
 * Mode for managing note associations with workspaces
 */
export class ManageAssociatedNotesMode extends BaseMode<ManageAssociatedNotesParameters, ManageAssociatedNotesResult> {
  private app: App;
  private serviceIntegration: ReturnType<typeof createServiceIntegration>;
  
  constructor(private agent: MemoryManagerAgent) {
    super(
      'manageAssociatedNotes',
      'Manage Associated Notes',
      'Manage note associations with workspaces (add/remove/list notes)',
      '1.0.0'
    );

    this.app = agent.getApp();
    this.serviceIntegration = createServiceIntegration(this.app, {
      logLevel: 'warn',
      maxRetries: 2,
      fallbackBehavior: 'warn'
    });
  }
  
  async execute(params: ManageAssociatedNotesParameters): Promise<ManageAssociatedNotesResult> {
    const startTime = Date.now();
    console.log(`[ManageAssociatedNotesMode] Starting operation: ${params.operation} for workspace: ${params.workspaceId}`);
    
    try {
      // Get workspace service
      const serviceResult = await this.serviceIntegration.getWorkspaceService();
      if (!serviceResult.success || !serviceResult.service) {
        return this.prepareResult(false, {
          operation: params.operation,
          workspaceId: params.workspaceId,
          notePaths: [],
          errors: [`Workspace service not available: ${serviceResult.error}`]
        }, `Workspace service not available: ${serviceResult.error}`);
      }
      
      const workspaceService = serviceResult.service;
      
      // Validate workspace exists
      const workspace = await workspaceService.getWorkspace(params.workspaceId);
      if (!workspace) {
        return this.prepareResult(false, {
          operation: params.operation,
          workspaceId: params.workspaceId,
          notePaths: [],
          errors: [`Workspace not found: ${params.workspaceId}`]
        }, `Workspace not found: ${params.workspaceId}`);
      }
      
      // Handle different operations
      switch (params.operation) {
        case 'list':
          return await this.handleListOperation(workspace, params);
          
        case 'add':
          if (!params.notePaths || params.notePaths.length === 0) {
            return this.prepareResult(false, {
              operation: params.operation,
              workspaceId: params.workspaceId,
              notePaths: [],
              errors: ['Note paths are required for add operation']
            }, 'Note paths are required for add operation');
          }
          return await this.handleAddOperation(workspaceService, workspace, params);
          
        case 'remove':
          if (!params.notePaths || params.notePaths.length === 0) {
            return this.prepareResult(false, {
              operation: params.operation,
              workspaceId: params.workspaceId,
              notePaths: [],
              errors: ['Note paths are required for remove operation']
            }, 'Note paths are required for remove operation');
          }
          return await this.handleRemoveOperation(workspaceService, workspace, params);
          
        default:
          return this.prepareResult(false, {
            operation: params.operation,
            workspaceId: params.workspaceId,
            notePaths: [],
            errors: [`Invalid operation: ${params.operation}. Valid operations are: add, remove, list`]
          }, `Invalid operation: ${params.operation}`);
      }
      
    } catch (error) {
      console.error('[ManageAssociatedNotesMode] Error:', error);
      return this.prepareResult(false, {
        operation: params.operation,
        workspaceId: params.workspaceId,
        notePaths: [],
        errors: [createErrorMessage('Error managing associated notes: ', error)]
      }, createErrorMessage('Error managing associated notes: ', error));
    }
  }
  
  /**
   * Handle list operation - return current associated notes
   */
  private async handleListOperation(workspace: any, params: ManageAssociatedNotesParameters): Promise<ManageAssociatedNotesResult> {
    const associatedNotes = workspace.associatedNotes || [];
    
    console.log(`[ManageAssociatedNotesMode] Listed ${associatedNotes.length} associated notes for workspace ${params.workspaceId}`);
    
    return this.prepareResult(true, {
      operation: params.operation,
      workspaceId: params.workspaceId,
      notePaths: associatedNotes,
      existingNotes: associatedNotes
    }, undefined, `Found ${associatedNotes.length} associated notes`);
  }
  
  /**
   * Handle add operation - add notes to workspace associations
   */
  private async handleAddOperation(
    workspaceService: any, 
    workspace: any, 
    params: ManageAssociatedNotesParameters
  ): Promise<ManageAssociatedNotesResult> {
    const notePaths = params.notePaths!;
    const validatedPaths: string[] = [];
    const errors: string[] = [];
    const existingNotes = new Set(workspace.associatedNotes || []);
    
    // Validate each note path
    for (const notePath of notePaths) {
      try {
        const file = this.app.vault.getAbstractFileByPath(notePath);
        if (!file) {
          errors.push(`File not found: ${notePath}`);
          continue;
        }
        
        if (!('children' in file) && !notePath.endsWith('.md')) {
          errors.push(`File is not a markdown note: ${notePath}`);
          continue;
        }
        
        if (existingNotes.has(notePath)) {
          console.warn(`[ManageAssociatedNotesMode] Note already associated: ${notePath}`);
          continue;
        }
        
        validatedPaths.push(notePath);
      } catch (error) {
        errors.push(`Error validating ${notePath}: ${error}`);
      }
    }
    
    if (validatedPaths.length === 0 && errors.length === 0) {
      return this.prepareResult(true, {
        operation: params.operation,
        workspaceId: params.workspaceId,
        notePaths: notePaths,
        addedNotes: [],
        existingNotes: Array.from(existingNotes)
      }, undefined, 'All notes were already associated with this workspace');
    }
    
    // Add valid notes to workspace
    if (validatedPaths.length > 0) {
      const updatedAssociatedNotes = [...(workspace.associatedNotes || []), ...validatedPaths];
      
      const updatedWorkspace = {
        ...workspace,
        associatedNotes: updatedAssociatedNotes
      };
      
      await workspaceService.updateWorkspace(params.workspaceId, updatedWorkspace);
      console.log(`[ManageAssociatedNotesMode] Added ${validatedPaths.length} notes to workspace ${params.workspaceId}`);
    }
    
    return this.prepareResult(true, {
      operation: params.operation,
      workspaceId: params.workspaceId,
      notePaths: notePaths,
      addedNotes: validatedPaths,
      existingNotes: Array.from(existingNotes),
      errors: errors.length > 0 ? errors : undefined
    }, undefined, `Added ${validatedPaths.length} notes to workspace${errors.length > 0 ? ` (${errors.length} errors)` : ''}`);
  }
  
  /**
   * Handle remove operation - remove notes from workspace associations
   */
  private async handleRemoveOperation(
    workspaceService: any, 
    workspace: any, 
    params: ManageAssociatedNotesParameters
  ): Promise<ManageAssociatedNotesResult> {
    const notePaths = params.notePaths!;
    const existingNotes = workspace.associatedNotes || [];
    const existingSet = new Set(existingNotes);
    const removedNotes: string[] = [];
    const errors: string[] = [];
    
    // Check which notes to remove
    for (const notePath of notePaths) {
      if (existingSet.has(notePath)) {
        removedNotes.push(notePath);
        existingSet.delete(notePath);
      } else {
        errors.push(`Note not found in workspace associations: ${notePath}`);
      }
    }
    
    if (removedNotes.length === 0) {
      return this.prepareResult(false, {
        operation: params.operation,
        workspaceId: params.workspaceId,
        notePaths: notePaths,
        removedNotes: [],
        existingNotes: existingNotes,
        errors: errors
      }, 'No notes were removed - none were found in workspace associations');
    }
    
    // Update workspace with remaining notes
    const updatedWorkspace = {
      ...workspace,
      associatedNotes: Array.from(existingSet)
    };
    
    await workspaceService.updateWorkspace(params.workspaceId, updatedWorkspace);
    console.log(`[ManageAssociatedNotesMode] Removed ${removedNotes.length} notes from workspace ${params.workspaceId}`);
    
    return this.prepareResult(true, {
      operation: params.operation,
      workspaceId: params.workspaceId,
      notePaths: notePaths,
      removedNotes: removedNotes,
      existingNotes: Array.from(existingSet),
      errors: errors.length > 0 ? errors : undefined
    }, undefined, `Removed ${removedNotes.length} notes from workspace${errors.length > 0 ? ` (${errors.length} warnings)` : ''}`);
  }

  getParameterSchema(): any {
    return {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description: 'Workspace identifier (REQUIRED)'
        },
        operation: {
          type: 'string',
          enum: ['add', 'remove', 'list'],
          description: 'Operation to perform (REQUIRED): add (associate notes), remove (disassociate notes), list (show current associations)'
        },
        notePaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of note file paths (REQUIRED for add/remove operations). Paths should be relative to vault root.'
        }
      },
      required: ['workspaceId', 'operation']
    };
  }
  
  getResultSchema(): any {
    return {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              description: 'Operation that was performed'
            },
            workspaceId: {
              type: 'string',
              description: 'Workspace identifier'
            },
            notePaths: {
              type: 'array',
              items: { type: 'string' },
              description: 'Note paths that were processed'
            },
            addedNotes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Notes that were successfully added (add operation)'
            },
            removedNotes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Notes that were successfully removed (remove operation)'
            },
            existingNotes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Current notes associated with workspace'
            },
            errors: {
              type: 'array',
              items: { type: 'string' },
              description: 'Error messages for failed operations'
            }
          }
        }
      }
    };
  }
}