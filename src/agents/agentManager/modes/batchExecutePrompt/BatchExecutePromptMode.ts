import { Plugin } from 'obsidian';
import { BaseMode } from '../../../baseMode';
import { getErrorMessage } from '../../../../utils/errorUtils';
import { LLMProviderManager } from '../../../../services/llm/providers/ProviderManager';
import { LLMService } from '../../../../services/llm/core/LLMService';
import { AgentManager } from '../../../../services/AgentManager';
import { CustomPromptStorageService } from '../../services/CustomPromptStorageService';
import { UsageTracker } from '../../../../services/UsageTracker';

// Import refactored services and types
import {
  BatchExecutePromptParams,
  BatchExecutePromptResult,
  PromptConfig,
  ExecutionContext
} from './types';
import {
  BudgetValidator,
  ContextBuilder,
  PromptExecutor,
  SequenceManager,
  ResultProcessor,
  ActionExecutor
} from './services';
import { PromptParser } from './utils';
import { SchemaBuilder, SchemaType } from '../../../../utils/schemas/SchemaBuilder';

/**
 * Refactored batch mode for executing multiple LLM prompts concurrently
 * Now follows SOLID principles with service composition
 * 
 * Responsibilities:
 * - Orchestrate prompt execution workflow
 * - Coordinate specialized services
 * - Handle high-level error management
 */
export class BatchExecutePromptMode extends BaseMode<BatchExecutePromptParams, BatchExecutePromptResult> {
  // Core services (injected)
  private llmService: LLMService | null = null;
  private providerManager: LLMProviderManager | null = null;
  private agentManager: AgentManager | null = null;
  private promptStorage: CustomPromptStorageService | null = null;
  private usageTracker: UsageTracker | null = null;

  // Specialized services (composition)
  private budgetValidator!: BudgetValidator;
  private contextBuilder!: ContextBuilder;
  private promptExecutor!: PromptExecutor;
  private sequenceManager!: SequenceManager;
  private resultProcessor!: ResultProcessor;
  private actionExecutor!: ActionExecutor;
  
  // Utilities
  private promptParser!: PromptParser;
  private schemaBuilder!: SchemaBuilder;

  constructor(
    plugin?: Plugin,
    llmService?: LLMService,
    providerManager?: LLMProviderManager,
    agentManager?: AgentManager,
    promptStorage?: CustomPromptStorageService
  ) {
    super(
      'batchExecutePrompt',
      'Batch Execute LLM Prompts',
      'Execute multiple LLM prompts concurrently across different providers. Supports context gathering, workspace integration, and result merging.',
      '1.0.0'
    );
    
    // Store injected dependencies
    this.llmService = llmService || null;
    this.providerManager = providerManager || null;
    this.agentManager = agentManager || null;
    this.promptStorage = promptStorage || null;

    // Initialize specialized services
    this.initializeServices();
  }

  /**
   * Wait for dependencies to be initialized
   * @param timeoutMs Maximum time to wait in milliseconds
   * @private
   */
  private async waitForDependencies(timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 100; // Check every 100ms
    
    while (Date.now() - startTime < timeoutMs) {
      if (this.llmService && this.providerManager && this.promptStorage) {
        return;
      }
      
      // Wait for the next check
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  }

  /**
   * Initialize all specialized services following dependency injection patterns
   */
  private initializeServices(): void {
    // Initialize utilities
    this.promptParser = new PromptParser();
    this.schemaBuilder = new SchemaBuilder(this.providerManager || undefined);

    // Initialize core services
    this.budgetValidator = new BudgetValidator(this.usageTracker || undefined);
    this.contextBuilder = new ContextBuilder();
    this.actionExecutor = new ActionExecutor(this.agentManager || undefined);

    // PromptExecutor requires LLM service, so we'll initialize it in execute() if needed
    // Same for SequenceManager and ResultProcessor
    this.resultProcessor = new ResultProcessor();
  }

  /**
   * Ensure prompt executor is initialized with LLM service
   */
  private ensurePromptExecutor(): void {
    if (!this.promptExecutor && this.llmService) {
      this.promptExecutor = new PromptExecutor(
        this.llmService,
        this.budgetValidator,
        this.contextBuilder,
        this.promptStorage || undefined
      );
      
      this.sequenceManager = new SequenceManager(
        this.promptExecutor,
        this.contextBuilder
      );
    }
  }

  /**
   * Execute multiple LLM prompts with orchestrated workflow
   */
  async execute(params: BatchExecutePromptParams): Promise<BatchExecutePromptResult> {
    try {
      // Try to wait for dependencies if not available
      if (!this.llmService || !this.providerManager || !this.promptStorage) {
        await this.waitForDependencies(3000);
      }
      
      // Validate dependencies
      if (!this.llmService) {
        return this.resultProcessor.createErrorResult('LLM Service not initialized');
      }
      
      if (!this.providerManager) {
        return this.resultProcessor.createErrorResult('LLM Provider Manager not initialized. Please ensure you have configured at least one LLM provider with valid API keys.');
      }
      
      if (!this.promptStorage) {
        return this.resultProcessor.createErrorResult('Prompt storage service not initialized');
      }

      // Ensure specialized services are ready
      this.ensurePromptExecutor();
      if (!this.promptExecutor || !this.sequenceManager) {
        return this.resultProcessor.createErrorResult('Failed to initialize execution services');
      }

      // Validate parameters using utility
      const validation = this.promptParser.validateParameters(params);
      if (!validation.valid) {
        return this.resultProcessor.createErrorResult(`Parameter validation failed: ${validation.errors.join(', ')}`);
      }

      const startTime = performance.now();
      
      // Normalize prompt configurations
      const normalizedPrompts = this.promptParser.normalizePromptConfigs(params.prompts);
      
      // Initialize execution context
      const executionContext = this.contextBuilder.initializeExecutionContext(
        params.sessionId,
        params.context
      );
      
      // Execute prompts with sequence and parallel group support
      const results = await this.sequenceManager.executePromptsWithSequencing(
        normalizedPrompts,
        executionContext
      );
      
      // Process actions for results that have them
      await this.processResultActions(results, normalizedPrompts, params);
      
      const totalExecutionTime = performance.now() - startTime;
      
      // Process and format final results
      return this.resultProcessor.processResults(
        results,
        params.mergeResponses || false,
        totalExecutionTime,
        params.prompts.length
      );
      
    } catch (error) {
      console.error('Batch LLM prompt execution failed:', error);
      return this.resultProcessor.createErrorResult(
        `Batch execution failed: ${getErrorMessage(error)}`
      );
    }
  }

  /**
   * Process content actions for results that specify them
   */
  private async processResultActions(
    results: any[],
    promptConfigs: PromptConfig[],
    params: BatchExecutePromptParams
  ): Promise<void> {
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const promptConfig = promptConfigs.find(p => p.id === result.id) || promptConfigs[i];
      
      if (promptConfig?.action && result.success && result.response) {
        try {
          const actionResult = await this.actionExecutor.executeContentAction(
            promptConfig.action,
            result.response,
            params.sessionId,
            typeof params.context === 'string' ? params.context : JSON.stringify(params.context)
          );

          result.actionPerformed = {
            type: promptConfig.action.type,
            targetPath: promptConfig.action.targetPath,
            success: actionResult.success,
            error: actionResult.error
          };
        } catch (actionError) {
          result.actionPerformed = {
            type: promptConfig.action.type,
            targetPath: promptConfig.action.targetPath,
            success: false,
            error: actionError instanceof Error ? actionError.message : 'Unknown action error'
          };
        }
      }
    }
  }

  /**
   * Set the LLM service instance
   */
  setLLMService(llmService: LLMService): void {
    this.llmService = llmService;
  }

  /**
   * Set the usage tracker for LLM cost tracking
   */
  setUsageTracker(usageTracker: UsageTracker): void {
    this.usageTracker = usageTracker;
    this.budgetValidator = new BudgetValidator(usageTracker);
  }

  /**
   * Set the provider manager instance
   */
  setProviderManager(providerManager: LLMProviderManager): void {
    this.providerManager = providerManager;
    this.schemaBuilder = new SchemaBuilder(providerManager);
    
    // Get LLM service from provider manager if we don't have one
    if (!this.llmService && providerManager) {
      this.llmService = providerManager.getLLMService();
    }
  }

  /**
   * Set the agent manager for action execution
   */
  setAgentManager(agentManager: AgentManager): void {
    this.agentManager = agentManager;
    this.actionExecutor = new ActionExecutor(agentManager);
  }

  /**
   * Set the prompt storage for custom agent support
   */
  setPromptStorage(promptStorage: CustomPromptStorageService): void {
    this.promptStorage = promptStorage;
  }

  /**
   * Get parameter schema for MCP tool definition
   */
  getParameterSchema(): any {
    const batchSchema = this.schemaBuilder.buildParameterSchema(SchemaType.BatchExecute, {
      mode: 'batchExecutePrompt',
      providerManager: this.providerManager
    });
    // Merge with common schema (sessionId and context)
    return this.getMergedSchema(batchSchema);
  }

  /**
   * Get result schema for MCP tool definition
   */
  getResultSchema(): any {
    return this.schemaBuilder.buildResultSchema(SchemaType.BatchExecute, {
      mode: 'batchExecutePrompt',
      providerManager: this.providerManager
    });
  }
}