import { App } from 'obsidian';
import { BaseTool, IToolContext } from './BaseTool';
import { VaultManager } from '../services/VaultManager';
import { ManageNoteTool } from './core/ManageNoteTool';
import { ManageMetadataTool } from './core/ManageMetadataTool';
import { CompletionTool } from './core/LLMTool'; 
import { ManageFolderTool } from './core/ManageFolderTool';
import { TemplateTool } from './core/TemplateTool';
import { EventManager } from '../services/EventManager';

// Conversation state
export interface ConversationState {
    isActive: boolean;
}

export class ToolRegistry {
    private tools: Map<string, typeof BaseTool> = new Map();
    private instances: Map<string, BaseTool> = new Map();
    private context: IToolContext;
    private conversationState: ConversationState;

    // Simplified conversation state management
    setActive(): void {
        this.conversationState.isActive = true;
    }

    constructor(
        app: App,
        plugin: any,
        vaultManager: VaultManager,
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
            CompletionTool,  
            ManageNoteTool,
            ManageFolderTool,
            TemplateTool
        ].forEach(Tool => this.registerTool(Tool));
    }

    registerTool(toolClass: new (context: IToolContext, ...args: any[]) => BaseTool) {
        let instance: BaseTool;
        
        // Create tool instance
        instance = new toolClass(this.context);

        const name = instance.getName();
        
        if (this.tools.has(name)) {
            throw new Error(`Tool ${name} is already registered`);
        }

        this.tools.set(name, toolClass);
        this.instances.set(name, instance);
    }

    async executeTool(name: string, args: any): Promise<any> {
        const instance = this.instances.get(name);
        if (!instance) {
            throw new Error(`Tool ${name} not found`);
        }

        try {
            // Set conversation as active for any tool execution
            this.setActive();

            if (instance.requiresConfirmation()) {
                // TODO: Implement confirmation dialog
            }

            const result = await instance.execute(args);
            return result;
        } catch (error) {
            console.error(`Error executing tool ${name}:`, error);
            throw error;
        }
    }

    // Reset conversation state
    resetConversationState(): void {
        this.conversationState = {
            isActive: false
        };
    }

    getAvailableTools(): Array<{name: string; description: string}> {
        return Array.from(this.instances.values()).map(tool => ({
            name: tool.getName(),
            description: tool.getDescription()
        }));
    }

    // Method to load external tools from a directory
    async loadExternalTools(toolsPath: string) {
        // Implementation for loading external tools
        // This would scan the tools directory and load any valid tool modules
    }

    getTool(name: string): BaseTool {
        const tool = this.instances.get(name);
        if (!tool) {
            throw new Error(`Tool '${name}' not found`);
        }
        return tool;
    }
}
