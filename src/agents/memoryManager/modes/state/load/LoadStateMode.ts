/**
 * LoadStateMode - Refactored following SOLID principles
 * Orchestrates specialized services for state restoration
 */

import { BaseMode } from '../../../../baseMode';
import { MemoryManagerAgent } from '../../../memoryManager';
import { LoadStateParams, StateResult } from '../../../types';
import { parseWorkspaceContext } from '../../../../../utils/contextUtils';
import { MetadataSearchService } from '../../../../../database/services/MetadataSearchService';

// Import specialized services
import { StateRetriever } from './retrieval/StateRetriever';
import { SessionManager } from './restoration/SessionManager';
import { WorkspaceContextBuilder } from './restoration/WorkspaceContextBuilder';
import { FileCollector } from './processing/FileCollector';
import { TraceProcessor } from './processing/TraceProcessor';
import { RestorationSummaryGenerator } from './summary/RestorationSummaryGenerator';
import { RestorationTracer } from './tracing/RestorationTracer';

/**
 * Refactored LoadStateMode following SOLID principles
 * Orchestrates specialized services for state restoration
 */
export class LoadStateMode extends BaseMode<LoadStateParams, StateResult> {
  private stateRetriever!: StateRetriever;
  private sessionManager!: SessionManager;
  private workspaceContextBuilder!: WorkspaceContextBuilder;
  private fileCollector!: FileCollector;
  private traceProcessor!: TraceProcessor;
  private summaryGenerator!: RestorationSummaryGenerator;
  private restorationTracer!: RestorationTracer;

  constructor(private agent: MemoryManagerAgent) {
    super(
      'loadState',
      'Load State',
      'Loads a workspace state with comprehensive context restoration',
      '1.0.0'
    );
    
    this.initializeServices();
  }

  /**
   * Initialize all specialized services
   */
  private initializeServices(): void {
    const memoryService = this.agent.getMemoryService();
    const workspaceService = this.agent.getWorkspaceService();
    const app = this.agent.getApp();

    if (!memoryService || !workspaceService || !app) {
      throw new Error('Required services not available');
    }

    this.stateRetriever = new StateRetriever(memoryService);
    this.sessionManager = new SessionManager(memoryService);
    this.workspaceContextBuilder = new WorkspaceContextBuilder(workspaceService);
    this.fileCollector = new FileCollector(app, new MetadataSearchService(app));
    this.traceProcessor = new TraceProcessor(memoryService);
    this.summaryGenerator = new RestorationSummaryGenerator();
    this.restorationTracer = new RestorationTracer(memoryService);
  }

  /**
   * Execute state restoration using orchestrated services
   */
  async execute(params: LoadStateParams): Promise<StateResult> {
    try {
      // Phase 1: Validate parameters and prepare context
      const validatedParams = await this.executeParameterValidation(params);
      
      // Phase 2: Retrieve and validate state
      const stateData = await this.executeStateRetrieval(validatedParams.stateId);
      
      // Phase 3: Restore state
      const restorationResult = await this.executeStateRestoration(validatedParams.stateId);
      
      // Phase 4: Handle session management
      const sessionResult = await this.executeSessionManagement(validatedParams, stateData);
      
      // Phase 5: Build workspace context
      const workspaceContext = await this.executeWorkspaceContextBuilding(stateData.metadata!.workspaceId);
      
      // Phase 6: Collect files and process traces
      const contextData = await this.executeContextProcessing(stateData, workspaceContext, validatedParams);
      
      // Phase 7: Generate summary and record traces
      const summaryResult = await this.executeSummaryGeneration(stateData, workspaceContext, contextData, validatedParams);
      
      // Phase 8: Record restoration activity
      if (validatedParams.createContinuationSession) {
        await this.executeRestorationTracing(stateData, workspaceContext, contextData, summaryResult, sessionResult, validatedParams);
      }
      
      // Phase 9: Assemble final result
      return this.assembleResult(stateData, workspaceContext, contextData, summaryResult, sessionResult, validatedParams);
      
    } catch (error) {
      return this.prepareResult(false, undefined, `Error loading state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Phase 1: Validate parameters and prepare context
   */
  private async executeParameterValidation(params: LoadStateParams): Promise<{
    stateId: string;
    sessionName?: string;
    sessionDescription?: string;
    restorationGoal?: string;
    contextDepth: 'minimal' | 'standard' | 'comprehensive';
    tags: string[];
    createContinuationSession: boolean;
  }> {
    // Validate parameters
    if (!params.stateId) {
      throw new Error('State ID is required');
    }

    // If no workspace context is provided, initialize it to default
    if (!params.workspaceContext) {
      params.workspaceContext = { workspaceId: 'system' };
    } else {
      const parsedContext = parseWorkspaceContext(params.workspaceContext);
      if (!parsedContext?.workspaceId) {
        params.workspaceContext = {
          ...(typeof params.workspaceContext === 'object' ? params.workspaceContext : {}),
          workspaceId: 'system'
        };
      }
    }

    return {
      stateId: params.stateId,
      sessionName: params.sessionName,
      sessionDescription: params.sessionDescription,
      restorationGoal: params.restorationGoal,
      contextDepth: params.contextDepth || 'standard',
      tags: params.tags || [],
      createContinuationSession: params.createContinuationSession !== false
    };
  }

  /**
   * Phase 2: Retrieve and validate state
   */
  private async executeStateRetrieval(stateId: string) {
    const result = await this.stateRetriever.retrieveState(stateId);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to retrieve state');
    }

    return result;
  }

  /**
   * Phase 3: Restore state
   */
  private async executeStateRestoration(stateId: string) {
    const result = await this.stateRetriever.restoreState(stateId);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to restore state');
    }

    return result;
  }

  /**
   * Phase 4: Handle session management
   */
  private async executeSessionManagement(validatedParams: any, stateData: any) {
    const activityEmbedder = (this.agent as any).plugin?.getActivityEmbedder?.();
    
    if (validatedParams.createContinuationSession) {
      const sessionResult = await this.sessionManager.createContinuationSession({
        workspaceId: stateData.metadata!.workspaceId,
        sessionName: validatedParams.sessionName,
        sessionDescription: validatedParams.sessionDescription,
        restorationGoal: validatedParams.restorationGoal,
        stateName: stateData.metadata!.stateName,
        stateCreatedAt: stateData.metadata!.stateCreatedAt,
        originalSessionName: stateData.metadata!.originalSessionName
      });

      if (!sessionResult.success) {
        throw new Error(sessionResult.error || 'Failed to create continuation session');
      }

      // Handle backward compatibility
      await this.sessionManager.handleBackwardCompatibility(
        activityEmbedder,
        stateData.metadata!.workspaceId,
        validatedParams.sessionName || `Continuation from "${stateData.metadata!.stateName}" (${stateData.metadata!.stateCreatedAt})`,
        validatedParams.sessionDescription || `Session continuing from state "${stateData.metadata!.stateName}" created during "${stateData.metadata!.originalSessionName}". ${validatedParams.restorationGoal ? `\nGoal: ${validatedParams.restorationGoal}` : ''}`,
        true
      );

      return sessionResult;
    } else {
      return await this.sessionManager.getActiveSession(stateData.metadata!.workspaceId);
    }
  }

  /**
   * Phase 5: Build workspace context
   */
  private async executeWorkspaceContextBuilding(workspaceId: string) {
    const result = await this.workspaceContextBuilder.getWorkspaceContext(workspaceId);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to get workspace context');
    }

    return result;
  }

  /**
   * Phase 6: Collect files and process traces
   */
  private async executeContextProcessing(stateData: any, workspaceContext: any, validatedParams: any) {
    const fileResult = await this.fileCollector.collectAssociatedFiles(
      stateData.state!,
      workspaceContext.workspace!,
      validatedParams.contextDepth
    );

    if (!fileResult.success) {
      throw new Error(fileResult.error || 'Failed to collect files');
    }

    const traceResult = await this.traceProcessor.processTraces(
      stateData.state!,
      stateData.metadata!.workspaceId,
      validatedParams.contextDepth
    );

    if (!traceResult.success) {
      throw new Error(traceResult.error || 'Failed to process traces');
    }

    // Get state history
    const historyResult = await this.stateRetriever.getWorkspaceStateHistory(stateData.metadata!.workspaceId);

    return {
      files: fileResult,
      traces: traceResult,
      history: historyResult
    };
  }

  /**
   * Phase 7: Generate summary
   */
  private async executeSummaryGeneration(stateData: any, workspaceContext: any, contextData: any, validatedParams: any) {
    const contextSummary = this.summaryGenerator.generateRestorationSummary({
      workspace: workspaceContext.workspace!,
      state: stateData.state!,
      stateCreatedAt: stateData.metadata!.stateCreatedAt,
      originalSessionName: stateData.metadata!.originalSessionName,
      restorationGoal: validatedParams.restorationGoal,
      associatedNotes: Array.from(contextData.files.associatedNotes!),
      traces: contextData.traces.restoredTraces,
      contextDepth: validatedParams.contextDepth
    });

    const keyTopics = this.summaryGenerator.generateKeyTopics(
      stateData.state!,
      workspaceContext.workspace!,
      stateData.metadata!.originalSessionName,
      validatedParams.restorationGoal
    );

    const filesInteracted = this.summaryGenerator.generateFilesInteracted(
      Array.from(contextData.files.associatedNotes!),
      stateData.metadata!.stateTimestamp
    );

    return {
      contextSummary,
      keyTopics,
      filesInteracted
    };
  }

  /**
   * Phase 8: Record restoration activity
   */
  private async executeRestorationTracing(stateData: any, workspaceContext: any, contextData: any, summaryResult: any, sessionResult: any, validatedParams: any) {
    const resultTags = this.restorationTracer.generateRestorationTags(
      validatedParams.tags,
      workspaceContext.workspace!,
      stateData.state!
    );

    await this.restorationTracer.recordRestorationTrace({
      sessionId: sessionResult.sessionId!,
      workspaceId: stateData.metadata!.workspaceId,
      stateId: validatedParams.stateId,
      stateName: stateData.metadata!.stateName,
      stateCreatedAt: stateData.metadata!.stateCreatedAt,
      originalSessionName: stateData.metadata!.originalSessionName,
      originalSessionId: stateData.metadata!.originalSessionId,
      associatedNotes: Array.from(contextData.files.associatedNotes!),
      workspace: workspaceContext.workspace!,
      contextSummary: summaryResult.contextSummary,
      restorationGoal: validatedParams.restorationGoal,
      tags: resultTags
    });

    // Handle backward compatibility
    const activityEmbedder = (this.agent as any).plugin?.getActivityEmbedder?.();
    await this.restorationTracer.handleBackwardCompatibility({
      activityEmbedder,
      workspaceId: stateData.metadata!.workspaceId,
      workspacePath: workspaceContext.workspace!.path || [],
      restorationTraceContent: summaryResult.contextSummary,
      stateId: validatedParams.stateId,
      restorationGoal: validatedParams.restorationGoal,
      newSessionId: sessionResult.sessionId!,
      associatedNotes: Array.from(contextData.files.associatedNotes!),
      originalSessionId: stateData.metadata!.originalSessionId
    });
  }

  /**
   * Phase 9: Assemble final result
   */
  private assembleResult(stateData: any, workspaceContext: any, contextData: any, summaryResult: any, sessionResult: any, validatedParams: any): StateResult {
    const resultTags = this.restorationTracer.generateRestorationTags(
      validatedParams.tags,
      workspaceContext.workspace!,
      stateData.state!
    );

    // Add current restoration point to history
    const continuationHistory = [
      ...(contextData.history.continuationHistory || []),
      {
        timestamp: Date.now(),
        description: `Loaded state "${stateData.metadata!.stateName}"`
      }
    ];

    // Extract rich metadata from the state
    const stateMetadata = stateData.state!.state?.metadata || {};

    return this.prepareResult(true, {
      stateId: validatedParams.stateId,
      name: stateData.metadata!.stateName,
      workspaceId: stateData.metadata!.workspaceId,
      sessionId: stateData.metadata!.originalSessionId,
      newSessionId: sessionResult.sessionId!,
      timestamp: Date.now(),
      metadata: {
        created: stateData.metadata!.stateCreatedAt,
        updated: new Date().toISOString(),
        duration: Date.now() - stateData.metadata!.stateTimestamp,
        traceCount: contextData.traces.restoredTraces?.length || 0
      },
      conversationHistory: contextData.traces.conversationHistory || { traces: [], timeline: [] },
      filesInteracted: summaryResult.filesInteracted,
      toolsUsed: contextData.traces.toolsUsed || [],
      keyTopics: summaryResult.keyTopics,
      summary: summaryResult.contextSummary,
      restoredContext: {
        summary: summaryResult.contextSummary,
        associatedNotes: Array.from(contextData.files.associatedNotes!),
        stateCreatedAt: stateData.metadata!.stateCreatedAt,
        originalSessionId: stateData.metadata!.originalSessionId,
        continuationHistory,
        tags: resultTags,
        purpose: stateMetadata.purpose,
        sessionMemory: stateMetadata.sessionMemory,
        toolContext: stateMetadata.toolContext
      }
    });
  }

  /**
   * Get the JSON schema for the mode's parameters
   */
  getParameterSchema(): any {
    const modeSchema = {
      type: 'object',
      properties: {
        stateId: {
          type: 'string',
          description: 'ID of the state to load'
        },
        sessionName: {
          type: 'string',
          description: 'Custom name for the new continuation session'
        },
        sessionDescription: {
          type: 'string',
          description: 'Custom description for the new continuation session'
        },
        restorationGoal: {
          type: 'string',
          description: 'What the user intends to do after restoring'
        },
        createContinuationSession: {
          type: 'boolean',
          description: 'Whether to automatically start a new session',
          default: true
        },
        contextDepth: {
          type: 'string',
          enum: ['minimal', 'standard', 'comprehensive'],
          description: 'Depth of context to include in the restoration',
          default: 'standard'
        },
        tags: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Tags to associate with the continuation session'
        }
      },
      required: ['stateId']
    };
    
    return this.getMergedSchema(modeSchema);
  }

  /**
   * Get the JSON schema for the mode's result
   */
  getResultSchema(): any {
    const baseSchema = super.getResultSchema();
    
    baseSchema.properties.data = {
      type: 'object',
      properties: {
        stateId: {
          type: 'string',
          description: 'ID of the state that was loaded'
        },
        name: {
          type: 'string',
          description: 'Name of the state'
        },
        workspaceId: {
          type: 'string',
          description: 'ID of the restored workspace'
        },
        sessionId: {
          type: 'string',
          description: 'ID of the original session'
        },
        newSessionId: {
          type: 'string',
          description: 'ID of the newly created session'
        },
        timestamp: {
          type: 'number',
          description: 'Restoration timestamp'
        },
        metadata: {
          type: 'object',
          description: 'Metadata about the restored state'
        },
        conversationHistory: {
          type: 'object',
          description: 'Full conversation history reconstruction'
        },
        filesInteracted: {
          type: 'object',
          description: 'Files that were interacted with'
        },
        toolsUsed: {
          type: 'array',
          description: 'Tools used and their purposes'
        },
        keyTopics: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key topics and concepts from the restored session'
        },
        summary: {
          type: 'string',
          description: 'Comprehensive restoration summary'
        },
        restoredContext: {
          type: 'object',
          description: 'Legacy context information for backward compatibility'
        }
      },
      required: ['stateId', 'workspaceId', 'newSessionId', 'timestamp', 'conversationHistory', 'summary']
    };
    
    return baseSchema;
  }
}