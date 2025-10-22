import { App, Plugin } from 'obsidian';
import ClaudesidianPlugin from '../../main';
import { AgentManager } from '../AgentManager';
import { EventManager } from '../EventManager';
import type { ServiceManager } from '../../core/ServiceManager';
import { AgentFactoryRegistry } from '../../core/ServiceFactory';
import {
    ContentManagerAgent,
    CommandManagerAgent,
    VaultManagerAgent,
    VaultLibrarianAgent,
    MemoryManagerAgent,
    AgentManagerAgent
} from '../../agents';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../../utils/logger';
import { CustomPromptStorageService } from "../../agents/agentManager/services/CustomPromptStorageService";
import { LLMProviderManager } from '../llm/providers/ProviderManager';
import { DEFAULT_LLM_PROVIDER_SETTINGS } from '../../types';
import { LLMValidationService } from '../llm/validation/ValidationService';

/**
 * Location: src/services/agent/AgentRegistrationService.ts
 * 
 * This service handles agent initialization and registration, including:
 * - Agent creation and configuration
 * - API key validation for agent capabilities
 * - Agent lifecycle management
 * - Service dependency injection
 * 
 * Used by: MCPConnector
 * Dependencies: All agent implementations, ServiceContainer, validation services
 */

export interface AgentRegistrationServiceInterface {
    /**
     * Initializes all configured agents
     * @returns Promise resolving to map of initialized agents
     * @throws InitializationError when agent initialization fails
     */
    initializeAllAgents(): Promise<Map<string, any>>;

    /**
     * Gets registered agent by name
     * @param name Agent name
     * @returns Agent instance or null if not found
     */
    getAgent(name: string): any | null;

    /**
     * Gets all registered agents
     * @returns Map of all registered agents
     */
    getAllAgents(): Map<string, any>;

    /**
     * Registers agents with server
     * @param registerFunction Function to register agents with server
     */
    registerAgentsWithServer(registerFunction: (agent: any) => void): void;

    /**
     * Gets agent registration status
     * @returns Registration status information
     */
    getRegistrationStatus(): AgentRegistrationStatus;
}

export interface AgentRegistrationStatus {
    /** Total number of registered agents */
    totalAgents: number;
    
    /** Number of successfully initialized agents */
    initializedAgents: number;
    
    /** Number of failed agent initializations */
    failedAgents: number;
    
    /** Agent initialization errors */
    initializationErrors: Record<string, Error>;
    
    /** Registration timestamp */
    registrationTime: Date;
    
    /** Time taken for registration in milliseconds */
    registrationDuration: number;
}

export class AgentRegistrationService implements AgentRegistrationServiceInterface {
    private agentManager: AgentManager;
    private registrationStatus: AgentRegistrationStatus;
    private initializationErrors: Record<string, Error> = {};
    private factoryRegistry: AgentFactoryRegistry;

    constructor(
        private app: App,
        private plugin: Plugin | ClaudesidianPlugin,
        private eventManager: EventManager,
        private serviceManager?: ServiceManager,
        private customPromptStorage?: CustomPromptStorageService
    ) {
        this.agentManager = new AgentManager(app, plugin, eventManager);
        this.factoryRegistry = new AgentFactoryRegistry();
        this.registrationStatus = {
            totalAgents: 0,
            initializedAgents: 0,
            failedAgents: 0,
            initializationErrors: {},
            registrationTime: new Date(),
            registrationDuration: 0
        };
    }

    /**
     * Initializes all configured agents using ServiceManager and constructor injection
     */
    async initializeAllAgentsWithServiceManager(): Promise<Map<string, any>> {
        if (!this.serviceManager) {
            throw new Error('ServiceManager is required for dependency injection');
        }

        const startTime = Date.now();
        this.registrationStatus.registrationTime = new Date();
        this.initializationErrors = {};

        try {
            logger.systemLog('Initializing agents with ServiceManager dependency injection...');

            const agentNames = ['contentManager', 'commandManager', 'vaultManager', 'vaultLibrarian', 'memoryManager', 'agentManager'];
            const initializedAgents = new Map<string, any>();

            for (const agentName of agentNames) {
                try {
                    await this.initializeAgentWithFactory(agentName);
                    const agent = this.agentManager.getAgent(agentName);
                    if (agent) {
                        initializedAgents.set(agentName, agent);
                    }
                } catch (error) {
                    this.initializationErrors[agentName] = error as Error;
                    logger.systemError(error as Error, `${agentName} Agent Initialization`);
                }
            }

            // Calculate final statistics
            this.registrationStatus = {
                totalAgents: agentNames.length,
                initializedAgents: initializedAgents.size,
                failedAgents: Object.keys(this.initializationErrors).length,
                initializationErrors: this.initializationErrors,
                registrationTime: this.registrationStatus.registrationTime,
                registrationDuration: Date.now() - startTime
            };

            logger.systemLog(`ServiceManager-based agent initialization completed - ${this.registrationStatus.initializedAgents}/${this.registrationStatus.totalAgents} agents initialized`);

            return initializedAgents;

        } catch (error) {
            this.registrationStatus.registrationDuration = Date.now() - startTime;
            logger.systemError(error as Error, 'Agent Registration with ServiceManager');
            throw new McpError(
                ErrorCode.InternalError,
                'Failed to initialize agents with ServiceManager',
                error
            );
        }
    }

    /**
     * Initialize single agent using factory pattern with dependency injection
     */
    private async initializeAgentWithFactory(agentName: string): Promise<void> {
        const factory = this.factoryRegistry.getFactory(agentName);
        if (!factory) {
            throw new Error(`No factory found for agent: ${agentName}`);
        }

        // Resolve dependencies using ServiceManager
        const dependencies = new Map<string, any>();
        for (const depName of factory.dependencies) {
            try {
                const dependency = await this.serviceManager!.getService(depName);
                dependencies.set(depName, dependency);
            } catch (error) {
                logger.systemWarn(`Optional dependency '${depName}' not available for agent '${agentName}': ${error}`);
                // For optional dependencies, continue without them
                dependencies.set(depName, null);
            }
        }

        // Create agent with injected dependencies
        const agent = await factory.create(dependencies, this.app, this.plugin);
        this.agentManager.registerAgent(agent);

        logger.systemLog(`${agentName} agent initialized successfully with dependency injection`);
    }

    /**
     * Initializes all configured agents (legacy method - maintain backward compatibility)
     */
    async initializeAllAgents(): Promise<Map<string, any>> {
        const startTime = Date.now();
        this.registrationStatus.registrationTime = new Date();
        this.initializationErrors = {};

        try {
            // Get memory settings to determine what to enable
            const memorySettings = this.plugin && (this.plugin as any).settings?.settings?.memory;
            const isMemoryEnabled = memorySettings?.enabled;
            
            // Validate API keys
            const hasValidLLMKeys = await this.validateLLMApiKeys();

            // Search modes disabled
            const enableSearchModes = false;
            
            // Enable LLM-dependent modes only if valid LLM API keys exist
            const enableLLMModes = hasValidLLMKeys;
            
            logger.systemLog(`Agent initialization started - Search modes: ${enableSearchModes}, LLM modes: ${enableLLMModes}`);
            
            // Log additional debugging info for AgentManager
            if (!hasValidLLMKeys) {
                const pluginSettings = (this.plugin as any)?.settings?.settings;
                const llmProviderSettings = pluginSettings?.llmProviders || DEFAULT_LLM_PROVIDER_SETTINGS;
                logger.systemLog(`LLM validation failed - Default provider: ${llmProviderSettings.defaultModel?.provider || 'none'}, Provider config exists: ${!!llmProviderSettings.providers}`);
            }

            // Initialize agents in order
            await this.initializeContentManager();
            await this.initializeCommandManager();
            await this.initializeVaultManager();
            await this.initializeAgentManager(enableLLMModes);
            await this.initializeVaultLibrarian(enableSearchModes, memorySettings);
            await this.initializeMemoryManager();
            // ChatAgent removed - native chatbot UI handles chat functionality
            logger.systemLog('Using native chatbot UI instead of ChatAgent');

            // Calculate final statistics
            const agents = this.agentManager.getAgents();
            this.registrationStatus = {
                totalAgents: agents.length,
                initializedAgents: agents.length - Object.keys(this.initializationErrors).length,
                failedAgents: Object.keys(this.initializationErrors).length,
                initializationErrors: this.initializationErrors,
                registrationTime: this.registrationStatus.registrationTime,
                registrationDuration: Date.now() - startTime
            };

            // Log conditional mode availability status
            if (!enableSearchModes && !enableLLMModes) {
                logger.systemLog("No valid API keys found - modes requiring API keys will be disabled");
            } else {
                if (!enableSearchModes) {
                    logger.systemLog("Search modes disabled");
                }
                if (!enableLLMModes) {
                    logger.systemLog("LLM modes disabled - no valid LLM API keys configured");
                }
            }

            logger.systemLog(`Agent initialization completed - ${this.registrationStatus.initializedAgents}/${this.registrationStatus.totalAgents} agents initialized`);

            return new Map(agents.map(agent => [agent.name, agent]));

        } catch (error) {
            this.registrationStatus.registrationDuration = Date.now() - startTime;
            
            logger.systemError(error as Error, 'Agent Registration');
            throw new McpError(
                ErrorCode.InternalError,
                'Failed to initialize agents',
                error
            );
        }
    }

    /**
     * Gets registered agent by name
     */
    getAgent(name: string): any | null {
        try {
            return this.agentManager.getAgent(name);
        } catch (error) {
            return null;
        }
    }

    /**
     * Gets all registered agents
     */
    getAllAgents(): Map<string, any> {
        const agents = this.agentManager.getAgents();
        return new Map(agents.map(agent => [agent.name, agent]));
    }

    /**
     * Registers agents with server
     */
    registerAgentsWithServer(registerFunction: (agent: any) => void): void {
        try {
            const agents = this.agentManager.getAgents();
            
            for (const agent of agents) {
                registerFunction(agent);
            }
            
            logger.systemLog(`Registered ${agents.length} agents with server`);
        } catch (error) {
            logger.systemError(error as Error, 'Agent Server Registration');
            throw new McpError(
                ErrorCode.InternalError,
                'Failed to register agents with server',
                error
            );
        }
    }

    /**
     * Gets agent registration status
     */
    getRegistrationStatus(): AgentRegistrationStatus {
        return { ...this.registrationStatus };
    }

    /**
     * Initialize ContentManager agent
     * @private
     */
    private async initializeContentManager(): Promise<void> {
        try {
            const contentManagerAgent = new ContentManagerAgent(
                this.app,
                this.plugin as ClaudesidianPlugin
            );
            
            this.agentManager.registerAgent(contentManagerAgent);
            logger.systemLog('ContentManager agent initialized successfully');
        } catch (error) {
            this.initializationErrors['contentManager'] = error as Error;
            logger.systemError(error as Error, 'ContentManager Agent Initialization');
        }
    }

    /**
     * Initialize CommandManager agent
     * @private
     */
    private async initializeCommandManager(): Promise<void> {
        try {
            // CommandManager with lazy memory service - NON-BLOCKING
            const memoryService = this.serviceManager ? 
                this.serviceManager.getServiceIfReady('memoryService') : null;
            
            const commandManagerAgent = new CommandManagerAgent(
                this.app,
                memoryService as any
            );
            
            this.agentManager.registerAgent(commandManagerAgent);
            logger.systemLog('CommandManager agent initialized successfully');
        } catch (error) {
            this.initializationErrors['commandManager'] = error as Error;
            logger.systemError(error as Error, 'CommandManager Agent Initialization');
        }
    }

    /**
     * Initialize VaultManager agent
     * @private
     */
    private async initializeVaultManager(): Promise<void> {
        try {
            const vaultManagerAgent = new VaultManagerAgent(this.app);
            
            this.agentManager.registerAgent(vaultManagerAgent);
            logger.systemLog('VaultManager agent initialized successfully');
        } catch (error) {
            this.initializationErrors['vaultManager'] = error as Error;
            logger.systemError(error as Error, 'VaultManager Agent Initialization');
        }
    }

    /**
     * Initialize AgentManager agent
     * @private
     */
    private async initializeAgentManager(enableLLMModes: boolean): Promise<void> {
        try {
            if (!this.customPromptStorage) {
                logger.systemWarn('AgentManager agent - no custom prompt storage available from constructor');
                // Try to create custom prompt storage directly if settings are available
                const pluginSettings = this.plugin && (this.plugin as any).settings;
                if (pluginSettings) {
                    try {
                        this.customPromptStorage = new CustomPromptStorageService(pluginSettings);
                        logger.systemLog('AgentManager - created custom prompt storage during initialization');
                    } catch (error) {
                        logger.systemError(error as Error, 'AgentManager - Failed to create custom prompt storage');
                        return;
                    }
                } else {
                    logger.systemError(new Error('Plugin settings not available'), 'AgentManager agent initialization');
                    return;
                }
            }

            // Initialize LLM Provider Manager if LLM modes are enabled
            let llmProviderManager: LLMProviderManager | null = null;
            let usageTracker: any = null;

            if (enableLLMModes) {
                try {
                    // Get LLM provider settings from plugin settings or use defaults
                    const pluginSettings = (this.plugin as any)?.settings?.settings;
                    const llmProviderSettings = pluginSettings?.llmProviders || DEFAULT_LLM_PROVIDER_SETTINGS;

                    // Create LLM Provider Manager
                    llmProviderManager = new LLMProviderManager(llmProviderSettings);

                    // Set VaultOperations for file reading from service manager
                    if (this.serviceManager) {
                        try {
                            const vaultOperations = await this.serviceManager.getService('vaultOperations');
                            if (vaultOperations) {
                                llmProviderManager.setVaultOperations(vaultOperations);
                            } else {
                                console.warn('VaultOperations service not yet initialized, file reading may not work');
                            }
                        } catch (error) {
                            console.warn('Failed to get VaultOperations from service manager:', error);
                        }
                    } else {
                        console.warn('ServiceManager not available, file reading may not work');
                    }

                    // Create usage tracker
                    const { UsageTracker } = await import('../UsageTracker');
                    usageTracker = new UsageTracker('llm', pluginSettings);

                } catch (error) {
                    logger.systemError(error as Error, 'LLM Provider Manager Initialization');
                    // Continue without LLM modes - basic prompt management will still work
                }
            } else {
                logger.systemLog('LLM modes disabled - AgentManager will function with prompt management only');
            }

            // Create AgentManagerAgent with constructor injection
            if (llmProviderManager && usageTracker) {
                const agentManagerAgent = new AgentManagerAgent(
                    (this.plugin as any).settings,
                    llmProviderManager,
                    this.agentManager,
                    usageTracker,
                    this.app.vault
                );

                this.agentManager.registerAgent(agentManagerAgent);
                logger.systemLog(`AgentManager agent created with full LLM support - LLM modes enabled: ${enableLLMModes}`);
            } else {
                // Create basic AgentManager with minimal dependencies for prompt management
                try {
                    // Create minimal LLM provider manager and usage tracker for basic functionality
                    const pluginSettings = (this.plugin as any)?.settings?.settings;
                    const llmProviderSettings = pluginSettings?.llmProviders || DEFAULT_LLM_PROVIDER_SETTINGS;

                    const minimalProviderManager = new LLMProviderManager(llmProviderSettings);
                    const { UsageTracker } = await import('../UsageTracker');
                    const minimalUsageTracker = new UsageTracker('llm', pluginSettings);

                    const agentManagerAgent = new AgentManagerAgent(
                        (this.plugin as any).settings,
                        minimalProviderManager,
                        this.agentManager,
                        minimalUsageTracker,
                        this.app.vault
                    );

                    this.agentManager.registerAgent(agentManagerAgent);
                    logger.systemLog('AgentManager agent created with basic support - LLM features may be limited');
                } catch (basicError) {
                    logger.systemError(basicError as Error, 'Basic AgentManager Creation');
                    logger.systemLog('AgentManager agent creation failed - prompt management features unavailable');
                }
            }
        } catch (error) {
            this.initializationErrors['agentManager'] = error as Error;
            logger.systemError(error as Error, 'AgentManager Agent Initialization');
        }
    }

    /**
     * Initialize VaultLibrarian agent
     * @private
     */
    private async initializeVaultLibrarian(enableSearchModes: boolean, memorySettings: any): Promise<void> {
        try {
            const vaultLibrarianAgent = new VaultLibrarianAgent(
                this.app,
                enableSearchModes  // Pass search modes enabled status
            );
            
            // Update VaultLibrarian with memory settings
            if (memorySettings) {
                vaultLibrarianAgent.updateSettings(memorySettings);
            }
            
            this.agentManager.registerAgent(vaultLibrarianAgent);
            logger.systemLog('VaultLibrarian agent initialized successfully');
        } catch (error) {
            this.initializationErrors['vaultLibrarian'] = error as Error;
            logger.systemError(error as Error, 'VaultLibrarian Agent Initialization');
        }
    }

    /**
     * Initialize MemoryManager agent
     * @private
     */
    private async initializeMemoryManager(): Promise<void> {
        try {
            // Get required services - try ServiceManager first, then plugin direct access
            let memoryService: any = null;
            let workspaceService: any = null;

            if (this.serviceManager) {
                memoryService = this.serviceManager.getServiceIfReady('memoryService');
                workspaceService = this.serviceManager.getServiceIfReady('workspaceService');
            } else {
                // Fallback to plugin's direct service access
                const pluginServices = (this.plugin as any).services;
                if (pluginServices) {
                    memoryService = pluginServices.memoryService;
                    workspaceService = pluginServices.workspaceService;
                }
            }

            if (!memoryService || !workspaceService) {
                logger.systemError(new Error(`Required services not available - memoryService: ${!!memoryService}, workspaceService: ${!!workspaceService}`), 'MemoryManager Agent Initialization');
                return;
            }

            const memoryManagerAgent = new MemoryManagerAgent(
                this.app,
                this.plugin,
                memoryService,
                workspaceService
            );

            this.agentManager.registerAgent(memoryManagerAgent);
            logger.systemLog('MemoryManager agent initialized successfully');
        } catch (error) {
            this.initializationErrors['memoryManager'] = error as Error;
            logger.systemError(error as Error, 'MemoryManager Agent Initialization');
        }
    }


    /**
     * Validate API keys for LLM providers used in agent modes
     * @private
     */
    private async validateLLMApiKeys(): Promise<boolean> {
        try {
            const pluginSettings = (this.plugin as any)?.settings?.settings;
            const llmProviderSettings = pluginSettings?.llmProviders || DEFAULT_LLM_PROVIDER_SETTINGS;
            
            const defaultProvider = llmProviderSettings.defaultModel?.provider;
            if (!defaultProvider) {
                return false;
            }

            const providerConfig = llmProviderSettings.providers?.[defaultProvider];
            if (!providerConfig?.apiKey) {
                return false;
            }

            // Validate with caching - this will use cached validation if available
            const validation = await LLMValidationService.validateApiKey(
                defaultProvider,
                providerConfig.apiKey,
                {
                    forceValidation: false,  // Use cache during startup
                    providerConfig: providerConfig,
                    onValidationSuccess: (hash: string, timestamp: number) => {
                        // Update validation state in settings
                        if (providerConfig) {
                            providerConfig.lastValidated = timestamp;
                            providerConfig.validationHash = hash;
                            // Save settings asynchronously
                            (this.plugin as any)?.settings?.saveSettings().catch((err: Error) => {
                                logger.systemError(err, 'Failed to save validation state');
                            });
                        }
                    }
                }
            );
            
            return validation.success;
        } catch (error) {
            logger.systemError(error as Error, 'LLM API Key Validation');
            return false;
        }
    }
}