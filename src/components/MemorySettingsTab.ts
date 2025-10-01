import { App } from 'obsidian';
import { WorkspaceService } from '../services/WorkspaceService';
import { MemoryService } from '../agents/memoryManager/services/MemoryService';
import { WorkspaceCardManager } from './workspace/WorkspaceCardManager';
import { Settings } from '../settings';

/**
 * Memory Manager settings tab component
 * Card-based workspace management interface
 */
export class MemorySettingsTab {
    private app: App;
    private workspaceService: WorkspaceService;
    private memoryService: MemoryService;
    private settings: Settings;
    private workspaceCardManager: WorkspaceCardManager;

    constructor(
        private containerEl: HTMLElement,
        app: App,
        workspaceService: WorkspaceService,
        memoryService: MemoryService,
        settings: Settings
    ) {
        this.app = app;
        this.workspaceService = workspaceService;
        this.memoryService = memoryService;
        this.settings = settings;

        this.workspaceCardManager = new WorkspaceCardManager(
            this.containerEl,
            this.workspaceService,
            this.settings
        );
    }

    async display(): Promise<void> {
        this.containerEl.empty();

        const memorySection = this.containerEl.createEl('div', { cls: 'memory-settings-container' });
        memorySection.createEl('h2', { text: 'Workspace Management' });

        // Create a new WorkspaceCardManager with the correct container
        this.workspaceCardManager = new WorkspaceCardManager(
            memorySection,
            this.workspaceService,
            this.settings
        );

        await this.workspaceCardManager.display();
    }
}