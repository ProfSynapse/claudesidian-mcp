# Phase 1: Setup Base Structure

This phase focuses on creating the foundational structure for the agent-based architecture. We'll set up the directory structure, implement base interfaces and classes, core services, shared utilities, and update the settings and types.

## Step 1: Create Directory Structure

First, create the necessary directories for the new structure:

```bash
# Create main directories
mkdir -p src/components
mkdir -p src/services
mkdir -p src/utils
mkdir -p src/agents/interfaces

# Create agent directories
mkdir -p src/agents/noteReader/utils/
mkdir -p src/agents/noteReader/tools/
mkdir -p src/agents/noteEditor/utils/
mkdir -p src/agents/noteEditor/tools/
mkdir -p src/agents/paletteCommander/tools/
mkdir -p src/agents/projectManager/tools/
mkdir -p src/agents/vaultManager/utils/
mkdir -p src/agents/vaultManager/tools/
mkdir -p src/agents/vaultLibrarian/utils/
mkdir -p src/agents/vaultLibrarian/tools/
```

## Step 2: Implement Base Interfaces

### Create IAgent Interface

Create the file `src/agents/interfaces/IAgent.ts`:

```typescript
import { ITool } from './ITool';

/**
 * Interface for agents in the MCP plugin
 * Each agent is responsible for a specific domain and provides a set of tools
 */
export interface IAgent {
  /**
   * Name of the agent
   */
  name: string;
  
  /**
   * Description of the agent
   */
  description: string;
  
  /**
   * Version of the agent
   */
  version: string;
  
  /**
   * Get all tools provided by this agent
   * @returns Array of tools
   */
  getTools(): ITool[];
  
  /**
   * Initialize the agent
   * @returns Promise that resolves when initialization is complete
   */
  initialize(): Promise<void>;
  
  /**
   * Execute a tool by name
   * @param toolName Name of the tool to execute
   * @param args Arguments to pass to the tool
   * @returns Promise that resolves with the tool's result
   */
  executeTool(toolName: string, args: any): Promise<any>;
}
```

### Create ITool Interface

Create the file `src/agents/interfaces/ITool.ts`:

```typescript
/**
 * Interface for tools in the MCP plugin
 * Each tool provides a specific functionality within an agent's domain
 */
export interface ITool<T = any, R = any> {
  /**
   * Name of the tool
   */
  name: string;
  
  /**
   * Description of the tool
   */
  description: string;
  
  /**
   * Version of the tool
   */
  version: string;
  
  /**
   * Execute the tool with arguments
   * @param args Arguments for the tool
   * @returns Promise that resolves with the tool's result
   */
  execute(args: T): Promise<R>;
  
  /**
   * Get the JSON schema for the tool
   * @returns JSON schema object
   */
  getSchema(): any;
}
```

## Step 3: Implement Base Classes

### Create BaseAgent Class

Create the file `src/agents/baseAgent.ts`:

```typescript
import { IAgent } from './interfaces/IAgent';
import { ITool } from './interfaces/ITool';

/**
 * Base class for all agents in the MCP plugin
 * Provides common functionality for agent implementation
 */
export abstract class BaseAgent implements IAgent {
  name: string;
  description: string;
  version: string;
  protected tools: Map<string, ITool> = new Map();
  
  /**
   * Create a new agent
   * @param name Name of the agent
   * @param description Description of the agent
   * @param version Version of the agent
   */
  constructor(name: string, description: string, version: string) {
    this.name = name;
    this.description = description;
    this.version = version;
  }
  
  /**
   * Get all tools provided by this agent
   * @returns Array of tools
   */
  getTools(): ITool[] {
    return Array.from(this.tools.values());
  }
  
  /**
   * Register a tool with this agent
   * @param tool Tool to register
   */
  registerTool(tool: ITool): void {
    this.tools.set(tool.name, tool);
  }
  
  /**
   * Initialize the agent
   * Default implementation does nothing
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    // Default implementation does nothing
  }
  
  /**
   * Execute a tool by name
   * @param toolName Name of the tool to execute
   * @param args Arguments to pass to the tool
   * @returns Promise that resolves with the tool's result
   * @throws Error if tool not found
   */
  async executeTool(toolName: string, args: any): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found in agent ${this.name}`);
    }
    
    return await tool.execute(args);
  }
}
```

### Create BaseTool Class

Create the file `src/agents/baseTool.ts`:

```typescript
import { ITool } from './interfaces/ITool';

/**
 * Base class for all tools in the MCP plugin
 * Provides common functionality for tool implementation
 */
export abstract class BaseTool<T = any, R = any> implements ITool<T, R> {
  name: string;
  description: string;
  version: string;
  
  /**
   * Create a new tool
   * @param name Name of the tool
   * @param description Description of the tool
   * @param version Version of the tool
   */
  constructor(name: string, description: string, version: string) {
    this.name = name;
    this.description = description;
    this.version = version;
  }
  
  /**
   * Execute the tool with arguments
   * @param args Arguments for the tool
   * @returns Promise that resolves with the tool's result
   */
  abstract execute(args: T): Promise<R>;
  
  /**
   * Get the JSON schema for the tool
   * @returns JSON schema object
   */
  abstract getSchema(): any;
}
```

## Step 4: Implement Core Services

### Create EventManager

Create the file `src/services/EventManager.ts`:

```typescript
/**
 * Event management service
 * Provides a simple event system for communication between components
 */
export class EventManager {
  private eventListeners: Map<string, Array<(data: any) => void>> = new Map();
  
  /**
   * Register an event listener
   * @param event Event name
   * @param callback Callback function to execute when event is emitted
   */
  on(event: string, callback: (data: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    
    this.eventListeners.get(event)?.push(callback);
  }
  
  /**
   * Remove an event listener
   * @param event Event name
   * @param callback Callback function to remove
   */
  off(event: string, callback: (data: any) => void): void {
    if (!this.eventListeners.has(event)) {
      return;
    }
    
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }
  
  /**
   * Emit an event
   * @param event Event name
   * @param data Data to pass to listeners
   */
  emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        listener(data);
      }
    }
  }
}
```

### Create AgentManager

Create the file `src/services/AgentManager.ts`:

```typescript
import { IAgent } from '../agents/interfaces/IAgent';
import { App } from 'obsidian';
import { EventManager } from './EventManager';

/**
 * Agent management service
 * Manages agent registration, initialization, and execution
 */
export class AgentManager {
  private agents: Map<string, IAgent> = new Map();
  
  /**
   * Create a new agent manager
   * @param app Obsidian app instance
   * @param plugin Plugin instance
   * @param eventManager Event manager instance
   */
  constructor(
    private app: App,
    private plugin: any,
    private eventManager: EventManager
  ) {}
  
  /**
   * Register an agent
   * @param agent Agent to register
   * @throws Error if agent with same name is already registered
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
   * @returns Agent instance
   * @throws Error if agent not found
   */
  getAgent(name: string): IAgent {
    const agent = this.agents.get(name);
    if (!agent) {
      throw new Error(`Agent ${name} not found`);
    }
    
    return agent;
  }
  
  /**
   * Get all registered agents
   * @returns Array of agent instances
   */
  getAgents(): IAgent[] {
    return Array.from(this.agents.values());
  }
  
  /**
   * Execute a tool on an agent
   * @param agentName Name of the agent
   * @param toolName Name of the tool
   * @param args Arguments to pass to the tool
   * @returns Promise that resolves with the tool's result
   */
  async executeAgentTool(agentName: string, toolName: string, args: any): Promise<any> {
    const agent = this.getAgent(agentName);
    return await agent.executeTool(toolName, args);
  }
  
  /**
   * Initialize all registered agents
   * @returns Promise that resolves when all agents are initialized
   */
  async initializeAgents(): Promise<void> {
    for (const agent of this.agents.values()) {
      await agent.initialize();
    }
  }
}
```

## Step 5: Set Up Shared Utilities

### Copy pathUtils.ts

Copy the existing `src_old/utils/pathUtils.ts` file to `src/utils/pathUtils.ts`. Make sure to update any imports if necessary.

## Step 6: Implement Settings and Types

### Create types.ts

Create the file `src/types.ts`:

```typescript
import { App, TFile, Command } from 'obsidian';

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
```

### Create settings.ts

Create the file `src/settings.ts`:

```typescript
import { Plugin } from 'obsidian';
import { MCPSettings, DEFAULT_SETTINGS } from './types';

/**
 * Settings manager
 * Handles loading and saving plugin settings
 */
export class Settings {
    private plugin: Plugin;
    settings: MCPSettings;

    /**
     * Create a new settings manager
     * @param plugin Plugin instance
     */
    constructor(plugin: Plugin) {
        this.plugin = plugin;
        this.settings = DEFAULT_SETTINGS;
    }

    /**
     * Load settings from plugin data
     */
    async loadSettings() {
        console.log('Settings: Loading settings');
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.plugin.loadData());
        console.log('Settings: Settings loaded', this.settings);
    }

    /**
     * Save settings to plugin data
     */
    async saveSettings() {
        console.log('Settings: Saving settings', this.settings);
        await this.plugin.saveData(this.settings);
        console.log('Settings: Settings saved');
    }
}

// Re-export types and constants from types.ts
export type { MCPSettings };
export { DEFAULT_SETTINGS };
```

## Step 7: Implement UI Components

### Create SettingsTab.ts

Create the file `src/components/SettingsTab.ts`:

```typescript
import { App, PluginSettingTab, Setting } from 'obsidian';
import { Settings } from '../settings';

/**
 * Settings tab for the plugin
 * Displays settings in the Obsidian settings panel
 */
export class SettingsTab extends PluginSettingTab {
    private settings: Settings;
    
    /**
     * Create a new settings tab
     * @param app Obsidian app instance
     * @param settings Settings manager instance
     */
    constructor(app: App, settings: Settings) {
        super(app, settings.plugin);
        this.settings = settings;
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
        
        // Add settings for agents if needed
    }
}
```

### Create ConfigModal.ts

Create the file `src/components/ConfigModal.ts`:

```typescript
import { App, Modal, Setting } from 'obsidian';

/**
 * Configuration modal for the plugin
 * Displays configuration options in a modal dialog
 */
export class ConfigModal extends Modal {
    /**
     * Create a new configuration modal
     * @param app Obsidian app instance
     */
    constructor(app: App) {
        super(app);
    }
    
    /**
     * Called when the modal is opened
     */
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'MCP Configuration' });
        
        // Add configuration options for agents
        
        new Setting(contentEl)
            .setName('Close')
            .setDesc('Close this modal')
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

## Step 8: Create Empty Files for Phase 2

Create empty files for each agent and tool that will be implemented in Phase 2. This ensures the directory structure is complete and ready for the next phase.

```bash
# Create empty files for each agent
touch src/agents/noteReader/noteReader.ts
touch src/agents/noteReader/config.ts
touch src/agents/noteReader/types.ts
touch src/agents/noteReader/utils/ReadOperations.ts
touch src/agents/noteReader/tools/index.ts
touch src/agents/noteReader/tools/readNote.ts
touch src/agents/noteReader/tools/batchRead.ts
touch src/agents/noteReader/tools/readLine.ts

touch src/agents/noteEditor/noteEditor.ts
touch src/agents/noteEditor/config.ts
touch src/agents/noteEditor/types.ts
touch src/agents/noteEditor/utils/EditOperations.ts
touch src/agents/noteEditor/tools/index.ts
touch src/agents/noteEditor/tools/singleEdit.ts
touch src/agents/noteEditor/tools/batchEdit.ts

touch src/agents/paletteCommander/paletteCommander.ts
touch src/agents/paletteCommander/config.ts
touch src/agents/paletteCommander/types.ts
touch src/agents/paletteCommander/tools/index.ts
touch src/agents/paletteCommander/tools/listCommands.ts
touch src/agents/paletteCommander/tools/executeCommand.ts

touch src/agents/projectManager/projectManager.ts
touch src/agents/projectManager/config.ts
touch src/agents/projectManager/types.ts
touch src/agents/projectManager/tools/index.ts
touch src/agents/projectManager/tools/projectPlan.ts
touch src/agents/projectManager/tools/askQuestion.ts
touch src/agents/projectManager/tools/checkpoint.ts

touch src/agents/vaultManager/vaultManager.ts
touch src/agents/vaultManager/config.ts
touch src/agents/vaultManager/types.ts
touch src/agents/vaultManager/utils/FileOperations.ts
touch src/agents/vaultManager/tools/index.ts
touch src/agents/vaultManager/tools/createNote.ts
touch src/agents/vaultManager/tools/createFolder.ts
touch src/agents/vaultManager/tools/deleteNote.ts
touch src/agents/vaultManager/tools/deleteFolder.ts
touch src/agents/vaultManager/tools/moveNote.ts
touch src/agents/vaultManager/tools/moveFolder.ts

touch src/agents/vaultLibrarian/vaultLibrarian.ts
touch src/agents/vaultLibrarian/config.ts
touch src/agents/vaultLibrarian/types.ts
touch src/agents/vaultLibrarian/utils/SearchOperations.ts
touch src/agents/vaultLibrarian/tools/index.ts
touch src/agents/vaultLibrarian/tools/searchContent.ts
touch src/agents/vaultLibrarian/tools/searchTag.ts
touch src/agents/vaultLibrarian/tools/searchProperty.ts
touch src/agents/vaultLibrarian/tools/listFolder.ts
touch src/agents/vaultLibrarian/tools/listNote.ts
touch src/agents/vaultLibrarian/tools/listTag.ts
touch src/agents/vaultLibrarian/tools/listProperties.ts
```

## Verification

After completing Phase 1, you should have the following structure in place:

1. Directory structure for the entire project
2. Base interfaces (IAgent, ITool)
3. Base classes (BaseAgent, BaseTool)
4. Core services (EventManager, AgentManager)
5. Shared utilities (pathUtils)
6. Settings and types (settings.ts, types.ts)
7. UI components (SettingsTab, ConfigModal)
8. Empty files for all agents and tools

You can verify this by running:

```bash
find src -type f | sort
```

This should list all the files created in this phase. Make sure all the expected files are present before proceeding to Phase 2.