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
 * Interface for agent-mode tool call parameters
 */
export interface AgentModeParams {
    agent: string;
    mode: string;
    params: Record<string, any>;
}

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
     * Call a tool using the new agent-mode architecture
     *
     * @param params The agent, mode, and parameters for the tool call
     * @returns Promise that resolves with the result of the tool call
     *
     * @example
     * // Call the noteEditor agent in replace mode
     * connector.callTool({
     *   agent: "noteEditor",
     *   mode: "replace",
     *   params: {
     *     path: "file/root",
     *     search: "old text",
     *     replace: "new text"
     *   }
     * });
     */
    async callTool(params: AgentModeParams): Promise<any> {
        try {
            const { agent, mode, params: modeParams } = params;
            
            // Validate batch operations if they exist
            if (modeParams && modeParams.operations && Array.isArray(modeParams.operations)) {
                // Validate each operation in the batch
                modeParams.operations.forEach((operation: any, index: number) => {
                    if (!operation || typeof operation !== 'object') {
                        throw new McpError(
                            ErrorCode.InvalidParams,
                            `Invalid operation at index ${index} in batch operations: operation must be an object`
                        );
                    }
                    
                    if (!operation.type) {
                        throw new McpError(
                            ErrorCode.InvalidParams,
                            `Invalid operation at index ${index} in batch operations: missing 'type' property`
                        );
                    }
                    
                    if (!operation.path) {
                        throw new McpError(
                            ErrorCode.InvalidParams,
                            `Invalid operation at index ${index} in batch operations: missing 'path' property`
                        );
                    }
                });
            }
            
            // Validate batch read paths if they exist
            if (modeParams && modeParams.paths && Array.isArray(modeParams.paths)) {
                // Validate each path in the batch
                modeParams.paths.forEach((path: any, index: number) => {
                    if (typeof path !== 'string') {
                        throw new McpError(
                            ErrorCode.InvalidParams,
                            `Invalid path at index ${index} in batch paths: path must be a string`
                        );
                    }
                });
            }
            
            // Execute the mode using the server's executeAgentMode method
            return await this.server.executeAgentMode(agent, mode, modeParams);
        } catch (error) {
            console.error('Error calling tool:', error);
            if (error instanceof McpError) {
                throw error;
            }
            throw new McpError(
                ErrorCode.InvalidParams,
                error.message || 'Failed to call tool',
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