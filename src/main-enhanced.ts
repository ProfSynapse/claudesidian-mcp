/**
 * Enhanced Plugin Main Class - Obsidian API-First Architecture
 * Location: src/main-enhanced.ts
 * 
 * This is the redesigned plugin main class implementing proper Obsidian Plugin lifecycle
 * management with clean dependency injection patterns. It replaces the complex service
 * initialization patterns with a clear, maintainable architecture.
 * 
 * Key improvements over main.ts:
 * - Clean onload/onunload lifecycle management
 * - Proper dependency injection with ServiceContainer
 * - Obsidian API-first patterns (no Node.js filesystem)
 * - Structured logging throughout
 * - Cross-platform compatibility (mobile + desktop)
 * - Proper error handling and cleanup
 * 
 * Architecture:
 * 1. Foundation services (no dependencies) - logger, pathManager, dataManager
 * 2. Core services (foundation dependencies) - vaultOperations, eventManager
 * 3. Business services (core dependencies) - vectorStore, mcpServer, agents
 * 4. UI services (business dependencies) - settingsTab, commands
 */

import { Plugin, Notice } from 'obsidian';
import { ServiceContainer } from './core/ServiceContainer';
import { StructuredLogger } from './core/StructuredLogger';
import { ObsidianPathManager } from './core/ObsidianPathManager';
import { PluginDataManager } from './core/PluginDataManager';
import { VaultOperations } from './core/VaultOperations';
import { MCPConnector } from './connector';
import { SettingsTab } from './components/SettingsTab';
import { Settings } from './settings';

// Service interfaces for type safety
import type { IVectorStore } from './database/interfaces/IVectorStore';
import type { EmbeddingService } from './database/services/EmbeddingService';
import type { MemoryService } from './database/services/MemoryService';
import type { EventManager } from './services/EventManager';

/**
 * Default plugin settings with proper typing
 */
export interface ClaudesidianSettings {
  // Core settings
  version: string;
  enabled: boolean;
  
  // API configuration
  api: {
    endpoint: string;
    timeout: number;
    retries: number;
  };
  
  // Memory and vector storage
  memory: {
    enabled: boolean;
    dbStoragePath: string;
    embeddingsEnabled: boolean;
    apiProvider: string;
    maxTokensPerMonth: number;
    defaultThreshold: number;
  };
  
  // Logging configuration
  logging: {
    debugMode: boolean;
    level: number;
    enablePerformanceLogging: boolean;
    maxBufferSize: number;
  };
  
  // UI preferences
  ui: {
    showWelcomeNotice: boolean;
    compactMode: boolean;
  };
  
  // Feature flags
  features: {
    betaFeatures: boolean;
    experimentalSearch: boolean;
  };
}

const DEFAULT_SETTINGS: ClaudesidianSettings = {
  version: '1.0.0',
  enabled: true,
  api: {
    endpoint: '',
    timeout: 30000,
    retries: 3
  },
  memory: {
    enabled: true,
    dbStoragePath: '',
    embeddingsEnabled: true,
    apiProvider: 'openai',
    maxTokensPerMonth: 1000000,
    defaultThreshold: 0.7
  },
  logging: {
    debugMode: false,
    level: 1, // INFO
    enablePerformanceLogging: false,
    maxBufferSize: 1000
  },
  ui: {
    showWelcomeNotice: true,
    compactMode: false
  },
  features: {
    betaFeatures: false,
    experimentalSearch: false
  }
};

/**
 * Enhanced Plugin Main Class with Obsidian API-First Architecture
 */
export default class ClaudesidianPluginEnhanced extends Plugin {
  // Core services
  private container!: ServiceContainer;
  private logger!: StructuredLogger;
  private pathManager!: ObsidianPathManager;
  private dataManager!: PluginDataManager<ClaudesidianSettings>;
  private vaultOperations!: VaultOperations;
  
  // Business services
  private connector!: MCPConnector;
  private settingsTab!: SettingsTab;
  
  // Service initialization state
  private initializationStartTime: number = 0;
  private foundationReady: boolean = false;
  private coreReady: boolean = false;
  private businessReady: boolean = false;

  /**
   * Plugin onload - Clean initialization sequence
   */
  async onload(): Promise<void> {
    this.initializationStartTime = performance.now();
    
    try {
      // Phase 1: Foundation Services (no dependencies)
      await this.initializeFoundationServices();
      this.foundationReady = true;
      
      // Phase 2: Core Services (foundation dependencies) 
      await this.initializeCoreServices();
      this.coreReady = true;
      
      // Phase 3: Business Services (core dependencies)
      await this.initializeBusinessServices();
      this.businessReady = true;
      
      // Phase 4: UI Services (business dependencies)
      await this.initializeUIServices();
      
      // Complete initialization
      await this.completeInitialization();
      
    } catch (error) {
      this.handleInitializationError(error);
    }
  }

  /**
   * Phase 1: Initialize foundation services with no dependencies
   */
  private async initializeFoundationServices(): Promise<void> {
    this.logger.time('Foundation Services');
    
    // Create service container
    this.container = new ServiceContainer();
    
    // Initialize structured logger
    this.logger = new StructuredLogger(this);
    this.container.register('logger', () => this.logger);
    
    // Initialize path manager with manifest
    this.pathManager = new ObsidianPathManager(this.app.vault, this.manifest);
    this.container.register('pathManager', () => this.pathManager);
    
    // Initialize data manager with schema validation
    this.dataManager = new PluginDataManager(this, DEFAULT_SETTINGS, this.createSettingsSchema());
    await this.dataManager.load();
    this.container.register('dataManager', () => this.dataManager);
    
    // Apply logger configuration from settings
    const loggingConfig = this.dataManager.get('logging');
    await this.logger.updateConfig(loggingConfig);
    
    this.logger.timeEnd('Foundation Services');
    this.logger.info('Foundation services initialized successfully');
  }

  /**
   * Phase 2: Initialize core services with foundation dependencies
   */
  private async initializeCoreServices(): Promise<void> {
    this.logger.time('Core Services');
    
    // Initialize vault operations
    this.vaultOperations = new VaultOperations(this.app.vault, this.pathManager, this.logger);
    this.container.register('vaultOperations', () => this.vaultOperations);
    
    // Ensure plugin data directories exist
    await this.ensureDataDirectories();
    
    // Register core event manager
    this.container.register('eventManager', async () => {
      const { EventManager } = await import('./services/EventManager');
      return new EventManager();
    }, { dependencies: ['logger'] });
    
    this.logger.timeEnd('Core Services');
    this.logger.info('Core services initialized successfully');
  }

  /**
   * Phase 3: Initialize business services with core dependencies
   */
  private async initializeBusinessServices(): Promise<void> {
    this.logger.time('Business Services');
    
    // Register vector store service
    this.container.register('vectorStore', async () => {
      const { ChromaVectorStoreModular } = await import('./database/providers/chroma/ChromaVectorStoreModular');
      const chromaDbPath = this.pathManager.getChromaDbPath();
      
      const vectorStore = new ChromaVectorStoreModular(this);
      
      await vectorStore.initialize();
      return vectorStore;
    }, { dependencies: ['logger', 'pathManager', 'vaultOperations'] });
    
    // Register embedding service
    this.container.register('embeddingService', async () => {
      const { EmbeddingService } = await import('./database/services/EmbeddingService');
      const { ProcessedFilesStateManager } = await import('./database/services/state/ProcessedFilesStateManager');
      const stateManager = new ProcessedFilesStateManager(this);
      
      return new EmbeddingService(this, stateManager);
    }, { dependencies: ['dataManager', 'logger'] });
    
    // Register memory service
    this.container.register('memoryService', async () => {
      const { MemoryService } = await import('./database/services/MemoryService');
      const vectorStore = await this.container.get<IVectorStore>('vectorStore');
      const embeddingService = await this.container.get('embeddingService') as any;
      const memorySettings = this.dataManager.get('memory');
      
      return new MemoryService(this, vectorStore, embeddingService, memorySettings);
    }, { dependencies: ['vectorStore', 'embeddingService', 'dataManager'] });
    
    // Initialize MCP connector
    this.connector = new MCPConnector(this.app, this);
    this.container.register('connector', () => this.connector);
    
    this.logger.timeEnd('Business Services');
    this.logger.info('Business services initialized successfully');
  }

  /**
   * Phase 4: Initialize UI services with business dependencies
   */
  private async initializeUIServices(): Promise<void> {
    this.logger.time('UI Services');
    
    // Initialize MCP connector with agents
    await this.connector.initializeAgents();
    await this.connector.start();
    
    // Create settings tab
    this.settingsTab = new SettingsTab(
      this.app,
      this,
      new Settings(this), // Compatibility wrapper
      this.container.getAllServiceMetadata(),
      this.connector.getVaultLibrarian() || undefined,
      this.connector.getMemoryManager() || undefined,
      this.container as any // Service manager compatibility
    );
    this.addSettingTab(this.settingsTab);
    
    // Register essential commands
    this.registerCommands();
    
    this.logger.timeEnd('UI Services');
    this.logger.info('UI services initialized successfully');
  }

  /**
   * Complete initialization with final setup
   */
  private async completeInitialization(): Promise<void> {
    const totalTime = performance.now() - this.initializationStartTime;
    
    // Show welcome notice if enabled
    if (this.dataManager.get('ui').showWelcomeNotice) {
      new Notice(`Claudesidian MCP Plugin loaded successfully in ${totalTime.toFixed(0)}ms`, 3000);
    }
    
    // Log completion
    this.logger.info('Plugin initialization completed', {
      totalTime: `${totalTime.toFixed(2)}ms`,
      servicesRegistered: this.container.getRegisteredServices().length,
      servicesReady: this.container.getReadyServices().length
    });
    
    // Validate dependency graph
    const validation = this.container.validateDependencies();
    if (!validation.valid) {
      this.logger.warn('Dependency validation issues detected', { cycles: validation.cycles });
    }
    
    // Start background optimizations
    this.startBackgroundOptimizations();
  }

  /**
   * Handle initialization errors gracefully
   */
  private handleInitializationError(error: any): void {
    console.error('[ClaudesidianPlugin] Initialization failed:', error);
    
    // Show user-friendly error
    new Notice('Claudesidian MCP Plugin failed to initialize. Check console for details.', 8000);
    
    // Try to initialize logger for error reporting
    if (!this.logger) {
      try {
        this.logger = new StructuredLogger(this);
      } catch (loggerError) {
        console.error('[ClaudesidianPlugin] Failed to initialize logger:', loggerError);
        return;
      }
    }
    
    this.logger.error('Plugin initialization failed', error instanceof Error ? error : new Error(String(error)));
    
    // Attempt partial functionality
    this.enableFallbackMode();
  }

  /**
   * Enable fallback mode with minimal functionality
   */
  private enableFallbackMode(): void {
    try {
      // Register basic command for troubleshooting
      this.addCommand({
        id: 'troubleshoot',
        name: 'Troubleshoot plugin issues',
        callback: () => {
          const message = 'Plugin failed to initialize. Check the console for error details.';
          new Notice(message, 10000);
          console.log('[ClaudesidianPlugin] Troubleshooting info:', {
            foundationReady: this.foundationReady,
            coreReady: this.coreReady,
            businessReady: this.businessReady,
            containerServices: this.container?.getRegisteredServices() || []
          });
        }
      });
      
      this.logger?.info('Fallback mode enabled with basic troubleshooting');
    } catch (fallbackError) {
      console.error('[ClaudesidianPlugin] Fallback mode setup failed:', fallbackError);
    }
  }

  /**
   * Ensure plugin data directories exist using Vault API
   */
  private async ensureDataDirectories(): Promise<void> {
    try {
      const directories = [
        this.pathManager.getPluginDataPath(),
        this.pathManager.getChromaDbPath(),
        this.pathManager.getCachePath(),
        this.pathManager.getLogsPath(),
        this.pathManager.getBackupPath()
      ];
      
      for (const dir of directories) {
        await this.vaultOperations.ensureDirectory(dir);
      }
      
      // Update settings with correct paths
      await this.dataManager.update(settings => ({
        ...settings,
        memory: {
          ...settings.memory,
          dbStoragePath: this.pathManager.getChromaDbPath()
        }
      }));
      
      this.logger.debug('Data directories created successfully');
    } catch (error) {
      this.logger.error('Failed to create data directories', error as Error);
      throw error;
    }
  }

  /**
   * Register essential commands
   */
  private registerCommands(): void {
    // Service status command
    this.addCommand({
      id: 'check-service-status',
      name: 'Check service status',
      callback: async () => {
        const stats = this.container.getStats();
        const metadata = this.container.getAllServiceMetadata();
        
        const readyServices = Object.values(metadata).filter(m => m.initialized).length;
        const totalServices = Object.keys(metadata).length;
        
        const message = [
          `Services: ${readyServices}/${totalServices} ready`,
          `Registered: ${stats.registered}`,
          `Singletons: ${stats.singletons}`,
          `Memory: ${this.logger.getLogStats().totalEntries} log entries`
        ].join('\n');
        
        new Notice(message, 8000);
      }
    });
    
    // Export logs command
    this.addCommand({
      id: 'export-logs',
      name: 'Export debug logs',
      callback: async () => {
        try {
          const logs = await this.logger.exportLogs();
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `claudesidian-logs-${timestamp}.json`;
          
          await this.vaultOperations.writeFile(
            this.pathManager.joinPath(this.pathManager.getLogsPath(), filename),
            logs
          );
          
          new Notice(`Logs exported to ${filename}`, 5000);
        } catch (error) {
          new Notice('Failed to export logs', 3000);
          this.logger.error('Log export failed', error as Error);
        }
      }
    });
    
    // Toggle debug mode command
    this.addCommand({
      id: 'toggle-debug-mode',
      name: 'Toggle debug mode',
      callback: async () => {
        const currentMode = this.dataManager.get('logging').debugMode;
        await this.dataManager.set('logging', {
          ...this.dataManager.get('logging'),
          debugMode: !currentMode
        });
        await this.logger.setDebugMode(!currentMode);
        
        new Notice(`Debug mode ${!currentMode ? 'enabled' : 'disabled'}`, 3000);
      }
    });
  }

  /**
   * Start background optimizations
   */
  private startBackgroundOptimizations(): void {
    // Pre-initialize commonly used services
    setTimeout(async () => {
      try {
        const commonServices = ['embeddingService', 'memoryService'];
        await this.container.preInitializeMany(commonServices);
        this.logger.debug('Background service pre-initialization completed');
      } catch (error) {
        this.logger.warn('Background optimization failed', error);
      }
    }, 1000);
    
    // Periodic memory cleanup
    setInterval(() => {
      if (this.logger.getConfig().enablePerformanceLogging) {
        this.logger.logMemoryUsage('PeriodicCheck');
      }
    }, 60000); // Every minute
  }

  /**
   * Create settings schema for validation
   */
  private createSettingsSchema() {
    return {
      version: { type: 'string' as const, required: true },
      enabled: { type: 'boolean' as const, required: true },
      'api.endpoint': { type: 'string' as const },
      'memory.enabled': { type: 'boolean' as const },
      'logging.debugMode': { type: 'boolean' as const }
    };
  }

  /**
   * Get service instance (compatibility method)
   */
  async getService<T>(name: string, timeoutMs: number = 10000): Promise<T | null> {
    try {
      return await this.container.get<T>(name);
    } catch (error) {
      this.logger.warn(`Failed to get service '${name}'`, error);
      return null;
    }
  }

  /**
   * Get all services (compatibility method)
   */
  get services(): Record<string, any> {
    return Object.fromEntries(
      this.container.getReadyServices().map(name => [
        name,
        this.container.getIfReady(name)
      ])
    );
  }

  /**
   * Legacy service getters for compatibility
   */
  get vectorStore(): IVectorStore | null {
    return this.container.getIfReady<IVectorStore>('vectorStore');
  }

  get embeddingService(): EmbeddingService | null {
    return this.container.getIfReady<EmbeddingService>('embeddingService');
  }

  get memoryService(): MemoryService | null {
    return this.container.getIfReady<MemoryService>('memoryService');
  }

  get eventManager(): EventManager | null {
    return this.container.getIfReady<EventManager>('eventManager');
  }

  /**
   * Get connector instance
   */
  getConnector(): MCPConnector {
    return this.connector;
  }

  /**
   * Plugin onunload - Clean shutdown sequence
   */
  async onunload(): Promise<void> {
    this.logger?.info('Plugin unload started');
    
    try {
      // Stop MCP connector
      if (this.connector) {
        await this.connector.stop();
      }
      
      // Cleanup data manager (save any pending changes)
      if (this.dataManager) {
        this.dataManager.cleanup();
      }
      
      // Clear service container (with proper cleanup order)
      if (this.container) {
        this.container.clear();
      }
      
      // Final logger cleanup
      if (this.logger) {
        this.logger.info('Plugin unload completed successfully');
        this.logger.cleanup();
      }
      
    } catch (error) {
      console.error('[ClaudesidianPlugin] Error during cleanup:', error);
    }
  }
}