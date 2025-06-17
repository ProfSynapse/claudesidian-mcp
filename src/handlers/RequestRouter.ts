import { App } from 'obsidian';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
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

// Import strategies
import { ToolExecutionStrategy } from './strategies/ToolExecutionStrategy';
import { ToolListStrategy } from './strategies/ToolListStrategy';

// Legacy handlers for non-tool requests
import { 
    handleResourceList, 
    handleResourceRead, 
    handlePromptsList,
    handleToolHelp 
} from './requestHandlers';

export class RequestRouter {
    private dependencies!: IRequestHandlerDependencies;
    private strategies: IRequestStrategy[] = [];

    constructor(
        private app: App,
        private agents: Map<string, IAgent>,
        private isVaultEnabled: boolean,
        private vaultName?: string,
        private sessionContextManager?: SessionContextManager
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
            toolListService: new ToolListService()
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
                this.sessionContextManager
            )
        ];
    }

    async handleRequest(method: string, request: any): Promise<any> {
        switch (method) {
            case 'resources/list':
                return await handleResourceList(this.app);
                
            case 'resources/read':
                return await handleResourceRead(this.app, request);
                
            case 'prompts/list':
                return await handlePromptsList();
                
            case 'tools/list':
                return await this.handleWithStrategy({ method, ...request });
                
            case 'tools/call':
                return await this.handleWithStrategy(request);
                
            case 'tools/help':
                return await handleToolHelp(
                    this.getAgent.bind(this),
                    request,
                    request.params.arguments
                );
                
            default:
                throw new McpError(
                    ErrorCode.MethodNotFound,
                    `Unknown method: ${method}`
                );
        }
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