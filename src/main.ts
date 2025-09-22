import { Plugin, Notice } from 'obsidian';
import { MCPConnector } from './connector';
import { WorkspaceService } from './agents/memoryManager/services/WorkspaceService';
import { MemoryService } from './agents/memoryManager/services/MemoryService';
import { ConversationService } from './services/ConversationService';
import { DataMigrationService } from './services/migration/DataMigrationService';

export default class ClaudesidianPlugin extends Plugin {
    private connector!: MCPConnector;
    private workspaceService!: WorkspaceService;
    private memoryService!: MemoryService;
    private conversationService!: ConversationService;
    private migrationService!: DataMigrationService;

    async onload() {
        console.log('Loading Claudesidian MCP Plugin');

        // Initialize simplified services
        this.workspaceService = new WorkspaceService(this);
        this.memoryService = new MemoryService(this);
        this.conversationService = new ConversationService(this);
        this.migrationService = new DataMigrationService(this);

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
        console.log('[Claudesidian] ========== MIGRATION CHECK START ==========');

        try {
            console.log('[Claudesidian] Checking migration status...');
            const migrationStatus = await this.migrationService.checkMigrationStatus();

            console.log('[Claudesidian] Migration status result:', {
                isRequired: migrationStatus.isRequired,
                hasLegacyData: migrationStatus.hasLegacyData,
                migrationComplete: migrationStatus.migrationComplete,
                migrationError: migrationStatus.migrationError
            });

            if (migrationStatus.isRequired) {
                console.log('[Claudesidian] ========== STARTING MIGRATION ==========');
                console.log('[Claudesidian] Legacy ChromaDB data detected, starting migration...');
                new Notice('Claudesidian: Migrating data to new format...', 5000);

                const migrationResult = await this.migrationService.performMigration();

                console.log('[Claudesidian] ========== MIGRATION RESULT ==========');
                console.log('[Claudesidian] Migration result:', {
                    success: migrationResult.success,
                    workspaces: migrationResult.workspacesMigrated,
                    sessions: migrationResult.sessionsMigrated,
                    conversations: migrationResult.conversationsMigrated,
                    memoryTraces: migrationResult.memoryTracesMigrated,
                    snapshots: migrationResult.snapshotsMigrated,
                    migrationTime: migrationResult.migrationTime + 'ms',
                    errors: migrationResult.errors
                });

                if (migrationResult.success) {
                    const message = `Migration completed successfully! Workspaces: ${migrationResult.workspacesMigrated}, Sessions: ${migrationResult.sessionsMigrated}, Conversations: ${migrationResult.conversationsMigrated}, Memory traces: ${migrationResult.memoryTracesMigrated}, Snapshots: ${migrationResult.snapshotsMigrated}`;

                    console.log('[Claudesidian] ✅ SUCCESS:', message);
                    new Notice('Claudesidian: Data migration completed successfully!', 8000);
                } else {
                    console.error('[Claudesidian] ❌ MIGRATION FAILED');
                    console.error('[Claudesidian] Errors:', migrationResult.errors);
                    new Notice(`Claudesidian: Migration failed. Check console for details.`, 10000);
                }
            } else if (migrationStatus.migrationComplete) {
                console.log('[Claudesidian] ✅ Migration already completed - skipping');
            } else {
                console.log('[Claudesidian] ℹ️ No legacy data found - no migration needed');
            }
        } catch (error) {
            console.error('[Claudesidian] ❌ MIGRATION CHECK ERROR:', error);
            console.error('[Claudesidian] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
            new Notice('Claudesidian: Error checking migration status', 5000);
        }

        console.log('[Claudesidian] ========== MIGRATION CHECK END ==========');
    }

    // Service accessors
    public get services() {
        return {
            workspaceService: this.workspaceService,
            memoryService: this.memoryService,
            conversationService: this.conversationService,
            migrationService: this.migrationService
        };
    }
}