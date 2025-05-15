import { Plugin, WorkspaceLeaf } from "obsidian";
import { EventEmitter } from "./events/emitter";
import { StorageManager } from "./storage/manager";
import { ObsidianStorageAdapter } from "./storage/obsidian";
import { TypedEventEmitter, EventTypes, StorageEventTypes } from "./types";
import { ChatEventTypes } from "../chat/types";
import { MCPEventTypes } from "../mcp/types";
import { SettingsEventTypes } from "../settings/types"; // Import SettingsEventTypes
import { ChatView } from "../chat/components/ChatView";
import { ConversationManager } from "../chat/services/conversation";
import { MessageProcessor } from "../chat/services/processor";
import { MCPClient } from "../mcp/client/index";
import { SettingsManager } from "../settings/manager"; // Import SettingsManager
import { ChatsidianSettingTab } from "../settings/ui/SettingsTab"; // Import SettingsTab
// Import BCP related types if needed for server integration later
// import { BCP, ToolDefinition } from "./types";

/**
 * Defines the core event types for the plugin lifecycle and basic integration.
 * This will be extended by other modules (Chat, MCP, BCPs).
 */
interface CoreEventTypes extends EventTypes {
  'plugin:loaded': void;
  'plugin:unloading': void;
  'obsidian:layout-ready': void;
  // Add more core events as needed
}

// Combine all expected event types for the main emitter
export type AppEventTypes = CoreEventTypes & StorageEventTypes & ChatEventTypes & MCPEventTypes & SettingsEventTypes; // Combine all event types

/**
 * Main class for the Chatsidian Plugin.
 * Extends Obsidian's Plugin class and orchestrates the initialization
 * and lifecycle management of all core components and features.
 */
export class ChatsidianPlugin extends Plugin {
  // Publicly accessible core components
  // Use definite assignment assertion (!) as properties are initialized in onload
  public events!: TypedEventEmitter<AppEventTypes>;
  public storage!: StorageManager;
  public conversationManager!: ConversationManager;
  public messageProcessor!: MessageProcessor;
  public mcpClient!: MCPClient;
  public settingsManager!: SettingsManager; // Added

  // View type constants or enums can be defined here or imported
  public static readonly VIEW_TYPE_CHAT = "chatsidian-chat-view";

  /**
   * Called when the plugin is first loaded by Obsidian.
   * Responsible for setting up core services like event emitter and storage,
   * registering views, commands, and settings.
   */
  async onload() {
    console.log("Loading Chatsidian Plugin...");

    // 1. Initialize Core Services (Order matters!)
    this.events = new EventEmitter<AppEventTypes>();
    const storageAdapter = new ObsidianStorageAdapter(this);
    this.storage = new StorageManager(storageAdapter, this.events);

    // Initialize Settings Manager (Phase 4) - Load settings early
    this.settingsManager = new SettingsManager(this.storage, this.events);
    await this.settingsManager.loadSettings();

    // Initialize MCP Client (Phase 3) - Pass App and SettingsManager
    this.mcpClient = new MCPClient(this.app, this.events, this.storage, this.settingsManager);
    await this.mcpClient.initialize(); // Register meta-tools, load persisted BCPs

    // Initialize Chat Services (Phase 2)
    this.conversationManager = new ConversationManager(this.storage, this.events);
    // Pass mcpClient to MessageProcessor
    this.messageProcessor = new MessageProcessor(this.events, this.conversationManager, this.mcpClient);
    await this.conversationManager.initialize(); // Load last conversation etc.

    // 2. Register Obsidian Components
    this.registerViews();
    this.addCommands();
    this.addSettingTab(new ChatsidianSettingTab(this.app, this)); // Add settings tab

    // 3. Handle Layout Ready
    // Use 'workspace-layout-ready' event to ensure workspace is fully loaded
    this.app.workspace.onLayoutReady(this.onLayoutReady.bind(this));

    // 4. Emit loaded event
    this.events.emit('plugin:loaded', undefined);
    console.log("Chatsidian Plugin loaded.");
  }

  /**
   * Called when the plugin is being unloaded by Obsidian.
   * Responsible for cleaning up resources, unregistering listeners,
   * and saving any final state.
   */
  async onunload() {
    console.log("Unloading Chatsidian Plugin...");
    this.events.emit('plugin:unloading', undefined);

    // Perform cleanup (e.g., close connections, remove listeners)
    if (this.mcpClient) {
      await this.mcpClient.shutdown();
    }

    // Remove all event listeners managed by the core emitter
    this.events.removeAllListeners();

    console.log("Chatsidian Plugin unloaded.");
  }

  /**
   * Registers the custom views provided by the plugin.
   */
  private registerViews(): void {
    // Register Chat View
    this.registerView(
      ChatsidianPlugin.VIEW_TYPE_CHAT,
      (leaf) => new ChatView(leaf, this) // Pass plugin instance
    );
  }

  /**
   * Adds ribbon icons and commands to Obsidian.
   */
  private addCommands(): void {
    // Add Ribbon Icon to open Chat View
    this.addRibbonIcon("message-circle", "Open Chatsidian Chat", () => {
      this.activateView(ChatsidianPlugin.VIEW_TYPE_CHAT);
    });

    // Add Command Palette command to open Chat View
    this.addCommand({
      id: "open-chatsidian-chat",
      name: "Open Chat",
      callback: () => {
        this.activateView(ChatsidianPlugin.VIEW_TYPE_CHAT);
      },
    });

    // Add other commands as needed
  }

  /**
   * Called once the Obsidian workspace layout is fully ready.
   * Useful for operations that depend on the UI being initialized.
   */
  private onLayoutReady(): void {
    console.log("Obsidian layout ready.");
    this.events.emit('obsidian:layout-ready', undefined);
    // Example: Activate the chat view automatically if desired
    // this.activateView(ChatsidianPlugin.VIEW_TYPE_CHAT);
  }

  /**
   * Helper function to activate a specific view type in the workspace.
   * Ensures only one instance of the view exists and reveals it.
   * @param viewType The unique type string of the view to activate.
   */
  async activateView(viewType: string): Promise<void> {
    // Detach existing leaves of this type
    this.app.workspace.detachLeavesOfType(viewType);

    // Get a new leaf in the right sidebar
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      console.error("Could not get right leaf for view:", viewType);
      return;
    }

    // Set the view type for the leaf
    await leaf.setViewState({
      type: viewType,
      active: true,
    });

    // Reveal the leaf
    this.app.workspace.revealLeaf(leaf);
  }
}

// Placeholder for Settings Tab (Phase 4 - Now integrated)
// import { App, PluginSettingTab, Setting } from 'obsidian'; // Already imported in SettingsTab.ts
// class ChatsidianSettingTab extends PluginSettingTab { // Definition moved to SettingsTab.ts
//   plugin: ChatsidianPlugin;
//   constructor(app: App, plugin: ChatsidianPlugin) {
//     super(app, plugin);
//     this.plugin = plugin;
//   }
//   display(): void {
//     const { containerEl } = this;
//     containerEl.empty();
//     containerEl.createEl('h2', { text: 'Chatsidian Settings' });
//     // Add settings here...
//   }
// }
