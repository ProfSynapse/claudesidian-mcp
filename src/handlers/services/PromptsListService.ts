import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { IPromptsListService } from '../interfaces/IRequestHandlerServices';
import { logger } from '../../utils/logger';

/**
 * Prompt interface for MCP prompt listing
 */
interface Prompt {
    name: string;
    description?: string;
    arguments?: Array<{
        name: string;
        description?: string;
        required?: boolean;
    }>;
}

/**
 * Service for listing available prompts
 * Applies Single Responsibility Principle by focusing solely on prompt enumeration
 * 
 * Currently returns empty list but structured for future prompt template support
 */
export class PromptsListService implements IPromptsListService {
    constructor() {}

    /**
     * Get all available prompts
     * @returns Promise resolving to array of prompts
     */
    async listPrompts(): Promise<{ prompts: Prompt[] }> {
        try {
            logger.systemLog('PromptsListService: Listing available prompts');
            
            // Currently no prompts implemented - returning empty array
            // This maintains API compatibility while allowing future expansion
            const prompts: Prompt[] = [];
            
            // Future enhancement: Could scan for prompt templates in vault
            // or provide predefined prompt templates for common operations
            
            logger.systemLog(`PromptsListService: Found ${prompts.length} prompts`);
            return { prompts };
        } catch (error) {
            logger.systemError(error as Error, 'PromptsListService');
            throw new McpError(ErrorCode.InternalError, 'Failed to list prompts', error);
        }
    }

    /**
     * Get prompts by category (future enhancement)
     * @param category Optional category to filter prompts
     * @returns Promise resolving to filtered prompts
     */
    async listPromptsByCategory(category?: string): Promise<{ prompts: Prompt[] }> {
        try {
            const allPrompts = await this.listPrompts();
            
            if (!category) {
                return allPrompts;
            }
            
            // Future: Filter prompts by category when implemented
            return { prompts: [] };
        } catch (error) {
            logger.systemError(error as Error, 'PromptsListService');
            throw new McpError(ErrorCode.InternalError, 'Failed to list prompts by category', error);
        }
    }

    /**
     * Check if prompt exists by name (future enhancement)
     * @param name Prompt name
     * @returns Promise resolving to boolean
     */
    async promptExists(name: string): Promise<boolean> {
        try {
            const prompts = await this.listPrompts();
            return prompts.prompts.some(prompt => prompt.name === name);
        } catch (error) {
            logger.systemWarn(`PromptsListService: Prompt existence check failed for ${name}`);
            return false;
        }
    }
}