import { App, Plugin } from 'obsidian';
import ClaudesidianPlugin from '../../main';
import { AgentManager } from '../AgentManager';
import { EventManager } from '../EventManager';
import type { ServiceManager } from '../../core/ServiceManager';
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
import { EmbeddingProviderManager } from '../../database/services/indexing/embedding/EmbeddingProviderManager';

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

    constructor(
        private app: App,
        private plugin: Plugin | ClaudesidianPlugin,
        private eventManager: EventManager,
        private serviceManager?: ServiceManager,
        private customPromptStorage?: CustomPromptStorageService
    ) {
        this.agentManager = new AgentManager(app, plugin, eventManager);
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
     * Initializes all configured agents
     */
    async initializeAllAgents(): Promise<Map<string, any>> {
        const startTime = Date.now();
        this.registrationStatus.registrationTime = new Date();
        this.initializationErrors = {};

        try {
            // Get memory settings to determine what to enable
            const memorySettings = this.plugin && (this.plugin as any).settings?.settings?.memory;
            const isMemoryEnabled = memorySettings?.enabled && memorySettings?.embeddingsEnabled;
            
            // Validate API keys
            const hasValidEmbeddingKeys = await this.validateEmbeddingApiKeys();
            const hasValidLLMKeys = await this.validateLLMApiKeys();
            
            // Enable vector modes only if memory is enabled AND valid embedding API keys exist
            const enableVectorModes = isMemoryEnabled && hasValidEmbeddingKeys;
            
            // Enable LLM-dependent modes only if valid LLM API keys exist
            const enableLLMModes = hasValidLLMKeys;
            
            logger.systemLog(`Agent initialization started - Vector modes: ${enableVectorModes}, LLM modes: ${enableLLMModes}`);

            // Initialize agents in order
            await this.initializeContentManager();
            await this.initializeCommandManager();
            await this.initializeVaultManager();
            await this.initializeAgentManager(enableLLMModes);
            await this.initializeVaultLibrarian(enableVectorModes, memorySettings);
            await this.initializeMemoryManager();

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
            if (!enableVectorModes && !enableLLMModes) {
                logger.systemLog("No valid API keys found - modes requiring API keys will be disabled");
            } else {
                if (!enableVectorModes) {
                    logger.systemLog("Vector modes disabled - no valid embedding API keys or memory disabled");
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
                logger.systemLog('AgentManager agent skipped - no custom prompt storage available');
                return;
            }

            const agentManagerAgent = new AgentManagerAgent((this.plugin as any).settings);

            // Initialize LLM Provider Manager if LLM modes are enabled
            if (enableLLMModes) {
                try {
                    // Get LLM provider settings from plugin settings or use defaults
                    const pluginSettings = (this.plugin as any)?.settings?.settings;
                    const llmProviderSettings = pluginSettings?.llmProviders || DEFAULT_LLM_PROVIDER_SETTINGS;
                    
                    // Create LLM Provider Manager
                    const llmProviderManager = new LLMProviderManager(llmProviderSettings);
                    
                    // Set up the provider manager on the agent
                    agentManagerAgent.setProviderManager(llmProviderManager);
                    
                    // Set the vault adapter for file reading
                    llmProviderManager.setVaultAdapter(this.app.vault.adapter);
                    
                    agentManagerAgent.setParentAgentManager(this.agentManager);
                    
                    // Create and inject LLM usage tracker (non-blocking)
                    import('../UsageTracker').then(({ UsageTracker }) => {
                        const llmUsageTracker = new UsageTracker('llm', pluginSettings);
                        agentManagerAgent.setUsageTracker(llmUsageTracker);
                    }).catch(error => {
                        logger.systemError(error as Error, 'LLM Usage Tracker Initialization');
                    });
                    
                } catch (error) {
                    logger.systemError(error as Error, 'LLM Provider Manager Initialization');
                }
            }
            
            this.agentManager.registerAgent(agentManagerAgent);
            logger.systemLog('AgentManager agent initialized successfully');
        } catch (error) {
            this.initializationErrors['agentManager'] = error as Error;
            logger.systemError(error as Error, 'AgentManager Agent Initialization');
        }
    }

    /**
     * Initialize VaultLibrarian agent
     * @private
     */
    private async initializeVaultLibrarian(enableVectorModes: boolean, memorySettings: any): Promise<void> {
        try {
            const vaultLibrarianAgent = new VaultLibrarianAgent(
                this.app,
                enableVectorModes  // Pass vector modes enabled status
            );
            
            // If vector modes are enabled, set up lazy initialization of search service
            if (enableVectorModes && this.serviceManager) {
                // Wait for service manager to complete initialization, then initialize search service
                setTimeout(async () => {
                    try {
                        // Check if vector store is ready (don't trigger initialization here)
                        const vectorStore = this.serviceManager?.getServiceIfReady('vectorStore');
                        if (vectorStore && vaultLibrarianAgent) {
                            // Initialize search service in background to avoid blocking
                            vaultLibrarianAgent.initializeSearchService().catch((error: any) => 
                                logger.systemError(error, 'VaultLibrarian Search Service Initialization')
                            );
                            
                            // Update VaultLibrarian with memory settings
                            if (memorySettings) {
                                vaultLibrarianAgent.updateSettings(memorySettings);
                            }
                        } else {
                            logger.systemLog('Vector store not ready, deferring VaultLibrarian initialization');
                        }
                    } catch (error) {
                        logger.systemError(error as Error, 'VaultLibrarian Search Service Setup');
                    }
                }, 15000); // Wait 15 seconds for service manager to complete
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
            const memoryManagerAgent = new MemoryManagerAgent(
                this.app,
                this.plugin
            );
            
            this.agentManager.registerAgent(memoryManagerAgent);
            logger.systemLog('MemoryManager agent initialized successfully');
        } catch (error) {
            this.initializationErrors['memoryManager'] = error as Error;
            logger.systemError(error as Error, 'MemoryManager Agent Initialization');
        }
    }

    /**
     * Validate embedding provider configuration
     * @private
     */
    private async validateEmbeddingApiKeys(): Promise<boolean> {
        try {
            const memorySettings = this.plugin && (this.plugin as any).settings?.settings?.memory;
            if (!memorySettings?.embeddingsEnabled) {
                return false;
            }

            // Use EmbeddingProviderManager to validate settings (handles Ollama and other providers correctly)
            const embeddingManager = new EmbeddingProviderManager();
            const isValid = embeddingManager['validateProviderSettings'](memorySettings);
            
            return isValid;
        } catch (error) {
            logger.systemError(error as Error, 'Embedding API Key Validation');
            return false;
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

            // Validate the API key
            const validation = await LLMValidationService.validateApiKey(defaultProvider, providerConfig.apiKey);
            return validation.success;
        } catch (error) {
            logger.systemError(error as Error, 'LLM API Key Validation');
            return false;
        }
    }
}