import { Plugin } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { getErrorMessage } from '../../../utils/errorUtils';
import { CommonParameters } from '../../../types';
import { LLMProviderManager } from '../../../services/LLMProviderManager';
import { LLMService } from '../../../services/LLMService';
import { AgentManager } from '../../../services/AgentManager';
import { CustomPromptStorageService } from '../../../database/services/CustomPromptStorageService';
import { StaticModelsService } from '../../../services/StaticModelsService';
import { UsageTracker, BudgetStatus } from '../../../services/UsageTracker';

/**
 * Parameters for batch LLM prompt execution
 */
export interface BatchExecutePromptParams extends CommonParameters {
  /** Array of prompts to execute - can be parallel or sequential */
  prompts: Array<{
    /** The prompt text to send to the LLM */
    prompt: string;
    /** Optional provider to use (defaults to settings default) */
    provider?: string;
    /** Optional model to use (defaults to settings default) */
    model?: string;
    /** Optional context files to include */
    contextFiles?: string[];
    /** Optional workspace for context */
    workspace?: string;
    /** Custom identifier for this prompt */
    id?: string;
    /** Sequence number for ordered execution (prompts with same sequence run in parallel, sequences execute in order) */
    sequence?: number;
    /** Whether to include previous step results as context */
    includePreviousResults?: boolean;
    /** Optional action to perform with the LLM response */
    action?: {
      type: 'create' | 'append' | 'prepend' | 'replace' | 'findReplace';
      targetPath: string;
      position?: number;
      findText?: string; // Required for 'findReplace' type
      replaceAll?: boolean; // Optional for 'findReplace' type
      caseSensitive?: boolean; // Optional for 'findReplace' type
      wholeWord?: boolean; // Optional for 'findReplace' type
    };
    /** Optional custom agent/prompt to use */
    agent?: string;
  }>;
  /** Maximum number of concurrent requests (default: 3) */
  maxConcurrency?: number;
  /** Whether to merge all responses into a single result */
  mergeResponses?: boolean;
}

/**
 * Result from batch LLM prompt execution
 */
export interface BatchExecutePromptResult {
  success: boolean;
  /** Individual prompt results (if mergeResponses is false) */
  results?: Array<{
    id?: string;
    prompt: string;
    success: boolean;
    response?: string;
    provider?: string;
    model?: string;
    agent?: string;
    error?: string;
    executionTime?: number;
    sequence?: number;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    cost?: {
      inputCost: number;
      outputCost: number;
      totalCost: number;
      currency: string;
    };
    filesIncluded?: string[];
    actionPerformed?: {
      type: string;
      targetPath: string;
      success: boolean;
      error?: string;
    };
  }>;
  /** Merged response (if mergeResponses is true) */
  merged?: {
    totalPrompts: number;
    successfulPrompts: number;
    combinedResponse: string;
    providersUsed: string[];
  };
  /** Execution statistics */
  stats?: {
    totalExecutionTime: number;
    promptsExecuted: number;
    promptsFailed: number;
    avgExecutionTime: number;
    tokensUsed?: number;
  };
  error?: string;
}

/**
 * Batch mode for executing multiple LLM prompts concurrently
 * Enables parallel processing of multiple prompts across different providers
 */
export class BatchExecutePromptMode extends BaseMode<BatchExecutePromptParams, BatchExecutePromptResult> {
  private llmService: LLMService | null = null;
  private providerManager: LLMProviderManager | null = null;
  private agentManager: AgentManager | null = null;
  private promptStorage: CustomPromptStorageService | null = null;
  private usageTracker: UsageTracker | null = null;

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
    
    this.llmService = llmService || null;
    this.providerManager = providerManager || null;
    this.agentManager = agentManager || null;
    this.promptStorage = promptStorage || null;
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
  }

  /**
   * Set the provider manager instance
   */
  setProviderManager(providerManager: LLMProviderManager): void {
    this.providerManager = providerManager;
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
  }

  /**
   * Set the prompt storage for custom agent support
   */
  setPromptStorage(promptStorage: CustomPromptStorageService): void {
    this.promptStorage = promptStorage;
  }

  /**
   * Execute multiple LLM prompts concurrently
   */
  async execute(params: BatchExecutePromptParams): Promise<BatchExecutePromptResult> {
    try {
      // Validate dependencies
      if (!this.llmService) {
        return {
          success: false,
          error: 'LLM Service not initialized'
        };
      }

      // Validate parameters
      if (!params.prompts || params.prompts.length === 0) {
        return {
          success: false,
          error: 'At least one prompt is required'
        };
      }

      // Check if any sequence has more prompts than maxConcurrency (this is the real limit)
      const maxConcurrency = params.maxConcurrency || 3;
      const sequenceGroups = new Map<number, number>();
      for (const prompt of params.prompts) {
        const sequence = prompt.sequence || 0;
        sequenceGroups.set(sequence, (sequenceGroups.get(sequence) || 0) + 1);
      }
      
      const maxPromptsInAnySequence = Math.max(...Array.from(sequenceGroups.values()));
      if (maxPromptsInAnySequence > maxConcurrency) {
        return {
          success: false,
          error: `Too many prompts in a single sequence. Maximum concurrent prompts per sequence: ${maxConcurrency}. Found sequence with ${maxPromptsInAnySequence} prompts.\n\nTo execute prompts sequentially, add 'sequence' numbers to your prompts:\n- sequence: 0 (first step)\n- sequence: 1 (second step)\n- sequence: 2 (third step)\n\nExample: {"sequence": 0, "prompt": "..."}, {"sequence": 1, "prompt": "..."}`
        };
      }

      const startTime = performance.now();
      
      // Execute prompts with sequence and concurrency control
      const results = await this.executePromptsWithSequencing(params.prompts, maxConcurrency, params);
      
      const totalExecutionTime = performance.now() - startTime;
      const successful = results?.filter(r => r.success) || [];
      const failed = results?.filter(r => !r.success) || [];

      // Calculate token usage (if available)
      const tokensUsed = results?.reduce((sum, _result) => {
        // This would be implemented when token counting is available
        return sum;
      }, 0);

      // Build response based on merge preference
      if (params.mergeResponses) {
        const merged = this.mergePromptResults(successful);
        
        return {
          success: true,
          merged: {
            totalPrompts: params.prompts.length,
            successfulPrompts: successful.length,
            combinedResponse: merged.combinedResponse,
            providersUsed: merged.providersUsed
          },
          stats: {
            totalExecutionTime,
            promptsExecuted: params.prompts.length,
            promptsFailed: failed.length,
            avgExecutionTime: totalExecutionTime / params.prompts.length,
            tokensUsed: tokensUsed || undefined
          }
        };
      } else {
        return {
          success: true,
          results: results,
          stats: {
            totalExecutionTime,
            promptsExecuted: params.prompts.length,
            promptsFailed: failed.length,
            avgExecutionTime: totalExecutionTime / params.prompts.length,
            tokensUsed: tokensUsed || undefined
          }
        };
      }
      
    } catch (error) {
      console.error('Batch LLM prompt execution failed:', error);
      return {
        success: false,
        error: `Batch execution failed: ${getErrorMessage(error)}`
      };
    }
  }

  /**
   * Execute prompts with concurrency control
   */
  private async executeConcurrentPrompts(
    prompts: BatchExecutePromptParams['prompts'],
    maxConcurrency: number,
    params: BatchExecutePromptParams
  ): Promise<BatchExecutePromptResult['results']> {
    const results: NonNullable<BatchExecutePromptResult['results']> = [];
    
    // Process prompts in batches to control concurrency
    for (let i = 0; i < prompts.length; i += maxConcurrency) {
      const batch = prompts.slice(i, i + maxConcurrency);
      
      const batchPromises = batch.map(async (promptConfig, index) => {
        try {
          // Add a small delay between concurrent requests to avoid overwhelming APIs
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, index * 100));
          }
          
          const startTime = performance.now();
          
          let systemPrompt = '';
          let agentUsed = 'default';
          
          // Handle custom agent if specified
          if (promptConfig.agent && this.promptStorage) {
            const customPrompt = await this.promptStorage.getPromptByName(promptConfig.agent);
            if (customPrompt && customPrompt.isEnabled) {
              systemPrompt = customPrompt.prompt;
              agentUsed = customPrompt.name;
            }
          }
          
          // Build the execution parameters
          const executeParams = {
            systemPrompt: systemPrompt,
            userPrompt: promptConfig.prompt,
            filepaths: promptConfig.contextFiles,
            provider: promptConfig.provider,
            model: promptConfig.model,
            workspace: promptConfig.workspace,
            sessionId: params.sessionId
          };
          
          // Check budget before executing LLM prompt
          if (this.usageTracker) {
            const budgetStatus = await this.usageTracker.getBudgetStatusAsync();
            if (budgetStatus.budgetExceeded) {
              throw new Error(`Monthly LLM budget of $${budgetStatus.monthlyBudget.toFixed(2)} has been exceeded. Current spending: $${budgetStatus.currentSpending.toFixed(2)}. Please reset or increase your budget in settings.`);
            }
          }
          
          // Execute the prompt using LLMService
          const response = await this.llmService!.executePrompt(executeParams);
          
          // Track usage for this execution
          if (this.usageTracker && response.cost && response.provider) {
            try {
              await this.usageTracker.trackUsage(
                response.provider.toLowerCase(),
                response.cost.totalCost || 0
              );
            } catch (error) {
              console.error('Failed to track LLM usage in batch execution:', error);
              // Don't fail the request if usage tracking fails
            }
          }
          
          const executionTime = performance.now() - startTime;
          
          const result: NonNullable<BatchExecutePromptResult['results']>[0] = {
            id: promptConfig.id,
            prompt: promptConfig.prompt,
            success: true,
            response: response.response,
            provider: response.provider,
            model: response.model,
            agent: agentUsed,
            executionTime
          };
          
          // Execute action if specified
          if (promptConfig.action && this.agentManager && response.response) {
            try {
              const actionResult = await this.executeContentAction(
                promptConfig.action,
                response.response,
                params.sessionId || '',
                '' // context is handled through common parameters
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
          
          return result;
          
        } catch (error) {
          console.warn(`LLM prompt execution failed for prompt "${promptConfig.prompt.substring(0, 50)}...":`, error);
          return {
            id: promptConfig.id,
            prompt: promptConfig.prompt,
            success: false,
            error: getErrorMessage(error),
            provider: promptConfig.provider,
            model: promptConfig.model,
            agent: promptConfig.agent || 'default'
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Execute prompts with sequence support - allows for sequential chains and parallel execution within sequences
   */
  private async executePromptsWithSequencing(
    prompts: BatchExecutePromptParams['prompts'],
    maxConcurrency: number,
    params: BatchExecutePromptParams
  ): Promise<NonNullable<BatchExecutePromptResult['results']>> {
    const results: NonNullable<BatchExecutePromptResult['results']> = [];
    const previousResults: { [sequence: number]: NonNullable<BatchExecutePromptResult['results']> } = {};
    
    // Group prompts by sequence number (default to 0 if not specified)
    const sequenceGroups = new Map<number, BatchExecutePromptParams['prompts']>();
    for (const prompt of prompts) {
      const sequence = prompt.sequence || 0;
      if (!sequenceGroups.has(sequence)) {
        sequenceGroups.set(sequence, []);
      }
      sequenceGroups.get(sequence)!.push(prompt);
    }
    
    // Sort sequences to execute in order
    const sortedSequences = Array.from(sequenceGroups.keys()).sort((a, b) => a - b);
    
    // Execute each sequence in order
    for (const sequence of sortedSequences) {
      const sequencePrompts = sequenceGroups.get(sequence)!;
      
      // Execute prompts within this sequence concurrently (up to maxConcurrency)
      const sequenceResults = await this.executeConcurrentPromptsWithContext(
        sequencePrompts, 
        maxConcurrency, 
        params, 
        previousResults, 
        sequence
      );
      
      results.push(...sequenceResults);
      previousResults[sequence] = sequenceResults;
    }
    
    return results;
  }

  /**
   * Execute prompts concurrently within a single sequence with previous context support
   */
  private async executeConcurrentPromptsWithContext(
    prompts: BatchExecutePromptParams['prompts'],
    maxConcurrency: number,
    params: BatchExecutePromptParams,
    previousResults: { [sequence: number]: NonNullable<BatchExecutePromptResult['results']> },
    currentSequence: number
  ): Promise<NonNullable<BatchExecutePromptResult['results']>> {
    const results: NonNullable<BatchExecutePromptResult['results']> = [];
    
    // Process prompts in batches to control concurrency
    for (let i = 0; i < prompts.length; i += maxConcurrency) {
      const batch = prompts.slice(i, i + maxConcurrency);
      
      const batchPromises = batch.map(async (promptConfig, index) => {
        try {
          // Add a small delay between concurrent requests to avoid overwhelming APIs
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, index * 100));
          }
          
          const startTime = performance.now();
          
          let systemPrompt = '';
          let agentUsed = 'default';
          
          // Handle custom agent if specified
          if (promptConfig.agent && this.promptStorage) {
            const customPrompt = await this.promptStorage.getPromptByName(promptConfig.agent);
            if (customPrompt && customPrompt.isEnabled) {
              systemPrompt = customPrompt.prompt;
              agentUsed = customPrompt.name;
            }
          }
          
          // Build the execution parameters with potential context from previous results
          let userPrompt = promptConfig.prompt;
          
          // Add previous results as context if requested
          if (promptConfig.includePreviousResults && currentSequence > 0) {
            const previousContext = this.buildPreviousResultsContext(previousResults, currentSequence);
            if (previousContext) {
              userPrompt = `Previous step results:\n${previousContext}\n\nCurrent prompt: ${promptConfig.prompt}`;
            }
          }
          
          const executeParams = {
            systemPrompt: systemPrompt,
            userPrompt: userPrompt,
            filepaths: promptConfig.contextFiles,
            provider: promptConfig.provider,
            model: promptConfig.model,
            workspace: promptConfig.workspace,
            sessionId: params.sessionId
          };
          
          // Check budget before executing LLM prompt
          if (this.usageTracker) {
            const budgetStatus = await this.usageTracker.getBudgetStatusAsync();
            if (budgetStatus.budgetExceeded) {
              throw new Error(`Monthly LLM budget of $${budgetStatus.monthlyBudget.toFixed(2)} has been exceeded. Current spending: $${budgetStatus.currentSpending.toFixed(2)}. Please reset or increase your budget in settings.`);
            }
          }
          
          // Execute the prompt using LLMService
          const response = await this.llmService!.executePrompt(executeParams);
          
          // Track usage for this execution
          if (this.usageTracker && response.cost && response.provider) {
            try {
              await this.usageTracker.trackUsage(
                response.provider.toLowerCase(),
                response.cost.totalCost || 0
              );
            } catch (error) {
              console.error('Failed to track LLM usage in batch execution:', error);
              // Don't fail the request if usage tracking fails
            }
          }
          
          const executionTime = performance.now() - startTime;
          
          const result: NonNullable<BatchExecutePromptResult['results']>[0] = {
            id: promptConfig.id,
            prompt: promptConfig.prompt,
            success: true,
            response: response.response,
            provider: response.provider,
            model: response.model,
            agent: agentUsed,
            usage: response.usage,
            cost: response.cost,
            executionTime: executionTime,
            filesIncluded: response.filesIncluded,
            sequence: currentSequence
          };
          
          // Execute action if specified
          if (promptConfig.action && this.agentManager) {
            try {
              const actionResult = await this.executeContentAction(
                promptConfig.action,
                response.response || '',
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
          
          return result;
        } catch (error) {
          return {
            id: promptConfig.id,
            prompt: promptConfig.prompt,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            provider: promptConfig.provider || 'unknown',
            model: promptConfig.model || 'unknown',
            agent: 'default',
            executionTime: 0,
            sequence: currentSequence
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Build context string from previous sequence results
   */
  private buildPreviousResultsContext(
    previousResults: { [sequence: number]: NonNullable<BatchExecutePromptResult['results']> },
    currentSequence: number
  ): string {
    const contextParts: string[] = [];
    
    // Include results from all previous sequences
    for (let seq = 0; seq < currentSequence; seq++) {
      const sequenceResults = previousResults[seq];
      if (sequenceResults && sequenceResults.length > 0) {
        contextParts.push(`--- Sequence ${seq} Results ---`);
        sequenceResults.forEach((result, index) => {
          if (result.success && result.response) {
            const label = result.id ? `${result.id}` : `Step ${index + 1}`;
            contextParts.push(`${label}: ${result.response}`);
          }
        });
        contextParts.push('');
      }
    }
    
    return contextParts.join('\n');
  }

  /**
   * Merge multiple prompt results into a single unified response
   */
  private mergePromptResults(results: NonNullable<BatchExecutePromptResult['results']>): {
    combinedResponse: string;
    providersUsed: string[];
  } {
    const responses: string[] = [];
    const providersUsed = new Set<string>();
    
    results.forEach((result, index) => {
      if (result.success && result.response) {
        responses.push(`## Response ${index + 1}${result.id ? ` (${result.id})` : ''}${result.provider ? ` - ${result.provider}` : ''}\n\n${result.response}`);
        
        if (result.provider) {
          providersUsed.add(result.provider);
        }
      }
    });
    
    const combinedResponse = responses.join('\n\n---\n\n');
    
    return {
      combinedResponse,
      providersUsed: Array.from(providersUsed)
    };
  }

  /**
   * Execute a ContentManager action with the LLM response
   */
  private async executeContentAction(
    action: { 
      type: string; 
      targetPath: string; 
      position?: number;
      findText?: string;
      replaceAll?: boolean;
      caseSensitive?: boolean;
      wholeWord?: boolean;
    },
    content: string,
    sessionId: string,
    context: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.agentManager) {
      return { success: false, error: 'Agent manager not available' };
    }

    try {
      const actionParams: any = {
        sessionId,
        context,
        content
      };

      switch (action.type) {
        case 'create': {
          actionParams.filePath = action.targetPath;
          const createResult = await this.agentManager.executeAgentMode('contentManager', 'createContent', actionParams);
          return { success: createResult.success, error: createResult.error };
        }
        case 'append': {
          actionParams.filePath = action.targetPath;
          const appendResult = await this.agentManager.executeAgentMode('contentManager', 'appendContent', actionParams);
          return { success: appendResult.success, error: appendResult.error };
        }
        case 'prepend': {
          actionParams.filePath = action.targetPath;
          const prependResult = await this.agentManager.executeAgentMode('contentManager', 'prependContent', actionParams);
          return { success: prependResult.success, error: prependResult.error };
        }
        case 'replace': {
          actionParams.filePath = action.targetPath;
          let replaceResult;
          if (action.position !== undefined) {
            actionParams.line = action.position;
            replaceResult = await this.agentManager.executeAgentMode('contentManager', 'replaceByLine', actionParams);
          } else {
            replaceResult = await this.agentManager.executeAgentMode('contentManager', 'replaceContent', actionParams);
          }
          return { success: replaceResult.success, error: replaceResult.error };
        }
        case 'findReplace': {
          if (!action.findText) {
            return { success: false, error: 'findText is required for findReplace action' };
          }
          actionParams.filePath = action.targetPath;
          actionParams.findText = action.findText;
          actionParams.replaceText = content; // LLM response becomes the replacement text
          actionParams.replaceAll = action.replaceAll ?? false;
          actionParams.caseSensitive = action.caseSensitive ?? true;
          actionParams.wholeWord = action.wholeWord ?? false;
          const findReplaceResult = await this.agentManager.executeAgentMode('contentManager', 'findReplaceContent', actionParams);
          return { success: findReplaceResult.success, error: findReplaceResult.error };
        }

        default:
          return { success: false, error: `Unknown action type: ${action.type}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error executing action'
      };
    }
  }

  /**
   * Get parameter schema for MCP tool definition
   */
  getParameterSchema(): any {
    const batchSchema = {
      type: 'object',
      title: 'Batch Execute LLM Prompts Parameters',
      description: 'Execute multiple LLM prompts concurrently across different providers with context support.',
      properties: {
        prompts: {
          type: 'array',
          description: 'Array of prompts to execute concurrently',
          items: {
            type: 'object',
            title: 'Individual Prompt Configuration',
            description: 'Configuration for a single LLM prompt execution',
            properties: {
              prompt: {
                type: 'string',
                description: 'The prompt text to send to the LLM',
                examples: [
                  'Summarize this document',
                  'Generate unit tests for this code',
                  'Explain this concept in simple terms'
                ]
              },
              provider: {
                type: 'string',
                description: this.getEnabledProviders().length > 0 
                  ? `Optional provider to use (defaults to settings default). Available providers: ${this.getEnabledProviders().join(', ')}`
                  : 'Optional provider to use (defaults to settings default). No providers are currently enabled. Please configure API keys in settings.',
                ...(this.getEnabledProviders().length > 0 && { 
                  enum: this.getEnabledProviders(),
                  examples: this.getEnabledProviders() 
                })
              },
              model: {
                type: 'string',
                description: this.getAvailableModels().length > 0
                  ? `Optional model to use (defaults to settings default). Available models: ${this.getAvailableModels().slice(0, 3).join(', ')}${this.getAvailableModels().length > 3 ? '...' : ''}`
                  : 'Optional model to use (defaults to settings default). No models available. Please configure provider API keys in settings.',
                ...(this.getAvailableModels().length > 0 && { 
                  enum: this.getAvailableModels(),
                  examples: this.getAvailableModels().slice(0, 5) 
                })
              },
              contextFiles: {
                type: 'array',
                description: 'Optional context files to include with this prompt',
                items: { type: 'string' }
              },
              workspace: {
                type: 'string',
                description: 'Optional workspace for context'
              },
              id: {
                type: 'string',
                description: 'Custom identifier for this prompt'
              },
              sequence: {
                type: 'number',
                description: 'Sequence number for ordered execution. Prompts with same sequence run in parallel, sequences execute in numerical order (0, 1, 2, etc.). If not specified, defaults to 0.',
                minimum: 0,
                examples: [0, 1, 2, 3]
              },
              includePreviousResults: {
                type: 'boolean',
                description: 'Whether to include previous sequence results as context for this prompt. Only applies when sequence > 0.',
                default: false
              },
              action: {
                type: 'object',
                description: 'Optional action to perform with the LLM response',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['create', 'append', 'prepend', 'replace', 'findReplace'],
                    description: 'Type of content action to perform'
                  },
                  targetPath: {
                    type: 'string',
                    description: 'Path to the target file for the action'
                  },
                  position: {
                    type: 'number',
                    description: 'Line position for replace actions'
                  },
                  findText: {
                    type: 'string',
                    description: 'Text to find and replace (required for findReplace action)'
                  },
                  replaceAll: {
                    type: 'boolean',
                    description: 'Whether to replace all occurrences (default: false)',
                    default: false
                  },
                  caseSensitive: {
                    type: 'boolean',
                    description: 'Whether search is case sensitive (default: true)',
                    default: true
                  },
                  wholeWord: {
                    type: 'boolean',
                    description: 'Whether to match whole words only (default: false)',
                    default: false
                  }
                },
                required: ['type', 'targetPath']
              },
              agent: {
                type: 'string',
                description: 'Optional custom agent/prompt to use for this prompt'
              }
            },
            required: ['prompt']
          },
          minItems: 1,
          maxItems: 10
        },
        maxConcurrency: {
          type: 'number',
          description: 'Maximum number of concurrent requests (default: 3)',
          minimum: 1,
          maximum: 10,
          default: 3
        },
        mergeResponses: {
          type: 'boolean',
          description: 'Whether to merge all responses into a single result (default: false)',
          default: false
        }
      },
      required: ['prompts'],
      additionalProperties: false
    };
    
    // Merge with common schema (sessionId and context)
    return this.getMergedSchema(batchSchema);
  }

  /**
   * Get result schema for MCP tool definition
   */
  getResultSchema(): any {
    return {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the batch execution was successful'
        },
        results: {
          type: 'array',
          description: 'Individual prompt results (if mergeResponses is false)',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Custom identifier for this prompt'
              },
              prompt: {
                type: 'string',
                description: 'The original prompt text'
              },
              success: {
                type: 'boolean',
                description: 'Whether this individual prompt succeeded'
              },
              response: {
                type: 'string',
                description: 'The LLM response (if successful)'
              },
              provider: {
                type: 'string',
                description: 'The provider that was used'
              },
              model: {
                type: 'string',
                description: 'The model that was used'
              },
              error: {
                type: 'string',
                description: 'Error message (if failed)'
              },
              executionTime: {
                type: 'number',
                description: 'Execution time in milliseconds'
              },
              agent: {
                type: 'string',
                description: 'The custom agent that was used'
              },
              actionPerformed: {
                type: 'object',
                description: 'Details about any action performed with the response',
                properties: {
                  type: {
                    type: 'string',
                    description: 'Type of action performed'
                  },
                  targetPath: {
                    type: 'string',
                    description: 'Target path for the action'
                  },
                  success: {
                    type: 'boolean',
                    description: 'Whether the action was successful'
                  },
                  error: {
                    type: 'string',
                    description: 'Error message if action failed'
                  }
                }
              }
            }
          }
        },
        merged: {
          type: 'object',
          description: 'Merged response (if mergeResponses is true)',
          properties: {
            totalPrompts: {
              type: 'number',
              description: 'Total number of prompts executed'
            },
            successfulPrompts: {
              type: 'number',
              description: 'Number of prompts that succeeded'
            },
            combinedResponse: {
              type: 'string',
              description: 'All responses combined into a single string'
            },
            providersUsed: {
              type: 'array',
              description: 'List of providers that were used',
              items: { type: 'string' }
            }
          }
        },
        stats: {
          type: 'object',
          description: 'Execution statistics',
          properties: {
            totalExecutionTime: {
              type: 'number',
              description: 'Total execution time in milliseconds'
            },
            promptsExecuted: {
              type: 'number',
              description: 'Number of prompts executed'
            },
            promptsFailed: {
              type: 'number',
              description: 'Number of prompts that failed'
            },
            avgExecutionTime: {
              type: 'number',
              description: 'Average execution time per prompt'
            },
            tokensUsed: {
              type: 'number',
              description: 'Total tokens used (if available)'
            }
          }
        },
        error: {
          type: 'string',
          description: 'Error message if batch execution failed'
        }
      },
      required: ['success'],
      additionalProperties: false
    };
  }

  /**
   * Get enabled providers for schema
   */
  private getEnabledProviders(): string[] {
    if (!this.providerManager) return [];
    
    try {
      const settings = this.providerManager.getSettings();
      return Object.keys(settings.providers)
        .filter(id => settings.providers[id]?.enabled && settings.providers[id]?.apiKey);
    } catch (error) {
      console.warn('Error getting enabled providers:', error);
      return [];
    }
  }

  /**
   * Get all available models from enabled providers
   */
  private getAvailableModels(): string[] {
    if (!this.providerManager) return [];
    
    try {
      const staticModelsService = StaticModelsService.getInstance();
      const enabledProviders = this.getEnabledProviders();
      const models: string[] = [];
      
      enabledProviders.forEach(providerId => {
        try {
          const providerModels = staticModelsService.getModelsForProvider(providerId);
          models.push(...providerModels.map(m => m.id));
        } catch (error) {
          console.warn(`Error getting models for provider ${providerId}:`, error);
        }
      });
      
      return [...new Set(models)]; // Remove duplicates
    } catch (error) {
      console.warn('Error getting available models:', error);
      return [];
    }
  }
}