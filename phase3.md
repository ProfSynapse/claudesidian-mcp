# Phase 3: Update Core Components

This phase focuses on updating the core components of the plugin to work with the new agent-based architecture. We'll update the main.ts file, the server.ts file, and remove all AI-related functionality.

## Step 1: Update types.ts

First, let's update the types.ts file to remove AI-related settings and add agent-related types:

```typescript
import { App, TFile, Command } from 'obsidian';
import { IAgent } from './agents/interfaces/IAgent';

/**
 * Server status enum
 */
export type ServerStatus = 'initializing' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

/**
 * Extend App type to include commands
 */
declare module 'obsidian' {
    interface App {
        commands: {
            listCommands(): Command[];
            executeCommandById(id: string): Promise<void>;
            commands: { [id: string]: Command };
        };
    }
}

/**
 * Plugin settings interface
 * AI-related settings removed
 */
export interface MCPSettings {
    enabledVault: boolean;
    // Add any new settings needed for the agent-based architecture
}

/**
 * Default plugin settings
 */
export const DEFAULT_SETTINGS: MCPSettings = {
    enabledVault: true,
    // Add defaults for any new settings
};

/**
 * Vault manager interface
 */
export interface IVaultManager {
    app: App;
    ensureFolder(path: string): Promise<void>;
    folderExists(path: string): Promise<boolean>;
    createFolder(path: string): Promise<void>;
    createNote(path: string, content: string, options?: any): Promise<TFile>;
    readNote(path: string): Promise<string>;
    updateNote(path: string, content: string, options?: any): Promise<void>;
    deleteNote(path: string): Promise<void>;
    getNoteMetadata(path: string): Promise<any>;
}

/**
 * MCP Server interface
 */
export interface IMCPServer {
    start(): Promise<void>;
    stop(): Promise<void>;
    isRunning(): boolean;
    getStatus(): ServerStatus;
    registerAgent(agent: IAgent): void;
}
```

## Step 2: Update server.ts

Now, let's update the server.ts file to work with the new agent-based architecture:

```typescript
import { App, Plugin } from 'obsidian';
import { IMCPServer, ServerStatus } from './types';
import { IAgent } from './agents/interfaces/IAgent';
import { EventManager } from './services/EventManager';

/**
 * MCP Server implementation
 */
export class MCPServer implements IMCPServer {
    private status: ServerStatus = 'stopped';
    private agents: Map<string, IAgent> = new Map();
    
    constructor(
        private app: App,
        private plugin: Plugin,
        private eventManager: EventManager
    ) {}
    
    /**
     * Start the MCP server
     */
    async start(): Promise<void> {
        try {
            this.status = 'starting';
            
            // Initialize all registered agents
            for (const agent of this.agents.values()) {
                await agent.initialize();
            }
            
            this.status = 'running';
            this.eventManager.emit('server:started', null);
            console.log('MCP Server started');
        } catch (error) {
            this.status = 'error';
            console.error('Failed to start MCP server:', error);
            throw error;
        }
    }
    
    /**
     * Stop the MCP server
     */
    async stop(): Promise<void> {
        try {
            this.status = 'stopping';
            
            // Cleanup code here
            
            this.status = 'stopped';
            this.eventManager.emit('server:stopped', null);
            console.log('MCP Server stopped');
        } catch (error) {
            this.status = 'error';
            console.error('Failed to stop MCP server:', error);
            throw error;
        }
    }
    
    /**
     * Check if the server is running
     */
    isRunning(): boolean {
        return this.status === 'running';
    }
    
    /**
     * Get the current server status
     */
    getStatus(): ServerStatus {
        return this.status;
    }
    
    /**
     * Register an agent with the server
     * @param agent Agent to register
     */
    registerAgent(agent: IAgent): void {
        if (this.agents.has(agent.name)) {
            throw new Error(`Agent ${agent.name} is already registered`);
        }
        
        this.agents.set(agent.name, agent);
    }
    
    /**
     * Get an agent by name
     * @param name Name of the agent
     * @returns The agent instance
     */
    getAgent(name: string): IAgent {
        const agent = this.agents.get(name);
        if (!agent) {
            throw new Error(`Agent ${name} not found`);
        }
        
        return agent;
    }
    
    /**
     * Execute a tool on an agent
     * @param agentName Name of the agent
     * @param toolName Name of the tool
     * @param args Tool arguments
     * @returns Result of the tool execution
     */
    async executeAgentTool(agentName: string, toolName: string, args: any): Promise<any> {
        const agent = this.getAgent(agentName);
        return await agent.executeTool(toolName, args);
    }
    
    /**
     * Get all registered agents
     * @returns Map of agent names to agent instances
     */
    getAgents(): Map<string, IAgent> {
        return this.agents;
    }
}
```

## Step 3: Update connector.ts

Now, let's update the connector.ts file to work with the new agent-based architecture:

```typescript
import { App, Plugin } from 'obsidian';
import { MCPServer } from './server';
import { EventManager } from './services/EventManager';
import { AgentManager } from './services/AgentManager';
import { NoteReaderAgent } from './agents/noteReader/noteReader';
import { NoteEditorAgent } from './agents/noteEditor/noteEditor';
import { PaletteCommanderAgent } from './agents/paletteCommander/paletteCommander';
import { ProjectManagerAgent } from './agents/projectManager/projectManager';
import { VaultManagerAgent } from './agents/vaultManager/vaultManager';
import { VaultLibrarianAgent } from './agents/vaultLibrarian/vaultLibrarian';

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
        
        this.initializeAgents();
    }
    
    /**
     * Initialize all agents
     */
    private initializeAgents(): void {
        // Create and register all agents
        const noteReaderAgent = new NoteReaderAgent(this.app);
        const noteEditorAgent = new NoteEditorAgent(this.app);
        const paletteCommanderAgent = new PaletteCommanderAgent(this.app);
        const projectManagerAgent = new ProjectManagerAgent(this.app);
        const vaultManagerAgent = new VaultManagerAgent(this.app);
        const vaultLibrarianAgent = new VaultLibrarianAgent(this.app);
        
        // Register agents with the agent manager
        this.agentManager.registerAgent(noteReaderAgent);
        this.agentManager.registerAgent(noteEditorAgent);
        this.agentManager.registerAgent(paletteCommanderAgent);
        this.agentManager.registerAgent(projectManagerAgent);
        this.agentManager.registerAgent(vaultManagerAgent);
        this.agentManager.registerAgent(vaultLibrarianAgent);
        
        // Register agents with the server
        this.server.registerAgent(noteReaderAgent);
        this.server.registerAgent(noteEditorAgent);
        this.server.registerAgent(paletteCommanderAgent);
        this.server.registerAgent(projectManagerAgent);
        this.server.registerAgent(vaultManagerAgent);
        this.server.registerAgent(vaultLibrarianAgent);
    }
    
    /**
     * Start the MCP server
     */
    async start(): Promise<void> {
        await this.server.start();
    }
    
    /**
     * Stop the MCP server
     */
    async stop(): Promise<void> {
        await this.server.stop();
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
```

## Step 4: Update main.ts

Finally, let's update the main.ts file to use the new agent-based architecture:

```typescript
import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { MCPConnector } from './connector';
import { Settings } from './settings';
import { SettingsTab } from './components/SettingsTab';
import { ConfigModal } from './components/ConfigModal';

export default class ClaudesidianPlugin extends Plugin {
    private settings: Settings;
    private connector: MCPConnector;
    private settingsTab: SettingsTab;
    
    async onload() {
        console.log('Loading Claudesidian MCP plugin');
        
        // Initialize settings
        this.settings = new Settings(this);
        await this.settings.loadSettings();
        
        // Initialize connector
        this.connector = new MCPConnector(this.app, this);
        await this.connector.start();
        
        // Add settings tab
        this.settingsTab = new SettingsTab(this.app, this.settings);
        this.addSettingTab(this.settingsTab);
        
        // Add ribbon icon
        this.addRibbonIcon('bot', 'Claudesidian MCP', () => {
            new ConfigModal(this.app).open();
        });
        
        // Register commands
        this.addCommand({
            id: 'open-claudesidian-settings',
            name: 'Open Claudesidian Settings',
            callback: () => {
                this.app.setting.open();
                this.app.setting.openTabById(this.manifest.id);
            }
        });
        
        // Add additional commands for each agent
        this.registerAgentCommands();
        
        console.log('Claudesidian MCP plugin loaded');
    }
    
    /**
     * Register commands for each agent
     */
    private registerAgentCommands(): void {
        const agentManager = this.connector.getAgentManager();
        const agents = agentManager.getAgents();
        
        // Register commands for each agent
        for (const agent of agents) {
            // Example command for each agent
            this.addCommand({
                id: `claudesidian-${agent.name}`,
                name: `Execute ${agent.name}`,
                callback: () => {
                    // Open a modal or execute a default action for this agent
                    console.log(`Executing ${agent.name}`);
                }
            });
        }
    }
    
    async onunload() {
        console.log('Unloading Claudesidian MCP plugin');
        
        // Stop the MCP server
        await this.connector.stop();
    }
}
```

## Step 5: Update config.ts

Let's update the config.ts file to remove AI-related configuration:

```typescript
/**
 * Plugin configuration
 */
export const CONFIG = {
    /**
     * Plugin name
     */
    PLUGIN_NAME: 'Claudesidian MCP',
    
    /**
     * Plugin version
     */
    VERSION: '2.0.0',
    
    /**
     * Default port for the MCP server
     */
    DEFAULT_PORT: 3000,
    
    /**
     * Default host for the MCP server
     */
    DEFAULT_HOST: 'localhost',
    
    /**
     * Default timeout for requests (in milliseconds)
     */
    DEFAULT_TIMEOUT: 30000,
    
    /**
     * Maximum number of concurrent requests
     */
    MAX_CONCURRENT_REQUESTS: 5
};
```

## Step 6: Remove AI-related Functionality

Remove any AI-related files and code:

1. Delete any files related to AI providers (e.g., OpenRouterAdapter.ts, HttpClient.ts)
2. Remove any AI-related settings from the settings tab
3. Remove any AI-related commands from the main.ts file
4. Remove any AI-related functionality from the server.ts file

## Step 7: Update Components

Update the SettingsTab.ts file to remove AI-related settings:

```typescript
import { App, PluginSettingTab, Setting } from 'obsidian';
import { Settings } from '../settings';

/**
 * Settings tab for the plugin
 */
export class SettingsTab extends PluginSettingTab {
    private settings: Settings;
    
    /**
     * Create a new settings tab
     * @param app Obsidian app instance
     * @param settings Settings manager
     */
    constructor(app: App, private settingsManager: Settings) {
        super(app, settingsManager.plugin);
        this.settings = settingsManager;
    }
    
    /**
     * Display the settings tab
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        
        containerEl.createEl('h2', { text: 'Claudesidian MCP Settings' });
        
        new Setting(containerEl)
            .setName('Enable Vault Access')
            .setDesc('Allow MCP to access your vault')
            .addToggle(toggle => toggle
                .setValue(this.settings.settings.enabledVault)
                .onChange(async (value) => {
                    this.settings.settings.enabledVault = value;
                    await this.settings.saveSettings();
                }));
        
        // Add additional settings for agents if needed
    }
}
```

Update the ConfigModal.ts file to work with the new agent-based architecture:

```typescript
import { App, Modal, Setting } from 'obsidian';

/**
 * Configuration modal for the plugin
 */
export class ConfigModal extends Modal {
    /**
     * Create a new configuration modal
     * @param app Obsidian app instance
     */
    constructor(private app: App) {
        super(app);
    }
    
    /**
     * Called when the modal is opened
     */
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: 'MCP Configuration' });
        
        // Add configuration options for agents
        contentEl.createEl('h3', { text: 'Agents' });
        
        // Example: Add a section for each agent
        const agentNames = [
            'Note Reader',
            'Note Editor',
            'Palette Commander',
            'Project Manager',
            'Vault Manager',
            'Vault Librarian'
        ];
        
        for (const agentName of agentNames) {
            new Setting(contentEl)
                .setName(agentName)
                .setDesc(`Configure ${agentName}`)
                .addButton(button => button
                    .setButtonText('Configure')
                    .onClick(() => {
                        // Open agent-specific configuration
                        console.log(`Configure ${agentName}`);
                    }));
        }
        
        // Close button
        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Close')
                .onClick(() => {
                    this.close();
                }));
    }
    
    /**
     * Called when the modal is closed
     */
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
```

## Verification

After completing Phase 3, you should have updated all the core components to work with the new agent-based architecture. Verify that:

1. All AI-related functionality has been removed
2. The main.ts file initializes the connector and registers the agents
3. The connector.ts file initializes the agents and the server
4. The server.ts file handles agent registration and execution
5. The settings.ts file no longer contains AI-related settings
6. The components have been updated to work with the new architecture

Once you've verified these changes, you can proceed to Phase 4 for testing and finalization.