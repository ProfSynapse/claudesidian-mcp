/**
 * MCPServer - Refactored following SOLID principles
 * Main orchestrator for MCP server operations
 */

import { App, Plugin } from 'obsidian';
import { IMCPServer, ServerStatus } from '../types';
import { IAgent } from '../agents/interfaces/IAgent';
import { EventManager } from '../services/EventManager';
import { SessionContextManager } from '../services/SessionContextManager';
import { CustomPromptStorageService } from '../database/services/CustomPromptStorageService';
import { Server as MCPSDKServer } from '@modelcontextprotocol/sdk/server/index.js';
import { RequestRouter } from '../handlers/RequestRouter';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errorUtils';

// Import specialized services
import { ServerConfiguration } from './services/ServerConfiguration';
import { AgentRegistry } from './services/AgentRegistry';
import { StdioTransportManager } from './transport/StdioTransportManager';
import { IPCTransportManager } from './transport/IPCTransportManager';
import { RequestHandlerFactory } from './handlers/RequestHandlerFactory';
import { ServerLifecycleManager } from './lifecycle/ServerLifecycleManager';
import { AgentExecutionManager } from './execution/AgentExecutionManager';

/**
 * Refactored MCP Server following SOLID principles
 * Orchestrates specialized services for server operations
 */
export class MCPServer implements IMCPServer {
    // Core SDK server
    private server: MCPSDKServer;
    
    // Specialized services following Dependency Injection principle
    private configuration: ServerConfiguration;
    private agentRegistry: AgentRegistry;
    private stdioTransportManager: StdioTransportManager;
    private ipcTransportManager: IPCTransportManager;
    private requestHandlerFactory: RequestHandlerFactory;
    private lifecycleManager: ServerLifecycleManager;
    private executionManager: AgentExecutionManager;
    
    // Request routing
    private requestRouter!: RequestRouter;

    constructor(
        private app: App,
        _plugin: Plugin,
        private eventManager: EventManager,
        private sessionContextManager?: SessionContextManager,
        serverName?: string,
        private customPromptStorage?: CustomPromptStorageService,
        private onToolCall?: (toolName: string, params: any) => Promise<void>,
        private onToolResponse?: (toolName: string, params: any, response: any, success: boolean, executionTime: number) => Promise<void>
    ) {
        // Initialize configuration service
        this.configuration = new ServerConfiguration(app, { serverName });
        
        // Initialize core SDK server
        this.server = this.createMCPSDKServer();
        
        // Initialize specialized services
        this.agentRegistry = new AgentRegistry();
        this.stdioTransportManager = new StdioTransportManager(this.server);
        this.ipcTransportManager = new IPCTransportManager(this.configuration, this.stdioTransportManager);
        this.executionManager = new AgentExecutionManager(this.agentRegistry, sessionContextManager);
        
        // Initialize request routing
        this.initializeRequestRouter();
        
        // Initialize request handlers
        this.requestHandlerFactory = new RequestHandlerFactory(
            this.server,
            this.requestRouter,
            this.onToolCall
        );
        
        // Initialize lifecycle manager
        this.lifecycleManager = new ServerLifecycleManager(
            this.agentRegistry,
            this.stdioTransportManager,
            this.ipcTransportManager,
            this.eventManager
        );
        
        // Setup handlers
        this.requestHandlerFactory.initializeHandlers();
    }

    /**
     * Create the MCP SDK server instance
     */
    private createMCPSDKServer(): MCPSDKServer {
        try {
            return new MCPSDKServer(
                this.configuration.getServerInfo(),
                this.configuration.getServerOptions()
            );
        } catch (error) {
            logger.systemError(error as Error, 'MCP SDK Server Creation');
            throw error;
        }
    }

    /**
     * Initialize the request router
     */
    private initializeRequestRouter(): void {
        try {
            this.requestRouter = new RequestRouter(
                this.app,
                this.agentRegistry.getAgents(),
                true, // isVaultEnabled
                this.configuration.getSanitizedVaultName(),
                this.sessionContextManager,
                this.customPromptStorage,
                this.onToolResponse
            );
        } catch (error) {
            logger.systemError(error as Error, 'Request Router Initialization');
            throw error;
        }
    }

    /**
     * Start the MCP server
     */
    async start(): Promise<void> {
        await this.lifecycleManager.startServer();
    }

    /**
     * Stop the MCP server
     */
    async stop(): Promise<void> {
        await this.lifecycleManager.stopServer();
    }

    /**
     * Check if the server is running
     */
    isRunning(): boolean {
        return this.lifecycleManager.isRunning();
    }

    /**
     * Get the current server status
     */
    getStatus(): ServerStatus {
        return this.lifecycleManager.getStatus();
    }

    /**
     * Register an agent with the server
     */
    registerAgent(agent: IAgent): void {
        this.agentRegistry.registerAgent(agent);
    }

    /**
     * Get an agent by name
     */
    getAgent(name: string): IAgent {
        return this.agentRegistry.getAgent(name);
    }

    /**
     * Get all registered agents
     */
    getAgents(): Map<string, IAgent> {
        return this.agentRegistry.getAgents();
    }

    /**
     * Get detailed help for a specific mode
     */
    getModeHelp(agentName: string, modeName: string): string {
        return this.executionManager.getModeHelp(agentName, modeName);
    }

    /**
     * Execute a mode on an agent
     */
    async executeAgentMode(agentName: string, mode: string, params: any): Promise<any> {
        return await this.executionManager.executeAgentModeWithValidation(agentName, mode, params);
    }

    /**
     * Get server configuration summary
     */
    getConfigurationSummary(): any {
        return this.configuration.getConfigurationSummary();
    }

    /**
     * Get server diagnostics
     */
    async getDiagnostics(): Promise<any> {
        return await this.lifecycleManager.getDiagnostics();
    }

    /**
     * Perform health check
     */
    async performHealthCheck(): Promise<any> {
        return await this.lifecycleManager.performHealthCheck();
    }

    /**
     * Get execution statistics
     */
    getExecutionStatistics(): any {
        return this.executionManager.getExecutionStatistics();
    }

    /**
     * Get request handler statistics
     */
    getRequestHandlerStatistics(): any {
        return this.requestHandlerFactory.getHandlerStatistics();
    }

    /**
     * Restart the server
     */
    async restart(): Promise<void> {
        await this.lifecycleManager.restartServer();
    }

    /**
     * Force shutdown (emergency stop)
     */
    async forceShutdown(): Promise<void> {
        await this.lifecycleManager.forceShutdown();
    }

    /**
     * Get detailed server status
     */
    getDetailedStatus(): any {
        return this.lifecycleManager.getDetailedStatus();
    }

    /**
     * Get agent statistics
     */
    getAgentStatistics(): any {
        return this.agentRegistry.getAgentStatistics();
    }

    /**
     * Get transport status
     */
    getTransportStatus(): {
        stdio: any;
        ipc: any;
    } {
        return {
            stdio: this.stdioTransportManager.getTransportStatus(),
            ipc: this.ipcTransportManager.getTransportStatus()
        };
    }

    /**
     * Validate execution parameters
     */
    validateExecutionParameters(agentName: string, mode: string, params: any): any {
        return this.executionManager.validateExecutionParameters(agentName, mode, params);
    }

    /**
     * Get execution context info
     */
    getExecutionContextInfo(sessionId?: string): any {
        return this.executionManager.getExecutionContextInfo(sessionId);
    }

    /**
     * Get agent mode schema
     */
    getAgentModeSchema(agentName: string, modeName: string): any {
        return this.executionManager.getAgentModeSchema(agentName, modeName);
    }

    /**
     * Update server configuration
     */
    updateConfiguration(updates: any): void {
        if (updates.capabilities) {
            this.configuration.updateCapabilities(updates.capabilities);
        }
    }

    /**
     * Reinitialize request router with current agents
     * Call this after agents have been registered
     */
    reinitializeRequestRouter(): void {
        try {
            this.requestRouter = new RequestRouter(
                this.app,
                this.agentRegistry.getAgents(),
                true, // isVaultEnabled
                this.configuration.getSanitizedVaultName(),
                this.sessionContextManager,
                this.customPromptStorage,
                this.onToolResponse // Callback should be available as class property
            );
            
            // Reinitialize request handlers with new router
            this.requestHandlerFactory = new RequestHandlerFactory(
                this.server,
                this.requestRouter,
                this.onToolCall
            );
            this.requestHandlerFactory.initializeHandlers();
        } catch (error) {
            logger.systemError(error as Error, 'Request Router Reinitialization');
            throw error;
        }
    }

    /**
     * Get server info
     */
    getServerInfo(): any {
        return {
            configuration: this.configuration.getConfigurationSummary(),
            status: this.getDetailedStatus(),
            agents: this.getAgentStatistics(),
            transports: this.getTransportStatus(),
            handlers: this.getRequestHandlerStatistics(),
            execution: this.getExecutionStatistics()
        };
    }
}