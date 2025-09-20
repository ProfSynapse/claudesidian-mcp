/**
 * Location: /src/core/commands/MaintenanceCommandManager.ts
 * 
 * Maintenance Command Manager - Handles plugin command registration and execution
 * 
 * This service extracts command management from PluginLifecycleManager,
 * making command registration data-driven and easily extensible.
 */

import type { Plugin } from 'obsidian';
import { MAINTENANCE_COMMAND_DEFINITIONS, TROUBLESHOOT_COMMAND_DEFINITION } from './CommandDefinitions';
import type { CommandContext } from './CommandDefinitions';

export interface MaintenanceCommandConfig {
    plugin: Plugin;
    serviceManager: any;
    getService: <T>(name: string, timeoutMs?: number) => Promise<T | null>;
    isInitialized: () => boolean;
}

export class MaintenanceCommandManager {
    private config: MaintenanceCommandConfig;
    private registeredCommands: Set<string> = new Set();

    constructor(config: MaintenanceCommandConfig) {
        this.config = config;
    }

    /**
     * Register all maintenance commands with the plugin
     */
    registerMaintenanceCommands(): void {
        const commandContext: CommandContext = {
            getService: this.config.getService,
            serviceManager: this.config.serviceManager,
            isInitialized: this.config.isInitialized()
        };

        for (const commandDef of MAINTENANCE_COMMAND_DEFINITIONS) {
            if (this.registeredCommands.has(commandDef.id)) {
                continue; // Skip already registered commands
            }

            this.config.plugin.addCommand({
                id: commandDef.id,
                name: commandDef.name,
                callback: () => {
                    // Update context with current state
                    const currentContext: CommandContext = {
                        getService: this.config.getService,
                        serviceManager: this.config.serviceManager,
                        isInitialized: this.config.isInitialized()
                    };
                    return commandDef.callback(currentContext);
                }
            });

            this.registeredCommands.add(commandDef.id);
        }
    }

    /**
     * Register fallback troubleshooting command for when services fail
     */
    registerTroubleshootCommand(): void {
        if (this.registeredCommands.has(TROUBLESHOOT_COMMAND_DEFINITION.id)) {
            return;
        }

        const commandContext: CommandContext = {
            getService: this.config.getService,
            serviceManager: this.config.serviceManager,
            isInitialized: this.config.isInitialized()
        };

        this.config.plugin.addCommand({
            id: TROUBLESHOOT_COMMAND_DEFINITION.id,
            name: TROUBLESHOOT_COMMAND_DEFINITION.name,
            callback: () => TROUBLESHOOT_COMMAND_DEFINITION.callback(commandContext)
        });

        this.registeredCommands.add(TROUBLESHOOT_COMMAND_DEFINITION.id);
    }

    /**
     * Get list of registered command IDs
     */
    getRegisteredCommands(): string[] {
        return Array.from(this.registeredCommands);
    }

    /**
     * Check if a command is registered
     */
    isCommandRegistered(commandId: string): boolean {
        return this.registeredCommands.has(commandId);
    }
}