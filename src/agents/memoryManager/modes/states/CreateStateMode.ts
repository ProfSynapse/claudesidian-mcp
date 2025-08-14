/**
 * Location: /src/agents/memoryManager/modes/states/CreateStateMode.ts
 * Purpose: Consolidated state creation mode combining all create functionality from original state files
 * 
 * This file consolidates:
 * - Original createStateMode.ts functionality
 * - StateCreator service logic
 * - Parameter validation logic
 * - Context building and tracing logic
 * 
 * Used by: MemoryManager agent for state creation operations
 */

import { App } from 'obsidian';
import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager'
import { CreateStateParams, StateResult } from '../../types';
import { createErrorMessage } from '../../../../utils/errorUtils';
import { extractContextFromParams } from '../../../../utils/contextUtils';
import { MemoryService } from "../../services/MemoryService";
import { WorkspaceService, GLOBAL_WORKSPACE_ID } from "../../services/WorkspaceService";
import { createServiceIntegration, ValidationError } from '../../services/ValidationService';
import { SchemaBuilder, SchemaType } from '../../../../utils/schemas/SchemaBuilder';

/**
 * Consolidated CreateStateMode - combines all state creation functionality
 */
export class CreateStateMode extends BaseMode<CreateStateParams, StateResult> {
    private app: App;
    private serviceIntegration: ReturnType<typeof createServiceIntegration>;
    private schemaBuilder: SchemaBuilder;

    constructor(private agent: MemoryManagerAgent) {
        super(
            'createState',
            'Create State',
            'Create a state with restoration context for later resumption',
            '2.0.0'
        );

        this.app = agent.getApp();
        this.serviceIntegration = createServiceIntegration(this.app, {
            logLevel: 'warn',
            maxRetries: 3,
            fallbackBehavior: 'warn'
        });
        this.schemaBuilder = new SchemaBuilder();
    }

    /**
     * Execute state creation with consolidated logic
     */
    async execute(params: CreateStateParams): Promise<StateResult> {
        const startTime = Date.now();
        
        try {
            // Phase 1: Get services and validate
            const servicesResult = await this.getServices();
            if (!servicesResult.success) {
                return this.prepareResult(false, undefined, servicesResult.error);
            }

            const { memoryService, workspaceService } = servicesResult;
            
            // Ensure services are available
            if (!memoryService || !workspaceService) {
                return this.prepareResult(false, undefined, 'Required services not available');
            }

            // Phase 2: Validate parameters (consolidated validation logic)
            const validationErrors = this.validateParameters(params);
            if (validationErrors.length > 0) {
                const firstError = validationErrors[0];
                return this.prepareResult(
                    false, 
                    undefined, 
                    `Validation error - ${firstError.field}: ${firstError.requirement}`,
                    extractContextFromParams(params)
                );
            }

            // Phase 3: Resolve workspace context (consolidated workspace resolution)
            const workspaceResult = await this.resolveWorkspaceContext(params, workspaceService);
            if (!workspaceResult.success) {
                return this.prepareResult(false, undefined, workspaceResult.error, extractContextFromParams(params));
            }

            // Phase 4: Build state snapshot (consolidated from StateCreator logic)
            const snapshotResult = await this.buildStateSnapshot(params, workspaceResult.data, workspaceService);

            // Phase 5: Create and persist state (consolidated persistence logic)
            const persistResult = await this.createAndPersistState(params, workspaceResult.data, snapshotResult, memoryService);
            if (!persistResult.success) {
                return this.prepareResult(false, undefined, persistResult.error, extractContextFromParams(params));
            }
            
            // Ensure stateId is available
            if (!persistResult.stateId) {
                return this.prepareResult(false, undefined, 'State creation failed - no state ID returned', extractContextFromParams(params));
            }

            // Phase 6: Verify persistence (data integrity check)
            const verificationResult = await this.verifyStatePersistence(persistResult.stateId, memoryService);
            if (!verificationResult.success) {
                // Rollback if verification fails
                await this.rollbackState(persistResult.stateId, memoryService);
                return this.prepareResult(false, undefined, `State verification failed: ${verificationResult.error}`, extractContextFromParams(params));
            }

            // Phase 7: Prepare final result
            return this.prepareFinalResult(
                persistResult.stateId,
                persistResult.savedSnapshot,
                snapshotResult,
                workspaceResult.data,
                startTime
            );

        } catch (error) {
            return this.prepareResult(false, undefined, createErrorMessage('Error creating state: ', error));
        }
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
     * Validate state creation parameters (consolidated validation logic)
     */
    private validateParameters(params: CreateStateParams): ValidationError[] {
        // Use consolidated validation service
        const errors = this.serviceIntegration.validateStateCreationParams(params);
        
        // Add any additional state-specific validations
        if (params.maxFiles !== undefined && params.maxFiles < 0) {
            errors.push({
                field: 'maxFiles',
                value: params.maxFiles,
                requirement: 'Maximum files must be a non-negative number'
            });
        }

        if (params.maxTraces !== undefined && params.maxTraces < 0) {
            errors.push({
                field: 'maxTraces',
                value: params.maxTraces,
                requirement: 'Maximum traces must be a non-negative number'
            });
        }

        return errors;
    }

    /**
     * Resolve workspace context (consolidated workspace resolution)
     */
    private async resolveWorkspaceContext(params: CreateStateParams, workspaceService: WorkspaceService): Promise<{success: boolean; error?: string; data?: any}> {
        try {
            // Get workspace from inherited context or use global workspace
            const inheritedContext = this.getInheritedWorkspaceContext(params);
            let workspaceId: string;
            
            if (inheritedContext?.workspaceId) {
                workspaceId = inheritedContext.workspaceId;
            } else {
                workspaceId = GLOBAL_WORKSPACE_ID;
            }

            // Get the workspace to capture its current context
            const workspace = await workspaceService.getWorkspace(workspaceId);
            if (!workspace) {
                return { success: false, error: `Workspace not found: ${workspaceId}` };
            }

            return { success: true, data: { workspaceId, workspace } };

        } catch (error) {
            return { success: false, error: createErrorMessage('Error resolving workspace: ', error) };
        }
    }

    /**
     * Build state snapshot (consolidated from StateCreator logic)
     */
    private async buildStateSnapshot(params: CreateStateParams, workspaceData: any, workspaceService: WorkspaceService): Promise<any> {
        const { workspace } = workspaceData;
        
        // Extract or create workspace context
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
            };
        }

        // Build the state snapshot from LLM input
        const snapshot = {
            workspaceContext: currentWorkspaceContext,
            conversationContext: params.conversationContext,
            activeTask: params.activeTask,
            activeFiles: params.activeFiles || [],
            nextSteps: params.nextSteps || [],
            reasoning: params.reasoning
        };

        return {
            snapshot,
            workspaceContext: currentWorkspaceContext
        };
    }

    /**
     * Create and persist state (consolidated persistence logic)
     */
    private async createAndPersistState(
        params: CreateStateParams,
        workspaceData: any,
        snapshotResult: any,
        memoryService: MemoryService
    ): Promise<{success: boolean; error?: string; stateId?: string; savedSnapshot?: any}> {
        try {
            const { workspaceId, workspace } = workspaceData;
            const { snapshot } = snapshotResult;
            const now = Date.now();

            // Build WorkspaceStateSnapshot for storage following the architecture design
            const snapshotData = {
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
                        creationMethod: 'manual',
                        includeSummary: params.includeSummary || false,
                        includeFileContents: params.includeFileContents || false,
                        maxFiles: params.maxFiles,
                        maxTraces: params.maxTraces,
                        reason: params.reason,
                        tags: params.tags || []
                    }
                }
            };

            // Persist to MemoryService
            const savedSnapshot = await memoryService.createSnapshot(snapshotData);
            
            return { success: true, stateId: savedSnapshot.id, savedSnapshot };

        } catch (error) {
            return { success: false, error: createErrorMessage('Error persisting state: ', error) };
        }
    }

    /**
     * Verify that a state was properly persisted
     */
    private async verifyStatePersistence(stateId: string, memoryService: MemoryService): Promise<{success: boolean; error?: string}> {
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
        } catch (error) {
            return { success: false, error: createErrorMessage('Verification failed: ', error) };
        }
    }

    /**
     * Rollback a state creation if verification fails
     */
    private async rollbackState(stateId: string, memoryService: MemoryService): Promise<void> {
        try {
            await memoryService.deleteSnapshot(stateId);
            console.warn(`[CreateStateMode] Rolled back state ${stateId} due to verification failure`);
        } catch (error) {
            console.error(`[CreateStateMode] Failed to rollback state ${stateId}:`, error);
            // Don't throw here - verification failure is the primary issue
        }
    }

    /**
     * Prepare final result
     */
    private prepareFinalResult(
        stateId: string,
        savedSnapshot: any,
        snapshotResult: any,
        workspaceData: any,
        startTime: number
    ): StateResult {
        const { workspace } = workspaceData;
        
        const resultData = {
            stateId: savedSnapshot.id,
            name: savedSnapshot.name,
            workspaceId: savedSnapshot.workspaceId,
            sessionId: savedSnapshot.sessionId,
            timestamp: savedSnapshot.timestamp,
            created: savedSnapshot.created,
            summary: `State "${savedSnapshot.name}" saved successfully. Task: ${snapshotResult.snapshot.activeTask}`,
            metadata: {
                persistenceVerified: true,
                workspaceName: workspace.name,
                totalActiveFiles: snapshotResult.snapshot.activeFiles.length,
                nextStepsCount: snapshotResult.snapshot.nextSteps.length
            },
            capturedContext: {
                summary: `${snapshotResult.snapshot.activeTask} - ${snapshotResult.snapshot.reasoning}`,
                conversationContext: snapshotResult.snapshot.conversationContext,
                activeFiles: snapshotResult.snapshot.activeFiles,
                nextSteps: snapshotResult.snapshot.nextSteps
            },
            performance: {
                totalDuration: Date.now() - startTime,
                persistenceVerified: true
            },
            recommendation: "STRONGLY RECOMMENDED: Use the updateWorkspace tool to ensure you have the latest workspace information (such as preferences, workflow, etc.) based on this conversation before proceeding with any tasks."
        };

        const contextString = `State "${savedSnapshot.name}" created and persisted successfully with ID: ${savedSnapshot.id}`;
        const workspaceContext = this.getInheritedWorkspaceContext({ workspaceContext: { workspaceId: workspaceData.workspaceId } });

        return this.prepareResult(
            true,
            resultData,
            undefined,
            contextString,
            workspaceContext || undefined
        );
    }

    /**
     * Schema methods using consolidated logic
     */
    getParameterSchema(): any {
        return {
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
                
                // Optional fields
                description: { 
                    type: 'string', 
                    description: 'Optional description for the state' 
                },
                targetSessionId: { 
                    type: 'string', 
                    description: 'Target session ID (optional, defaults to current session)' 
                },
                includeSummary: { 
                    type: 'boolean', 
                    description: 'Whether to include a summary (default: false)' 
                },
                includeFileContents: { 
                    type: 'boolean', 
                    description: 'Whether to include file contents (default: false)' 
                },
                maxFiles: { 
                    type: 'number', 
                    description: 'Maximum number of files to include' 
                },
                maxTraces: { 
                    type: 'number', 
                    description: 'Maximum number of memory traces to include' 
                },
                tags: { 
                    type: 'array', 
                    items: { type: 'string' }, 
                    description: 'Tags to associate with the state' 
                },
                reason: { 
                    type: 'string', 
                    description: 'Additional reason for creating this state' 
                }
            },
            required: ['name', 'conversationContext', 'activeTask', 'activeFiles', 'nextSteps', 'reasoning'],
            additionalProperties: false
        };
    }

    getResultSchema(): any {
        return this.schemaBuilder.buildResultSchema(SchemaType.State, {
            mode: 'createState'
        });
    }
}