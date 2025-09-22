/**
 * Plugin Data Manager
 * Handles simple plugin data storage operations using Obsidian's native data.json
 */

import { Plugin } from 'obsidian';

export class PluginDataManager {
  constructor(private plugin: Plugin) {}

  /**
   * Save data to plugin storage
   */
  async saveData(data: any): Promise<void> {
    await this.plugin.saveData(data);
  }

  /**
   * Load data from plugin storage
   */
  async loadData(): Promise<any> {
    return await this.plugin.loadData();
  }

  /**
   * Load data with defaults and migration support
   */
  async load(defaults: any = {}, migrateFn?: (data: any) => any): Promise<any> {
    try {
      let data = await this.plugin.loadData();
      if (!data) {
        data = defaults;
      }
      if (migrateFn) {
        data = migrateFn(data);
      }
      return data;
    } catch {
      return defaults;
    }
  }

  /**
   * Check if data exists
   */
  async hasData(): Promise<boolean> {
    try {
      const data = await this.plugin.loadData();
      return data !== null && data !== undefined;
    } catch {
      return false;
    }
  }
}

// Legacy compatibility exports
export class SettingsMigrationManager {
  static migrate(data: any): any {
    return data;
  }
}

export interface SettingsSchema {
  [key: string]: any;
}

export interface SettingsMigration {
  version: number;
  migrate: (data: any) => any;
}

export interface BackupData {
  version: string;
  timestamp: number;
  data: any;
}