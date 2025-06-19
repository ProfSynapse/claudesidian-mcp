import { App, Plugin, TAbstractFile, TFile } from 'obsidian';
import { ToEmbedService } from './ToEmbedService';

/**
 * Simple file event manager that just adds files to to_embed collection
 */
export class SimpleFileEventManager {
    private fileCreatedHandler!: (file: TAbstractFile) => void;
    private fileModifiedHandler!: (file: TAbstractFile) => void;
    private fileDeletedHandler!: (file: TAbstractFile) => void;
    private fileRenamedHandler!: (file: TAbstractFile, oldPath: string) => void;
    private isStartupPhase: boolean = true;
    private startupTimeout: NodeJS.Timeout | null = null;
    private idleInterval: NodeJS.Timeout | null = null;

    constructor(
        private app: App,
        private plugin: Plugin,
        private toEmbedService: ToEmbedService,
        private strategy: { type: 'manual' | 'idle' | 'startup'; idleTimeThreshold: number }
    ) {
        this.bindEventHandlers();
    }

    async initialize(): Promise<void> {
        // Register vault event handlers
        this.registerVaultEventHandlers();

        // End startup phase after 5 seconds
        this.startupTimeout = setTimeout(() => {
            this.isStartupPhase = false;
            console.log('[SimpleFileEventManager] Startup phase ended - now monitoring for new file changes');
        }, 5000);

        // Set up idle processing if using idle strategy
        if (this.strategy.type === 'idle') {
            this.setupIdleProcessing();
        }

        console.log(`[SimpleFileEventManager] Initialized with strategy: ${this.strategy.type}`);
    }

    async shutdown(): Promise<void> {
        console.log('[SimpleFileEventManager] Shutting down...');

        // Clear timeouts
        if (this.startupTimeout) {
            clearTimeout(this.startupTimeout);
            this.startupTimeout = null;
        }
        if (this.idleInterval) {
            clearInterval(this.idleInterval);
            this.idleInterval = null;
        }

        // Unregister event handlers
        this.unregisterVaultEventHandlers();

        console.log('[SimpleFileEventManager] Shutdown complete');
    }

    /**
     * Process the to_embed queue (called on startup or by idle timer)
     */
    async processQueue(): Promise<void> {
        await this.toEmbedService.processQueue();
    }

    private shouldProcessFile(file: TAbstractFile): boolean {
        // Only process .md files
        if (!file.path.endsWith('.md')) {
            return false;
        }

        // Skip system files and excluded paths
        if (file.path.startsWith('.obsidian/')) {
            return false;
        }

        return true;
    }

    private async handleFileCreated(file: TAbstractFile): Promise<void> {
        if (!this.shouldProcessFile(file)) return;
        
        // Ignore events during startup phase (these are existing files)
        if (this.isStartupPhase) {
            return;
        }

        console.log(`[SimpleFileEventManager] File created: ${file.path}`);
        await this.toEmbedService.queueFile(file.path, 'create');
    }

    private async handleFileModified(file: TAbstractFile): Promise<void> {
        if (!this.shouldProcessFile(file)) return;
        
        // Ignore events during startup phase
        if (this.isStartupPhase) {
            return;
        }

        console.log(`[SimpleFileEventManager] File modified: ${file.path}`);
        await this.toEmbedService.queueFile(file.path, 'modify');
    }

    private async handleFileDeleted(file: TAbstractFile): Promise<void> {
        if (!this.shouldProcessFile(file)) return;

        console.log(`[SimpleFileEventManager] File deleted: ${file.path}`);
        await this.toEmbedService.queueFile(file.path, 'delete');
    }

    private async handleFileRenamed(file: TAbstractFile, oldPath: string): Promise<void> {
        if (!this.shouldProcessFile(file)) return;

        console.log(`[SimpleFileEventManager] File renamed: ${oldPath} -> ${file.path}`);
        // Treat rename as delete old + create new
        await this.toEmbedService.queueFile(oldPath, 'delete');
        await this.toEmbedService.queueFile(file.path, 'create');
    }

    private setupIdleProcessing(): void {
        // Process queue periodically based on idle threshold
        const intervalMs = this.strategy.idleTimeThreshold;
        this.idleInterval = setInterval(async () => {
            console.log('[SimpleFileEventManager] Idle processing triggered');
            await this.processQueue();
        }, intervalMs);
    }

    private bindEventHandlers(): void {
        this.fileCreatedHandler = (file: TAbstractFile) => this.handleFileCreated(file);
        this.fileModifiedHandler = (file: TAbstractFile) => this.handleFileModified(file);
        this.fileDeletedHandler = (file: TAbstractFile) => this.handleFileDeleted(file);
        this.fileRenamedHandler = (file: TAbstractFile, oldPath: string) => this.handleFileRenamed(file, oldPath);
    }

    private registerVaultEventHandlers(): void {
        this.app.vault.on('create', this.fileCreatedHandler as any);
        this.app.vault.on('modify', this.fileModifiedHandler as any);
        this.app.vault.on('delete', this.fileDeletedHandler as any);
        this.app.vault.on('rename', this.fileRenamedHandler as any);
        
        console.log('[SimpleFileEventManager] Vault event handlers registered');
    }

    private unregisterVaultEventHandlers(): void {
        this.app.vault.off('create', this.fileCreatedHandler as any);
        this.app.vault.off('modify', this.fileModifiedHandler as any);
        this.app.vault.off('delete', this.fileDeletedHandler as any);
        this.app.vault.off('rename', this.fileRenamedHandler as any);
        
        console.log('[SimpleFileEventManager] Vault event handlers unregistered');
    }
}