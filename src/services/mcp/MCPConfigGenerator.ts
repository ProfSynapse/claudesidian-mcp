import { App, Notice } from 'obsidian';
import * as path from 'path';
import { sanitizeVaultName } from '../../utils/vaultUtils';

/**
 * Location: src/services/mcp/MCPConfigGenerator.ts
 *
 * Service for generating and managing .mcp.json configuration files
 * in the vault root for universal MCP client compatibility.
 *
 * This enables any MCP-compatible tool (coding assistants, AI development tools, etc.)
 * to connect to the Obsidian vault through the Claudesidian MCP server.
 */

export interface MCPConfigStatus {
    /** Whether .mcp.json exists in vault root */
    exists: boolean;
    /** Whether our server is configured in .mcp.json */
    hasOurServer: boolean;
    /** Whether our server config is up to date */
    isUpToDate: boolean;
    /** Total number of MCP servers configured */
    totalServers: number;
}

export interface MCPConfigResult {
    /** Whether the operation succeeded */
    success: boolean;
    /** Human-readable message about what happened */
    message: string;
    /** Type of action performed */
    action: 'created' | 'updated' | 'unchanged' | 'error';
}

/**
 * Generates and manages .mcp.json configuration files for MCP clients
 */
export class MCPConfigGenerator {
    private mcpJsonPath: string;
    private ourServerKey: string;
    private ourServerConfig: any;

    constructor(
        private app: App,
        private vaultPath: string,
        private pluginPath: string
    ) {
        // Ensure we normalize the path and don't duplicate
        const normalizedVaultPath = path.normalize(this.vaultPath);
        this.mcpJsonPath = path.join(normalizedVaultPath, '.mcp.json');
        this.ourServerKey = `claudesidian-mcp-${sanitizeVaultName(this.app.vault.getName())}`;
        this.ourServerConfig = {
            command: "node",
            args: [path.normalize(path.join(this.pluginPath, 'connector.js'))]
        };
    }

    /**
     * Generate or update .mcp.json in vault root
     * Intelligently merges with existing configuration
     */
    async generateOrUpdateConfig(): Promise<MCPConfigResult> {
        try {
            // Read existing config or create new
            const existingConfig = await this.readExistingConfig();

            // Ensure mcpServers exists
            if (!existingConfig.mcpServers) {
                existingConfig.mcpServers = {};
            }

            // Check if already up to date
            if (this.isConfigUpToDate(existingConfig)) {
                return {
                    success: true,
                    message: '.mcp.json is already up to date',
                    action: 'unchanged'
                };
            }

            // Determine if this is a create or update
            const fileExists = await this.configFileExists();
            const hadOurServer = existingConfig.mcpServers[this.ourServerKey] != null;

            // Add/update our server configuration
            existingConfig.mcpServers[this.ourServerKey] = this.ourServerConfig;

            // Write the file
            await this.writeConfig(existingConfig);

            // Determine action and message
            let action: 'created' | 'updated';
            let message: string;

            if (!fileExists) {
                action = 'created';
                message = '.mcp.json created successfully';
            } else if (!hadOurServer) {
                action = 'updated';
                const totalServers = Object.keys(existingConfig.mcpServers).length;
                message = `.mcp.json updated with Claudesidian configuration (${totalServers} total ${totalServers === 1 ? 'server' : 'servers'})`;
            } else {
                action = 'updated';
                message = 'Claudesidian configuration updated to current vault path';
            }

            return {
                success: true,
                message,
                action
            };

        } catch (error) {
            console.error('[MCPConfigGenerator] Error generating config:', error);
            return {
                success: false,
                message: `Failed to generate .mcp.json: ${(error as Error).message}`,
                action: 'error'
            };
        }
    }

    /**
     * Check the current status of .mcp.json configuration
     */
    async checkConfigStatus(): Promise<MCPConfigStatus> {
        try {
            const fileExists = await this.configFileExists();

            if (!fileExists) {
                return {
                    exists: false,
                    hasOurServer: false,
                    isUpToDate: false,
                    totalServers: 0
                };
            }

            const config = await this.readExistingConfig();
            const hasOurServer = config.mcpServers?.[this.ourServerKey] != null;
            const isUpToDate = this.isConfigUpToDate(config);
            const totalServers = Object.keys(config.mcpServers || {}).length;

            return {
                exists: true,
                hasOurServer,
                isUpToDate,
                totalServers
            };

        } catch (error) {
            console.error('[MCPConfigGenerator] Error checking status:', error);
            return {
                exists: false,
                hasOurServer: false,
                isUpToDate: false,
                totalServers: 0
            };
        }
    }

    /**
     * Check if .mcp.json file exists
     */
    private async configFileExists(): Promise<boolean> {
        try {
            // Use relative path from vault root (just the filename)
            await this.app.vault.adapter.read('.mcp.json');
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Read existing config or return empty config structure
     */
    private async readExistingConfig(): Promise<any> {
        try {
            // Use relative path from vault root (just the filename)
            const fileContent = await this.app.vault.adapter.read('.mcp.json');
            return JSON.parse(fileContent);
        } catch (error) {
            // File doesn't exist or is invalid - return empty config
            return { mcpServers: {} };
        }
    }

    /**
     * Write configuration to .mcp.json
     */
    private async writeConfig(config: any): Promise<void> {
        const jsonContent = JSON.stringify(config, null, 2);
        // Use relative path from vault root (just the filename)
        await this.app.vault.adapter.write('.mcp.json', jsonContent);
    }

    /**
     * Check if our server config is up to date in the given config
     */
    private isConfigUpToDate(config: any): boolean {
        const existingServer = config.mcpServers?.[this.ourServerKey];

        if (!existingServer) {
            return false;
        }

        return (
            existingServer.command === this.ourServerConfig.command &&
            JSON.stringify(existingServer.args) === JSON.stringify(this.ourServerConfig.args)
        );
    }

    /**
     * Get the path to the .mcp.json file
     */
    getMCPJsonPath(): string {
        return this.mcpJsonPath;
    }

    /**
     * Get the server key used in the config
     */
    getServerKey(): string {
        return this.ourServerKey;
    }
}
