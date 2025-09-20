/**
 * Location: /src/core/PluginLifecycleManager.ts
 * 
 * Plugin Lifecycle Manager - Handles plugin initialization, startup, and shutdown logic
 * 
 * This service extracts complex lifecycle management from the main plugin class,
 * coordinating service initialization, background tasks, and cleanup procedures.
 * Used by main.ts to manage the plugin's lifecycle phases in a structured way.
 */

import { Plugin, Notice } from 'obsidian';
import { ServiceManager } from './ServiceManager';
import { Settings } from '../settings';
import { SettingsTab } from '../components/SettingsTab';
import { MCPConnector } from '../connector';
import { UpdateManager } from '../utils/UpdateManager';
import { ServiceRegistrar } from './services/ServiceRegistrar';
import { MaintenanceCommandManager } from './commands/MaintenanceCommandManager';
import { ChatUIManager } from './ui/ChatUIManager';
import { BackgroundProcessor } from './background/BackgroundProcessor';
import { SettingsTabManager } from './settings/SettingsTabManager';
import type { IVectorStore } from '../database/interfaces/IVectorStore';
import type { ServiceCreationContext } from './services/ServiceDefinitions';

export interface PluginLifecycleConfig {
    plugin: Plugin;
    app: any;
    serviceManager: ServiceManager;
    settings: Settings;
    connector: MCPConnector;
    manifest: any;
}

/**
 * Plugin Lifecycle Manager - coordinates plugin initialization and shutdown
 */
export class PluginLifecycleManager {
    private config: PluginLifecycleConfig;
    private isInitialized: boolean = false;
    private startTime: number = Date.now();
    private serviceRegistrar: ServiceRegistrar;
    private commandManager: MaintenanceCommandManager;
    private chatUIManager: ChatUIManager;
    private backgroundProcessor: BackgroundProcessor;
    private settingsTabManager: SettingsTabManager;

    constructor(config: PluginLifecycleConfig) {
        this.config = config;
        
        // Create service registrar with proper context
        const serviceContext: ServiceCreationContext = {
            plugin: config.plugin,
            app: config.app,
            serviceManager: config.serviceManager,
            settings: config.settings,
            connector: config.connector,
            manifest: config.manifest
        };
        this.serviceRegistrar = new ServiceRegistrar(serviceContext);
        
        // Create command manager
        this.commandManager = new MaintenanceCommandManager({
            plugin: config.plugin,
            serviceManager: config.serviceManager,
            getService: (name, timeoutMs) => this.serviceRegistrar.getService(name, timeoutMs),
            isInitialized: () => this.isInitialized
        });
        
        // Create chat UI manager
        this.chatUIManager = new ChatUIManager({
            plugin: config.plugin,
            app: config.app,
            settings: config.settings,
            getService: (name, timeoutMs) => this.serviceRegistrar.getService(name, timeoutMs)
        });
        
        // Create background processor
        this.backgroundProcessor = new BackgroundProcessor({
            plugin: config.plugin,
            settings: config.settings,
            serviceManager: config.serviceManager,
            getService: (name, timeoutMs) => this.serviceRegistrar.getService(name, timeoutMs),
            waitForService: (name, timeoutMs) => this.serviceRegistrar.waitForService(name, timeoutMs),
            isInitialized: () => this.isInitialized
        });
        
        // Create settings tab manager
        this.settingsTabManager = new SettingsTabManager({
            plugin: config.plugin,
            app: config.app,
            settings: config.settings,
            serviceManager: config.serviceManager,
            connector: config.connector,
            lifecycleManager: this,
            backgroundProcessor: this.backgroundProcessor
        });
    }

    /**
     * Initialize plugin - called from onload()
     */
    async initialize(): Promise<void> {
        const startTime = Date.now();
        
        try {
            // PHASE 1: Foundation - Service container and settings already created by main.ts
            
            // PHASE 2: Register core services (no initialization yet)
            await this.serviceRegistrar.registerCoreServices();
            
            // PHASE 3: Initialize essential services only
            await this.serviceRegistrar.initializeEssentialServices();
            
            // Plugin is now "loaded" - defer full initialization to background
            const loadTime = Date.now() - startTime;
            
            // PHASE 4: Start background initialization after onload completes
            setTimeout(() => {
                this.startBackgroundInitialization().catch(error => {
                    console.error('[PluginLifecycleManager] Background initialization failed:', error);
                });
            }, 0);
            
        } catch (error) {
            console.error('[PluginLifecycleManager] Critical initialization failure:', error);
            this.enableFallbackMode();
        }
    }

    /**
     * Background initialization - runs after onload() completes
     */
    private async startBackgroundInitialization(): Promise<void> {
        const bgStartTime = Date.now();
        
        try {
            // Load settings first
            await this.config.settings.loadSettings();
            
            // Log data.json for debugging StateManager
            try {
                const data = await this.config.plugin.loadData();
                // Plugin data.json loaded successfully
            } catch (error) {
                console.warn('Failed to debug data.json:', error);
            }
            
            // Initialize data directories
            await this.serviceRegistrar.initializeDataDirectories();
            
            // PRIORITY: Initialize MCP server FIRST to prevent timeout
            // This allows Claude Desktop to connect while heavy services initialize in background
            try {
                await this.config.connector.initializeAgents();
                await this.config.connector.start();
                console.log('[PluginLifecycleManager] MCP server started - connection available');
            } catch (error) {
                console.warn('[PluginLifecycleManager] MCP initialization failed:', error);
            }
            
            // Now initialize heavy services in background (non-blocking)
            setTimeout(async () => {
                try {
                    // Initialize core services in proper dependency order
                    await this.serviceRegistrar.initializeBusinessServices();
                    
                    // Pre-initialize UI-critical services to avoid long loading times
                    await this.serviceRegistrar.preInitializeUICriticalServices();
                    
                    // Validate search functionality
                    await this.backgroundProcessor.validateSearchFunctionality();
                    
                    console.log('[PluginLifecycleManager] Heavy services initialization complete');
                } catch (error) {
                    console.error('[PluginLifecycleManager] Background service initialization failed:', error);
                }
            }, 100); // Small delay to ensure MCP connection is fully established
            
            // Register chat UI components
            await this.chatUIManager.registerChatUI();
            
            // Create settings tab
            await this.settingsTabManager.initializeSettingsTab();
            
            // Register all maintenance commands
            this.commandManager.registerMaintenanceCommands();
            
            // Check for updates
            this.backgroundProcessor.checkForUpdatesOnStartup();
            
            // Update settings tab with loaded services
            this.backgroundProcessor.updateSettingsTabServices();
            
            // Mark as fully initialized
            this.isInitialized = true;
            
            // Start background startup processing after everything is ready
            this.backgroundProcessor.startBackgroundStartupProcessing();
            
            const bgLoadTime = Date.now() - bgStartTime;
            
        } catch (error) {
            console.error('[PluginLifecycleManager] Background initialization failed:', error);
        }
    }









    /**
     * Enable ChatView UI when user toggles it on in settings
     * This registers the UI components and auto-opens the ChatView
     */
    async enableChatViewUI(): Promise<void> {
        try {
            return await this.chatUIManager.enableChatViewUI();
        } catch (error) {
            console.error('[PluginLifecycleManager] Failed to enable ChatView UI:', error);
        }
    }



    /**
     * Enable fallback mode with minimal functionality
     */
    private enableFallbackMode(): void {
        try {
            this.commandManager.registerTroubleshootCommand();
        } catch (error) {
            console.error('[PluginLifecycleManager] Fallback mode setup failed:', error);
        }
    }

    /**
     * Get service helper method
     */
    private async getService<T>(name: string, timeoutMs: number = 10000): Promise<T | null> {
        if (!this.config.serviceManager) {
            return null;
        }
        
        // Try to get service (will initialize if needed)
        try {
            return await this.config.serviceManager.getService<T>(name);
        } catch (error) {
            console.warn(`[PluginLifecycleManager] Failed to get service '${name}':`, error);
            return null;
        }
    }

    /**
     * Reload configuration for all services after settings change
     */
    reloadConfiguration(): void {
        try {
            const fileEventManager = this.config.serviceManager?.getServiceIfReady('fileEventManager');
            if (fileEventManager && typeof (fileEventManager as any).reloadConfiguration === 'function') {
                (fileEventManager as any).reloadConfiguration();
            }
        } catch (error) {
            console.warn('Error reloading file event manager configuration:', error);
        }
    }

    /**
     * Get initialization status
     */
    getInitializationStatus(): { isInitialized: boolean; startTime: number } {
        return {
            isInitialized: this.isInitialized,
            startTime: this.startTime
        };
    }

    /**
     * Shutdown and cleanup
     */
    async shutdown(): Promise<void> {
        try {
            // Save processed files state before cleanup
            const stateManager = this.config.serviceManager?.getServiceIfReady('stateManager');
            if (stateManager && typeof (stateManager as any).saveState === 'function') {
                await (stateManager as any).saveState();
            }
            
            // Cleanup settings tab accordions
            this.settingsTabManager.cleanup();
            
            // Cleanup service manager (handles all service cleanup)
            if (this.config.serviceManager) {
                await this.config.serviceManager.stop();
            }
            
            // Stop the MCP connector
            if (this.config.connector) {
                await this.config.connector.stop();
            }
            
        } catch (error) {
            console.error('[PluginLifecycleManager] Error during cleanup:', error);
        }
    }
}