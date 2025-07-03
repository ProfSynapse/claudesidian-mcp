import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { IToolExecutionService } from '../interfaces/IRequestHandlerServices';
import { IAgent } from '../../agents/interfaces/IAgent';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../../utils/errorUtils';

export class ToolExecutionService implements IToolExecutionService {
    async executeAgent(
        agent: IAgent,
        mode: string,
        params: any
    ): Promise<any> {
        try {
            this.validateModeSpecificParams(agent.name, mode, params);
            return await agent.executeMode(mode, params);
        } catch (error) {
            logger.systemError(error as Error, `Tool Execution - ${agent.name}:${mode}`);
            throw error;
        }
    }

    private validateModeSpecificParams(agentName: string, mode: string, params: any): void {
        switch (agentName) {
            case 'memoryManager':
                this.validateMemoryManagerParams(mode, params);
                break;
            case 'vaultManager':
                this.validateVaultManagerParams(mode, params);
                break;
            case 'contentManager':
                this.validateContentManagerParams(mode, params);
                break;
        }
    }

    private validateMemoryManagerParams(mode: string, params: any): void {
        if (mode === 'createState' && !params.name) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Missing required parameter: name for createState mode'
            );
        }
    }

    private validateVaultManagerParams(mode: string, params: any): void {
        if (['listFolders', 'createFolder', 'listFiles'].includes(mode) && 
            params.path === undefined) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Missing required parameter: path for ${mode} mode`
            );
        }
    }

    private validateContentManagerParams(mode: string, params: any): void {
        if (mode === 'createContent') {
            if (!params.filePath) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    'Missing required parameter: filePath for createContent mode'
                );
            }
            if (params.content === undefined || params.content === null) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    'Missing required parameter: content for createContent mode'
                );
            }
        }
    }
}