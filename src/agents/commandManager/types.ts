import { CommonParameters, CommonResult } from '../../types';

/**
 * Parameters for listing available commands
 */
export interface ListCommandsParams extends CommonParameters {
  /**
   * Optional filter to apply to command list
   */
  filter?: string;
}

/**
 * Command information
 */
export interface CommandInfo {
  /**
   * Command ID
   */
  id: string;
  
  /**
   * Display name of the command
   */
  name: string;
  
  /**
   * Optional icon name
   */
  icon?: string;
  
  /**
   * List of hotkeys associated with the command
   */
  hotkeys?: string[];
}

/**
 * Result of listing available commands
 */
export interface ListCommandsResult extends CommonResult {
  data?: {
    /**
     * List of available commands
     */
    commands: CommandInfo[];
    
    /**
     * Total number of commands
     */
    total: number;
  };
}

/**
 * Parameters for executing a command
 */
export interface ExecuteCommandParams extends CommonParameters {
  /**
   * ID of the command to execute
   */
  commandId: string;
}

/**
 * Result of executing a command
 */
export interface ExecuteCommandResult extends CommonResult {
  data?: {
    /**
     * ID of the executed command
     */
    commandId: string;
  };
}