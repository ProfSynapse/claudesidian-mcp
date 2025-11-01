import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { IRequestStrategy } from './IRequestStrategy';
import { IRequestHandlerDependencies } from '../interfaces/IRequestHandlerServices';
import { IAgent } from '../../agents/interfaces/IAgent';
import { logger } from '../../utils/logger';

interface ToolListRequest {
    method: string;
}

interface ToolListResponse {
    tools: any[];
}

export class ToolListStrategy implements IRequestStrategy<ToolListRequest, ToolListResponse> {
    constructor(
        private dependencies: IRequestHandlerDependencies,
        private agents: Map<string, IAgent>,
        private isVaultEnabled: boolean,
        private vaultName?: string
    ) {}

    canHandle(request: ToolListRequest): boolean {
        return request.method === 'tools/list';
    }

    async handle(request: ToolListRequest): Promise<ToolListResponse> {
        try {
            // Claude Desktop: Return all tools (no dynamic registration)
            // Bounded context is only for Chat View internal connector
            return await this.dependencies.toolListService.generateToolList(
                this.agents,
                this.isVaultEnabled,
                this.vaultName
            );
        } catch (error) {
            logger.systemError(error as Error, "Tool List Strategy");
            throw new McpError(ErrorCode.InternalError, 'Failed to list tools', error);
        }
    }
}