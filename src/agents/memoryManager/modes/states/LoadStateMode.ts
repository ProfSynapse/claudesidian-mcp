/**
 * Location: /src/agents/memoryManager/modes/states/LoadStateMode.ts
 * Purpose: Consolidated state loading mode combining all load functionality from original state files
 * 
 * This file consolidates:
 * - Original loadStateMode.ts functionality
 * - StateRetriever and restoration logic
 * - FileCollector and TraceProcessor logic
 * - SessionManager and WorkspaceContextBuilder logic
 * - RestorationSummaryGenerator and RestorationTracer logic
 * 
 * Used by: MemoryManager agent for state loading and restoration operations
 */

import { App } from 'obsidian';
import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager'
import { LoadStateParams, StateResult } from '../../types';
import { createErrorMessage } from '../../../../utils/errorUtils';
import { extractContextFromParams } from '../../../../utils/contextUtils';
import { MemoryService } from "../../services/MemoryService";
import { WorkspaceService } from '../../../../services/WorkspaceService';
import { createServiceIntegration } from '../../services/ValidationService';
import { SchemaBuilder, SchemaType } from '../../../../utils/schemas/SchemaBuilder';

/**
 * Consolidated LoadStateMode - combines all state loading functionality
 */
export class LoadStateMode extends BaseMode<LoadStateParams, StateResult> {
    private app: App;
    private serviceIntegration: ReturnType<typeof createServiceIntegration>;
    private schemaBuilder: SchemaBuilder;

    constructor(private agent: MemoryManagerAgent) {
        super(
            'loadState',
            'Load State',
            'Load a saved state and optionally create a continuation session with restored context',
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
     * Execute state loading with consolidated logic
     */
    async execute(params: LoadStateParams): Promise<StateResult> {
        try {
            // Phase 1: Get services and validate
            const servicesResult = await this.getServices();
            if (!servicesResult.success) {
                return this.prepareResult(false, undefined, servicesResult.error);
            }

            const { memoryService, workspaceService } = servicesResult;

            // Phase 2: Extract workspaceId and sessionId, then load state data
            if (!memoryService) {
                return this.prepareResult(false, undefined, 'Memory service not available', extractContextFromParams(params));
            }

            // Extract workspaceId and sessionId from params
            const parsedContext = params.workspaceContext ?
                (typeof params.workspaceContext === 'string' ? JSON.parse(params.workspaceContext) : params.workspaceContext) : null;
            const workspaceId = parsedContext?.workspaceId || 'default-workspace';
            const sessionId = params.context?.sessionId || 'current';

            const stateResult = await this.loadStateData(workspaceId, sessionId, params.stateId, memoryService);
            if (!stateResult.success) {
                return this.prepareResult(false, undefined, stateResult.error, extractContextFromParams(params));
            }

            // Phase 3: Process and restore context (consolidated from FileCollector and TraceProcessor logic)
            if (!workspaceService) {
                return this.prepareResult(false, undefined, 'Workspace service not available', extractContextFromParams(params));
            }
            const contextResult = await this.processAndRestoreContext(stateResult.data, workspaceService, memoryService);

            // Phase 4: Handle session continuation (consolidated from SessionManager logic)
            let continuationSessionId: string | undefined;
            if (params.continueExistingSession !== false) {
                // Continue with original session ID
                continuationSessionId = stateResult.data.stateSnapshot.sessionId;
            } else {
                // Create new continuation session
                const continuationResult = await this.createContinuationSession(
                    params,
                    stateResult.data,
                    contextResult,
                    memoryService
                );
                if (continuationResult.success) {
                    continuationSessionId = continuationResult.sessionId;
                }
            }

            // Phase 5: Generate restoration summary (consolidated from RestorationSummaryGenerator logic)
            const summaryResult = this.generateRestorationSummary(
                stateResult.data,
                contextResult,
                continuationSessionId,
                params.restorationGoal
            );

            // Phase 6: Create restoration trace (consolidated from RestorationTracer logic)
            if (continuationSessionId && memoryService) {
                await this.createRestorationTrace(
                    stateResult.data,
                    contextResult,
                    continuationSessionId,
                    params.restorationGoal,
                    memoryService
                );
            }

            // Phase 7: Prepare final result
            return this.prepareFinalResult(
                stateResult.data,
                contextResult,
                summaryResult,
                continuationSessionId
            );

        } catch (error) {
            return this.prepareResult(false, undefined, createErrorMessage('Error loading state: ', error));
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
     * Load state data (consolidated from StateRetriever logic)
     * Supports lookup by both state ID and state name
     */
    private async loadStateData(workspaceId: string, sessionId: string, stateIdentifier: string, memoryService: MemoryService): Promise<{success: boolean; error?: string; data?: any}> {
        try {
            // Get state snapshot from memory service using unified lookup (ID or name)
            const stateSnapshot = await memoryService.getStateSnapshotByNameOrId(workspaceId, sessionId, stateIdentifier);
            if (!stateSnapshot) {
                return { success: false, error: `State '${stateIdentifier}' not found (searched by both name and ID)` };
            }

            // Get related traces if available using the actual state's session ID
            let relatedTraces: any[] = [];
            try {
                const effectiveSessionId = stateSnapshot.sessionId || sessionId;
                if (effectiveSessionId && effectiveSessionId !== 'current') {
                    relatedTraces = await memoryService.getMemoryTraces(workspaceId, effectiveSessionId);
                }
            } catch {
                // Ignore errors getting traces - not critical for state loading
            }

            return {
                success: true,
                data: {
                    stateSnapshot,
                    relatedTraces: relatedTraces || []
                }
            };

        } catch (error) {
            return { success: false, error: createErrorMessage('Error loading state data: ', error) };
        }
    }

    /**
     * Process and restore context (consolidated from FileCollector and TraceProcessor logic)
     */
    private async processAndRestoreContext(stateData: any, workspaceService: WorkspaceService, memoryService: MemoryService): Promise<any> {
        try {
            const { stateSnapshot, relatedTraces } = stateData;
            
            // Get workspace for context
            let workspace: any;
            try {
                workspace = await workspaceService.getWorkspace(stateSnapshot.workspaceId);
            } catch {
                workspace = { name: 'Unknown Workspace' };
            }

            // Extract state snapshot details
            const snapshot = stateSnapshot.snapshot || {};
            
            // Build context summary (consolidated from FileCollector logic)
            const summary = this.buildContextSummary(stateSnapshot, workspace, snapshot);

            // Process active files (consolidated file collection logic)
            const activeFiles = snapshot.activeFiles || [];
            const associatedNotes = this.processActiveFiles(activeFiles);

            // Process memory traces (consolidated from TraceProcessor logic)
            const processedTraces = this.processMemoryTraces(relatedTraces);

            return {
                summary,
                associatedNotes,
                stateCreatedAt: new Date(stateSnapshot.created).toISOString(),
                originalSessionId: stateSnapshot.sessionId,
                workspace,
                restoredContext: {
                    conversationContext: snapshot.conversationContext,
                    activeTask: snapshot.activeTask,
                    activeFiles,
                    nextSteps: snapshot.nextSteps || [],
                    reasoning: snapshot.reasoning,
                    workspaceContext: snapshot.workspaceContext
                },
                traces: processedTraces
            };

        } catch (error) {
            console.warn('Error processing context:', error);
            return {
                summary: `State "${stateData.stateSnapshot.name}" loaded successfully`,
                associatedNotes: [],
                stateCreatedAt: new Date().toISOString(),
                originalSessionId: stateData.stateSnapshot.sessionId,
                workspace: { name: 'Unknown Workspace' },
                restoredContext: {
                    conversationContext: 'Context restoration incomplete',
                    activeTask: 'Resume from saved state',
                    activeFiles: [],
                    nextSteps: [],
                    reasoning: 'State loaded with limited context'
                },
                traces: []
            };
        }
    }

    /**
     * Create continuation session (consolidated from SessionManager logic)
     */
    private async createContinuationSession(
        params: LoadStateParams,
        stateData: any,
        contextResult: any,
        memoryService: MemoryService
    ): Promise<{success: boolean; error?: string; sessionId?: string}> {
        try {
            const stateSnapshot = stateData.stateSnapshot;
            const snapshot = stateSnapshot.snapshot || {};

            // Create continuation session
            const continuationData = {
                workspaceId: stateSnapshot.workspaceId,
                name: params.sessionName || `Restored from "${stateSnapshot.name}"`,
                description: params.sessionDescription || `Resuming work from state saved on ${new Date(stateSnapshot.created).toLocaleDateString()}`,
                sessionGoal: params.restorationGoal || `Resume: ${snapshot.activeTask}`,
                previousSessionId: stateSnapshot.sessionId !== 'current' ? stateSnapshot.sessionId : undefined,
                isActive: true,
                toolCalls: 0,
                startTime: Date.now()
            };

            const continuationSession = await memoryService.createSession(continuationData);

            return { success: true, sessionId: continuationSession.id };

        } catch (error) {
            console.warn('Warning creating continuation session:', error);
            return { success: false, error: createErrorMessage('Error creating continuation session: ', error) };
        }
    }

    /**
     * Generate restoration summary (consolidated from RestorationSummaryGenerator logic)
     */
    private generateRestorationSummary(stateData: any, contextResult: any, continuationSessionId?: string, restorationGoal?: string): any {
        const stateSnapshot = stateData.stateSnapshot;
        const snapshot = stateSnapshot.snapshot || {};

        const summary = {
            stateName: stateSnapshot.name,
            originalCreationTime: new Date(stateSnapshot.created).toLocaleString(),
            workspaceId: stateSnapshot.workspaceId,
            workspaceName: contextResult.workspace.name,
            originalSessionId: stateSnapshot.sessionId,
            continuationSessionId,
            restorationTime: new Date().toLocaleString(),
            restorationGoal,
            contextSummary: contextResult.summary,
            activeTask: snapshot.activeTask,
            activeFiles: snapshot.activeFiles || [],
            nextSteps: snapshot.nextSteps || [],
            reasoning: snapshot.reasoning,
            continuationHistory: undefined as any[] | undefined
        };

        // Add continuation history if applicable
        const continuationHistory = [];
        if (stateSnapshot.sessionId !== 'current') {
            continuationHistory.push({
                timestamp: stateSnapshot.created,
                description: `Originally saved from session ${stateSnapshot.sessionId}`
            });
        }
        
        if (continuationSessionId) {
            continuationHistory.push({
                timestamp: Date.now(),
                description: `Restored in continuation session ${continuationSessionId}`
            });
        }

        if (continuationHistory.length > 0) {
            summary['continuationHistory'] = continuationHistory;
        }

        return summary;
    }

    /**
     * Create restoration trace (consolidated from RestorationTracer logic)
     */
    private async createRestorationTrace(
        stateData: any,
        contextResult: any,
        continuationSessionId: string,
        restorationGoal: string | undefined,
        memoryService: MemoryService
    ): Promise<void> {
        try {
            const stateSnapshot = stateData.stateSnapshot;
            const snapshot = stateSnapshot.snapshot || {};
            
            const traceContent = this.buildRestorationTraceContent(
                stateSnapshot,
                snapshot,
                contextResult,
                continuationSessionId,
                restorationGoal
            );

            // Create restoration memory trace
            await memoryService.createMemoryTrace({
                sessionId: continuationSessionId,
                workspaceId: stateSnapshot.workspaceId,
                content: traceContent,
                type: 'state_restoration',
                timestamp: Date.now(),
                metadata: {
                    tool: 'LoadStateMode',
                    params: { stateId: stateData.stateSnapshot.stateId },
                    result: { continuationSessionId },
                    relatedFiles: contextResult.associatedNotes || []
                }
            });

        } catch (error) {
            console.warn('Warning creating restoration trace:', error);
            // Don't fail state loading if trace creation fails
        }
    }

    /**
     * Prepare final result
     * 
     * Result structure explanation:
     * - summary: Generated by buildContextSummary() from state snapshot and workspace data
     * - associatedNotes: Processed active files (limited to 20) from processActiveFiles()
     * - continuationHistory: Restoration timeline from generateRestorationSummary()
     * - activeTask, activeFiles, nextSteps, reasoning: Direct from state snapshot.snapshot
     */
    private prepareFinalResult(stateData: any, contextResult: any, summaryResult: any, continuationSessionId?: string): StateResult {
        const stateSnapshot = stateData.stateSnapshot;
        
        const resultData: any = {
            stateId: stateSnapshot.id,
            name: stateSnapshot.name,
            workspaceId: stateSnapshot.workspaceId,
            sessionId: stateSnapshot.sessionId,
            created: stateSnapshot.created,
            newSessionId: continuationSessionId,
            restoredContext: {
                summary: contextResult.summary,                    // From buildContextSummary()
                associatedNotes: contextResult.associatedNotes,   // From processActiveFiles()
                stateCreatedAt: contextResult.stateCreatedAt,     // ISO string of state creation
                originalSessionId: stateSnapshot.sessionId,      // Original session ID
                continuationHistory: summaryResult.continuationHistory, // From generateRestorationSummary()
                activeTask: summaryResult.activeTask,            // From state snapshot.activeTask
                activeFiles: summaryResult.activeFiles,          // From state snapshot.activeFiles
                nextSteps: summaryResult.nextSteps,              // From state snapshot.nextSteps
                reasoning: summaryResult.reasoning,              // From state snapshot.reasoning
                restorationGoal: summaryResult.restorationGoal  // From input params
            }
        };

        const contextString = continuationSessionId 
            ? `Loaded state "${stateSnapshot.name}" and created continuation session ${continuationSessionId}. Ready to resume: ${summaryResult.activeTask}`
            : `Loaded state "${stateSnapshot.name}". Context restored: ${summaryResult.activeTask}`;

        return this.prepareResult(
            true,
            resultData,
            undefined,
            contextString
        );
    }

    /**
     * Helper methods (consolidated from various services)
     */
    private buildContextSummary(stateSnapshot: any, workspace: any, snapshot: any): string {
        const parts: string[] = [];
        
        parts.push(`Loaded state: "${stateSnapshot.name}"`);
        parts.push(`Workspace: ${workspace.name}`);
        
        if (snapshot.activeTask) {
            parts.push(`Active task: ${snapshot.activeTask}`);
        }
        
        if (snapshot.conversationContext) {
            const contextPreview = snapshot.conversationContext.length > 100 
                ? snapshot.conversationContext.substring(0, 100) + '...'
                : snapshot.conversationContext;
            parts.push(`Context: ${contextPreview}`);
        }
        
        if (snapshot.activeFiles && snapshot.activeFiles.length > 0) {
            parts.push(`${snapshot.activeFiles.length} active file${snapshot.activeFiles.length === 1 ? '' : 's'}`);
        }
        
        if (snapshot.nextSteps && snapshot.nextSteps.length > 0) {
            parts.push(`${snapshot.nextSteps.length} next step${snapshot.nextSteps.length === 1 ? '' : 's'} defined`);
        }
        
        const stateAge = Date.now() - stateSnapshot.created;
        const daysAgo = Math.floor(stateAge / (1000 * 60 * 60 * 24));
        if (daysAgo > 0) {
            parts.push(`Created ${daysAgo} day${daysAgo === 1 ? '' : 's'} ago`);
        } else {
            const hoursAgo = Math.floor(stateAge / (1000 * 60 * 60));
            if (hoursAgo > 0) {
                parts.push(`Created ${hoursAgo} hour${hoursAgo === 1 ? '' : 's'} ago`);
            } else {
                parts.push('Created recently');
            }
        }
        
        return parts.join('. ');
    }

    private processActiveFiles(activeFiles: string[]): string[] {
        // Filter and validate active files
        return activeFiles
            .filter(file => file && typeof file === 'string')
            .slice(0, 20); // Limit to 20 files for performance
    }

    private processMemoryTraces(traces: any[]): any[] {
        // Process and format traces for display
        return traces
            .slice(0, 5) // Limit to 5 most recent traces
            .map(trace => ({
                timestamp: trace.timestamp,
                content: trace.content.substring(0, 150) + (trace.content.length > 150 ? '...' : ''),
                type: trace.type,
                importance: trace.importance
            }));
    }

    private buildRestorationTraceContent(
        stateSnapshot: any,
        snapshot: any,
        contextResult: any,
        continuationSessionId: string,
        restorationGoal?: string
    ): string {
        const parts: string[] = [];
        
        parts.push(`State Restoration: Loaded state "${stateSnapshot.name}"`);
        parts.push(`Original state created: ${new Date(stateSnapshot.created).toLocaleString()}`);
        parts.push(`Continuation session created: ${continuationSessionId}`);
        
        if (restorationGoal) {
            parts.push(`Restoration goal: ${restorationGoal}`);
        }
        
        parts.push(`Active task: ${snapshot.activeTask}`);
        
        if (snapshot.conversationContext) {
            parts.push(`Previous context: ${snapshot.conversationContext}`);
        }
        
        if (snapshot.nextSteps && snapshot.nextSteps.length > 0) {
            parts.push(`Next steps: ${snapshot.nextSteps.slice(0, 3).join(', ')}${snapshot.nextSteps.length > 3 ? '...' : ''}`);
        }
        
        if (snapshot.activeFiles && snapshot.activeFiles.length > 0) {
            parts.push(`Active files: ${snapshot.activeFiles.slice(0, 5).join(', ')}`);
        }
        
        return parts.join('\n\n');
    }

    /**
     * Schema methods using consolidated logic
     */
    getParameterSchema(): any {
        const customSchema = {
            type: 'object',
            properties: {
                stateId: {
                    type: 'string',
                    description: 'ID or name of the state to load (REQUIRED). Accepts either the unique state ID or the state name.'
                },
                sessionName: {
                    type: 'string',
                    description: 'Custom name for the new continuation session (only used when continueExistingSession=false)'
                },
                sessionDescription: {
                    type: 'string',
                    description: 'Custom description for the new continuation session (only used when continueExistingSession=false)'
                },
                restorationGoal: {
                    type: 'string',
                    description: 'What do you intend to do after restoring this state? (optional)'
                },
                continueExistingSession: {
                    type: 'boolean',
                    description: 'Whether to continue with the original session ID (default: true). Set to false to create a new continuation session.'
                },
            },
            required: ['stateId'],
            additionalProperties: false
        };

        return this.getMergedSchema(customSchema);
    }

    getResultSchema(): any {
        return this.schemaBuilder.buildResultSchema(SchemaType.State, {
            mode: 'loadState'
        });
    }
}