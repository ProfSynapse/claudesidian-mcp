import { Command } from 'obsidian';

/**
 * Command information
 */
export interface CommandInfo {
  /**
   * Command ID
   */
  id: string;
  
  /**
   * Command name
   */
  name: string;
  
  /**
   * Command icon (if available)
   */
  icon?: string;
  
  /**
   * Command hotkeys (if available)
   */
  hotkeys?: string[];
}

/**
 * Arguments for listing commands
 */
export interface ListCommandsArgs {
  /**
   * Filter by command name (optional)
   */
  filter?: string;
}

/**
 * Result of listing commands
 */
export interface ListCommandsResult {
  /**
   * List of commands
   */
  commands: CommandInfo[];
  
  /**
   * Total number of commands
   */
  total: number;
}

/**
 * Arguments for executing a command
 */
export interface ExecuteCommandArgs {
  /**
   * Command ID
   */
  id: string;
}

/**
 * Result of executing a command
 */
export interface ExecuteCommandResult {
  /**
   * Command ID
   */
  id: string;
  
  /**
   * Whether the command was executed successfully
   */
  success: boolean;
  
  /**
   * Error message if execution failed
   */
  error?: string;
}