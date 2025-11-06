import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { CommandManagerConfig } from '../../config/agents';
import {
  ListCommandsMode,
  ExecuteCommandMode
} from './modes';
import { MemoryService } from "../../agents/memoryManager/services/MemoryService";
import { isAgentHidden } from '../../config/toolVisibility';

/**
 * CommandManager Agent for command palette operations
 */
export class CommandManagerAgent extends BaseAgent {
  /**
   * Obsidian app instance
   */
  private app: App;
  
  /**
   * Memory service for activity recording
   */
  private memoryService: MemoryService | null = null;
  
  /**
   * Create a new CommandManagerAgent
   * @param app Obsidian app instance
   * @param memoryService Optional memory service for activity recording
   */
  constructor(app: App, memoryService?: MemoryService) {
    super(
      CommandManagerConfig.name,
      CommandManagerConfig.description,
      CommandManagerConfig.version
    );
    
    this.app = app;
    this.memoryService = memoryService || null;

    // Register modes only if agent is not hidden
    if (!isAgentHidden('commandManager')) {
      this.registerMode(new ListCommandsMode(app));
      this.registerMode(new ExecuteCommandMode(app, this));
    }

    // Memory service is now injected via constructor or remains null
    // Backward compatibility: if no service injected, it will remain null
  }
  
  /**
   * Get a list of available commands
   * @param filter Optional filter to apply to command list
   * @returns Promise that resolves with the command list
   */
  async listCommands(filter?: string): Promise<{
    commands: Array<{
      id: string;
      name: string;
      icon?: string;
      hotkeys?: string[];
    }>;
    total: number;
  }> {
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
    
    return {
      commands: mappedCommands,
      total: mappedCommands.length
    };
  }
  
  /**
   * Execute a command by ID
   * @param commandId ID of the command to execute
   * @returns Promise that resolves when the command is executed
   */
  async executeCommand(commandId: string): Promise<boolean> {
    try {
      // Check if the command exists
      const commands = this.app.commands.listCommands();
      const command = commands.find(cmd => cmd.id === commandId);
      
      if (!command) {
        throw new Error(`Command with ID ${commandId} not found`);
      }
      
      // Execute the command
      await this.app.commands.executeCommandById(commandId);
      
      return true;
    } catch (error) {
      console.error(`Error executing command ${commandId}:`, error);
      throw error;
    }
  }
  
  /**
   * Record command execution activity in workspace memory
   * @param commandId ID of the executed command
   * @param commandName Name of the executed command
   * @param workspaceId ID of the workspace
   * @param workspacePath Path of the workspace
   */
  async recordCommandActivity(
    commandId: string,
    commandName: string,
    workspaceId: string,
    workspacePath?: string[]
  ): Promise<void> {
    // Skip if no memory service
    if (!this.memoryService) {
      return;
    }
    
    try {
      // Create a descriptive content about this command execution
      const content = `Executed command: ${commandName}\n` +
                      `Command ID: ${commandId}\n`;
      
      // Record the activity using memory service
      await this.memoryService.recordActivityTrace({
        workspaceId,
        type: 'command',
        content,
        timestamp: Date.now(),
        metadata: {
          tool: 'ExecuteCommandMode',
          params: { commandId },
          result: { success: true }
        }
      }
      );
    } catch (error) {
      // Log but don't fail the main operation
      console.error('Failed to record command activity:', error);
      
      // Memory service not available - activity recording skipped
      // Note: In constructor injection pattern, service should be provided at initialization
    }
  }
  
  /**
   * Get hotkeys for a command
   * @param commandId ID of the command
   * @returns Array of hotkey strings or undefined if none
   */
  private getCommandHotkeys(commandId: string): string[] | undefined {
    try {
      // Access the Obsidian internal API to retrieve hotkeys
      const hotkeyManager = (this.app as any).hotkeyManager;
      if (!hotkeyManager) return undefined;
      
      // Get all hotkeys from the manager
      const hotkeys = hotkeyManager.getHotkeys(commandId) || [];
      
      // Format hotkey strings
      return hotkeys.map((hotkey: any) => {
        // Accessing internal Obsidian API properties
        const { modifiers, key } = hotkey;
        const modifierKeys = [];
        
        // Add modifiers in a standard order
        if (modifiers.contains('Mod')) modifierKeys.push('Ctrl/Cmd');
        if (modifiers.contains('Shift')) modifierKeys.push('Shift');
        if (modifiers.contains('Alt')) modifierKeys.push('Alt');
        if (modifiers.contains('Meta')) modifierKeys.push('Meta');
        
        // Join modifiers + key with + sign
        return [...modifierKeys, key].join('+');
      });
    } catch (error) {
      console.warn(`Error retrieving hotkeys for command ${commandId}:`, error);
      return undefined;
    }
  }
}