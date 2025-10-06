import { Plugin, Notice } from 'obsidian';
import { MCPConnector } from './connector';
import { Settings } from './settings';
import { ServiceManager } from './core/ServiceManager';
import { PluginLifecycleManager, type PluginLifecycleConfig } from './core/PluginLifecycleManager';

export default class ClaudesidianPlugin extends Plugin {
    public settings!: Settings;
    private connector!: MCPConnector;
    private serviceManager!: ServiceManager;
    private lifecycleManager!: PluginLifecycleManager;

    /**
     * Get a service asynchronously
     */
    public async getService<T>(name: string, timeoutMs?: number): Promise<T | null> {
        if (!this.serviceManager) {
            return null;
        }
        try {
            return await this.serviceManager.getService<T>(name);
        } catch (error) {
            console.error(`[Claudesidian] Failed to get service ${name}:`, error);
            return null;
        }
    }

    // Get service if already initialized (non-blocking)
    public getServiceIfReady<T>(name: string): T | null {
        if (!this.serviceManager) {
            return null;
        }
        return this.serviceManager.getServiceIfReady<T>(name);
    }

    // Service registry - for backward compatibility
    public get services(): Record<string, any> {
        const services: Record<string, any> = {};
        if (!this.serviceManager) {
            return services;
        }
        // Return only ready services for immediate access
        return services;
    }

    async onload() {
        try {
            // Create service manager and settings
            this.settings = new Settings(this);
            this.serviceManager = new ServiceManager(this.app, this);

            // Initialize connector skeleton (no agents yet)
            this.connector = new MCPConnector(this.app, this);

            // Create and initialize lifecycle manager
            const lifecycleConfig: PluginLifecycleConfig = {
                plugin: this,
                app: this.app,
                serviceManager: this.serviceManager,
                settings: this.settings,
                connector: this.connector,
                manifest: this.manifest
            };

            this.lifecycleManager = new PluginLifecycleManager(lifecycleConfig);
            await this.lifecycleManager.initialize();

        } catch (error) {
            console.error('[Claudesidian] Plugin loading failed:', error);
            new Notice('Claudesidian: Plugin failed to load. Check console for details.');
            throw error;
        }
    }

    async onunload() {
        // Shutdown lifecycle manager first (handles UI cleanup)
        if (this.lifecycleManager) {
            await this.lifecycleManager.shutdown();
        }

        // Stop connector
        if (this.connector) {
            await this.connector.stop();
        }

        // Service manager cleanup handled by lifecycle manager
    }

    /**
     * Get service manager for direct access if needed
     */
    public getServiceContainer(): ServiceManager {
        return this.serviceManager;
    }
}