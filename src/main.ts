import { Plugin, Notice } from 'obsidian';
import { MCPConnector } from './connector';
import { WorkspaceService } from './agents/memoryManager/services/WorkspaceService';
import { MemoryService } from './agents/memoryManager/services/MemoryService';
import { DataMigrationService } from './services/migration/DataMigrationService';

export default class ClaudesidianPlugin extends Plugin {
    private connector!: MCPConnector;
    private workspaceService!: WorkspaceService;
    private memoryService!: MemoryService;
    private migrationService!: DataMigrationService;

    async onload() {
        console.log('Loading Claudesidian MCP Plugin');

        // Initialize simplified services
        this.workspaceService = new WorkspaceService(this);
        this.memoryService = new MemoryService(this);
        this.migrationService = new DataMigrationService(this, this.workspaceService, this.memoryService);

        // Check and perform migration if needed
        await this.checkAndPerformMigration();

        // Initialize MCP connector
        this.connector = new MCPConnector(this.app, this);
        await this.connector.start();

        console.log('Claudesidian MCP Plugin loaded successfully');
    }

    async onunload() {
        console.log('Unloading Claudesidian MCP Plugin');

        if (this.connector) {
            await this.connector.stop();
        }

        console.log('Claudesidian MCP Plugin unloaded');
    }

    /**
     * Check and perform data migration if needed
     */
    private async checkAndPerformMigration(): Promise<void> {
        try {
            const migrationStatus = await this.migrationService.checkMigrationStatus();

            if (migrationStatus.isRequired) {
                console.log('[ClaudesidianPlugin] Legacy data detected, starting migration...');
                new Notice('Claudesidian: Migrating data to new format...', 5000);

                const migrationResult = await this.migrationService.performMigration();

                if (migrationResult.success) {
                    const message = `Migration completed successfully!
                    Workspaces: ${migrationResult.workspacesMigrated},
                    Sessions: ${migrationResult.sessionsMigrated},
                    Memory traces: ${migrationResult.memoryTracesMigrated}`;

                    console.log('[ClaudesidianPlugin]', message);
                    new Notice('Claudesidian: Data migration completed successfully!', 8000);
                } else {
                    console.error('[ClaudesidianPlugin] Migration failed:', migrationResult.errors);
                    new Notice(`Claudesidian: Migration failed. Check console for details.`, 10000);
                }
            } else if (migrationStatus.migrationComplete) {
                console.log('[ClaudesidianPlugin] Migration already completed');
            }
        } catch (error) {
            console.error('[ClaudesidianPlugin] Migration check failed:', error);
            new Notice('Claudesidian: Error checking migration status', 5000);
        }
    }

    // Service accessors
    public get services() {
        return {
            workspaceService: this.workspaceService,
            memoryService: this.memoryService,
            migrationService: this.migrationService
        };
    }
}