import { StorageManager } from "../core/storage/manager";
import { TypedEventEmitter } from "../core/types";
import { AppEventTypes } from "../core/plugin"; // Use combined types
import { ChatsidianSettings, DEFAULT_SETTINGS, SettingsEventTypes } from "./types";
// import { deepmerge } from 'deepmerge-ts'; // Assuming deepmerge-ts is installed for merging defaults - COMMENTED OUT FOR NOW

const SETTINGS_STORAGE_KEY = 'plugin:settings';

/**
 * Manages the plugin's settings.
 * Responsible for loading settings from storage, providing default values,
 * allowing updates, saving changes, and notifying other components via events.
 */
export class SettingsManager {
  private storage: StorageManager;
  private events: TypedEventEmitter<AppEventTypes>;
  private currentSettings: ChatsidianSettings;

  /**
   * Creates an instance of SettingsManager.
   * @param storage The application's StorageManager instance.
   * @param events The application's TypedEventEmitter instance.
   */
  constructor(storage: StorageManager, events: TypedEventEmitter<AppEventTypes>) {
    this.storage = storage;
    this.events = events;
    // Initialize with a structured clone of defaults
    this.currentSettings = this.structuredClone(DEFAULT_SETTINGS);
  }

  /**
   * Simple structured clone (basic deep copy for JSON-serializable data)
   * Replace with a more robust library (like deepmerge-ts) if complex types are needed.
   * @param obj Object to clone
   * @private
   */
  private structuredClone<T>(obj: T): T {
    try {
      // Basic deep copy for simple objects
      return JSON.parse(JSON.stringify(obj));
    } catch (e) {
      console.error("Failed to structured clone object, returning original:", obj, e);
      return obj; // Fallback, though risky
    }
  }

  /**
   * Merges loaded settings with defaults. Overwrites defaults with loaded values.
   * Handles nested objects one level deep for known keys.
   * Replace with deepmerge-ts for more robust merging if needed.
   * @param defaults Default settings object.
   * @param loaded Loaded settings object (potentially partial).
   * @returns Merged settings object.
   * @private
   */
  private mergeSettings(defaults: ChatsidianSettings, loaded: Partial<ChatsidianSettings>): ChatsidianSettings {
    const merged = this.structuredClone(defaults);

    // Iterate over top-level keys in loaded settings
    for (const key in loaded) {
      if (Object.prototype.hasOwnProperty.call(loaded, key)) {
        const loadedValue = loaded[key as keyof ChatsidianSettings];
        const defaultValue = merged[key as keyof ChatsidianSettings];

        // If both default and loaded values are objects (but not arrays), merge them shallowly
        if (
          typeof loadedValue === 'object' && loadedValue !== null && !Array.isArray(loadedValue) &&
          typeof defaultValue === 'object' && defaultValue !== null && !Array.isArray(defaultValue)
        ) {
          // Simple shallow merge for known nested objects (general, chat, mcp, bcpSettings)
          merged[key as keyof ChatsidianSettings] = { ...defaultValue, ...loadedValue } as any;
        } else if (loadedValue !== undefined) {
          // Otherwise, overwrite default with loaded value (if defined)
          merged[key as keyof ChatsidianSettings] = loadedValue as any;
        }
      }
    }
    return merged;
  }


  /**
   * Loads the settings from storage. If no settings are found,
   * it initializes them with default values and saves them.
   * Merges loaded settings with defaults to ensure all keys are present.
   */
  async loadSettings(): Promise<void> {
    console.log("Loading settings...");
    try {
      const loadedSettings = await this.storage.read<Partial<ChatsidianSettings>>(SETTINGS_STORAGE_KEY);

      if (loadedSettings) {
        // Merge loaded settings with defaults
        this.currentSettings = this.mergeSettings(DEFAULT_SETTINGS, loadedSettings);
        console.log("Settings loaded and merged with defaults.");
        // Ensure the merged settings are saved back if loaded settings were incomplete
        await this.saveSettings(this.currentSettings, false);
      } else {
        console.log("No settings found in storage, using defaults.");
        // If nothing is loaded, currentSettings already holds the defaults. Save them.
        await this.saveSettings(this.currentSettings, false); // Don't emit change event on initial save
      }
    } catch (error) {
      console.error("Error loading settings:", error);
      this.events.emit('settings:error', { error: error as Error, operation: 'load' });
      // Keep default settings if loading fails
      this.currentSettings = this.structuredClone(DEFAULT_SETTINGS);
    }
  }

  /**
   * Saves the provided settings object to storage.
   * Emits a 'settings:changed' event upon successful save.
   * @param settings The complete settings object to save.
   * @param emitChangeEvent Whether to emit the 'settings:changed' event. Defaults to true.
   */
  async saveSettings(settings: ChatsidianSettings, emitChangeEvent = true): Promise<void> {
    try {
      // Update the internal state first
      this.currentSettings = settings;
      await this.storage.write(SETTINGS_STORAGE_KEY, settings);
      console.log("Settings saved.");
      if (emitChangeEvent) {
        this.events.emit('settings:changed', { newSettings: this.currentSettings });
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      this.events.emit('settings:error', { error: error as Error, operation: 'save' });
      throw error; // Re-throw error for upstream handling (e.g., in settings tab)
    }
  }

  /**
   * Updates a portion of the settings using a partial settings object.
   * Merges the changes into the current settings and saves the result.
   * Note: This uses a simplified merge, not a deep merge for arbitrary structures.
   * @param changes A partial settings object containing the updates.
   */
  async updateSettings(changes: Partial<ChatsidianSettings>): Promise<void> {
    // Perform a merge using our custom merge function
    const newSettings = this.mergeSettings(this.currentSettings, changes);
    await this.saveSettings(newSettings);
  }

  /**
   * Gets the current settings object.
   * Returns a clone to prevent direct modification of internal state.
   * @returns A clone of the current ChatsidianSettings object.
   */
  getSettings(): ChatsidianSettings {
    // Return a clone to prevent accidental modification
    return this.structuredClone(this.currentSettings);
  }

  /**
   * Resets settings to their default values.
   */
  async resetSettings(): Promise<void> {
    console.log("Resetting settings to default values...");
    const defaultSettingsCopy = this.structuredClone(DEFAULT_SETTINGS);
    await this.saveSettings(defaultSettingsCopy);
  }
}
