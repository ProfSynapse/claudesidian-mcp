/**
 * CreateStateMode - Refactored version using service composition
 * Orchestrates specialized services following SOLID principles
 * Maintains backward compatibility while providing clean, focused architecture
 */

import { BaseMode } from '../../../baseMode';
import { MemoryManagerAgent } from '../../memoryManager';
import { CreateStateParams, StateResult } from '../../types';
import { extractContextFromParams } from '../../../../utils/contextUtils';

// Import specialized services
import {
  ParameterValidator,
  WorkspaceValidator,
  SessionValidator
} from './create/validation';

import {
  ContextBuilder,
  SummaryGenerator
} from './create/context';

import { StateCreator } from './create/state';
import { MemoryTracer } from './create/tracing';

/**
 * Refactored CreateStateMode using service composition
 * Each service handles a specific concern following SRP
 */
export class CreateStateMode extends BaseMode<CreateStateParams, StateResult> {
  // Service instances - initialized lazily in execute method
  private parameterValidator!: ParameterValidator;
  private workspaceValidator!: WorkspaceValidator;
  private sessionValidator!: SessionValidator;
  private contextBuilder!: ContextBuilder;
  private summaryGenerator!: SummaryGenerator;
  private stateCreator!: StateCreator;
  private memoryTracer!: MemoryTracer;

  constructor(private agent: MemoryManagerAgent) {
    super(
      'createState',
      'Create State',
      'Creates a workspace state with rich context',
      '1.0.0'
    );

    // Initialize services - lazy initialization in execute method for service availability
  }

  /**
   * Execute the mode using service composition
   */
  async execute(params: CreateStateParams): Promise<StateResult> {
    try {
      // Initialize services
      this.initializeServices();

      // Phase 1: Parameter Validation
      const validation = this.parameterValidator.validate(params);
      if (!validation.isValid) {
        return this.prepareResult(false, undefined, validation.error);
      }

      // Log validation warnings if any
      if (validation.warnings && validation.warnings.length > 0) {
        console.warn('Parameter validation warnings:', validation.warnings);
      }

      // Sanitize parameters
      const sanitizedParams = this.parameterValidator.sanitizeParameters(params);

      // Phase 2: Workspace Resolution
      const workspaceResult = await this.workspaceValidator.resolveWorkspace(sanitizedParams);
      if (!workspaceResult.success) {
        return this.prepareResult(
          false, 
          undefined, 
          workspaceResult.error,
          extractContextFromParams(params)
        );
      }

      const { workspaceId, workspace } = workspaceResult;
      console.log(`Using workspace: ${workspace!.name} (${workspaceId})`);

      // Phase 3: Session Resolution
      const sessionResult = await this.sessionValidator.resolveSession(
        workspaceId!,
        sanitizedParams.targetSessionId,
        sanitizedParams.name
      );
      if (!sessionResult.success) {
        return this.prepareResult(
          false, 
          undefined, 
          sessionResult.error,
          extractContextFromParams(params)
        );
      }

      const { sessionId, session } = sessionResult;
      console.log(`Using session: ${session!.name} (${sessionId})`);

      // Phase 4: Context Building
      const contextData = await this.contextBuilder.buildContext(
        workspaceId!,
        sessionId!,
        workspace!,
        sanitizedParams.description || '',
        {
          maxFiles: sanitizedParams.maxFiles || 10,
          maxTraces: sanitizedParams.maxTraces || 20,
          includeFileContents: sanitizedParams.includeFileContents || false,
          tags: sanitizedParams.tags || [],
          reason: sanitizedParams.reason
        }
      );

      // Phase 5: State Creation
      const stateResult = await this.stateCreator.createState({
        workspaceId: workspaceId!,
        sessionId: sessionId!,
        name: sanitizedParams.name,
        description: contextData.enhancedDescription,
        workspace: workspace!,
        contextData
      });

      if (!stateResult.success) {
        // Create failure trace
        await this.memoryTracer.createStateFailureTrace(
          workspaceId!,
          sessionId!,
          sanitizedParams.name,
          stateResult.error || 'Unknown error',
          sanitizedParams.reason
        );

        return this.prepareResult(
          false, 
          undefined, 
          stateResult.error,
          extractContextFromParams(params)
        );
      }

      // Phase 6: Summary Generation
      const summary = this.summaryGenerator.generateStateSummary(
        workspace!,
        session!,
        contextData.traces,
        contextData.files,
        contextData.enhancedMetadata,
        sanitizedParams.name,
        contextData.enhancedDescription
      );

      // Phase 7: Memory Trace Creation
      await this.memoryTracer.createStateCreationTrace(
        workspaceId!,
        sessionId!,
        stateResult.stateId!,
        sanitizedParams.name,
        summary
      );

      // Prepare successful result
      const resultData = {
        stateId: stateResult.stateId!,
        name: sanitizedParams.name,
        workspaceId: workspaceId!,
        sessionId: sessionId!,
        timestamp: Date.now(),
        capturedContext: summary
      };

      return this.prepareResult(
        true,
        resultData,
        `State "${sanitizedParams.name}" created successfully`,
        extractContextFromParams(params)
      );

    } catch (error) {
      console.error('Unexpected error in createState:', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return this.prepareResult(
        false,
        undefined,
        `Unexpected error: ${errorMessage}`,
        extractContextFromParams(params)
      );
    }
  }

  /**
   * Initialize services with available dependencies
   */
  private initializeServices(): void {
    // Get services from agent
    const memoryService = this.agent.getMemoryService();
    const workspaceService = this.agent.getWorkspaceService();
    
    if (!memoryService || !workspaceService) {
      throw new Error('Memory or workspace services not available');
    }

    // Get activity embedder for backward compatibility
    const activityEmbedder = (this.agent as any).plugin?.getActivityEmbedder?.();

    // Initialize all services
    this.parameterValidator = new ParameterValidator();
    this.workspaceValidator = new WorkspaceValidator(workspaceService);
    this.sessionValidator = new SessionValidator(memoryService, activityEmbedder);
    this.contextBuilder = new ContextBuilder(memoryService, workspaceService);
    this.summaryGenerator = new SummaryGenerator();
    this.stateCreator = new StateCreator(memoryService, activityEmbedder);
    this.memoryTracer = new MemoryTracer(memoryService);
  }

  /**
   * Get the JSON schema for the mode's parameters
   */
  getParameterSchema(): any {
    return {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name for the state'
        },
        description: {
          type: 'string',
          description: 'Description of the state (optional)'
        },
        workspaceContext: {
          description: 'Workspace context (optional, will use current workspace if not provided)'
        },
        targetSessionId: {
          type: 'string',
          description: 'Target session ID (optional, will use active session if not provided)'
        },
        includeSummary: {
          type: 'boolean',
          description: 'Whether to include a summary in the state (default: true)'
        },
        includeFileContents: {
          type: 'boolean',
          description: 'Whether to include file contents in the state (default: false)'
        },
        maxFiles: {
          type: 'number',
          description: 'Maximum number of files to include (default: 10)'
        },
        maxTraces: {
          type: 'number', 
          description: 'Maximum number of memory traces to include (default: 20)'
        },
        tags: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Tags to associate with the state (optional)'
        },
        reason: {
          type: 'string',
          description: 'Reason for creating this state (optional)'
        }
      },
      required: ['name']
    };
  }

  /**
   * Get the JSON schema for the mode's result
   */
  getResultSchema(): any {
    // Use the base result schema from BaseMode
    const baseSchema = super.getResultSchema();
    
    // Add mode-specific data properties
    baseSchema.properties.data = {
      type: 'object',
      properties: {
        stateId: {
          type: 'string',
          description: 'ID of the created state'
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
        capturedContext: {
          type: 'object',
          description: 'Information about the captured context',
          properties: {
            summary: {
              type: 'string',
              description: 'Summary of the workspace state at save time'
            },
            purpose: {
              type: 'string',
              description: 'The primary goal of this state derived from context parameter'
            },
            sessionMemory: {
              type: 'string',
              description: 'Conversation summary at the time of state creation'
            },
            toolContext: {
              type: 'string',
              description: 'Context for why this state was created'
            },
            files: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'List of key files included in the state'
            },
            traceCount: {
              type: 'number',
              description: 'Number of memory traces included'
            },
            tags: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Tags associated with this state'
            },
            reason: {
              type: 'string',
              description: 'State creation reason'
            }
          },
          required: ['files', 'traceCount', 'tags']
        }
      },
      required: ['stateId', 'name', 'workspaceId', 'timestamp', 'capturedContext']
    };
    
    // Modify the context property description
    if (baseSchema.properties.context) {
      baseSchema.properties.context.description = 'The purpose and context of this state creation';
    }
    
    return baseSchema;
  }
}