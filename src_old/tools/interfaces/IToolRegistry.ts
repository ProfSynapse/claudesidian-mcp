import { BaseTool } from '../BaseTool';
import { IToolContext } from './ToolInterfaces';

/**
 * Interface for tool registry
 * Follows Single Responsibility Principle by focusing only on tool management
 */
export interface IToolRegistry {
    /**
     * Registers a tool class
     * @param toolClass Tool class to register
     */
    registerTool(toolClass: new (context: IToolContext, ...args: any[]) => BaseTool): void;
    
    /**
     * Gets a tool by name
     * @param name Tool name
     * @returns The tool instance
     * @throws Error if tool not found
     */
    getTool(name: string): BaseTool;
    
    /**
     * Gets all available tools
     * @returns Array of tool information
     */
    getAvailableTools(): Array<{name: string; description: string}>;
    
    /**
     * Executes a tool
     * @param name Tool name
     * @param args Tool arguments
     * @returns Tool execution result
     */
    executeTool(name: string, args: any): Promise<any>;
    
    /**
     * Sets the conversation as active
     */
    setActive(): void;
    
    /**
     * Resets the conversation state
     */
    resetConversationState(): void;
}
