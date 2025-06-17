import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { IRequestStrategy } from './IRequestStrategy';
import { IRequestHandlerDependencies, IRequestContext } from '../interfaces/IRequestHandlerServices';
import { IAgent } from '../../agents/interfaces/IAgent';
import { SessionContextManager } from '../../services/SessionContextManager';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../../utils/errorUtils';

interface ToolExecutionRequest {
    params: {
        name: string;
        arguments: any;
    };
}

interface ToolExecutionResponse {
    content: Array<{
        type: string;
        text: string;
    }>;
}

export class ToolExecutionStrategy implements IRequestStrategy<ToolExecutionRequest, ToolExecutionResponse> {
    constructor(
        private dependencies: IRequestHandlerDependencies,
        private getAgent: (name: string) => IAgent,
        private sessionContextManager?: SessionContextManager
    ) {}

    canHandle(request: ToolExecutionRequest): boolean {
        return !!(request.params && request.params.name && request.params.arguments);
    }

    async handle(request: ToolExecutionRequest): Promise<ToolExecutionResponse> {
        try {
            const context = await this.buildRequestContext(request);
            const processedParams = await this.processParameters(context);
            const result = await this.executeToolWithHandoffs(context, processedParams);
            
            return this.dependencies.responseFormatter.formatToolExecutionResponse(
                result,
                context.sessionInfo
            );
        } catch (error) {
            if (error instanceof McpError) {
                throw error;
            }
            logger.systemError(error as Error, 'Tool Execution Strategy');
            throw new McpError(ErrorCode.InternalError, 'Failed to execute tool', error);
        }
    }

    private async buildRequestContext(request: ToolExecutionRequest): Promise<IRequestContext & { sessionInfo: any }> {
        const { name: fullToolName, arguments: parsedArgs } = request.params;
        
        if (!parsedArgs) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Missing arguments for tool ${fullToolName}`
            );
        }

        const agentName = this.extractAgentName(fullToolName);
        const { mode, ...params } = parsedArgs as { mode: string; [key: string]: any };
        
        if (!mode) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Missing required parameter: mode for agent ${agentName}`
            );
        }

        const sessionInfo = await this.dependencies.sessionService.processSessionId(params.sessionId);
        params.sessionId = sessionInfo.sessionId;
        
        const shouldInjectInstructions = this.dependencies.sessionService.shouldInjectInstructions(
            sessionInfo.sessionId, 
            this.sessionContextManager
        );

        return {
            agentName,
            mode,
            params,
            sessionId: sessionInfo.sessionId,
            fullToolName,
            sessionContextManager: this.sessionContextManager,
            sessionInfo: {
                ...sessionInfo,
                shouldInjectInstructions
            }
        };
    }

    private async processParameters(context: IRequestContext): Promise<any> {
        const agent = this.getAgent(context.agentName);
        const modeInstance = agent.getMode(context.mode);
        
        let paramSchema;
        try {
            if (modeInstance && typeof modeInstance.getParameterSchema === 'function') {
                paramSchema = modeInstance.getParameterSchema();
            }
        } catch (error) {
            logger.systemWarn(`Failed to get parameter schema for mode ${context.mode}: ${getErrorMessage(error)}`);
        }

        const enhancedParams = await this.dependencies.validationService.validateToolParams(
            context.params, 
            paramSchema
        );

        if (this.sessionContextManager && enhancedParams.sessionId) {
            try {
                const validatedSessionId = await this.sessionContextManager.validateSessionId(enhancedParams.sessionId);
                
                if (validatedSessionId !== enhancedParams.sessionId) {
                    enhancedParams._isNonStandardId = true;
                    enhancedParams._originalSessionId = enhancedParams.sessionId;
                    enhancedParams.sessionId = validatedSessionId;
                    logger.systemLog(`Session ID standardized from "${enhancedParams._originalSessionId}" to "${validatedSessionId}"`);
                }
            } catch (error) {
                logger.systemWarn(`Session validation failed: ${getErrorMessage(error)}. Using original ID`);
            }
        }

        let processedParams = { ...enhancedParams };
        if (this.sessionContextManager && processedParams.sessionId) {
            if (!processedParams.workspaceContext || !processedParams.workspaceContext.workspaceId) {
                processedParams = this.sessionContextManager.applyWorkspaceContext(
                    processedParams.sessionId, 
                    processedParams
                );
            }
        }

        return processedParams;
    }

    private async executeToolWithHandoffs(context: IRequestContext, processedParams: any): Promise<any> {
        const agent = this.getAgent(context.agentName);
        const result = await this.dependencies.toolExecutionService.executeAgent(
            agent,
            context.mode,
            processedParams
        );

        if (this.sessionContextManager && processedParams.sessionId && result.workspaceContext) {
            this.sessionContextManager.updateFromResult(processedParams.sessionId, result);
        }

        if (result.handoff && result.success) {
            const handoffResult = await this.dependencies.handoffProcessor.processHandoff(
                result,
                this.getAgent,
                processedParams.sessionId,
                this.sessionContextManager
            );

            if (handoffResult.handoffResult) {
                return this.dependencies.responseFormatter.formatHandoffResponse(
                    result,
                    handoffResult.handoffResult,
                    handoffResult.returnHere
                );
            }
        }

        return result;
    }

    private extractAgentName(toolName: string): string {
        const lastUnderscoreIndex = toolName.lastIndexOf('_');
        return lastUnderscoreIndex === -1 ? toolName : toolName.substring(0, lastUnderscoreIndex);
    }
}