/**
 * Command Definitions
 * Basic command definitions for plugin functionality
 */

export interface CommandContext {
  plugin: any;
  serviceManager: any;
}

export const BASIC_COMMAND_DEFINITIONS = [
  {
    id: 'open-settings',
    name: 'Open Plugin Settings',
    callback: (context: CommandContext) => {
      context.plugin.app.setting.open();
      context.plugin.app.setting.openTabById(context.plugin.manifest.id);
    }
  }
];

export const MAINTENANCE_COMMAND_DEFINITIONS = BASIC_COMMAND_DEFINITIONS;
export const TROUBLESHOOT_COMMAND_DEFINITION = BASIC_COMMAND_DEFINITIONS[0];