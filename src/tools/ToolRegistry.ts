import { App } from 'obsidian';
import { BaseTool, IToolContext } from './BaseTool';
import { VaultManager } from '../services/VaultManager';
import { MemoryManager } from '../services/MemoryManager';
import { ManageMemoryTool } from './core/ManageMemoryTool';
import { ReasoningTool } from './core/ReasoningTool';
import { ManageNoteTool } from './core/ManageNoteTool';
import { ManageMetadataTool } from './core/ManageMetadataTool';
import { CompletionTool } from './core/LLMTool'; 
import { IndexManager } from '../services/IndexManager';  
import { ManageFolderTool } from './core/ManageFolderTool';

export class ToolRegistry {
    private tools: Map<string, typeof BaseTool> = new Map();
    private instances: Map<string, BaseTool> = new Map();
    private context: IToolContext;

    constructor(
        app: App,
        plugin: any, // Add plugin parameter
        vaultManager: VaultManager,
        memoryManager: MemoryManager,
        indexManager: IndexManager  // Add this parameter
    ) {
        this.context = {
            app,
            plugin, // Add this line
            vault: vaultManager,
            memory: memoryManager,
            toolRegistry: this,  // Add this line
            settings: plugin.settings,  // Add settings from plugin
            indexManager  // Add this line
        };

        // Register all core tools
        [
            ManageMetadataTool,
            ManageMemoryTool,
            ReasoningTool,
            CompletionTool,  
            ManageNoteTool,
            ManageFolderTool
        ].forEach(Tool => this.registerTool(Tool));
    }

    registerTool(toolClass: new (context: IToolContext, ...args: any[]) => BaseTool) {
        let instance: BaseTool;
        
        // Special handling for ReasoningTool to inject MemoryManager
        if (toolClass === ReasoningTool) {
            instance = new ReasoningTool(this.context, this.context.memory);
        } else {
            instance = new toolClass(this.context);
        }

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
