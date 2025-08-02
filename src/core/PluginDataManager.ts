/**
 * PluginDataManager - Centralized data persistence using Plugin.loadData/saveData
 * Location: src/core/PluginDataManager.ts
 * 
 * This service replaces all direct file operations for plugin data with Obsidian's
 * official Plugin.loadData/saveData methods, ensuring cross-platform compatibility
 * and proper integration with Obsidian's data management.
 * 
 * Key features:
 * - Type-safe settings management with validation
 * - Automatic migration between plugin versions
 * - Backup and restore functionality
 * - Schema validation for data integrity
 * - Cross-platform data persistence (mobile + desktop)
 * 
 * Used by:
 * - Main plugin for settings management
 * - All services for persistent configuration
 * - Backup/restore operations
 * - Settings migration between versions
 */

import { Plugin } from 'obsidian';

export interface SettingsSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    required?: boolean;
    validation?: Array<{
      validate: (value: any) => boolean;
      message: string;
    }>;
  };
}

export interface SettingsMigration {
  fromVersion: string;
  toVersion: string;
  migrate: (data: any) => any;
}

export interface BackupData {
  version: string;
  timestamp: string;
  settings: any;
  metadata: {
    pluginId: string;
    platform: string;
  };
}

/**
 * Settings migration manager for version compatibility
 */
export class SettingsMigrationManager {
  private migrations: SettingsMigration[] = [];

  /**
   * Register a migration
   */
  registerMigration(migration: SettingsMigration): void {
    this.migrations.push(migration);
    // Sort by version to ensure correct order
    this.migrations.sort((a, b) => this.compareVersions(a.fromVersion, b.fromVersion));
  }

  /**
   * Apply migrations to data
   */
  async migrate(data: any, currentVersion: string): Promise<any> {
    let migratedData = { ...data };
    const dataVersion = data._version || '0.0.0';

    // Find applicable migrations
    const applicableMigrations = this.migrations.filter(migration => 
      this.compareVersions(migration.fromVersion, dataVersion) >= 0 &&
      this.compareVersions(migration.toVersion, currentVersion) <= 0
    );

    // Apply migrations in order
    for (const migration of applicableMigrations) {
      try {
        console.log(`[PluginDataManager] Applying migration from ${migration.fromVersion} to ${migration.toVersion}`);
        migratedData = migration.migrate(migratedData);
        migratedData._version = migration.toVersion;
      } catch (error) {
        console.error(`[PluginDataManager] Migration failed from ${migration.fromVersion} to ${migration.toVersion}:`, error);
        throw error;
      }
    }

    // Update to current version
    migratedData._version = currentVersion;
    return migratedData;
  }

  /**
   * Compare semantic versions
   */
  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      
      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }
    
    return 0;
  }
}

/**
 * Centralized data persistence using Plugin.loadData/saveData
 * Replaces all direct file operations for plugin data
 */
export class PluginDataManager<T extends Record<string, any>> {
  private settings: T;
  private schema: SettingsSchema;
  private migrationManager: SettingsMigrationManager;
  private saveTimeout: NodeJS.Timeout | null = null;
  private isDirty: boolean = false;

  constructor(
    private plugin: Plugin,
    private defaults: T,
    schema?: SettingsSchema
  ) {
    this.settings = { ...defaults };
    this.schema = schema || {};
    this.migrationManager = new SettingsMigrationManager();
    
    // Register default migrations for common patterns
    this.registerCommonMigrations();
  }

  /**
   * Load settings from Plugin.loadData with migration support
   */
  async load(): Promise<void> {
    try {
      const loadedData = await this.plugin.loadData() || {};
      
      // Apply migrations if needed
      const migratedData = await this.migrationManager.migrate(
        loadedData,
        this.plugin.manifest.version
      );
      
      // Validate and merge with defaults
      this.settings = this.validateAndMerge(migratedData);
      
      console.log(`[PluginDataManager] Settings loaded and migrated to version ${this.plugin.manifest.version}`);
      
    } catch (error) {
      console.error('[PluginDataManager] Failed to load plugin data:', error);
      this.settings = { ...this.defaults };
      
      // Save defaults to establish baseline
      await this.save();
    }
  }

  /**
   * Save settings using Plugin.saveData with debouncing
   */
  async save(): Promise<void> {
    try {
      // Clear any pending save
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = null;
      }

      const validatedSettings = this.validateSettings(this.settings);
      
      // Add metadata
      const dataToSave = {
        ...validatedSettings,
        _version: this.plugin.manifest.version,
        _lastSaved: new Date().toISOString(),
        _platform: this.getPlatform()
      };

      await this.plugin.saveData(dataToSave);
      this.isDirty = false;
      
      console.log('[PluginDataManager] Settings saved successfully');
      
    } catch (error) {
      console.error('[PluginDataManager] Failed to save plugin data:', error);
      throw error;
    }
  }

  /**
   * Save with debouncing to prevent excessive writes
   */
  async saveLater(delayMs: number = 1000): Promise<void> {
    this.isDirty = true;
    
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    this.saveTimeout = setTimeout(async () => {
      try {
        await this.save();
      } catch (error) {
        console.error('[PluginDataManager] Delayed save failed:', error);
      }
    }, delayMs);
  }

  /**
   * Type-safe getter
   */
  get<K extends keyof T>(key: K): T[K] {
    return this.settings[key];
  }

  /**
   * Type-safe setter with validation and auto-save
   */
  async set<K extends keyof T>(key: K, value: T[K]): Promise<void> {
    if (this.validateField(key, value)) {
      this.settings[key] = value;
      await this.saveLater();
    } else {
      throw new Error(`Invalid value for setting ${String(key)}`);
    }
  }

  /**
   * Batch update with validation
   */
  async update(updater: (current: T) => T): Promise<void> {
    const newSettings = updater({ ...this.settings });
    
    // Validate all changes
    const validatedSettings = this.validateSettings(newSettings);
    
    this.settings = validatedSettings;
    await this.saveLater();
  }

  /**
   * Get all settings (read-only copy)
   */
  getAll(): Readonly<T> {
    return { ...this.settings };
  }

  /**
   * Reset to defaults
   */
  async reset(): Promise<void> {
    this.settings = { ...this.defaults };
    await this.save();
  }

  /**
   * Write complex nested data (for collections, etc.)
   */
  async writeNestedData(path: string, data: any): Promise<void> {
    const keys = path.split('.');
    let current = this.settings as any;
    
    // Navigate to parent
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }
    
    // Set the value
    const finalKey = keys[keys.length - 1];
    current[finalKey] = data;
    
    await this.saveLater();
  }

  /**
   * Read complex nested data
   */
  readNestedData(path: string): any {
    const keys = path.split('.');
    let current = this.settings as any;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return null;
      }
    }
    
    return current;
  }

  /**
   * Create backup of current settings
   */
  async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupData: BackupData = {
      version: this.plugin.manifest.version,
      timestamp,
      settings: this.settings,
      metadata: {
        pluginId: this.plugin.manifest.id,
        platform: this.getPlatform()
      }
    };
    
    const backupKey = `backup_${timestamp}`;
    
    // Store backup in plugin data under special key
    const currentData = await this.plugin.loadData() || {};
    currentData._backups = currentData._backups || {};
    currentData._backups[backupKey] = backupData;
    
    await this.plugin.saveData(currentData);
    
    console.log(`[PluginDataManager] Backup created: ${backupKey}`);
    return backupKey;
  }

  /**
   * Restore from backup
   */
  async restoreFromBackup(backupKey: string): Promise<void> {
    const currentData = await this.plugin.loadData() || {};
    const backup = currentData._backups?.[backupKey];
    
    if (!backup) {
      throw new Error(`Backup not found: ${backupKey}`);
    }
    
    // Apply migrations to backup data if needed
    const migratedData = await this.migrationManager.migrate(
      backup.settings,
      this.plugin.manifest.version
    );
    
    this.settings = this.validateAndMerge(migratedData);
    await this.save();
    
    console.log(`[PluginDataManager] Restored from backup: ${backupKey}`);
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<Array<{ key: string; timestamp: string; version: string }>> {
    const currentData = await this.plugin.loadData() || {};
    const backups = currentData._backups || {};
    
    return Object.entries(backups).map(([key, backup]: [string, any]) => ({
      key,
      timestamp: backup.timestamp,
      version: backup.version
    }));
  }

  /**
   * Register migration
   */
  registerMigration(migration: SettingsMigration): void {
    this.migrationManager.registerMigration(migration);
  }

  /**
   * Validate and merge loaded data with defaults
   */
  private validateAndMerge(loadedData: any): T {
    const result = { ...this.defaults };
    
    for (const [key, value] of Object.entries(loadedData)) {
      if (key.startsWith('_')) {
        // Skip metadata fields
        continue;
      }
      
      if (key in this.defaults && this.isValidFieldValue(key as keyof T, value)) {
        // Type assertion is safe here because isValidFieldValue ensures compatibility
        (result as Record<string, any>)[key] = value;
      }
    }
    
    return result;
  }

  /**
   * Validate entire settings object
   */
  private validateSettings(settings: T): T {
    for (const [key, value] of Object.entries(settings)) {
      if (!this.validateField(key as keyof T, value)) {
        throw new Error(`Invalid value for setting '${key}'`);
      }
    }
    
    return settings;
  }

  /**
   * Validate individual field with unknown value type (for loading from storage)
   */
  private isValidFieldValue(key: keyof T, value: unknown): boolean {
    const schemaRule = this.schema[key as string];
    if (!schemaRule) return true;
    
    // Type validation
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== schemaRule.type) {
      console.warn(`[PluginDataManager] Type mismatch for ${String(key)}: expected ${schemaRule.type}, got ${actualType}`);
      return false;
    }
    
    // Custom validation rules
    if (schemaRule.validation) {
      for (const rule of schemaRule.validation) {
        if (!rule.validate(value as any)) {
          console.warn(`[PluginDataManager] Validation failed for ${String(key)}: ${rule.message}`);
          return false;
        }
      }
    }
    
    return true;
  }

  /**
   * Validate individual field
   */
  private validateField<K extends keyof T>(key: K, value: T[K]): boolean {
    const schemaRule = this.schema[key as string];
    if (!schemaRule) return true;
    
    // Type validation
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== schemaRule.type) {
      console.warn(`[PluginDataManager] Type mismatch for ${String(key)}: expected ${schemaRule.type}, got ${actualType}`);
      return false;
    }
    
    // Custom validation rules
    if (schemaRule.validation) {
      for (const rule of schemaRule.validation) {
        if (!rule.validate(value)) {
          console.warn(`[PluginDataManager] Validation failed for ${String(key)}: ${rule.message}`);
          return false;
        }
      }
    }
    
    return true;
  }

  /**
   * Register common migration patterns
   */
  private registerCommonMigrations(): void {
    // Example: migrate old API settings structure
    this.registerMigration({
      fromVersion: '0.0.0',
      toVersion: '1.0.0',
      migrate: (data: any) => {
        // Migrate old apiUrl to new api.endpoint structure
        if (data.apiUrl && !data.api) {
          data.api = { endpoint: data.apiUrl };
          delete data.apiUrl;
        }
        return data;
      }
    });
  }

  /**
   * Get current platform
   */
  private getPlatform(): string {
    return (this.plugin.app as any).isMobile ? 'mobile' : 'desktop';
  }

  /**
   * Check if settings have unsaved changes
   */
  isDirtySettings(): boolean {
    return this.isDirty;
  }

  /**
   * Force immediate save if dirty
   */
  async flush(): Promise<void> {
    if (this.isDirty) {
      await this.save();
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    
    // Force save if dirty
    if (this.isDirty) {
      this.save().catch(error => {
        console.error('[PluginDataManager] Failed to save during cleanup:', error);
      });
    }
  }
}