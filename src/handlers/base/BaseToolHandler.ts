import { BaseHandler } from './BaseHandler';
import { IAgent } from '../../agents/interfaces/IAgent';
import { SessionContextManager } from '../../services/SessionContextManager';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Base class for tool-related handlers
 * 
 * This class extends BaseHandler with tool-specific functionality,
 * including agent management and session context handling.
 */
export abstract class BaseToolHandler extends BaseHandler {
    constructor(
        protected getAgent: (name: string) => IAgent,
        protected sessionContextManager?: SessionContextManager
    ) {
        super();
    }
    
    /**
     * Validate that an agent exists and return it
     * 
     * @param agentName - Name of the agent to retrieve
     * @returns The agent instance
     * @throws McpError if agent not found
     */
    protected validateAndGetAgent(agentName: string): IAgent {
        if (!agentName || typeof agentName !== 'string') {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Agent name must be a non-empty string'
            );
        }
        
        try {
            return this.getAgent(agentName);
        } catch (error) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Agent '${agentName}' not found`
            );
        }
    }
    
    /**
     * Validate that a mode exists on an agent
     * 
     * @param agent - The agent instance
     * @param modeName - Name of the mode to validate
     * @returns The mode instance
     * @throws McpError if mode not found
     */
    protected validateAndGetMode(agent: IAgent, modeName: string): any {
        if (!modeName || typeof modeName !== 'string') {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Mode name must be a non-empty string'
            );
        }
        
        const mode = agent.getMode(modeName);
        if (!mode) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Mode '${modeName}' not found in agent '${agent.name}'`
            );
        }
        
        return mode;
    }
    
    /**
     * Extract tool name and mode from request parameters
     * 
     * @param request - The request object
     * @returns Object containing agentName and mode
     */
    protected extractToolInfo(request: any): { agentName: string; mode?: string } {
        const params = this.extractParams(request);
        
        const { name: fullToolName } = params;
        if (!fullToolName) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Tool name is required'
            );
        }
        
        return {
            agentName: fullToolName
        };
    }
}