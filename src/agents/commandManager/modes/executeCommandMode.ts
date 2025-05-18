import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { ExecuteCommandParams, ExecuteCommandResult } from '../types';
import { CommandManagerAgent } from '../commandManager';
import { parseWorkspaceContext } from '../../../utils/contextUtils';

/**
 * Mode for executing a command
 */
export class ExecuteCommandMode extends BaseMode<ExecuteCommandParams, ExecuteCommandResult> {
  private app: App;
  private agent: CommandManagerAgent;
  
  /**
   * Create a new ExecuteCommandMode
   * @param app Obsidian app instance
   * @param agent CommandManager agent instance
   */
  constructor(app: App, agent: CommandManagerAgent) {
    super(
      'executeCommand',
      'Execute Command',
      'Run an Obsidian command',
      '1.0.0'
    );
    
    this.app = app;
    this.agent = agent;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves when the command is executed
   */
  async execute(params: ExecuteCommandParams): Promise<ExecuteCommandResult> {
    try {
      const { commandId, workspaceContext, handoff } = params;
      
      if (!commandId) {
        return this.prepareResult(false, undefined, 'Command ID is required');
      }
      
      // Check if the command exists
      const commands = this.app.commands.listCommands();
      const command = commands.find(cmd => cmd.id === commandId);
      
      if (!command) {
        return this.prepareResult(false, undefined, `Command with ID ${commandId} not found`);
      }
      
      // Execute the command
      await this.app.commands.executeCommandById(commandId);
      
      // Record activity if in a workspace context
      const parsedContext = parseWorkspaceContext(workspaceContext);
      if (parsedContext) {
        await this.agent.recordCommandActivity(
          commandId,
          command.name,
          parsedContext.workspaceId,
          parsedContext.workspacePath
        );
      }
      
      // Prepare result with workspace context
      const response = this.prepareResult(
        true,
        {
          commandId
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
      return this.prepareResult(false, undefined, `Error executing command: ${error.message}`);
    }
  }
  
  /**
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
    // Create the mode-specific schema
    const modeSchema = {
      type: 'object',
      properties: {
        commandId: {
          type: 'string',
          description: 'ID of the command to execute'
        }
      },
      required: ['commandId']
    };
    
    // Merge with common schema (workspace context and handoff)
    return this.getMergedSchema(modeSchema);
  }
  
  /**
   * Get the JSON schema for the mode's result
   * @returns JSON schema object
   */
  getResultSchema(): any {
    // Use the base result schema from BaseMode, which includes common result properties
    const baseSchema = super.getResultSchema();
    
    // Add mode-specific data properties
    baseSchema.properties.data = {
      type: 'object',
      properties: {
        commandId: {
          type: 'string',
          description: 'ID of the executed command'
        }
      },
      required: ['commandId']
    };
    
    return baseSchema;
  }
}