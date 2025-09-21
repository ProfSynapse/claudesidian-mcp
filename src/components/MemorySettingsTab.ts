import { App } from 'obsidian';
import { WorkspaceService } from '../agents/memoryManager/services/WorkspaceService';
import { MemoryService } from '../agents/memoryManager/services/MemoryService';
import { WorkspaceCardManager } from './workspace/WorkspaceCardManager';

/**
 * Memory Manager settings tab component
 * Card-based workspace management interface
 */
export class MemorySettingsTab {
    private app: App;
    private workspaceService: WorkspaceService;
    private memoryService: MemoryService;
    private workspaceCardManager: WorkspaceCardManager;

    constructor(
        private containerEl: HTMLElement,
        app: App,
        workspaceService: WorkspaceService,
        memoryService: MemoryService
    ) {
        this.app = app;
        this.workspaceService = workspaceService;
        this.memoryService = memoryService;

        this.workspaceCardManager = new WorkspaceCardManager(
            this.containerEl,
            this.workspaceService
        );
    }

    async display(): Promise<void> {
        this.containerEl.empty();

        const memorySection = this.containerEl.createEl('div', { cls: 'memory-settings-container' });
        memorySection.createEl('h2', { text: 'Workspace Management' });

        await this.workspaceCardManager.display();
    }
}