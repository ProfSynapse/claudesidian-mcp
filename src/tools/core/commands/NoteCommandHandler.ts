import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { IToolContext } from '../../interfaces/ToolInterfaces';
import { sanitizePath, ensureMdExtension } from '../../../utils/pathUtils';
import ClaudesidianMCPPlugin from '../../../main';

/**
 * Interface for note command handlers
 * Each command represents a specific note operation (create, read, edit, etc.)
 */
export interface INoteCommandHandler {
    /**
     * Executes the command with the given arguments
     * @param args Command-specific arguments
     * @param context Tool context providing access to services
     * @returns Command execution result
     * @throws McpError if the command fails
     */
    execute(args: any, context: IToolContext): Promise<any>;

    /**
     * Undoes the command using the previous result
     * @param args Original command arguments
     * @param previousResult Result from the original execution
     * @param context Tool context providing access to services
     * @throws McpError if the undo operation fails
     */
    undo?(args: any, previousResult: any, context: IToolContext): Promise<void>;

    /**
     * Gets the JSON schema for command arguments
     * @returns JSON schema object defining valid arguments
     */
    getSchema(): any;
}

/**
 * Abstract base class for note commands
 * Provides common functionality and type safety
 */
export abstract class BaseNoteCommand implements INoteCommandHandler {
    /**
     * Validates command arguments against the schema
     * @param args Arguments to validate
     * @throws McpError if validation fails
     */
    protected validateArgs(args: any): void {
        const schema = this.getSchema();
        // TODO: Implement schema validation
        // For now, just check required properties
        if (schema.required) {
            for (const prop of schema.required) {
                if (args[prop] === undefined) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Missing required parameter: ${prop}`
                    );
                }
            }
        }
    }

    /**
     * Default implementation throws error if called on commands that don't support undo
     */
    async undo(args: any, previousResult: any, context: IToolContext): Promise<void> {
        throw new McpError(
            ErrorCode.MethodNotFound,
            'This command does not support undo operations'
        );
    }

    /**
     * Common path preparation logic used by all note commands
     * @param rawPath The raw path to prepare
     * @param context Tool context
     * @param title Optional title for new notes
     * @returns Sanitized and validated path
     */
    protected preparePath(rawPath: string, context: IToolContext): string {
        const rootPath = ClaudesidianMCPPlugin.getClaudesidianPath();
        const sanitizedPath = sanitizePath(rawPath, rootPath);
        if (!sanitizedPath) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Invalid path after sanitization'
            );
        }
        return ensureMdExtension(sanitizedPath);
    }

    abstract execute(args: any, context: IToolContext): Promise<any>;
    abstract getSchema(): any;
}
