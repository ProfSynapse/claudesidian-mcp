import { App } from 'obsidian';
import { VaultManager } from '../services/VaultManager';
import { MemoryManager } from '../services/MemoryManager';
import { ToolRegistry } from './ToolRegistry';  // Add this import
import { MCPSettings } from '../types';
import { IndexManager } from '../services/IndexManager';

export interface IToolContext {
    app: App;
    plugin: any;
    vault: VaultManager;
    memory: MemoryManager;
    toolRegistry: ToolRegistry;  // Add this line
    settings: MCPSettings; // Add this line
    indexManager: IndexManager;  // Add this line
}

export interface IToolMetadata {
    name: string;
    description: string;
    version: string;
    author?: string;
}

export interface IToolOptions {
    requireConfirmation?: boolean;
    allowUndo?: boolean;
}

export class BaseTool {
    protected context: IToolContext;
    protected metadata: IToolMetadata;
    protected options: Required<IToolOptions>;  // Make options required

    constructor(context: IToolContext, metadata: IToolMetadata, options: IToolOptions = {}) {
        this.context = context;
        this.metadata = metadata;
        this.options = {
            requireConfirmation: true,
            allowUndo: false,
            ...options
        };
    }

    async execute(args: any): Promise<any> {
        throw new Error('Execute method not implemented');
    }

    getName(): string {
        return this.metadata.name;
    }

    getDescription(): string {
        return this.metadata.description;
    }

    requiresConfirmation(): boolean {
        return this.options.requireConfirmation;
    }

    supportsUndo(): boolean {
        return this.options.allowUndo;
    }

    // Optional method to implement undo functionality
    async undo?(args: any, previousResult: any): Promise<void> {
        throw new Error('Undo not implemented');
    }

    // Validation helper
    protected validateArgs(args: any, schema: any): boolean {
        // Implementation of JSON schema validation
        return true; // Placeholder
    }

    // Add this new method
    getSchema(): any {
        return {
            type: "object",
            properties: {},
            required: []
        };
    }
}
