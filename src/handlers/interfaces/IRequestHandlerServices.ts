import { IAgent } from '../../agents/interfaces/IAgent';
import { SessionContextManager } from '../../services/SessionContextManager';
import { ModeCall, ModeCallResult } from '../../types';
import { ISchemaProvider } from './ISchemaProvider';

export interface IValidationService {
    validateToolParams(params: any, schema?: any, toolName?: string): Promise<any>;
    validateSessionId(sessionId: string): Promise<string>;
    validateBatchOperations(operations: any[]): Promise<void>;
    validateBatchPaths(paths: any[]): Promise<void>;
}

export interface ISessionService {
    processSessionId(sessionId: string): Promise<{
        sessionId: string;
        isNewSession: boolean;
        isNonStandardId: boolean;
        originalSessionId?: string;
    }>;
    generateSessionId(): string;
    isStandardSessionId(sessionId: string): boolean;
    shouldInjectInstructions(sessionId: string, sessionContextManager?: SessionContextManager): boolean;
}

export interface IToolExecutionService {
    executeAgent(
        agent: IAgent,
        mode: string,
        params: any
    ): Promise<any>;
}

export interface IHandoffProcessor {
    processHandoff(
        result: any,
        getAgent: (name: string) => IAgent,
        sessionId: string,
        sessionContextManager?: SessionContextManager
    ): Promise<any>;
    processSingleHandoff(
        handoff: ModeCall,
        getAgent: (name: string) => IAgent,
        sessionId: string,
        workspaceContext?: any,
        sessionContextManager?: SessionContextManager
    ): Promise<any>;
    processMultiHandoff(
        handoffs: ModeCall[],
        result: any,
        sessionId: string,
        sessionContextManager?: SessionContextManager
    ): Promise<any>;
}

export interface IResponseFormatter {
    formatToolExecutionResponse(result: any, sessionInfo?: any): any;
    formatSessionInstructions(sessionId: string, result: any): any;
    formatHandoffResponse(result: any, handoffResult: any, returnHere: boolean): any;
    formatErrorResponse(error: Error): any;
}

export interface IToolListService {
    generateToolList(
        agents: Map<string, IAgent>,
        isVaultEnabled: boolean,
        vaultName?: string
    ): Promise<{ tools: any[] }>;
    buildAgentSchema(agent: IAgent): any;
    mergeModeSchemasIntoAgent(agent: IAgent, agentSchema: any): any;
    setSchemaEnhancementService(service: ISchemaEnhancementService): void;
}

export interface IResourceListService {
    listResources(): Promise<{ resources: Array<{ uri: string; name: string; mimeType: string }> }>;
    listResourcesByPath(pathPrefix?: string): Promise<{ resources: Array<{ uri: string; name: string; mimeType: string }> }>;
}

export interface IResourceReadService {
    readResource(uri: string): Promise<{ contents: Array<{ uri: string; text: string; mimeType: string }> }>;
    readMultipleResources(uris: string[]): Promise<{ contents: Array<{ uri: string; text: string; mimeType: string }> }>;
    resourceExists(uri: string): Promise<boolean>;
}

export interface IPromptsListService {
    listPrompts(): Promise<{ prompts: Array<{ name: string; description?: string; arguments?: any[] }> }>;
    listPromptsByCategory(category?: string): Promise<{ prompts: Array<{ name: string; description?: string; arguments?: any[] }> }>;
    promptExists(name: string): Promise<boolean>;
    getPrompt(name: string): Promise<string | null>;
}

export interface IToolHelpService {
    generateToolHelp(
        getAgent: (name: string) => IAgent,
        toolName: string,
        mode: string
    ): Promise<{ content: Array<{ type: string; text: string }> }>;
    generateAgentHelp(
        getAgent: (name: string) => IAgent,
        toolName: string
    ): Promise<{ content: Array<{ type: string; text: string }> }>;
    validateModeExists(
        getAgent: (name: string) => IAgent,
        toolName: string,
        mode: string
    ): Promise<boolean>;
}

export interface IRequestContext {
    agentName: string;
    mode: string;
    params: any;
    sessionId: string;
    fullToolName: string;
    sessionContextManager?: SessionContextManager;
}

export interface ISchemaEnhancementService {
    enhanceToolSchema(toolName: string, baseSchema: any): Promise<any>;
    getAvailableEnhancements(): Promise<string[]>;
    registerProvider(provider: ISchemaProvider): void;
    unregisterProvider(providerName: string): boolean;
    hasProvider(providerName: string): boolean;
    clearProviders(): void;
    getProviderInfo(): Array<{ name: string; description: string; priority: number }>;
}

export interface IRequestHandlerDependencies {
    validationService: IValidationService;
    sessionService: ISessionService;
    toolExecutionService: IToolExecutionService;
    handoffProcessor: IHandoffProcessor;
    responseFormatter: IResponseFormatter;
    toolListService: IToolListService;
    resourceListService: IResourceListService;
    resourceReadService: IResourceReadService;
    promptsListService: IPromptsListService;
    toolHelpService: IToolHelpService;
    schemaEnhancementService: ISchemaEnhancementService;
}