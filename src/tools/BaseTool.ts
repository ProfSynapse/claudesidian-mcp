import { IToolContext } from './interfaces/ToolInterfaces';

/**
 * Metadata for a tool
 * Contains information about the tool's name, description, and version
 */
export interface IToolMetadata {
    /** Unique name of the tool */
    name: string;
    /** Description of what the tool does */
    description: string;
    /** Version of the tool */
    version: string;
    /** Optional author of the tool */
    author?: string;
}

/**
 * Options for tool behavior
 */
export interface IToolOptions {
    /** Whether the tool requires confirmation before execution */
    requireConfirmation?: boolean;
    /** Whether the tool supports undo functionality */
    allowUndo?: boolean;
}

/**
 * Base class for all tools
 * Provides common functionality and defines the interface for tools
 */
export abstract class BaseTool {
    protected context: IToolContext;
    protected metadata: IToolMetadata;
    protected options: Required<IToolOptions>;  // Make options required

    /**
     * Creates a new tool instance
     * @param context Tool context with dependencies
     * @param metadata Tool metadata
     * @param options Tool options
     */
    constructor(context: IToolContext, metadata: IToolMetadata, options: IToolOptions = {}) {
        this.context = context;
        this.metadata = metadata;
        this.options = {
            requireConfirmation: true,
            allowUndo: false,
            ...options
        };
    }

    /**
     * Executes the tool with the given arguments
     * @param args Tool arguments
     * @returns Tool execution result
     * @throws Error if not implemented by subclass
     */
    abstract execute(args: any): Promise<any>;

    /**
     * Gets the tool name
     * @returns Tool name
     */
    getName(): string {
        return this.metadata.name;
    }

    /**
     * Gets the tool description
     * @returns Tool description
     */
    getDescription(): string {
        return this.metadata.description;
    }

    /**
     * Checks if the tool requires confirmation before execution
     * @returns True if confirmation is required, false otherwise
     */
    requiresConfirmation(): boolean {
        return this.options.requireConfirmation;
    }

    /**
     * Checks if the tool supports undo functionality
     * @returns True if undo is supported, false otherwise
     */
    supportsUndo(): boolean {
        return this.options.allowUndo;
    }

    /**
     * Undoes the tool execution
     * @param args Original tool arguments
     * @param previousResult Original tool result
     * @throws Error if not implemented by subclass
     */
    async undo?(args: any, previousResult: any): Promise<void> {
        throw new Error('Undo not implemented');
    }

    /**
     * Validates tool arguments against a schema
     * @param args Tool arguments
     * @param schema JSON schema
     * @returns True if arguments are valid, false otherwise
     */
    protected validateArgs(args: any, schema: any): boolean {
        // Implementation of JSON schema validation
        // This is a placeholder and should be implemented properly
        console.log('Validating args against schema:', schema);
        return true;
    }

    /**
     * Gets the JSON schema for tool arguments
     * @returns JSON schema object
     */
    getSchema(): any {
        return {
            type: "object",
            properties: {},
            required: []
        };
    }
}
