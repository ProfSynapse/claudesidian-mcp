import { App, Command } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { ListCommandsArgs, ListCommandsResult, CommandInfo } from '../types';

/**
 * Tool for listing available commands
 */
export class ListCommandsTool extends BaseTool<ListCommandsArgs, ListCommandsResult> {
  private app: App;
  
  /**
   * Create a new ListCommandsTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'listCommands',
      'List available commands in the command palette',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the list of commands
   */
  async execute(args: ListCommandsArgs): Promise<ListCommandsResult> {
    const { filter } = args;
    
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
   * Get the JSON schema for the tool
   * @returns JSON schema object
   */
  getSchema(): any {
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