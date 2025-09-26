import { Plugin, Notice } from 'obsidian';
import { MCPConnector } from './connector';
import { WorkspaceService } from './agents/memoryManager/services/WorkspaceService';
import { MemoryService } from './agents/memoryManager/services/MemoryService';
import { ConversationService } from './services/ConversationService';
import { DataMigrationService } from './services/migration/DataMigrationService';
import { SettingsTab } from './components/SettingsTab';
import { Settings } from './settings';

export default class ClaudesidianPlugin extends Plugin {
    private connector!: MCPConnector;
    private workspaceService!: WorkspaceService;
    private memoryService!: MemoryService;
    private conversationService!: ConversationService;
    private migrationService!: DataMigrationService;
    public settingsManager!: Settings;
    public settings: any;

    async onload() {
        try {
            // Load plugin settings first before creating any services
            this.settings = await this.loadData();
            this.settingsManager = new Settings(this);
            await this.settingsManager.loadSettings();

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

            // Add settings tab
            this.addSettingTab(new SettingsTab(
                this.app,
                this,
                this.settingsManager,
                {
                    workspaceService: this.workspaceService,
                    memoryService: this.memoryService
                }
            ));

        } catch (error) {
            console.error('Plugin loading failed:', error);
            throw error;
        }
    }

    async onunload() {
        if (this.connector) {
            await this.connector.stop();
        }
    }

    /**
     * Check and perform data migration if needed
     */
    private async checkAndPerformMigration(): Promise<void> {
        try {
            const migrationStatus = await this.migrationService.checkMigrationStatus();

            if (migrationStatus.isRequired) {
                new Notice('Claudesidian: Migrating data to new format...', 5000);
                const migrationResult = await this.migrationService.performMigration();

                if (migrationResult.success) {
                    new Notice('Claudesidian: Data migration completed successfully!', 8000);
                } else {
                    console.error('[Claudesidian] Migration failed:', migrationResult.errors);
                    new Notice(`Claudesidian: Migration failed. Check console for details.`, 10000);
                }
            }
        } catch (error) {
            console.error('[Claudesidian] Migration check error:', error);
            new Notice('Claudesidian: Error checking migration status', 5000);
        }
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

    // Service getter method for compatibility
    public getService(serviceName: string) {
        const services = this.services;
        switch (serviceName) {
            case 'workspaceService':
                return services.workspaceService;
            case 'memoryService':
                return services.memoryService;
            case 'conversationService':
                return services.conversationService;
            case 'migrationService':
                return services.migrationService;
            default:
                return undefined;
        }
    }
}