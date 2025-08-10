import { LLMService } from '../../../../../services/llm/core/LLMService';
import { CustomPromptStorageService } from '../../../services/CustomPromptStorageService';
import { BudgetValidator } from './BudgetValidator';
import { ContextBuilder } from './ContextBuilder';
import { 
  PromptConfig, 
  TextPromptConfig,
  PromptExecutionResult, 
  PromptExecutionParams,
  ExecutionContext 
} from '../types';
import { getErrorMessage } from '../../../../../utils/errorUtils';

/**
 * Service responsible for executing individual LLM prompts
 * Follows SRP by focusing only on prompt execution logic
 */
export class PromptExecutor {
  constructor(
    private llmService: LLMService,
    private budgetValidator: BudgetValidator,
    private contextBuilder: ContextBuilder,
    private promptStorage?: CustomPromptStorageService
  ) {}

  /**
   * Execute a single prompt with all necessary context and validation
   */
  async executePrompt(
    promptConfig: PromptConfig,
    executionContext: ExecutionContext,
    currentSequence: number,
    index: number = 0
  ): Promise<PromptExecutionResult> {
    try {
      // Add delay between concurrent requests to avoid overwhelming APIs
      if (index > 0) {
        await new Promise(resolve => setTimeout(resolve, index * 100));
      }
      
      const startTime = performance.now();
      
      // Only handle text prompts - images are handled by RequestExecutor
      if (promptConfig.type !== 'text') {
        const executionTime = performance.now() - startTime;
        return {
          type: 'text',
          id: promptConfig.id,
          prompt: promptConfig.prompt,
          success: false,
          error: 'PromptExecutor only handles text prompts',
          executionTime,
          sequence: currentSequence,
          parallelGroup: promptConfig.parallelGroup
        };
      }

      const textConfig = promptConfig as TextPromptConfig;

      // Resolve custom agent/prompt if specified
      const { systemPrompt, agentUsed } = await this.resolveCustomPrompt(textConfig.agent);
      
      // Build user prompt with context from previous results
      const userPrompt = this.contextBuilder.buildUserPromptWithContext(
        textConfig.prompt,
        textConfig,
        executionContext
      );
      
      // Build execution parameters
      const executeParams: PromptExecutionParams = {
        systemPrompt,
        userPrompt,
        filepaths: textConfig.contextFiles,
        provider: textConfig.provider,
        model: textConfig.model,
        workspace: textConfig.workspace,
        sessionId: executionContext.sessionId
      };
      
      // Check budget before executing
      await this.budgetValidator.validateBudget();
      
      // Execute the prompt
      const response = await this.llmService.executePrompt(executeParams);
      
      // Track usage
      if (response.cost && response.provider) {
        await this.budgetValidator.trackUsage(
          response.provider.toLowerCase(),
          response.cost.totalCost || 0
        );
      }
      
      const executionTime = performance.now() - startTime;
      
      return {
        type: 'text',
        id: textConfig.id,
        prompt: textConfig.prompt,
        success: true,
        response: response.response,
        provider: response.provider,
        model: response.model,
        agent: agentUsed,
        usage: response.usage,
        cost: response.cost,
        executionTime,
        filesIncluded: response.filesIncluded,
        sequence: currentSequence,
        parallelGroup: textConfig.parallelGroup
      };
      
    } catch (error) {
      console.warn(`LLM prompt execution failed for prompt "${promptConfig.prompt.substring(0, 50)}...":`, error);
      
      return {
        type: 'text',
        id: promptConfig.id,
        prompt: promptConfig.prompt,
        success: false,
        error: getErrorMessage(error),
        provider: promptConfig.provider,
        model: promptConfig.model,
        agent: promptConfig.type === 'text' ? (promptConfig as TextPromptConfig).agent || 'default' : 'default',
        executionTime: 0,
        sequence: currentSequence,
        parallelGroup: promptConfig.parallelGroup
      };
    }
  }

  /**
   * Execute multiple prompts concurrently
   */
  async executeConcurrentPrompts(
    prompts: PromptConfig[],
    executionContext: ExecutionContext,
    currentSequence: number
  ): Promise<PromptExecutionResult[]> {
    const batchPromises = prompts.map((promptConfig, index) => 
      this.executePrompt(promptConfig, executionContext, currentSequence, index)
    );
    
    return await Promise.all(batchPromises);
  }

  /**
   * Resolve custom agent/prompt configuration
   */
  private async resolveCustomPrompt(agentName?: string): Promise<{ systemPrompt: string; agentUsed: string }> {
    let systemPrompt = '';
    let agentUsed = 'default';
    
    if (agentName && this.promptStorage) {
      try {
        const customPrompt = await this.promptStorage.getPromptByName(agentName);
        if (customPrompt && customPrompt.isEnabled) {
          systemPrompt = customPrompt.prompt;
          agentUsed = customPrompt.name;
        }
      } catch (error) {
        console.warn(`Failed to resolve custom prompt "${agentName}":`, error);
      }
    }
    
    return { systemPrompt, agentUsed };
  }
}