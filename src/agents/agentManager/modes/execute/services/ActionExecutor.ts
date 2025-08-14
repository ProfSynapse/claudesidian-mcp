/**
 * ActionExecutor - Handles content action execution
 * Follows Single Responsibility Principle by focusing only on content action operations
 */

import { AgentManager } from '../../../../../services/AgentManager';
import { ExecutePromptParams } from '../ExecutePromptMode';

export interface ActionExecutionResult {
    success: boolean;
    actionPerformed?: {
        type: string;
        targetPath: string;
        success: boolean;
        error?: string;
    };
    error?: string;
}

/**
 * Service responsible for executing content actions
 * Follows SRP by focusing only on content action execution operations
 */
export class ActionExecutor {
    constructor(private agentManager: AgentManager | null) {}

    /**
     * Execute content action with LLM response
     */
    async executeAction(
        params: ExecutePromptParams,
        llmResponse: string
    ): Promise<ActionExecutionResult> {
        // Check if action is specified and agent manager is available
        if (!params.action) {
            return {
                success: true // No action to execute is not an error
            };
        }

        if (!this.agentManager) {
            return {
                success: false,
                error: 'Agent manager not available for action execution'
            };
        }

        try {
            const actionResult = await this.executeContentAction(
                params.action,
                llmResponse,
                params.context.sessionId || '',
                typeof params.context === 'string' ? params.context : JSON.stringify(params.context)
            );

            return {
                success: true,
                actionPerformed: {
                    type: params.action.type,
                    targetPath: params.action.targetPath,
                    success: actionResult.success,
                    error: actionResult.error
                }
            };
        } catch (error) {
            console.error('ActionExecutor: Action execution failed with exception:', error);
            return {
                success: false,
                actionPerformed: {
                    type: params.action.type,
                    targetPath: params.action.targetPath,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown action error'
                },
                error: error instanceof Error ? error.message : 'Unknown action error'
            };
        }
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
        console.log('executeContentAction called with:', {
            actionType: action.type,
            targetPath: action.targetPath,
            contentLength: content.length,
            hasAgentManager: !!this.agentManager
        });

        if (!this.agentManager) {
            console.error('executeContentAction: Agent manager not available');
            return { success: false, error: 'Agent manager not available' };
        }

        try {
            const actionParams: any = {
                sessionId,
                context,
                content
            };

            console.log('executeContentAction: Preparing to call agent with params:', {
                actionType: action.type,
                paramsKeys: Object.keys(actionParams),
                targetPath: action.targetPath
            });

            switch (action.type) {
                case 'create':
                    actionParams.filePath = action.targetPath;
                    console.log('executeContentAction: Calling createContent mode');
                    await this.agentManager.executeAgentMode('contentManager', 'createContent', actionParams);
                    break;

                case 'append':
                    actionParams.filePath = action.targetPath;
                    console.log('executeContentAction: Calling appendContent mode');
                    await this.agentManager.executeAgentMode('contentManager', 'appendContent', actionParams);
                    break;

                case 'prepend':
                    actionParams.filePath = action.targetPath;
                    console.log('executeContentAction: Calling prependContent mode');
                    await this.agentManager.executeAgentMode('contentManager', 'prependContent', actionParams);
                    break;

                case 'replace':
                    actionParams.filePath = action.targetPath;
                    if (action.position !== undefined) {
                        actionParams.line = action.position;
                        console.log('executeContentAction: Calling replaceByLine mode');
                        await this.agentManager.executeAgentMode('contentManager', 'replaceByLine', actionParams);
                    } else {
                        console.log('executeContentAction: Calling replaceContent mode');
                        await this.agentManager.executeAgentMode('contentManager', 'replaceContent', actionParams);
                    }
                    break;

                case 'findReplace':
                    if (!action.findText) {
                        console.error('executeContentAction: findText is required for findReplace action');
                        return { success: false, error: 'findText is required for findReplace action' };
                    }
                    actionParams.filePath = action.targetPath;
                    actionParams.findText = action.findText;
                    actionParams.replaceText = content; // LLM response becomes the replacement text
                    actionParams.replaceAll = action.replaceAll ?? false;
                    actionParams.caseSensitive = action.caseSensitive ?? true;
                    actionParams.wholeWord = action.wholeWord ?? false;
                    console.log('executeContentAction: Calling findReplaceContent mode');
                    await this.agentManager.executeAgentMode('contentManager', 'findReplaceContent', actionParams);
                    break;

                default:
                    console.error('executeContentAction: Unknown action type:', action.type);
                    return { success: false, error: `Unknown action type: ${action.type}` };
            }

            console.log('executeContentAction: Agent mode execution completed successfully');
            return { success: true };
        } catch (error) {
            console.error('executeContentAction: Agent mode execution failed:', error);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error' 
            };
        }
    }

    /**
     * Validate action parameters
     */
    validateActionParameters(action: ExecutePromptParams['action']): {
        isValid: boolean;
        errors: string[];
        warnings: string[];
    } {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!action) {
            return { isValid: true, errors, warnings }; // No action is valid
        }

        // Validate required fields
        if (!action.type || typeof action.type !== 'string') {
            errors.push('Action type is required and must be a string');
        } else if (!['create', 'append', 'prepend', 'replace', 'findReplace'].includes(action.type)) {
            errors.push('Action type must be one of: create, append, prepend, replace, findReplace');
        }

        if (!action.targetPath || typeof action.targetPath !== 'string') {
            errors.push('Action targetPath is required and must be a string');
        }

        // Validate action-specific requirements
        if (action.type === 'findReplace' && !action.findText) {
            errors.push('findText is required for findReplace action');
        }

        if (action.type === 'replace' && action.position !== undefined && 
            (typeof action.position !== 'number' || action.position < 0)) {
            errors.push('Position must be a non-negative number');
        }

        // Validate optional boolean fields
        if (action.replaceAll !== undefined && typeof action.replaceAll !== 'boolean') {
            errors.push('replaceAll must be a boolean');
        }

        if (action.caseSensitive !== undefined && typeof action.caseSensitive !== 'boolean') {
            errors.push('caseSensitive must be a boolean');
        }

        if (action.wholeWord !== undefined && typeof action.wholeWord !== 'boolean') {
            errors.push('wholeWord must be a boolean');
        }

        // Warnings
        if (!this.agentManager) {
            warnings.push('Agent manager not available - actions will not be executed');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Get action execution capability
     */
    getActionCapability(): {
        canExecuteActions: boolean;
        supportedActionTypes: string[];
        hasAgentManager: boolean;
    } {
        return {
            canExecuteActions: !!this.agentManager,
            supportedActionTypes: ['create', 'append', 'prepend', 'replace', 'findReplace'],
            hasAgentManager: !!this.agentManager
        };
    }

    /**
     * Get action type description
     */
    getActionTypeDescription(actionType: string): string {
        const descriptions: Record<string, string> = {
            create: 'Create a new file with the LLM response content',
            append: 'Append the LLM response to the end of an existing file',
            prepend: 'Prepend the LLM response to the beginning of an existing file',
            replace: 'Replace the entire file content or a specific line with the LLM response',
            findReplace: 'Find specific text and replace it with the LLM response'
        };

        return descriptions[actionType] || 'Unknown action type';
    }

    /**
     * Update agent manager
     */
    updateAgentManager(agentManager: AgentManager | null): void {
        this.agentManager = agentManager;
    }

    /**
     * Test action execution capability
     */
    testActionCapability(): {
        canExecute: boolean;
        error?: string;
    } {
        if (!this.agentManager) {
            return {
                canExecute: false,
                error: 'Agent manager not available'
            };
        }

        try {
            // Test if agent manager has the required methods
            if (typeof this.agentManager.executeAgentMode !== 'function') {
                return {
                    canExecute: false,
                    error: 'Agent manager does not have executeAgentMode method'
                };
            }

            return {
                canExecute: true
            };
        } catch (error) {
            return {
                canExecute: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
}