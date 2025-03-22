import { IToolContext } from '../../interfaces/ToolInterfaces';

/**
 * Interface for project command handlers
 * Defines the contract for all project-related command handlers
 */
export interface IProjectCommandHandler {
    /**
     * Executes the command with the given arguments
     * @param args Command arguments
     * @param context Tool context
     * @returns Command execution result
     */
    execute(args: any, context: IToolContext): Promise<any>;
    
    /**
     * Gets the JSON schema for command arguments
     * @returns JSON schema object
     */
    getSchema(): any;
    
    /**
     * Optional: Undoes the command execution
     * @param args Original command arguments
     * @param previousResult Original command result
     * @param context Tool context
     */
    undo?(args: any, previousResult: any, context: IToolContext): Promise<void>;
}