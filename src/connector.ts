import { App, Plugin } from 'obsidian';
import { MCPServer } from './server';
import { EventManager } from './services/EventManager';
import { AgentManager } from './services/AgentManager';
import {
    NoteReaderAgent,
    NoteEditorAgent,
    PaletteCommanderAgent,
    ProjectManagerAgent,
    VaultManagerAgent,
    VaultLibrarianAgent
} from './agents';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

/**
 * MCP Connector
 * Connects the plugin to the MCP server and initializes all agents
 */
export class MCPConnector {
    private server: MCPServer;
    private agentManager: AgentManager;
    private eventManager: EventManager;
    
    constructor(
        private app: App,
        private plugin: Plugin
    ) {
        this.eventManager = new EventManager();
        this.agentManager = new AgentManager(app, plugin, this.eventManager);
        this.server = new MCPServer(app, plugin, this.eventManager);
        
        // Initialize agents
        this.initializeAgents();
    }
    
    /**
     * Initialize all agents
     */
    private initializeAgents(): void {
        try {
            // Create and register all agents with the agent manager only
            const noteReaderAgent = new NoteReaderAgent(this.app);
            const noteEditorAgent = new NoteEditorAgent(this.app);
            const paletteCommanderAgent = new PaletteCommanderAgent(this.app);
            const projectManagerAgent = new ProjectManagerAgent(this.app);
            const vaultManagerAgent = new VaultManagerAgent(this.app);
            const vaultLibrarianAgent = new VaultLibrarianAgent(this.app);
            
            // Register with agent manager
            this.agentManager.registerAgent(noteReaderAgent);
            this.agentManager.registerAgent(noteEditorAgent);
            this.agentManager.registerAgent(paletteCommanderAgent);
            this.agentManager.registerAgent(projectManagerAgent);
            this.agentManager.registerAgent(vaultManagerAgent);
            this.agentManager.registerAgent(vaultLibrarianAgent);
            
            // Register all agents from the agent manager with the server
            this.registerAgentsWithServer();
            
            console.log('All agents initialized successfully');
        } catch (error) {
            console.error('Error initializing agents:', error);
            if (error instanceof McpError) {
                throw error;
            }
            throw new McpError(
                ErrorCode.InternalError,
                'Failed to initialize agents',
                error
            );
        }
    }
    
    /**
     * Register all agents from the agent manager with the server
     */
    private registerAgentsWithServer(): void {
        try {
            const agents = this.agentManager.getAgents();
            for (const agent of agents) {
                this.server.registerAgent(agent);
            }
        } catch (error) {
            console.error('Error registering agents with server:', error);
            if (error instanceof McpError) {
                throw error;
            }
            throw new McpError(
                ErrorCode.InternalError,
                'Failed to register agents with server',
                error
            );
        }
    }
    
    /**
     * Start the MCP server
     */
    async start(): Promise<void> {
        try {
            await this.server.start();
        } catch (error) {
            console.error('Error starting MCP server:', error);
            if (error instanceof McpError) {
                throw error;
            }
            throw new McpError(
                ErrorCode.InternalError,
                'Failed to start MCP server',
                error
            );
        }
    }
    
    /**
     * Stop the MCP server
     */
    async stop(): Promise<void> {
        try {
            await this.server.stop();
        } catch (error) {
            console.error('Error stopping MCP server:', error);
            if (error instanceof McpError) {
                throw error;
            }
            throw new McpError(
                ErrorCode.InternalError,
                'Failed to stop MCP server',
                error
            );
        }
    }
    
    /**
     * Get the MCP server instance
     */
    getServer(): MCPServer {
        return this.server;
    }
    
    /**
     * Get the agent manager instance
     */
    getAgentManager(): AgentManager {
        return this.agentManager;
    }
    
    /**
     * Get the event manager instance
     */
    getEventManager(): EventManager {
        return this.eventManager;
    }
}