import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { ExecuteCommandArgs, ExecuteCommandResult } from '../types';

/**
 * Tool for executing a command
 */
export class ExecuteCommandTool extends BaseTool<ExecuteCommandArgs, ExecuteCommandResult> {
  private app: App;
  
  /**
   * Create a new ExecuteCommandTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'executeCommand',
      'Execute a command by ID',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the result of the command execution
   */
  async execute(args: ExecuteCommandArgs): Promise<ExecuteCommandResult> {
    const { id } = args;
    
    try {
      // Check if command exists
      const command = this.app.commands.commands[id];
      if (!command) {
        throw new Error(`Command not found: ${id}`);
      }
      
      // Execute the command
      await this.app.commands.executeCommandById(id);
      
      return {
        id,
        success: true
      };
    } catch (error) {
      return {
        id,
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get the JSON schema for the tool
   * @returns JSON schema object
   */
  getSchema(): any {
    return {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Command ID to execute'
        }
      },
      required: ['id']
    };
  }
}