import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { ListCommandsParams, ListCommandsResult } from '../types';

/**
 * Mode for listing available commands
 */
export class ListCommandsMode extends BaseMode<ListCommandsParams, ListCommandsResult> {
  private app: App;
  
  /**
   * Create a new ListCommandsMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'listCommands',
      'List Commands',
      'List available Obsidian commands',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the list of commands
   */
  async execute(params: ListCommandsParams): Promise<ListCommandsResult> {
    try {
      const { filter, workspaceContext, handoff } = params;
      
      // Get all commands from the app
      const commands = this.app.commands.listCommands();
      
      // Filter commands if filter is provided
      const filteredCommands = filter
        ? commands.filter(cmd => 
            cmd.name.toLowerCase().includes(filter.toLowerCase()) ||
            cmd.id.toLowerCase().includes(filter.toLowerCase())
          )
        : commands;
      
      // Map to the desired format
      const mappedCommands = filteredCommands.map(cmd => ({
        id: cmd.id,
        name: cmd.name,
        icon: cmd.icon,
        hotkeys: this.getCommandHotkeys(cmd.id)
      }));
      
      // Prepare result with workspace context
      const response = this.prepareResult(
        true,
        {
          commands: mappedCommands,
          total: mappedCommands.length
        },
        undefined,
        workspaceContext
      );
      
      // Handle handoff if requested
      if (handoff) {
        return this.handleHandoff(handoff, response);
      }
      
      return response;
    } catch (error) {
      return this.prepareResult(false, undefined, `Error listing commands: ${error.message}`);
    }
  }
  
  /**
   * Get hotkeys for a command
   * @param commandId ID of the command
   * @returns Array of hotkey strings or undefined if none
   */
  private getCommandHotkeys(commandId: string): string[] | undefined {
    // This is a placeholder as Obsidian's public API doesn't expose hotkeys directly
    // In a real implementation, we'd need to access the internal hotkey registry
    return undefined;
  }
  
  /**
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
    return {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          description: 'Optional filter to apply to command list'
        },
        ...this.getCommonParameterSchema()
      }
    };
  }
  
  /**
   * Get the JSON schema for the mode's result
   * @returns JSON schema object
   */
  getResultSchema(): any {
    return {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the operation succeeded'
        },
        error: {
          type: 'string',
          description: 'Error message if success is false'
        },
        data: {
          type: 'object',
          properties: {
            commands: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'Command ID'
                  },
                  name: {
                    type: 'string',
                    description: 'Display name of the command'
                  },
                  icon: {
                    type: 'string',
                    description: 'Optional icon name'
                  },
                  hotkeys: {
                    type: 'array',
                    items: {
                      type: 'string'
                    },
                    description: 'List of hotkeys associated with the command'
                  }
                },
                required: ['id', 'name']
              },
              description: 'List of available commands'
            },
            total: {
              type: 'number',
              description: 'Total number of commands'
            }
          },
          required: ['commands', 'total']
        },
        workspaceContext: {
          type: 'object',
          properties: {
            workspaceId: {
              type: 'string',
              description: 'ID of the workspace'
            },
            workspacePath: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Path of the workspace'
            },
            activeWorkspace: {
              type: 'boolean',
              description: 'Whether this is the active workspace'
            }
          }
        },
        handoffResult: {
          type: 'object',
          description: 'Result of the handoff operation'
        }
      },
      required: ['success']
    };
  }
}