/**
 * CreateStateMode - Robust state creation with comprehensive service integration and error handling
 */

import { BaseMode } from '../../../baseMode';
import { CreateStateParameters, StateResult } from '../../../../database/types/workspace/ParameterTypes';
import { StateSnapshot, State } from '../../../../database/types/session/SessionTypes';
import { MemoryService } from "../services/MemoryService";
import { WorkspaceService, GLOBAL_WORKSPACE_ID } from "../services/WorkspaceService";
import { App } from 'obsidian';
import { createServiceIntegration } from '../../utils/ServiceIntegration';
import { memoryManagerErrorHandler, createMemoryManagerError } from '../../utils/ErrorHandling';

/**
 * Robust state creation with comprehensive service integration, validation, and error recovery
 */
export class CreateStateMode extends BaseMode<CreateStateParameters, StateResult> {
  private app: App;
  private serviceIntegration: ReturnType<typeof createServiceIntegration>;

  constructor(app: App) {
    super(
      'createState',
      'Create State',
      'Create a state with restoration context',
      '2.0.0'
    );
    
    this.app = app;
    this.serviceIntegration = createServiceIntegration(app, {
      logLevel: 'warn',
      maxRetries: 3,
      fallbackBehavior: 'warn',
      timeoutMs: 5000
    });
  }

  /**
   * Execute state creation with robust service integration and comprehensive error handling
   */
  async execute(params: CreateStateParameters): Promise<StateResult> {
    const startTime = Date.now();
    
    try {
      // Get services with comprehensive error handling
      const [memoryResult, workspaceResult] = await Promise.all([
        this.serviceIntegration.getMemoryService(),
        this.serviceIntegration.getWorkspaceService()
      ]);
      
      if (!memoryResult.success || !memoryResult.service) {
        const error = memoryManagerErrorHandler.handleServiceUnavailable(
          'Create State',
          'createState',
          'MemoryService',
          memoryResult.error,
          params
        );
        return memoryManagerErrorHandler.createErrorResult(error, params.workspaceContext);
      }
      
      if (!workspaceResult.success || !workspaceResult.service) {
        const error = memoryManagerErrorHandler.handleServiceUnavailable(
          'Create State',
          'createState',
          'WorkspaceService',
          workspaceResult.error,
          params
        );
        return memoryManagerErrorHandler.createErrorResult(error, params.workspaceContext);
      }
      
      const memoryService = memoryResult.service;
      const workspaceService = workspaceResult.service;
      
      console.log(`[CreateStateMode] Services obtained successfully (${Date.now() - startTime}ms)`);
      
      // Validate required fields with structured error handling
      const validationErrors = this.validateParameters(params);
      if (validationErrors.length > 0) {
        const firstError = validationErrors[0];
        const error = memoryManagerErrorHandler.handleValidationError(
          'Create State',
          'createState',
          firstError.field,
          firstError.value,
          firstError.requirement,
          params
        );
        return memoryManagerErrorHandler.createErrorResult(error, params.workspaceContext);
      }
      
      console.log('[CreateStateMode] Parameter validation successful');
      
      // Get current workspace context using inherited utility
      const workspaceContextData = this.getInheritedWorkspaceContext(params);
      
      // Use global workspace if no workspaceId provided
      let workspaceId: string;
      if (!workspaceContextData || !workspaceContextData.workspaceId) {
        workspaceId = GLOBAL_WORKSPACE_ID;
        console.log('[CreateStateMode] No workspaceId provided, using global workspace:', workspaceId);
      } else {
        workspaceId = workspaceContextData.workspaceId;
        console.log('[CreateStateMode] Using provided workspaceId:', workspaceId);
      }
      
      // Get the workspace to capture its current context
      let workspace;
      try {
        workspace = await workspaceService.getWorkspace(workspaceId);
        if (!workspace) {
          const error = memoryManagerErrorHandler.handleNotFound(
            'Create State',
            'createState',
            'Workspace',
            workspaceId,
            params
          );
          return memoryManagerErrorHandler.createErrorResult(error, params.workspaceContext);
        }
        console.log(`[CreateStateMode] Workspace ${workspaceId} retrieved successfully`);
      } catch (workspaceError) {
        console.error('[CreateStateMode] Failed to retrieve workspace:', workspaceError);
        const error = memoryManagerErrorHandler.handleUnexpected(
          'Create State',
          'createState',
          workspaceError,
          params
        );
        return memoryManagerErrorHandler.createErrorResult(error, params.workspaceContext);
      }
      
      // Extract workspace context or create basic one for legacy workspaces
      let currentWorkspaceContext;
      if (workspace.context) {
        currentWorkspaceContext = workspace.context;
      } else {
        // Create basic context for legacy workspace
        currentWorkspaceContext = {
          purpose: workspace.description || `Work in ${workspace.name}`,
          currentGoal: 'Continue workspace tasks',
          status: 'In progress',
          workflows: [],
          keyFiles: [],
          preferences: [],
          agents: [],
          nextActions: []
        };
      }
      
      // Build the state snapshot from LLM input
      const snapshot: StateSnapshot = {
        workspaceContext: currentWorkspaceContext,
        conversationContext: params.conversationContext,
        activeTask: params.activeTask,
        activeFiles: params.activeFiles,
        nextSteps: params.nextSteps,
        reasoning: params.reasoning
      };
      
      // Create the simple state
      const now = Date.now();
      const stateData: Omit<State, 'id'> = {
        name: params.name,
        workspaceId: workspaceId,
        created: now,
        snapshot: snapshot
      };
      
      // CRITICAL FIX: Actually persist the state using MemoryService
      // Build WorkspaceStateSnapshot for storage following the architecture design
      const snapshotData: Omit<import('../../../../database/workspace-types').WorkspaceStateSnapshot, 'id'> = {
        workspaceId: workspaceId,
        sessionId: params.targetSessionId || params.sessionId || 'current',
        timestamp: now,
        name: params.name,
        created: now,
        description: `${params.activeTask} - ${params.reasoning}`,
        snapshot: snapshot,
        state: {
          workspace,
          recentTraces: [], // Could be populated from current session
          contextFiles: params.activeFiles || [],
          metadata: {
            createdBy: 'CreateStateMode',
            version: '2.0.0',
            creationMethod: 'manual'
          }
        }
      };
      
      // STEP 1: Persist to MemoryService with comprehensive error handling
      console.log('[CreateStateMode] Persisting state to MemoryService...');
      let savedSnapshot;
      try {
        savedSnapshot = await memoryService.createSnapshot(snapshotData);
        console.log(`[CreateStateMode] State persisted successfully with ID: ${savedSnapshot.id}`);
      } catch (persistError) {
        console.error('[CreateStateMode] Failed to persist state:', persistError);
        const error = memoryManagerErrorHandler.handleUnexpected(
          'Create State',
          'createState',
          persistError,
          params
        );
        return memoryManagerErrorHandler.createErrorResult(error, params.workspaceContext);
      }
      
      // STEP 2: Verify persistence (data integrity check)
      let verification;
      try {
        verification = await this.verifyStatePersistence(savedSnapshot.id, memoryService);
        if (!verification.success) {
          console.warn(`[CreateStateMode] State verification failed: ${verification.error}`);
          // Rollback if verification fails
          await this.rollbackState(savedSnapshot.id, memoryService);
          const error = memoryManagerErrorHandler.handleDataCorruption(
            'Create State',
            'createState',
            `State verification failed: ${verification.error}`,
            undefined,
            params
          );
          return memoryManagerErrorHandler.createErrorResult(error, params.workspaceContext);
        }
        console.log(`[CreateStateMode] State verification successful for ID: ${savedSnapshot.id}`);
      } catch (verificationError) {
        console.error('[CreateStateMode] Verification process failed:', verificationError);
        await this.rollbackState(savedSnapshot.id, memoryService);
        const error = memoryManagerErrorHandler.handleUnexpected(
          'Create State',
          'createState',
          verificationError,
          params
        );
        return memoryManagerErrorHandler.createErrorResult(error, params.workspaceContext);
      }
      
      // STEP 3: Return success with comprehensive performance data
      const result = this.prepareResult(
        true,
        {
          stateId: savedSnapshot.id,
          name: savedSnapshot.name,
          workspaceId: savedSnapshot.workspaceId,
          sessionId: savedSnapshot.sessionId,
          timestamp: savedSnapshot.timestamp,
          created: savedSnapshot.created,
          summary: `State "${params.name}" saved successfully. Task: ${params.activeTask}`,
          metadata: {
            persistenceVerified: true,
            workspaceName: workspace.name,
            totalActiveFiles: params.activeFiles.length,
            nextStepsCount: params.nextSteps.length
          },
          capturedContext: {
            summary: `${params.activeTask} - ${params.reasoning}`,
            conversationContext: params.conversationContext,
            activeFiles: params.activeFiles,
            nextSteps: params.nextSteps
          },
          performance: {
            totalDuration: Date.now() - startTime,
            serviceAccessTime: (memoryResult.diagnostics?.duration || 0) + (workspaceResult.diagnostics?.duration || 0),
            validationTime: 0, // Could be measured if needed
            persistenceTime: Date.now() - startTime // Approximation
          }
        },
        undefined, // no error
        `State "${params.name}" created and persisted successfully with ID: ${savedSnapshot.id}`, // context string
        workspaceContextData || undefined // workspaceContext
      );
      
      console.log(`[CreateStateMode] Operation completed successfully in ${Date.now() - startTime}ms`);
      return result;
      
    } catch (error: any) {
      console.error(`[CreateStateMode] Unexpected error after ${Date.now() - startTime}ms:`, error);
      return createMemoryManagerError<StateResult>(
        'Create State',
        'createState',
        error,
        params.workspaceContext,
        params
      );
    }
  }
  
  /**
   * Validate state creation parameters
   */
  private validateParameters(params: CreateStateParameters): Array<{field: string; value: any; requirement: string}> {
    const errors: Array<{field: string; value: any; requirement: string}> = [];
    
    if (!params.name) {
      errors.push({
        field: 'name',
        value: params.name,
        requirement: 'State name is required and must be a descriptive, non-empty string'
      });
    }
    
    if (!params.conversationContext) {
      errors.push({
        field: 'conversationContext',
        value: params.conversationContext,
        requirement: 'Conversation context is required. Provide a summary of what was happening when you decided to save this state'
      });
    }
    
    if (!params.activeTask) {
      errors.push({
        field: 'activeTask',
        value: params.activeTask,
        requirement: 'Active task description is required. Be specific about the current task you were working on'
      });
    }
    
    if (!params.activeFiles || params.activeFiles.length === 0) {
      errors.push({
        field: 'activeFiles',
        value: params.activeFiles,
        requirement: 'Active files list is required. Specify which files were being edited or referenced'
      });
    }
    
    if (!params.nextSteps || params.nextSteps.length === 0) {
      errors.push({
        field: 'nextSteps',
        value: params.nextSteps,
        requirement: 'Next steps are required. Provide specific actionable steps for when you resume'
      });
    }
    
    if (!params.reasoning) {
      errors.push({
        field: 'reasoning',
        value: params.reasoning,
        requirement: 'Reasoning for saving state is required. Explain why you are saving the state at this point'
      });
    }
    
    return errors;
  }

  /**
   * Verify that a state was properly persisted
   * @private
   * @param stateId - ID of the state to verify
   * @param memoryService - Memory service instance
   * @returns Verification result
   */
  private async verifyStatePersistence(stateId: string, memoryService: MemoryService): Promise<{success: boolean, error?: string}> {
    try {
      const retrieved = await memoryService.getSnapshot(stateId);
      if (!retrieved) {
        return { success: false, error: 'State not found after creation' };
      }
      
      if (!retrieved.snapshot || !retrieved.snapshot.activeTask) {
        return { success: false, error: 'State data incomplete after persistence' };
      }

      if (!retrieved.workspaceId || !retrieved.name) {
        return { success: false, error: 'Critical state fields missing after persistence' };
      }
      
      return { success: true };
    } catch (error: any) {
      return { success: false, error: `Verification failed: ${error.message}` };
    }
  }

  /**
   * Rollback a state creation if verification fails
   * @private
   * @param stateId - ID of the state to rollback
   * @param memoryService - Memory service instance
   */
  private async rollbackState(stateId: string, memoryService: MemoryService): Promise<void> {
    try {
      await memoryService.deleteSnapshot(stateId);
      console.warn(`[CreateStateMode] Rolled back state ${stateId} due to verification failure`);
    } catch (error: any) {
      console.error(`[CreateStateMode] Failed to rollback state ${stateId}:`, error);
      // Don't throw here - verification failure is the primary issue
    }
  }

  /**
   * Get parameter schema - prompts LLM to provide complete StateSnapshot structure
   */
  getParameterSchema(): any {
    const modeSchema = {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'State name (REQUIRED)'
        },
        conversationContext: {
          type: 'string',
          description: 'What was happening when you decided to save this state? (REQUIRED) Provide a summary of the conversation and what you were working on. Example: "We were customizing the cover letter for Google\'s Marketing Manager position. We researched their team and identified key requirements."'
        },
        activeTask: {
          type: 'string',
          description: 'What task were you actively working on? (REQUIRED) Be specific about the current task. Example: "Finishing the cover letter paragraph about data-driven campaign optimization results"'
        },
        activeFiles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Which files were you working with? (REQUIRED) List the files that were being edited or referenced. Example: ["cover-letter-google.md", "application-tracker.md"]'
        },
        nextSteps: {
          type: 'array',
          items: { type: 'string' },
          description: 'What are the immediate next steps when you resume? (REQUIRED) Provide specific actionable next steps. Example: ["Complete cover letter customization", "Review resume for Google-specific keywords", "Submit application"]'
        },
        reasoning: {
          type: 'string',
          description: 'Why are you saving this state right now? (REQUIRED) Explain the reason for saving at this point. Example: "Saving before context limit, about to submit application"'
        },
        
        // Legacy fields for backward compatibility
        description: { type: 'string', description: 'Optional description' },
        targetSessionId: { type: 'string', description: 'Target session ID (optional)' },
        includeSummary: { type: 'boolean', description: 'Whether to include a summary' },
        includeFileContents: { type: 'boolean', description: 'Whether to include file contents' },
        maxFiles: { type: 'number', description: 'Maximum number of files to include' },
        maxTraces: { type: 'number', description: 'Maximum number of memory traces to include' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags to associate with the state' },
        reason: { type: 'string', description: 'Reason for creating this state' }
      },
      required: ['name', 'conversationContext', 'activeTask', 'activeFiles', 'nextSteps', 'reasoning']
    };
    
    // Get merged schema with common parameters
    const mergedSchema = this.getMergedSchema(modeSchema);
    
    // Override workspaceContext to be OPTIONAL for state creation
    // States will be saved to the global workspace if no workspaceId is provided
    mergedSchema.properties.workspaceContext = {
      type: 'object',
      properties: {
        workspaceId: { 
          type: 'string',
          description: 'Workspace ID where this state should be saved (OPTIONAL - will use global workspace if not provided)' 
        }
      },
      description: 'Workspace context - OPTIONAL. If workspaceId is not provided, the state will be saved to the global workspace for general use.'
    };
    
    return mergedSchema;
  }

  /**
   * Get result schema
   */
  getResultSchema(): any {
    const baseSchema = super.getResultSchema();
    
    baseSchema.properties.data = {
      type: 'object',
      properties: {
        stateId: {
          type: 'string',
          description: 'ID of the created and persisted state'
        },
        name: {
          type: 'string',
          description: 'Name of the state'
        },
        workspaceId: {
          type: 'string',
          description: 'ID of the workspace'
        },
        sessionId: {
          type: 'string',
          description: 'ID of the associated session'
        },
        timestamp: {
          type: 'number',
          description: 'State creation timestamp'
        },
        created: {
          type: 'number',
          description: 'State creation timestamp (same as timestamp)'
        },
        summary: {
          type: 'string',
          description: 'Summary of the state creation operation'
        },
        metadata: {
          type: 'object',
          properties: {
            persistenceVerified: {
              type: 'boolean',
              description: 'Whether persistence was verified'
            },
            workspaceName: {
              type: 'string',
              description: 'Name of the workspace'
            },
            totalActiveFiles: {
              type: 'number',
              description: 'Number of active files in the state'
            },
            nextStepsCount: {
              type: 'number',
              description: 'Number of next steps defined'
            }
          },
          description: 'Additional metadata about the created state'
        },
        capturedContext: {
          type: 'object',
          properties: {
            summary: {
              type: 'string',
              description: 'Summary of the captured context'
            },
            conversationContext: {
              type: 'string',
              description: 'Conversation context at time of state creation'
            },
            activeFiles: {
              type: 'array',
              items: { type: 'string' },
              description: 'Files that were active when state was created'
            },
            nextSteps: {
              type: 'array',
              items: { type: 'string' },
              description: 'Next steps defined in the state'
            }
          },
          description: 'Detailed context captured in the state'
        }
      },
      required: ['stateId', 'name', 'workspaceId', 'sessionId', 'timestamp', 'created', 'summary', 'metadata']
    };
    
    return baseSchema;
  }
}