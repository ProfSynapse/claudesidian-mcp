import { App } from 'obsidian';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types';
import { IAgent } from '../agents/interfaces/IAgent';
import { SessionContextManager } from '../services/SessionContextManager';
import { IRequestHandlerDependencies } from './interfaces/IRequestHandlerServices';
import { IRequestStrategy } from './strategies/IRequestStrategy';

// Import services
import { ValidationService } from './services/ValidationService';
import { SessionService } from './services/SessionService';
import { ToolExecutionService } from './services/ToolExecutionService';
import { HandoffProcessor } from './services/HandoffProcessor';
import { ResponseFormatter } from './services/ResponseFormatter';
import { ToolListService } from './services/ToolListService';
import { ResourceListService } from './services/ResourceListService';
import { ResourceReadService } from './services/ResourceReadService';
import { PromptsListService } from './services/PromptsListService';
import { CustomPromptStorageService } from '../database/services/CustomPromptStorageService';
import { ToolHelpService } from './services/ToolHelpService';

// Import strategies
import { ToolExecutionStrategy } from './strategies/ToolExecutionStrategy';
import { ToolListStrategy } from './strategies/ToolListStrategy';
import { ResourceListStrategy } from './strategies/ResourceListStrategy';
import { ResourceReadStrategy } from './strategies/ResourceReadStrategy';
import { PromptsListStrategy } from './strategies/PromptsListStrategy';
import { PromptsGetStrategy } from './strategies/PromptsGetStrategy';
import { ToolHelpStrategy } from './strategies/ToolHelpStrategy';

// All requests now handled through modern strategy pattern

export class RequestRouter {
    private dependencies!: IRequestHandlerDependencies;
    private strategies: IRequestStrategy[] = [];

    constructor(
        private app: App,
        private agents: Map<string, IAgent>,
        private isVaultEnabled: boolean,
        private vaultName?: string,
        private sessionContextManager?: SessionContextManager,
        private customPromptStorage?: CustomPromptStorageService,
        private onToolResponse?: (toolName: string, params: any, response: any, success: boolean, executionTime: number) => Promise<void>
    ) {
        this.initializeDependencies();
        this.initializeStrategies();
    }

    private initializeDependencies(): void {
        this.dependencies = {
            validationService: new ValidationService(),
            sessionService: new SessionService(),
            toolExecutionService: new ToolExecutionService(),
            handoffProcessor: new HandoffProcessor(),
            responseFormatter: new ResponseFormatter(),
            toolListService: new ToolListService(),
            resourceListService: new ResourceListService(this.app),
            resourceReadService: new ResourceReadService(this.app),
            promptsListService: new PromptsListService(this.customPromptStorage),
            toolHelpService: new ToolHelpService()
        };
    }

    private initializeStrategies(): void {
        this.strategies = [
            new ToolListStrategy(
                this.dependencies,
                this.agents,
                this.isVaultEnabled,
                this.vaultName
            ),
            new ToolExecutionStrategy(
                this.dependencies,
                this.getAgent.bind(this),
                this.sessionContextManager,
                this.onToolResponse
            ),
            new ResourceListStrategy(
                this.dependencies,
                this.app
            ),
            new ResourceReadStrategy(
                this.dependencies,
                this.app
            ),
            new PromptsListStrategy(
                this.dependencies
            ),
            new PromptsGetStrategy(
                this.dependencies
            ),
            new ToolHelpStrategy(
                this.dependencies,
                this.getAgent.bind(this)
            )
        ];
    }

    async handleRequest(method: string, request: any): Promise<any> {
        // All requests now handled through strategy pattern
        const requestWithMethod = { method, ...request };
        return await this.handleWithStrategy(requestWithMethod);
    }

    private async handleWithStrategy(request: any): Promise<any> {
        for (const strategy of this.strategies) {
            if (strategy.canHandle(request)) {
                return await strategy.handle(request);
            }
        }
        
        throw new McpError(
            ErrorCode.MethodNotFound,
            `No strategy found for request: ${request.method || 'unknown'}`
        );
    }

    private getAgent(name: string): IAgent {
        const agent = this.agents.get(name);
        if (!agent) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Agent not found: ${name}`
            );
        }
        return agent;
    }

    // Expose dependencies for testing or extended functionality
    getDependencies(): IRequestHandlerDependencies {
        return this.dependencies;
    }

    // Allow adding custom strategies
    addStrategy(strategy: IRequestStrategy): void {
        this.strategies.push(strategy);
    }
}