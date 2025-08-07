/**
 * Execute Prompt Mode - Orchestrates LLM prompt execution workflow
 * Follows Single Responsibility Principle by delegating specialized tasks to services
 */

import { BaseMode } from '../../../baseMode';
import { CommonResult } from '../../../../types';
import { createResult } from '../../../../utils/schemaUtils';
import { LLMProviderManager } from '../../../../services/LLMProviderManager';
import { CustomPromptStorageService } from '../../../../database/services/CustomPromptStorageService';
import { AgentManager } from '../../../../services/AgentManager';
import { UsageTracker, BudgetStatus } from '../../../../services/UsageTracker';
import { 
    DependencyValidator, 
    PromptExecutor, 
    ActionExecutor, 
    BudgetManager,
    ServiceDependencies
} from './services';
import { SchemaBuilder, SchemaType } from '../../../../utils/schemas/SchemaBuilder';

export interface ExecutePromptParams {
    agent?: string;
    filepaths?: string[];
    prompt: string;
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    action?: {
        type: 'create' | 'append' | 'prepend' | 'replace' | 'findReplace';
        targetPath: string;
        position?: number;
        findText?: string;
        replaceAll?: boolean;
        caseSensitive?: boolean;
        wholeWord?: boolean;
    };
    sessionId: string;
    context: string;
    workspaceContext?: any;
    handoff?: any;
}

export interface ExecutePromptResult extends CommonResult {
    data: {
        response: string;
        model: string;
        provider: string;
        agentUsed: string;
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
        budgetStatus?: BudgetStatus;
        filesIncluded?: string[];
        actionPerformed?: {
            type: string;
            targetPath: string;
            success: boolean;
            error?: string;
        };
    };
}

/**
 * Main orchestrator for prompt execution workflow
 * Delegates specialized tasks to focused services following SOLID principles
 */
export class ExecutePromptMode extends BaseMode<ExecutePromptParams, ExecutePromptResult> {
    private dependencyValidator: DependencyValidator;
    private promptExecutor: PromptExecutor;
    private actionExecutor: ActionExecutor;
    private budgetManager: BudgetManager;
    private schemaBuilder: SchemaBuilder;

    constructor() {
        super(
            'executePrompt',
            'Execute Prompt',
            'Execute an LLM prompt using a custom agent with optional file content and ContentManager actions',
            '1.0.0'
        );

        // Initialize services with null dependencies - will be updated via setters
        const dependencies: ServiceDependencies = {
            providerManager: null,
            promptStorage: null,
            agentManager: null,
            usageTracker: null
        };

        this.dependencyValidator = new DependencyValidator(dependencies);
        this.promptExecutor = new PromptExecutor(null!, null!);
        this.actionExecutor = new ActionExecutor(null);
        this.budgetManager = new BudgetManager(null);
        this.schemaBuilder = new SchemaBuilder(null);
    }

    /**
     * Set the provider manager instance
     */
    setProviderManager(providerManager: LLMProviderManager): void {
        this.dependencyValidator.updateDependencies({ providerManager });
        this.promptExecutor = new PromptExecutor(providerManager, this.promptExecutor['promptStorage']);
        this.schemaBuilder.updateProviderManager(providerManager);
    }

    /**
     * Set the prompt storage service
     */
    setPromptStorage(promptStorage: CustomPromptStorageService): void {
        this.dependencyValidator.updateDependencies({ promptStorage });
        this.promptExecutor = new PromptExecutor(this.promptExecutor['providerManager'], promptStorage);
    }

    /**
     * Set the usage tracker for LLM cost tracking
     */
    setUsageTracker(usageTracker: UsageTracker): void {
        this.dependencyValidator.updateDependencies({ usageTracker });
        this.budgetManager.updateUsageTracker(usageTracker);
    }

    /**
     * Set the agent manager for action operations
     */
    setAgentManager(agentManager: AgentManager): void {
        this.dependencyValidator.updateDependencies({ agentManager });
        this.actionExecutor.updateAgentManager(agentManager);
    }

    /**
     * Execute the prompt mode using service orchestration
     */
    async execute(params: ExecutePromptParams): Promise<ExecutePromptResult> {
        try {
            // Phase 1: Validate dependencies
            const dependencyValidation = this.dependencyValidator.validateDependencies();
            if (!dependencyValidation.isValid) {
                return createResult<ExecutePromptResult>(
                    false,
                    undefined,
                    dependencyValidation.error!,
                    undefined,
                    undefined,
                    params.sessionId,
                    params.context
                );
            }

            // Phase 2: Validate custom agent if specified
            if (params.agent) {
                const agentValidation = await this.dependencyValidator.validateCustomPromptAgent(params.agent);
                if (!agentValidation.isValid) {
                    return createResult<ExecutePromptResult>(
                        false,
                        undefined,
                        agentValidation.error!,
                        undefined,
                        undefined,
                        params.sessionId,
                        params.context
                    );
                }
            }

            // Phase 3: Validate budget
            const budgetValidation = await this.budgetManager.validateBudget();
            if (!budgetValidation.isValid) {
                return createResult<ExecutePromptResult>(
                    false,
                    undefined,
                    budgetValidation.error!,
                    undefined,
                    undefined,
                    params.sessionId,
                    params.context
                );
            }

            // Phase 4: Execute prompt
            const promptResult = await this.promptExecutor.executePrompt(params);
            if (!promptResult.success) {
                return createResult<ExecutePromptResult>(
                    false,
                    undefined,
                    promptResult.error!,
                    undefined,
                    undefined,
                    params.sessionId,
                    params.context
                );
            }

            // Phase 5: Track usage
            let finalBudgetStatus: BudgetStatus | undefined = budgetValidation.budgetStatus;
            if (promptResult.cost && promptResult.provider) {
                const usageResult = await this.budgetManager.trackUsage(
                    promptResult.provider,
                    promptResult.cost.totalCost
                );
                if (usageResult.success && usageResult.budgetStatus) {
                    finalBudgetStatus = usageResult.budgetStatus;
                }
            }

            // Phase 6: Execute action if specified
            const actionResult = await this.actionExecutor.executeAction(params, promptResult.response || '');

            // Phase 7: Build result
            const resultData: ExecutePromptResult['data'] = {
                response: promptResult.response || '',
                model: promptResult.model || 'unknown',
                provider: promptResult.provider || 'unknown',
                agentUsed: promptResult.agentUsed,
                usage: promptResult.usage,
                cost: promptResult.cost,
                budgetStatus: finalBudgetStatus,
                filesIncluded: promptResult.filesIncluded,
                actionPerformed: actionResult.actionPerformed
            };

            return createResult<ExecutePromptResult>(
                true,
                resultData,
                undefined,
                undefined,
                undefined,
                params.sessionId,
                params.context
            );

        } catch (error) {
            return createResult<ExecutePromptResult>(
                false,
                undefined,
                `Failed to execute prompt: ${error instanceof Error ? error.message : 'Unknown error'}`,
                undefined,
                undefined,
                params.sessionId,
                params.context
            );
        }
    }

    /**
     * Get parameter schema for the mode
     */
    getParameterSchema(): any {
        return this.schemaBuilder.buildParameterSchema(SchemaType.Execute, {
            mode: 'executePrompt',
            providerManager: this.dependencyValidator.getDependencies().providerManager
        });
    }

    /**
     * Get result schema for the mode
     */
    getResultSchema(): any {
        return this.schemaBuilder.buildResultSchema(SchemaType.Execute, {
            mode: 'executePrompt',
            providerManager: this.dependencyValidator.getDependencies().providerManager
        });
    }
}