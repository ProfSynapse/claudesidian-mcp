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
import { EventManager } from '../services/EventManager';

export type ConversationPhase = 'start' | 'reviewed' | 'reasoned' | 'active';

export interface ConversationState {
    phase: ConversationPhase;
    hasSavedMemory: boolean;
    currentMemoryOperation?: {
        action: string;
        endConversation?: boolean;
    };
}

export class ToolRegistry {
    private tools: Map<string, typeof BaseTool> = new Map();
    private instances: Map<string, BaseTool> = new Map();
    private context: IToolContext;
    private conversationState: ConversationState;

    // Expose getters for conversation state
    get phase(): ConversationPhase {
        return this.conversationState.phase;
    }

    get hasSavedMemory(): boolean {
        return this.conversationState.hasSavedMemory;
    }

    // Phase transition methods
    setPhaseToReviewed(): void {
        if (this.conversationState.phase !== 'start') {
            throw new Error('Can only transition to reviewed from start phase');
        }
        this.conversationState.phase = 'reviewed';
    }

    setPhaseToReasoned(): void {
        if (this.conversationState.phase !== 'reviewed') {
            throw new Error('Can only transition to reasoned from reviewed phase');
        }
        this.conversationState.phase = 'reasoned';
    }

    setPhaseToActive(): void {
        if (this.conversationState.phase !== 'reasoned') {
            throw new Error('Can only transition to active from reasoned phase');
        }
        this.conversationState.phase = 'active';
    }

    setHasSavedMemory(action: string, endConversation?: boolean): void {
        this.conversationState.hasSavedMemory = true;
        this.conversationState.currentMemoryOperation = {
            action,
            endConversation
        };
    }

    constructor(
        app: App,
        plugin: any,
        vaultManager: VaultManager,
        memoryManager: MemoryManager,
        indexManager: IndexManager,
        private eventManager: EventManager
    ) {
        this.resetConversationState();
        this.context = {
            app,
            plugin,
            vault: vaultManager,
            memory: memoryManager,
            toolRegistry: this,
            settings: plugin.settings,
            indexManager,
            eventManager
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
            // Validate workflow requirements
            if (name === 'manageMemory') {
                if (args.action === 'reviewIndex') {
                    if (this.phase !== 'start') {
                        throw new Error('reviewIndex must be the first action');
                    }
                    this.setPhaseToReviewed();
                }

                if (['create', 'edit'].includes(args.action)) {
                    this.setHasSavedMemory(args.action, args.endConversation);
                }
            } else if (name === 'reasoning') {
                if (this.phase === 'start') {
                    throw new Error('Must call reviewIndex before reasoning');
                }
                if (this.phase === 'reviewed') {
                    this.setPhaseToReasoned();
                    this.setPhaseToActive();
                }
            } else if (this.phase === 'start') {
                throw new Error('Must call reviewIndex as first action');
            } else if (this.phase === 'reviewed') {
                throw new Error('Must use reasoning after reviewIndex');
            }

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

    // Method to check if memory workflow is properly completed
    isMemoryWorkflowComplete(): boolean {
        return this.phase === 'active' &&
               this.hasSavedMemory &&
               this.conversationState.currentMemoryOperation?.endConversation === true;
    }

    // Reset conversation state
    resetConversationState(): void {
        this.conversationState = {
            phase: 'start',
            hasSavedMemory: false,
            currentMemoryOperation: undefined
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
