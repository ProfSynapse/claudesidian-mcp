import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { ExecuteCommandArgs, ExecuteCommandResult } from '../types';

/**
 * Mode for executing a command
 */
export class ExecuteCommandMode extends BaseMode<ExecuteCommandArgs, ExecuteCommandResult> {
  private app: App;
  
  /**
   * Create a new ExecuteCommandMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'executeCommand',
      'Execute Command',
      'Execute a command by ID',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the result of the command execution
   */
  async execute(params: ExecuteCommandArgs): Promise<ExecuteCommandResult> {
    const { id } = params;
    
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
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
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