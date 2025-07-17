/**
 * CreateSessionMode - Refactored following SOLID principles
 * Main orchestrator for session creation operations
 */

import { BaseMode } from '../../../../baseMode';
import { MemoryManagerAgent } from '../../../memoryManager';
import { CreateSessionParams, SessionResult } from '../../../types';
import { createErrorMessage } from '../../../../../utils/errorUtils';
import { extractContextFromParams } from '../../../../../utils/contextUtils';

// Import specialized services
import { WorkspaceResolver } from './services/WorkspaceResolver';
import { SessionCreator } from './services/SessionCreator';
import { ContextBuilder } from './services/ContextBuilder';
import { MemoryTracer } from './services/MemoryTracer';
import { SessionInstructionManager } from './services/SessionInstructionManager';
import { SessionSchemaBuilder } from './services/SessionSchemaBuilder';

/**
 * Refactored CreateSessionMode following SOLID principles
 * Orchestrates specialized services for session creation
 */
export class CreateSessionMode extends BaseMode<CreateSessionParams, SessionResult> {
    // Composed services following Dependency Injection principle
    private workspaceResolver: WorkspaceResolver;
    private sessionCreator: SessionCreator;
    private contextBuilder: ContextBuilder;
    private memoryTracer: MemoryTracer;
    private instructionManager: SessionInstructionManager;
    private schemaBuilder: SessionSchemaBuilder;

    constructor(private agent: MemoryManagerAgent) {
        super(
            'createSession',
            'Create Session',
            'Creates a new tool activity tracking session with memory context',
            '1.0.0'
        );

        // Initialize specialized services
        this.workspaceResolver = new WorkspaceResolver(agent);
        this.sessionCreator = new SessionCreator(agent);
        this.contextBuilder = new ContextBuilder(agent);
        this.memoryTracer = new MemoryTracer(agent);
        this.instructionManager = new SessionInstructionManager(agent);
        this.schemaBuilder = new SessionSchemaBuilder();
    }

    /**
     * Execute the mode using service composition
     */
    async execute(params: CreateSessionParams): Promise<SessionResult> {
        try {
            // Validate services are available
            const servicesValid = this.validateServices();
            if (!servicesValid.isValid) {
                return this.prepareResult(false, undefined, servicesValid.error);
            }

            // Phase 1: Resolve workspace context
            const workspaceResult = await this.resolveWorkspaceContext(params);
            if (workspaceResult.error) {
                return this.prepareResult(false, undefined, workspaceResult.error, extractContextFromParams(params));
            }

            // Phase 2: Create session
            const sessionResult = await this.createSession(params, workspaceResult);
            if (sessionResult.error) {
                return this.prepareResult(false, undefined, sessionResult.error);
            }

            // Phase 3: Build session context
            const contextResult = await this.buildSessionContext(params, workspaceResult, sessionResult);

            // Phase 4: Create memory traces (if enabled)
            if (params.generateContextTrace !== false) {
                await this.createMemoryTraces(params, workspaceResult, sessionResult, contextResult);
            }

            // Phase 5: Process session instructions
            const instructionResult = this.processSessionInstructions(
                sessionResult.session.id,
                this.sessionCreator.extractContextString(params),
                sessionResult.session.name
            );

            // Phase 6: Prepare final result
            return this.prepareFinalResult(
                sessionResult,
                contextResult,
                instructionResult,
                workspaceResult
            );

        } catch (error) {
            return this.prepareResult(false, undefined, createErrorMessage('Error creating session: ', error));
        }
    }

    /**
     * Phase 1: Resolve workspace context
     */
    private async resolveWorkspaceContext(params: CreateSessionParams): Promise<any> {
        const inheritedContext = this.getInheritedWorkspaceContext(params);
        return await this.workspaceResolver.resolveWorkspace(params, inheritedContext);
    }

    /**
     * Phase 2: Create session
     */
    private async createSession(params: CreateSessionParams, workspaceResult: any): Promise<any> {
        const sessionData = {
            workspaceId: workspaceResult.workspaceId,
            name: params.name || `Session ${new Date().toLocaleString()}`,
            description: params.description || '',
            sessionGoal: params.sessionGoal,
            previousSessionId: params.previousSessionId,
            context: params.context,
            tags: params.tags || []
        };

        return await this.sessionCreator.createSession(params, sessionData);
    }

    /**
     * Phase 3: Build session context
     */
    private async buildSessionContext(params: CreateSessionParams, workspaceResult: any, sessionResult: any): Promise<any> {
        // Get previous session info if applicable
        let previousSessionInfo = '';
        if (params.previousSessionId) {
            const prevInfo = await this.sessionCreator.getPreviousSessionInfo(params.previousSessionId);
            previousSessionInfo = prevInfo.info;
        }

        // Build context
        const contextOptions = {
            workspace: workspaceResult.workspace,
            sessionGoal: params.sessionGoal,
            previousSessionId: params.previousSessionId,
            previousSessionInfo,
            contextDepth: params.contextDepth || 'standard',
            tags: params.tags || []
        };

        return await this.contextBuilder.buildSessionContext(contextOptions);
    }

    /**
     * Phase 4: Create memory traces
     */
    private async createMemoryTraces(
        params: CreateSessionParams,
        workspaceResult: any,
        sessionResult: any,
        contextResult: any
    ): Promise<void> {
        const contextString = this.sessionCreator.extractContextString(params);
        
        const traceData = {
            sessionId: sessionResult.session.id,
            workspaceId: workspaceResult.workspaceId,
            workspace: workspaceResult.workspace,
            contextTraceContent: this.contextBuilder.buildContextTraceContent(
                contextResult.summary,
                contextString,
                params.sessionGoal,
                params.previousSessionId
            ),
            contextData: contextResult,
            sessionName: sessionResult.session.name,
            sessionDescription: sessionResult.session.description,
            sessionGoal: params.sessionGoal,
            previousSessionId: params.previousSessionId
        };

        const traceResult = await this.memoryTracer.createMemoryTraces(traceData);
        
        // Log any warnings
        traceResult.warnings.forEach(warning => {
            console.warn(`Memory trace warning: ${warning}`);
        });
    }

    /**
     * Phase 5: Process session instructions
     */
    private processSessionInstructions(sessionId: string, contextString: string, sessionName: string): any {
        return this.instructionManager.processSessionInstructions(sessionId, contextString, sessionName);
    }

    /**
     * Phase 6: Prepare final result
     */
    private prepareFinalResult(
        sessionResult: any,
        contextResult: any,
        instructionResult: any,
        workspaceResult: any
    ): SessionResult {
        // Prepare result data
        const resultData: any = {
            sessionId: sessionResult.session.id,
            name: sessionResult.session.name,
            workspaceId: workspaceResult.workspaceId,
            startTime: sessionResult.session.startTime,
            previousSessionId: sessionResult.session.previousSessionId,
            memoryContext: contextResult
        };

        // Add session instructions if needed
        if (instructionResult.shouldIncludeInstructions) {
            resultData.sessionInstructions = instructionResult.sessionInstructions;
        }

        // Return result with context
        return this.prepareResult(
            true,
            resultData,
            undefined,
            instructionResult.finalContextString
        );
    }

    /**
     * Validate that required services are available
     */
    private validateServices(): { isValid: boolean; error?: string } {
        const memoryService = this.agent.getMemoryService();
        const workspaceService = this.agent.getWorkspaceService();

        if (!memoryService || !workspaceService) {
            return {
                isValid: false,
                error: 'Memory or workspace service not available'
            };
        }

        return { isValid: true };
    }

    /**
     * Get parameter schema using schema builder
     */
    getParameterSchema(): any {
        const baseSchema = this.schemaBuilder.getParameterSchema();
        return this.getMergedSchema(baseSchema);
    }

    /**
     * Get result schema using schema builder
     */
    getResultSchema(): any {
        const baseSchema = super.getResultSchema();
        return this.schemaBuilder.getMergedResultSchema(baseSchema);
    }

    /**
     * Get mode diagnostics
     */
    getDiagnostics(): {
        services: any;
        memoryService: any;
        instructionManager: any;
    } {
        return {
            services: this.validateServices(),
            memoryService: this.memoryTracer.getMemoryServiceStatus(),
            instructionManager: this.instructionManager.getSessionManagerStatus()
        };
    }

    /**
     * Get service status
     */
    getServiceStatus(): {
        workspaceResolver: boolean;
        sessionCreator: boolean;
        contextBuilder: boolean;
        memoryTracer: boolean;
        instructionManager: boolean;
        schemaBuilder: boolean;
    } {
        return {
            workspaceResolver: !!this.workspaceResolver,
            sessionCreator: !!this.sessionCreator,
            contextBuilder: !!this.contextBuilder,
            memoryTracer: !!this.memoryTracer,
            instructionManager: !!this.instructionManager,
            schemaBuilder: !!this.schemaBuilder
        };
    }
}