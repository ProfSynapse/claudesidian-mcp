import { App } from 'obsidian';
import { BaseTool, IToolContext } from './BaseTool';
import { VaultTool } from './core/VaultTool';
import { VaultManager } from '../services/VaultManager';
import { MemoryManager } from '../services/MemoryManager';
import { ReasoningManager } from '../services/ReasoningManager';
import { MemoryTool } from './core/MemoryTool';
import { ReasoningTool } from './core/ReasoningTool';

export class ToolRegistry {
    private tools: Map<string, typeof BaseTool> = new Map();
    private instances: Map<string, BaseTool> = new Map();
    private context: IToolContext;

    constructor(
        app: App,
        vaultManager: VaultManager,
        memoryManager: MemoryManager,
        reasoningManager: ReasoningManager
    ) {
        this.context = {
            app,
            vault: vaultManager,
            memory: memoryManager,
            reasoning: reasoningManager
        };

        // Register core tools
        this.registerTool(VaultTool);
        this.registerTool(MemoryTool);
        this.registerTool(ReasoningTool);
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
}
