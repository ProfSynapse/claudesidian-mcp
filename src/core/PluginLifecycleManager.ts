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
import type { IVectorStore } from '../database/interfaces/IVectorStore';

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
    private settingsTab?: SettingsTab;
    private isInitialized: boolean = false;
    private startTime: number = Date.now();
    private hasRunBackgroundStartup: boolean = false;
    private chatUIRegistered: boolean = false;

    constructor(config: PluginLifecycleConfig) {
        this.config = config;
    }

    /**
     * Initialize plugin - called from onload()
     */
    async initialize(): Promise<void> {
        const startTime = Date.now();
        
        try {
            // PHASE 1: Foundation - Service container and settings already created by main.ts
            
            // PHASE 2: Register core services (no initialization yet)
            await this.registerCoreServices();
            
            // PHASE 3: Initialize essential services only
            await this.initializeEssentialServices();
            
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
            await this.initializeDataDirectories();
            
            // Initialize core services in proper dependency order
            await this.initializeBusinessServices();
            
            // Pre-initialize UI-critical services to avoid long loading times
            await this.preInitializeUICriticalServices();
            
            // Validate search functionality
            await this.validateSearchFunctionality();
            
            // Initialize connector with agents
            try {
                await this.config.connector.initializeAgents();
                await this.config.connector.start();
            } catch (error) {
                console.warn('[PluginLifecycleManager] MCP initialization failed:', error);
            }
            
            // Register chat UI components
            await this.registerChatUI();
            
            // Create settings tab
            await this.initializeSettingsTab();
            
            // Register all maintenance commands
            this.registerMaintenanceCommands();
            
            // Check for updates
            this.checkForUpdatesOnStartup();
            
            // Update settings tab with loaded services
            this.updateSettingsTabServices();
            
            // Mark as fully initialized
            this.isInitialized = true;
            
            // Start background startup processing after everything is ready
            this.startBackgroundStartupProcessing();
            
            const bgLoadTime = Date.now() - bgStartTime;
            
        } catch (error) {
            console.error('[PluginLifecycleManager] Background initialization failed:', error);
        }
    }

    /**
     * Register core services with ServiceManager
     */
    private async registerCoreServices(): Promise<void> {
        const { serviceManager, plugin, settings } = this.config;
        
        // Foundation services (no dependencies)
        await serviceManager.registerService({
            name: 'eventManager',
            create: async () => {
                const { EventManager } = await import('../services/EventManager');
                return new EventManager();
            }
        });
        
        await serviceManager.registerService({
            name: 'stateManager',
            create: async () => {
                const { ProcessedFilesStateManager } = await import('../database/services/indexing/state/ProcessedFilesStateManager');
                return new ProcessedFilesStateManager(plugin);
            }
        });
        
        // Memory services
        await serviceManager.registerService({
            name: 'simpleMemoryService',
            create: async () => {
                const { SimpleMemoryService } = await import('../services/memory/SimpleMemoryService');
                return new SimpleMemoryService();
            }
        });
        
        await serviceManager.registerService({
            name: 'sessionService',
            dependencies: ['vectorStore', 'embeddingService'],
            create: async () => {
                const { SessionService } = await import('../agents/memoryManager/services/SessionService');
                const { VectorStoreFactory } = await import('../database/factory/VectorStoreFactory');
                const vectorStore = await serviceManager.getService<any>('vectorStore');
                const embeddingService = await serviceManager.getService<any>('embeddingService');
                
                
                // Create session collection through factory (same pattern as workspaces/states)
                const sessionCollection = VectorStoreFactory.createSessionCollection(vectorStore, embeddingService);
                return new SessionService(plugin, sessionCollection);
            }
        });
        
        await serviceManager.registerService({
            name: 'toolCallCaptureService',
            dependencies: ['simpleMemoryService', 'sessionService', 'memoryTraceService', 'embeddingService'],
            create: async () => {
                const { ToolCallCaptureService } = await import('../services/toolcall-capture/ToolCallCaptureService');
                const memoryService = await serviceManager.getService<any>('simpleMemoryService');
                const sessionService = await serviceManager.getService<any>('sessionService');
                
                // Create service with simple storage initially
                const service = new ToolCallCaptureService(memoryService, sessionService);
                
                // Enable full functionality with embeddings if services are available
                try {
                    const memoryTraceService = await serviceManager.getService<any>('memoryTraceService');
                    const embeddingService = await serviceManager.getService<any>('embeddingService');
                    
                    if (memoryTraceService && embeddingService) {
                        await service.upgrade(memoryTraceService, embeddingService);
                    }
                } catch (error) {
                    console.warn('[ToolCallCapture] Failed to enable full functionality:', error);
                }
                
                return service;
            }
        });
        
        // Vector store - CRITICAL: Single instance with proper initialization
        await serviceManager.registerService({
            name: 'vectorStore',
            create: async () => {
            const { ChromaVectorStoreModular } = await import('../database/providers/chroma/ChromaVectorStoreModular');
            
            // Get embedding configuration from settings based on actual provider
            const memorySettings = settings.settings.memory;
            if (!memorySettings?.apiProvider || !memorySettings?.providerSettings) {
                throw new Error('Memory settings not configured - cannot determine embedding dimensions');
            }
            
            const activeProvider = memorySettings.apiProvider;
            const providerSettings = memorySettings.providerSettings[activeProvider];
            
            if (!providerSettings?.dimensions) {
                throw new Error(`Embedding dimensions not configured for provider '${activeProvider}'`);
            }
            
            const embeddingConfig = {
                dimension: providerSettings.dimensions,
                model: providerSettings.model
            };
            
            // Create vectorStore with proper embedding configuration
            const vectorStore = new ChromaVectorStoreModular(plugin, {
                embedding: embeddingConfig,
                persistentPath: memorySettings.dbStoragePath,
                inMemory: false,
                cache: {
                    enabled: true,
                    maxItems: 1000,
                    ttl: 3600000
                }
            });
            
                await vectorStore.initialize();
                return vectorStore;
            }
        });
        
        // Business services with dependencies
        await serviceManager.registerService({
            name: 'embeddingService',
            dependencies: ['stateManager'],
            create: async () => {
                const { EmbeddingService } = await import('../database/services/core/EmbeddingService');
                const stateManager = await serviceManager.getService<any>('stateManager');
                return new EmbeddingService(plugin, stateManager);
            }
        });
        
        await serviceManager.registerService({
            name: 'memoryService',
            dependencies: ['vectorStore', 'embeddingService'],
            create: async () => {
                const { MemoryService } = await import('../agents/memoryManager/services/MemoryService');
                const vectorStore = await serviceManager.getService<any>('vectorStore');
                const embeddingService = await serviceManager.getService<any>('embeddingService');
                return new MemoryService(plugin, vectorStore, embeddingService, settings.settings.memory || {});
            }
        });
        
        await serviceManager.registerService({
            name: 'workspaceService',
            dependencies: ['vectorStore', 'embeddingService'],
            create: async () => {
                const { WorkspaceService } = await import('../agents/memoryManager/services/WorkspaceService');
                const vectorStore = await serviceManager.getService<any>('vectorStore');
                const embeddingService = await serviceManager.getService<any>('embeddingService');
                return new WorkspaceService(plugin, vectorStore, embeddingService);
            }
        });
        
        // Memory trace service - moved from registerAdditionalServices to ensure availability
        await serviceManager.registerService({
            name: 'memoryTraceService',
            dependencies: ['vectorStore', 'embeddingService'],
            create: async () => {
                const { MemoryTraceService } = await import('../agents/memoryManager/services/MemoryTraceService');
                const { VectorStoreFactory } = await import('../database/factory/VectorStoreFactory');
                
                // Create memory trace collection through factory
                const vectorStore = await serviceManager.getService<any>('vectorStore');
                const embeddingService = await serviceManager.getService<any>('embeddingService');
                const memoryTraceCollection = VectorStoreFactory.createMemoryTraceCollection(vectorStore);
                
                return new MemoryTraceService(memoryTraceCollection, embeddingService);
            }
        });

        // File event manager service - for embedding queue management
        await serviceManager.registerService({
            name: 'fileEventManager',
            dependencies: ['memoryService', 'workspaceService', 'embeddingService', 'eventManager'],
            create: async () => {
                const { FileEventManagerModular } = await import('../services/file-events/FileEventManagerModular');
                
                const memoryService = await serviceManager.getService<any>('memoryService');
                const workspaceService = await serviceManager.getService<any>('workspaceService');
                const embeddingService = await serviceManager.getService<any>('embeddingService');
                const eventManager = await serviceManager.getService<any>('eventManager');
                
                // Get embedding strategy from settings
                const embeddingStrategy = {
                    type: settings.settings.memory?.embeddingStrategy || 'idle',
                    idleTimeThreshold: settings.settings.memory?.idleTimeThreshold || 60000,
                    batchSize: 10,
                    processingDelay: 1000
                };
                
                const fileEventManager = new FileEventManagerModular(
                    plugin.app,
                    plugin,
                    memoryService,
                    workspaceService,
                    embeddingService,
                    eventManager,
                    embeddingStrategy
                );
                
                // Initialize the file event manager
                await fileEventManager.initialize();
                
                return fileEventManager;
            }
        });

        // Agent Manager service - for tool execution coordination
        await serviceManager.registerService({
            name: 'agentManager',
            dependencies: ['eventManager'],
            create: async () => {
                const { AgentManager } = await import('../services/AgentManager');
                const eventManager = await serviceManager.getService<any>('eventManager');
                return new AgentManager(plugin.app, plugin, eventManager);
            }
        });

        // LLM Service - for AI response generation
        await serviceManager.registerService({
            name: 'llmService',
            dependencies: [],
            create: async () => {
                const { LLMService } = await import('../services/llm/core/LLMService');
                const llmProviderSettings = settings.settings.llmProviders || {
                  providers: {},
                  defaultModel: {
                    provider: 'openai',
                    model: 'gpt-3.5-turbo'
                  }
                };
                const mcpConnector = (plugin as any).getConnector();
                return new LLMService(llmProviderSettings, mcpConnector);
            }
        });

        // Session Context Manager - for workspace context
        await serviceManager.registerService({
            name: 'sessionContextManager',
            dependencies: ['eventManager'],
            create: async () => {
                const { SessionContextManager } = await import('../services/SessionContextManager');
                return new SessionContextManager();
            }
        });

        // Chat services - native chatbot functionality
        await serviceManager.registerService({
            name: 'conversationRepository',
            dependencies: ['vectorStore', 'embeddingService'],
            create: async () => {
                const { ConversationRepository } = await import('../database/services/chat/ConversationRepository');
                const { ConversationCollection } = await import('../database/collections/ConversationCollection');
                const vectorStore = await serviceManager.getService<any>('vectorStore');
                const embeddingService = await serviceManager.getService<any>('embeddingService');
                const conversationCollection = new ConversationCollection(vectorStore);
                return new ConversationRepository(conversationCollection, embeddingService);
            }
        });

        await serviceManager.registerService({
            name: 'chatService',
            dependencies: ['conversationRepository', 'llmService', 'embeddingService'],
            create: async () => {
                const { ChatService } = await import('../services/chat/ChatService');
                const conversationRepo = await serviceManager.getService<any>('conversationRepository');
                const llmService = await serviceManager.getService<any>('llmService');
                const embeddingService = await serviceManager.getService<any>('embeddingService');
                
                // Get MCP server URL from connector
                const mcpConnector = (plugin as any).getConnector();
                let mcpServerUrl: string | undefined;
                
                try {
                    const mcpServer = mcpConnector?.getServer();
                    mcpServerUrl = mcpServer?.getServerUrl?.() || 'http://localhost:3000/sse';
                } catch (error) {
                    console.warn('[PluginLifecycleManager] Failed to get MCP server URL:', error);
                    mcpServerUrl = 'http://localhost:3000/sse'; // Fallback
                }
                
                return new ChatService({
                    conversationRepo,
                    llmService,
                    embeddingService,
                    vaultName: plugin.app.vault.getName(),
                    mcpConnector,
                    mcpServerUrl
                });
            }
        });
    }

    /**
     * Initialize essential services that must be ready immediately
     */
    private async initializeEssentialServices(): Promise<void> {
        try {
            // Initialize only the most critical services synchronously
            await this.config.serviceManager.getService('eventManager');
            await this.config.serviceManager.getService('stateManager');
            await this.config.serviceManager.getService('simpleMemoryService');
        } catch (error) {
            console.error('[PluginLifecycleManager] Essential service initialization failed:', error);
            throw error;
        }
    }

    /**
     * Initialize business services with proper dependency resolution
     */
    private async initializeBusinessServices(): Promise<void> {
        try {
            // Initialize in dependency order to prevent multiple VectorStore instances
            const vectorStore = await this.config.serviceManager.getService('vectorStore');
            
            // Initialize dependent services sequentially to avoid circular dependency issues
            await this.config.serviceManager.getService('embeddingService');
            await this.config.serviceManager.getService('memoryService');
            await this.config.serviceManager.getService('workspaceService');
            await this.config.serviceManager.getService('memoryTraceService');
            await this.config.serviceManager.getService('fileEventManager');
            
            // Initialize supporting services for chat
            await this.config.serviceManager.getService('agentManager');
            await this.config.serviceManager.getService('llmService');
            await this.config.serviceManager.getService('sessionContextManager');
            
            // Initialize chat services
            await this.config.serviceManager.getService('conversationRepository');
            await this.config.serviceManager.getService('chatService');
        } catch (error) {
            console.error('[PluginLifecycleManager] Business service initialization failed:', error);
            throw error;
        }
    }

    /**
     * Initialize data directories asynchronously in background
     */
    private async initializeDataDirectories(): Promise<void> {
        try {
            // Use vault-relative paths for Obsidian adapter
            const pluginDir = `.obsidian/plugins/${this.config.manifest.id}`;
            const dataDir = `${pluginDir}/data`;
            const chromaDbDir = `${dataDir}/chroma-db`;
            const collectionsDir = `${chromaDbDir}/collections`;
            
            // Create directories using Obsidian's vault adapter
            const { normalizePath } = require('obsidian');
            await this.config.app.vault.adapter.mkdir(normalizePath(dataDir));
            await this.config.app.vault.adapter.mkdir(normalizePath(chromaDbDir));
            await this.config.app.vault.adapter.mkdir(normalizePath(collectionsDir));
            
            // Update settings with correct path
            if (!this.config.settings.settings.memory) {
                this.config.settings.settings.memory = this.getDefaultMemorySettings(chromaDbDir);
            } else {
                this.config.settings.settings.memory.dbStoragePath = chromaDbDir;
            }
            
            // Save settings in background
            this.config.settings.saveSettings().catch(error => {
                console.warn('[PluginLifecycleManager] Failed to save settings after directory init:', error);
            });
            
        } catch (error) {
            console.error('[PluginLifecycleManager] Failed to initialize data directories:', error);
            // Don't throw - plugin should function without directories for now
        }
    }

    /**
     * Start background startup processing - runs independently after plugin initialization
     */
    private startBackgroundStartupProcessing(): void {
        // Prevent multiple background startup processes
        if (this.hasRunBackgroundStartup) {
            return;
        }
        
        // Run startup processing in background without blocking plugin initialization
        setTimeout(async () => {
            try {
                // Double-check to prevent race conditions
                if (this.hasRunBackgroundStartup) {
                    return;
                }
                
                this.hasRunBackgroundStartup = true;
                
                // STEP 1: Perform deferred migration first (after file system is ready)
                try {
                    const fileEventManager = await this.waitForService('fileEventManager', 5000);
                    if (fileEventManager && typeof (fileEventManager as any).getCoordinator === 'function') {
                        const coordinator = (fileEventManager as any).getCoordinator();
                        if (coordinator && typeof coordinator.getIncompleteFilesManager === 'function') {
                            const incompleteFilesManager = coordinator.getIncompleteFilesManager();
                            await incompleteFilesManager.performDeferredMigration();
                        } else {
                            console.warn('[PluginLifecycleManager] ⚠️ FileEventCoordinator or IncompleteFilesStateManager not available');
                        }
                    } else {
                        console.warn('[PluginLifecycleManager] ⚠️ Could not access FileEventManager for deferred migration');
                    }
                } catch (error) {
                    console.error('[PluginLifecycleManager] ❌ Deferred migration failed:', error);
                }
                
                const memorySettings = this.config.settings.settings.memory;
                const embeddingStrategy = memorySettings?.embeddingStrategy || 'idle';
                
                if (embeddingStrategy === 'startup') {
                    
                    // Wait for FileEventManager to be ready (with retry logic)
                    const fileEventManager = await this.waitForService('fileEventManager', 30000);
                    if (fileEventManager && typeof (fileEventManager as any).processStartupQueue === 'function') {
                        await (fileEventManager as any).processStartupQueue();
                    } else {
                        console.warn('[PluginLifecycleManager] FileEventManager not available for background startup processing');
                        // Reset flag so it can be retried if needed
                        this.hasRunBackgroundStartup = false;
                    }
                } else {
                }
            } catch (error) {
                console.error('[PluginLifecycleManager] Error in background startup processing:', error);
                // Reset flag on error so it can be retried
                this.hasRunBackgroundStartup = false;
            }
        }, 2000); // 2 second delay to ensure Obsidian is fully loaded
    }

    /**
     * Wait for a service to be ready with retry logic
     */
    private async waitForService<T>(serviceName: string, timeoutMs: number = 30000): Promise<T | null> {
        const startTime = Date.now();
        const retryInterval = 1000; // Check every 1 second
        
        while (Date.now() - startTime < timeoutMs) {
            try {
                const service = await this.getService<T>(serviceName, 2000);
                if (service) {
                    return service;
                }
            } catch (error) {
                // Service not ready yet, continue waiting
            }
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, retryInterval));
        }
        
        console.warn(`[PluginLifecycleManager] Service '${serviceName}' not ready after ${timeoutMs}ms`);
        return null;
    }

    /**
     * Get default memory settings
     */
    private getDefaultMemorySettings(chromaDbDir: string) {
        return {
            dbStoragePath: chromaDbDir,
            enabled: true,
            embeddingsEnabled: true,
            apiProvider: 'openai',
            providerSettings: {
                openai: {
                    apiKey: '',
                    model: 'text-embedding-3-small',
                    dimensions: 1536
                }
            },
            maxTokensPerMonth: 1000000,
            apiRateLimitPerMinute: 500,
            chunkStrategy: 'paragraph' as 'paragraph',
            chunkSize: 512,
            chunkOverlap: 50,
            includeFrontmatter: true,
            excludePaths: ['.obsidian/**/*'],
            minContentLength: 50,
            embeddingStrategy: 'idle' as 'idle',
            idleTimeThreshold: 60000,
            autoCleanOrphaned: true,
            maxDbSize: 500,
            pruningStrategy: 'least-used' as 'least-used',
            vectorStoreType: 'file-based' as 'file-based'
        };
    }

    /**
     * Initialize settings tab asynchronously in background
     */
    private async initializeSettingsTab(): Promise<void> {
        try {
            // Get agent references - may not be available yet
            const vaultLibrarian = this.config.connector?.getVaultLibrarian();
            const memoryManager = this.config.connector?.getMemoryManager();
            
            // Get services from container
            const services: Record<string, any> = {};
            for (const serviceName of this.config.serviceManager.getReadyServices()) {
                services[serviceName] = this.config.serviceManager.getServiceIfReady(serviceName);
            }
            
            // Create settings tab with current state
            this.settingsTab = new SettingsTab(
                this.config.app,
                this.config.plugin,
                this.config.settings,
                services, // Pass current services (may be empty initially)
                vaultLibrarian || undefined,
                memoryManager || undefined,
                this.config.serviceManager as any, // Pass service manager for compatibility
                this // Pass this lifecycle manager for ChatView activation
            );
            this.config.plugin.addSettingTab(this.settingsTab);
            
        } catch (error) {
            console.error('[PluginLifecycleManager] Settings tab initialization failed:', error);
            // Plugin should still function without settings tab
        }
    }

    /**
     * Pre-initialize UI-critical services to avoid Memory Management loading delays
     */
    private async preInitializeUICriticalServices(): Promise<void> {
        if (!this.config.serviceManager) return;
        
        const startTime = Date.now();
        
        try {
            // Initialize services that Memory Management accordion depends on
            const uiCriticalServices = [
                'fileEmbeddingAccessService',
                'usageStatsService',
                'cacheManager'
            ];
            
            // Register additional services if not already registered
            this.registerAdditionalServices();
            
            // Initialize in parallel where possible
            await Promise.allSettled(
                uiCriticalServices.map(async (serviceName) => {
                    try {
                        const serviceStart = Date.now();
                        await this.config.serviceManager.getService(serviceName);
                        const serviceTime = Date.now() - serviceStart;
                    } catch (error) {
                        console.warn(`[PluginLifecycleManager] Failed to pre-initialize ${serviceName}:`, error);
                    }
                })
            );
            
            const totalTime = Date.now() - startTime;
            
            // Inject vector store into SimpleMemoryService for persistence
            try {
                const vectorStore = await this.config.serviceManager.getService('vectorStore');
                const simpleMemoryService = await this.config.serviceManager.getService<any>('simpleMemoryService');
                
                if (vectorStore && simpleMemoryService && typeof simpleMemoryService.setVectorStore === 'function') {
                    simpleMemoryService.setVectorStore(vectorStore);
                } else {
                    console.warn('[PluginLifecycleManager] ❌ Vector store or SimpleMemoryService not available for injection');
                }
            } catch (error) {
                console.error('[PluginLifecycleManager] Failed to inject vector store:', error);
            }
            
        } catch (error) {
            console.error('[PluginLifecycleManager] UI-critical services pre-initialization failed:', error);
        }
    }

    /**
     * Register additional services needed by UI components
     */
    private registerAdditionalServices(): void {
        const { serviceManager, plugin, settings } = this.config;
        
        // Register services that weren't included in core registration
        serviceManager.registerFactory(
            'fileEmbeddingAccessService',
            async (deps) => {
                const { FileEmbeddingAccessService } = await import('../database/services/indexing/FileEmbeddingAccessService');
                return new FileEmbeddingAccessService(plugin, deps.vectorStore);
            },
            { dependencies: ['vectorStore'] }
        );
        
        serviceManager.registerFactory(
            'usageStatsService',
            async (deps) => {
                const { UsageStatsService } = await import('../database/services/usage/UsageStatsService');
                return new UsageStatsService(deps.embeddingService, deps.vectorStore, settings.settings.memory || {});
            },
            { dependencies: ['embeddingService', 'vectorStore'] }
        );
        
        serviceManager.registerFactory(
            'cacheManager',
            async (deps) => {
                const { CacheManager } = await import('../database/services/cache/CacheManager');
                return new CacheManager(this.config.app, deps.workspaceService, deps.memoryService);
            },
            { dependencies: ['workspaceService', 'memoryService'] }
        );
    }

    /**
     * Register chat UI components
     */
    private async registerChatUI(): Promise<void> {
        try {
            const { plugin, app } = this.config;
            
            // Check if ChatView is enabled in settings
            if (!this.isChatViewEnabled()) {
                console.log('[PluginLifecycleManager] ChatView disabled in settings - skipping UI registration');
                return;
            }
            
            // Skip if already registered
            if (this.chatUIRegistered) {
                console.log('[PluginLifecycleManager] ChatView UI already registered');
                return;
            }
            
            // Get ChatService
            const chatService = await this.getService<any>('chatService', 5000);
            if (!chatService) {
                console.warn('[PluginLifecycleManager] ChatService not available for UI registration');
                return;
            }
            
            // Import ChatView
            const { ChatView, CHAT_VIEW_TYPE } = await import('../ui/chat/ChatView');
            
            // Register ChatView with Obsidian
            plugin.registerView(
                CHAT_VIEW_TYPE,
                (leaf) => new ChatView(leaf, chatService)
            );
            
            // Add ribbon icon for chat
            plugin.addRibbonIcon('message-square', 'AI Chat', () => {
                this.activateChatView();
            });
            
            // Add command to open chat
            plugin.addCommand({
                id: 'open-chat',
                name: 'Open AI Chat',
                callback: () => {
                    this.activateChatView();
                }
            });
            
            // Mark as registered
            this.chatUIRegistered = true;
            console.log('[PluginLifecycleManager] ChatView UI registered successfully');
            
        } catch (error) {
            console.error('[PluginLifecycleManager] Failed to register chat UI:', error);
        }
    }

    /**
     * Activate chat view in sidebar
     */
    private async activateChatView(): Promise<void> {
        const { app } = this.config;
        
        // Check if ChatView is enabled in settings
        if (!this.isChatViewEnabled()) {
            new Notice('AI Chat is disabled. Enable it in Plugin Settings > Agent Management > AI Chat tab.');
            return;
        }
        
        const { CHAT_VIEW_TYPE } = await import('../ui/chat/ChatView');
        
        // Check if chat view already exists
        const existingLeaf = app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];
        if (existingLeaf) {
            app.workspace.revealLeaf(existingLeaf);
            return;
        }
        
        // Create new chat view in right sidebar
        const leaf = app.workspace.getRightLeaf(false);
        await leaf.setViewState({
            type: CHAT_VIEW_TYPE,
            active: true
        });
        
        app.workspace.revealLeaf(leaf);
    }
    
    /**
     * Check if ChatView is enabled in settings
     */
    private isChatViewEnabled(): boolean {
        const chatViewSettings = this.config.settings.settings.chatView;
        return chatViewSettings?.enabled === true;
    }
    
    /**
     * Enable ChatView UI when user toggles it on in settings
     * This registers the UI components and auto-opens the ChatView
     */
    async enableChatViewUI(): Promise<void> {
        try {
            if (!this.isChatViewEnabled()) {
                console.warn('[PluginLifecycleManager] ChatView not enabled in settings');
                return;
            }
            
            // Register ChatView UI components if not already registered
            await this.registerChatUI();
            
            // Auto-open ChatView in sidebar
            await this.activateChatView();
            
        } catch (error) {
            console.error('[PluginLifecycleManager] Failed to enable ChatView UI:', error);
        }
    }

    /**
     * Register maintenance commands
     */
    private registerMaintenanceCommands(): void {
        const { plugin, serviceManager } = this.config;
        
        plugin.addCommand({
            id: 'repair-collections',
            name: 'Repair vector collections',
            callback: async () => {
                try {
                    const notice = new Notice('Repairing vector collections...', 0);
                    
                    const vectorStore = await this.getService<IVectorStore>('vectorStore', 15000);
                    if (!vectorStore) {
                        notice.setMessage('Vector store not available or failed to initialize');
                        setTimeout(() => notice.hide(), 5000);
                        return;
                    }
                    
                    if (typeof (vectorStore as any).repairCollections !== 'function') {
                        notice.setMessage('Repair function not available');
                        setTimeout(() => notice.hide(), 5000);
                        return;
                    }
                    
                    const result = await (vectorStore as any).repairCollections();
                    
                    if (result.success) {
                        notice.setMessage(`Repair successful: ${result.repairedCollections.length} collections restored`);
                    } else {
                        notice.setMessage(`Repair completed with issues: ${result.errors.length} errors`);
                        console.error('Collection repair errors:', result.errors);
                    }
                    
                    setTimeout(() => notice.hide(), 5000);
                } catch (error) {
                    new Notice(`Repair failed: ${(error as Error).message}`);
                    console.error('Collection repair error:', error);
                }
            }
        });
        
        plugin.addCommand({
            id: 'cleanup-obsolete-collections',
            name: 'Clean up obsolete collections',
            callback: async () => {
                try {
                    const notice = new Notice('Cleaning up obsolete collections...', 0);
                    
                    const vectorStore = await this.getService<IVectorStore>('vectorStore', 15000);
                    if (!vectorStore) {
                        notice.setMessage('Vector store not available or failed to initialize');
                        setTimeout(() => notice.hide(), 5000);
                        return;
                    }
                    
                    // Access the collection manager through the vector store
                    const collectionManager = (vectorStore as any).collectionManager;
                    if (!collectionManager || typeof collectionManager.cleanupObsoleteCollections !== 'function') {
                        notice.setMessage('Collection cleanup not available');
                        setTimeout(() => notice.hide(), 5000);
                        return;
                    }
                    
                    const result = await collectionManager.cleanupObsoleteCollections();
                    
                    if (result.cleaned.length > 0) {
                        notice.setMessage(`Cleaned up ${result.cleaned.length} collections: ${result.cleaned.join(', ')}`);
                    } else {
                        notice.setMessage('No obsolete collections found to clean up');
                    }
                    
                    if (result.errors.length > 0) {
                        console.warn('Collection cleanup errors:', result.errors);
                    }
                    
                    setTimeout(() => notice.hide(), 8000);
                } catch (error) {
                    new Notice(`Cleanup failed: ${(error as Error).message}`);
                    console.error('Collection cleanup error:', error);
                }
            }
        });
        
        plugin.addCommand({
            id: 'check-vector-storage',
            name: 'Check vector storage status',
            callback: async () => {
                try {
                    const notice = new Notice('Checking vector storage...', 0);
                    
                    const vectorStore = await this.getService<IVectorStore>('vectorStore', 15000);
                    if (!vectorStore) {
                        notice.setMessage('Vector store not available or failed to initialize');
                        setTimeout(() => notice.hide(), 5000);
                        return;
                    }
                    
                    const diagnostics = await vectorStore.getDiagnostics();
                    
                    const message = [
                        `Storage mode: ${diagnostics.storageMode}`,
                        `Path: ${diagnostics.persistentPath}`,
                        `Collections: ${diagnostics.totalCollections}`,
                        `Directory exists: ${diagnostics.dataDirectoryExists ? 'Yes' : 'No'}`,
                        `Permissions OK: ${diagnostics.filePermissionsOk ? 'Yes' : 'No'}`
                    ].join('\n');
                    
                    notice.setMessage(message);
                    
                    setTimeout(() => notice.hide(), 10000);
                } catch (error) {
                    new Notice(`Diagnostics failed: ${(error as Error).message}`);
                    console.error('Diagnostics error:', error);
                }
            }
        });
        
        plugin.addCommand({
            id: 'check-service-readiness',
            name: 'Check service readiness status',
            callback: async () => {
                try {
                    const notice = new Notice('Checking service readiness...', 0);
                    
                    if (!serviceManager) {
                        notice.setMessage('Service manager not available');
                        setTimeout(() => notice.hide(), 5000);
                        return;
                    }
                    
                    const stats = serviceManager.getStats();
                    const metadata = serviceManager.getAllServiceStatus();
                    
                    const readyServices = Object.values(metadata).filter(m => m.ready).length;
                    const totalServices = Object.keys(metadata).length;
                    
                    const message = [
                        `Services: ${readyServices}/${totalServices} ready`,
                        `Registered: ${stats.registered}`,
                        `Ready: ${stats.ready}`,
                        `Failed: ${stats.failed}`,
                        `Plugin initialized: ${this.isInitialized ? 'Yes' : 'No'}`
                    ].join('\n');
                    
                    notice.setMessage(message);
                    
                    setTimeout(() => notice.hide(), 8000);
                } catch (error) {
                    new Notice(`Readiness check failed: ${(error as Error).message}`);
                    console.error('Service readiness check error:', error);
                }
            }
        });
    }

    /**
     * Check for updates on startup in background
     */
    private async checkForUpdatesOnStartup(): Promise<void> {
        // Run in background to avoid blocking startup
        setTimeout(async () => {
            try {
                const { settings } = this.config;
                const lastCheck = settings.settings.lastUpdateCheckDate;
                if (lastCheck) {
                    const lastCheckTime = new Date(lastCheck);
                    const now = new Date();
                    const daysDiff = (now.getTime() - lastCheckTime.getTime()) / (1000 * 60 * 60 * 24);
                    if (daysDiff < 1) {
                        return;
                    }
                }

                const updateManager = new UpdateManager(this.config.plugin);
                const hasUpdate = await updateManager.checkForUpdate();
                
                settings.settings.lastUpdateCheckDate = new Date().toISOString();
                
                if (hasUpdate) {
                    const release = await (updateManager as any).fetchLatestRelease();
                    const availableVersion = release.tag_name.replace('v', '');
                    
                    settings.settings.availableUpdateVersion = availableVersion;
                    
                    new Notice(`Plugin update available: v${availableVersion}. Check settings to update.`, 8000);
                } else {
                    settings.settings.availableUpdateVersion = undefined;
                }
                
                await settings.saveSettings();
                
            } catch (error) {
                console.error('Failed to check for updates:', error);
            }
        }, 2000); // 2 second delay
    }

    /**
     * Validate search functionality - ensure core services are available
     */
    private async validateSearchFunctionality(): Promise<void> {
        try {
            // Test 1: Validate vectorStore service is available (ChromaDB)
            const vectorStore = await this.getService<IVectorStore>('vectorStore', 5000);
            if (vectorStore) {
                // Test basic collection operations
                try {
                    const collections = await vectorStore.listCollections();
                } catch (collectionError) {
                    console.warn('[VALIDATION] Collection access error (may be normal during startup):', collectionError);
                }
            } else {
                console.warn('[VALIDATION] ⚠️ VectorStore service not available');
            }
            
            // Test 2: Validate core services are available
            const serviceManager = this.config.serviceManager;
            if (serviceManager) {
                const metadata = serviceManager.getAllServiceStatus();
                const serviceNames = Object.keys(metadata);
                
                const coreServices = ['vectorStore', 'embeddingService', 'workspaceService', 'memoryService'];
                const availableCore = coreServices.filter(service => serviceNames.includes(service));
            }
            
        } catch (error) {
            console.warn('[VALIDATION] Service validation error:', error);
        }
    }

    /**
     * Update settings tab with available services (non-blocking)
     */
    private updateSettingsTabServices(): void {
        if (this.settingsTab) {
            const services: Record<string, any> = {};
            for (const serviceName of this.config.serviceManager.getReadyServices()) {
                services[serviceName] = this.config.serviceManager.getServiceIfReady(serviceName);
            }
            this.settingsTab.updateServices(services);
        }
    }

    /**
     * Enable fallback mode with minimal functionality
     */
    private enableFallbackMode(): void {
        try {
            this.config.plugin.addCommand({
                id: 'troubleshoot-services',
                name: 'Troubleshoot service initialization',
                callback: () => {
                    const stats = this.config.serviceManager?.getStats() || { registered: 0, ready: 0, failed: 0 };
                    const message = `Service initialization failed. Registered: ${stats.registered}, Ready: ${stats.ready}`;
                    new Notice(message, 10000);
                    // Service diagnostic information logged
                }
            });
            
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
            if (this.settingsTab && typeof (this.settingsTab as any).cleanup === 'function') {
                (this.settingsTab as any).cleanup();
            }
            
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