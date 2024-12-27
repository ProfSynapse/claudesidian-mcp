import { App } from 'obsidian';
import { BaseTool, IToolContext } from './BaseTool';
import { VaultManager } from '../services/VaultManager';
import { MemoryManager } from '../services/MemoryManager';
// Remove VaultTool import
import { MemoryTool } from './core/MemoryTool';
import { ReasoningTool } from './core/ReasoningTool';
import { CreateNoteTool } from './core/CreateNoteTool';
import { EditNoteTool } from './core/EditNoteTool';
import { MoveNoteTool } from './core/MoveNoteTool';
import { ReadNoteTool } from './core/ReadNoteTool';
import { InsertContentTool } from './core/InsertContentTool';
import { UpdateFrontmatterTool } from './core/UpdateFrontmatterTool';
import { TagsTool } from './core/TagsTool';
import { DeleteNoteTool } from './core/DeleteNoteTool';
import { SearchMemoryTool } from './core/SearchMemoryTool';
// Remove PuppeteerTool import
import { SearchTool } from './core/SearchTool';
import { CompletionTool } from './core/LLMTool';

export class ToolRegistry {
    private tools: Map<string, typeof BaseTool> = new Map();
    private instances: Map<string, BaseTool> = new Map();
    private context: IToolContext;

    constructor(
        app: App,
        plugin: any, // Add plugin parameter
        vaultManager: VaultManager,
        memoryManager: MemoryManager
    ) {
        this.context = {
            app,
            plugin, // Add this line
            vault: vaultManager,
            memory: memoryManager,
            toolRegistry: this  // Add this line
        };

        // Register all core tools
        [
            CreateNoteTool,
            ReadNoteTool,
            InsertContentTool,
            DeleteNoteTool,
            EditNoteTool,
            MoveNoteTool,
            UpdateFrontmatterTool,
            TagsTool,
            MemoryTool,
            SearchMemoryTool,
            ReasoningTool,
            SearchTool,
            CompletionTool  // Add CompletionTool
        ].forEach(Tool => this.registerTool(Tool));
    }

    registerTool(toolClass: new (context: IToolContext) => BaseTool) {
        const instance = new toolClass(this.context);
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
