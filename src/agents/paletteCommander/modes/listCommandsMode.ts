import { App, Command } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { ListCommandsArgs, ListCommandsResult, CommandInfo } from '../types';

/**
 * Mode for listing available commands
 */
export class ListCommandsMode extends BaseMode<ListCommandsArgs, ListCommandsResult> {
  private app: App;
  
  /**
   * Create a new ListCommandsMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'listCommands',
      'List Commands',
      'List available commands in the command palette',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the list of commands
   */
  async execute(params: ListCommandsArgs): Promise<ListCommandsResult> {
    const { filter } = params;
    
    // Get all commands
    const allCommands = this.app.commands.listCommands();
    
    // Filter commands if a filter is provided
    const filteredCommands = filter
      ? allCommands.filter(cmd => cmd.name.toLowerCase().includes(filter.toLowerCase()))
      : allCommands;
    
    // Convert to CommandInfo objects
    const commands: CommandInfo[] = filteredCommands.map(cmd => this.commandToInfo(cmd));
    
    return {
      commands,
      total: commands.length
    };
  }
  
  /**
   * Convert a Command to a CommandInfo
   * @param command Command object
   * @returns CommandInfo object
   */
  private commandToInfo(command: Command): CommandInfo {
    const info: CommandInfo = {
      id: command.id,
      name: command.name
    };
    
    if (command.icon) {
      info.icon = command.icon;
    }
    
    // Get hotkeys if available
    const hotkeyMap = (this.app as any).hotkeyManager?.hotkeyMap;
    if (hotkeyMap && hotkeyMap[command.id]) {
      info.hotkeys = hotkeyMap[command.id].map((hotkey: any) => hotkey.display);
    }
    
    return info;
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
          description: 'Filter commands by name (optional)'
        }
      }
    };
  }
}