import { App, PluginSettingTab, Setting } from 'obsidian';
import { ChatsidianPlugin } from '../../core/plugin';
import { SettingsManager } from '../manager';
import { ChatsidianSettings } from '../types';

/**
 * Represents the settings tab for the Chatsidian plugin in Obsidian's settings panel.
 * Provides a UI for users to configure plugin settings.
 */
export class ChatsidianSettingTab extends PluginSettingTab {
  plugin: ChatsidianPlugin;
  settingsManager: SettingsManager; // Direct access for getting/saving

  /**
   * Creates an instance of ChatsidianSettingTab.
   * @param app The Obsidian App instance.
   * @param plugin The ChatsidianPlugin instance.
   */
  constructor(app: App, plugin: ChatsidianPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    // Assuming SettingsManager is initialized and available on the plugin instance
    // If not, it needs to be passed or accessed differently.
    // For now, let's assume it will be added to the plugin instance later.
    // this.settingsManager = plugin.settingsManager;
  }

  /**
   * Called by Obsidian to render the content of the settings tab.
   * Clears existing content and builds the settings UI elements.
   */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Chatsidian Settings' });

    // Check if settingsManager is available (it might not be if initialized later)
    if (!this.settingsManager) {
       // Temporarily assign from plugin if available (needs proper initialization order)
       if ((this.plugin as any).settingsManager) {
           this.settingsManager = (this.plugin as any).settingsManager;
       } else {
           containerEl.createEl('p', { text: 'Error: Settings Manager not initialized.' });
           console.error("Settings Tab: SettingsManager not found on plugin instance.");
           return;
       }
    }

    const currentSettings = this.settingsManager.getSettings();

    // --- General Settings ---
    containerEl.createEl('h3', { text: 'General' });

    new Setting(containerEl)
      .setName('Default Language Model')
      .setDesc('Select the default AI model to use for chats.')
      .addText(text => text
        .setPlaceholder('e.g., claude-3-opus-20240229')
        .setValue(currentSettings.general.defaultModel)
        .onChange(async (value) => {
          await this.settingsManager.updateSettings({ general: { ...currentSettings.general, defaultModel: value } });
        }));

    new Setting(containerEl)
      .setName('Log Level')
      .setDesc('Set the verbosity of plugin logs.')
      .addDropdown(dropdown => dropdown
        .addOptions({
          'debug': 'Debug',
          'info': 'Info',
          'warn': 'Warning',
            'error': 'Error'
          })
          .setValue(currentSettings.general.logLevel)
          // Accept string, then cast/validate
          .onChange(async (value: string) => {
             // Basic validation to ensure the string is one of the expected values
             if (['debug', 'info', 'warn', 'error'].includes(value)) {
               await this.settingsManager.updateSettings({
                 general: {
                   ...currentSettings.general,
                   logLevel: value as 'debug' | 'info' | 'warn' | 'error' // Cast after validation
                 }
               });
             } else {
               console.warn(`Invalid log level selected: ${value}`);
               // Optionally reset dropdown or show error
             }
          }));

     new Setting(containerEl)
      .setName('Auto-load BCPs on Startup')
      .setDesc('Enter BCP domain names to load automatically (comma-separated).')
      .addText(text => text
        .setPlaceholder('e.g., Notes,Vault')
        .setValue(currentSettings.general.autoLoadBCPs.join(','))
        .onChange(async (value) => {
          const domains = value.split(',').map(d => d.trim()).filter(d => d.length > 0);
          await this.settingsManager.updateSettings({ general: { ...currentSettings.general, autoLoadBCPs: domains } });
        }));


    // --- Chat Settings ---
    containerEl.createEl('h3', { text: 'Chat' });

    new Setting(containerEl)
      .setName('Show Welcome Message')
      .setDesc('Display a welcome message when opening an empty chat.')
      .addToggle(toggle => toggle
        .setValue(currentSettings.chat.showWelcomeMessage)
        .onChange(async (value) => {
          await this.settingsManager.updateSettings({ chat: { ...currentSettings.chat, showWelcomeMessage: value } });
        }));

    // --- MCP Settings ---
    containerEl.createEl('h3', { text: 'MCP Client' });
     new Setting(containerEl)
      .setName('Request Timeout (ms)')
      .setDesc('Timeout duration for MCP requests in milliseconds.')
      .addText(text => text
         .setPlaceholder('e.g., 30000')
         .setValue(String(currentSettings.mcp.requestTimeoutMs))
         .onChange(async (value) => {
           const timeout = parseInt(value, 10);
           if (!isNaN(timeout) && timeout > 0) {
             await this.settingsManager.updateSettings({ mcp: { ...currentSettings.mcp, requestTimeoutMs: timeout } });
           }
           // TODO: Add validation feedback to the user if input is invalid
         }));


    // --- BCP Settings ---
    // TODO: Dynamically generate settings UI for loaded BCPs if needed

    // --- Reset Button ---
    containerEl.createDiv('settings-actions', el => {
        new Setting(el)
            .addButton(button => button
                .setButtonText('Reset to Defaults')
                .setWarning() // Optional: makes the button red
                .onClick(async () => {
                    if (confirm('Are you sure you want to reset all settings to their defaults?')) {
                        await this.settingsManager.resetSettings();
                        // Re-render the settings tab to show the new default values
                        this.display();
                    }
                }));
    });
  }
}
