import { App } from 'obsidian';
import { BaseTool } from './BaseTool';
import { ManageNoteTool } from './core/ManageNoteTool';
import { ManageMetadataTool } from './core/ManageMetadataTool';
import { AIGenerationTool } from './core/AIGenerationTool';
import { ManageFolderTool } from './core/ManageFolderTool';
import { NoteDiffTool } from './core/NoteDiffTool';
import { ProjectTool } from './core/ProjectTool';
import { EventManager } from '../services/EventManager';
import { IToolContext, IToolRegistry, IVaultManager } from './interfaces/ToolInterfaces';

/**
 * Represents the state of a conversation
 */
export interface ConversationState {
    isActive: boolean;
}

/**
 * Registry for managing tools
 * Implements IToolRegistry interface
 */
export class ToolRegistry implements IToolRegistry {
    private tools: Map<string, typeof BaseTool> = new Map();
    private instances: Map<string, BaseTool> = new Map();
    private context: IToolContext;
    private conversationState: ConversationState;

    /**
     * Sets the conversation as active
     * Used to track conversation state for tools
     */
    setActive(): void {
        this.conversationState.isActive = true;
    }

    constructor(
        app: App,
        plugin: any,
        vaultManager: IVaultManager,
        private eventManager: EventManager
    ) {
        this.resetConversationState();
        this.context = {
            app,
            plugin,
            vault: vaultManager,
            toolRegistry: this,
            settings: plugin.settings,
            eventManager
        };

        // Register all core tools
        [
            ManageMetadataTool,
            AIGenerationTool,
            ManageNoteTool,
            ManageFolderTool,
            NoteDiffTool,
            ProjectTool
        ].forEach(Tool => this.registerTool(Tool));
    }

    /**
     * Registers a tool class and creates an instance
     * @param toolClass Tool class to register
     * @throws Error if a tool with the same name is already registered
     */
    registerTool(toolClass: new (context: IToolContext, ...args: any[]) => BaseTool) {
        // Create tool instance
        const instance = new toolClass(this.context);
        const name = instance.getName();
        
        // Check if tool is already registered
        if (this.tools.has(name)) {
            throw new Error(`Tool ${name} is already registered`);
        }

        // Store tool class and instance
        this.tools.set(name, toolClass);
        this.instances.set(name, instance);
    }

    /**
     * Executes a tool with the given name and arguments
     * @param name Tool name
     * @param args Tool arguments
     * @returns Tool execution result
     * @throws Error if tool not found or execution fails
     */
    async executeTool(name: string, args: any): Promise<any> {
        const instance = this.instances.get(name);
        if (!instance) {
            throw new Error(`Tool ${name} not found`);
        }

        try {
            // Set conversation as active for any tool execution
            this.setActive();

            // For tools that require confirmation, we should implement a confirmation dialog
            // Currently, we proceed without confirmation
            // This should be implemented in a future update
            
            const result = await instance.execute(args);
            return result;
        } catch (error) {
            console.error(`Error executing tool ${name}:`, error);
            throw error;
        }
    }

    /**
     * Resets the conversation state to inactive
     * Used when starting a new conversation
     */
    resetConversationState(): void {
        this.conversationState = {
            isActive: false
        };
    }

    /**
     * Gets all available tools with their names and descriptions
     * @returns Array of tool information objects
     */
    getAvailableTools(): Array<{name: string; description: string}> {
        return Array.from(this.instances.values()).map(tool => ({
            name: tool.getName(),
            description: tool.getDescription()
        }));
    }

    /**
     * Loads external tools from a directory
     * @param toolsPath Path to the directory containing tool modules
     * @remarks This is a placeholder for future implementation
     */
    async loadExternalTools(toolsPath: string): Promise<void> {
        // Implementation for loading external tools
        // This would scan the tools directory and load any valid tool modules
        console.log(`External tools would be loaded from: ${toolsPath}`);
    }

    /**
     * Gets a tool by name
     * @param name Tool name
     * @returns The tool instance
     * @throws Error if tool not found
     */
    getTool(name: string): BaseTool {
        const tool = this.instances.get(name);
        if (!tool) {
            throw new Error(`Tool '${name}' not found`);
        }
        return tool;
    }
}
