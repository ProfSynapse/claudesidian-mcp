// Location: src/services/migration/DataMigrationService.ts
// Complete rewrite for the new simplified JSON-based architecture
// Used by: main.ts during plugin initialization to migrate from ChromaDB to JSON files
// Dependencies: FileSystemService, ChromaDataLoader, DataTransformer, SearchIndexBuilder

import { Plugin } from 'obsidian';
import { FileSystemService } from './FileSystemService';
import { ChromaDataLoader } from './ChromaDataLoader';
import { DataTransformer } from './DataTransformer';
import { SearchIndexBuilder } from './SearchIndexBuilder';

export interface MigrationStatus {
  isRequired: boolean;
  hasLegacyData: boolean;
  migrationComplete: boolean;
  migrationError?: string;
  lastMigrationAttempt?: number;
}

export interface MigrationResult {
  success: boolean;
  workspacesMigrated: number;
  sessionsMigrated: number;
  conversationsMigrated: number;
  memoryTracesMigrated: number;
  snapshotsMigrated: number;
  errors: string[];
  backupCreated: boolean;
  migrationTime: number;
}

export class DataMigrationService {
  private plugin: Plugin;
  private fileSystem: FileSystemService;
  private chromaLoader: ChromaDataLoader;
  private transformer: DataTransformer;
  private indexBuilder: SearchIndexBuilder;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.fileSystem = new FileSystemService(plugin);
    this.chromaLoader = new ChromaDataLoader(this.fileSystem);
    this.transformer = new DataTransformer();
    this.indexBuilder = new SearchIndexBuilder();

    console.log('[Claudesidian] DataMigrationService initialized with new architecture');
  }

  async checkMigrationStatus(): Promise<MigrationStatus> {
    console.log('[Claudesidian] Checking migration status...');

    // Check if new structure already exists
    const hasNewStructure = await this.fileSystem.fileExists('workspace-data.json');

    if (hasNewStructure) {
      console.log('[Claudesidian] New structure already exists - checking if settings cleanup needed');

      // Check if settings cleanup is needed
      const needsSettingsCleanup = await this.needsSettingsCleanup();
      if (needsSettingsCleanup) {
        console.log('[Claudesidian] Settings cleanup needed - running cleanup...');
        const cleanupResult = await this.cleanupObsoleteSettings();
        if (cleanupResult.success) {
          console.log(`[Claudesidian] Settings cleanup completed - removed ${cleanupResult.removedSettings.length} obsolete settings`);
        } else {
          console.warn('[Claudesidian] Settings cleanup failed:', cleanupResult.error);
        }
      } else {
        console.log('[Claudesidian] Settings already clean - no cleanup needed');
      }

      return {
        isRequired: false,
        hasLegacyData: false,
        migrationComplete: true
      };
    }

    // Check for legacy ChromaDB data
    const hasLegacyData = await this.chromaLoader.detectLegacyData();

    console.log(`[Claudesidian] Migration status: required=${hasLegacyData}, hasLegacy=${hasLegacyData}`);

    return {
      isRequired: hasLegacyData,
      hasLegacyData,
      migrationComplete: false
    };
  }

  async performMigration(): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: false,
      workspacesMigrated: 0,
      sessionsMigrated: 0,
      conversationsMigrated: 0,
      memoryTracesMigrated: 0,
      snapshotsMigrated: 0,
      errors: [],
      backupCreated: false,
      migrationTime: 0
    };

    try {
      console.log('[Claudesidian] Starting migration to new JSON architecture...');

      // Step 1: Ensure data directory exists
      await this.fileSystem.ensureDataDirectory();
      console.log('[Claudesidian] Data directory ensured');

      // Step 2: Get data summary for reporting
      const dataSummary = await this.chromaLoader.getDataSummary();
      console.log('[Claudesidian] Data summary:', dataSummary);

      // Step 3: Load all ChromaDB collections
      const chromaData = await this.chromaLoader.loadAllCollections();
      console.log('[Claudesidian] ChromaDB collections loaded');

      // Step 4: Transform to new structure
      const { workspaceData, conversationData } = this.transformer.transformToNewStructure(chromaData);
      console.log('[Claudesidian] Data transformation completed');

      // Step 5: Count migrated items for reporting
      result.conversationsMigrated = Object.keys(conversationData.conversations).length;
      result.workspacesMigrated = Object.keys(workspaceData.workspaces).length;

      let totalSessions = 0;
      let totalTraces = 0;
      let totalSnapshots = 0;

      for (const workspace of Object.values(workspaceData.workspaces)) {
        totalSessions += Object.keys(workspace.sessions).length;
        for (const session of Object.values(workspace.sessions)) {
          totalTraces += Object.keys(session.memoryTraces).length;
          totalSnapshots += Object.keys(session.states).length;
        }
      }

      result.sessionsMigrated = totalSessions;
      result.memoryTracesMigrated = totalTraces;
      result.snapshotsMigrated = totalSnapshots;

      console.log('[Claudesidian] Migration counts:', {
        workspaces: result.workspacesMigrated,
        sessions: result.sessionsMigrated,
        conversations: result.conversationsMigrated,
        traces: result.memoryTracesMigrated,
        snapshots: result.snapshotsMigrated
      });

      // Step 6: Build search indexes
      console.log('[Claudesidian] Building search indexes...');
      const workspaceIndex = this.indexBuilder.buildWorkspaceIndex(workspaceData);
      const conversationIndex = this.indexBuilder.buildConversationIndex(conversationData);
      console.log('[Claudesidian] Search indexes built');

      // Step 7: Write all files atomically
      console.log('[Claudesidian] Writing JSON files...');
      await Promise.all([
        this.fileSystem.writeJSON('workspace-data.json', workspaceData),
        this.fileSystem.writeJSON('conversations.json', conversationData),
        this.fileSystem.writeJSON('workspace-index.json', workspaceIndex),
        this.fileSystem.writeJSON('conversations-index.json', conversationIndex)
      ]);

      // Step 8: Clean up obsolete settings
      console.log('[Claudesidian] Cleaning up obsolete embedding/vector settings...');
      const settingsCleanupResult = await this.cleanupObsoleteSettings();
      if (settingsCleanupResult.success) {
        console.log(`[Claudesidian] Settings cleanup completed - removed ${settingsCleanupResult.removedSettings.length} obsolete settings`);
      } else {
        console.warn('[Claudesidian] Settings cleanup failed:', settingsCleanupResult.error);
      }

      result.success = true;
      result.migrationTime = Date.now() - startTime;

      console.log('[Claudesidian] Migration completed successfully in', result.migrationTime, 'ms');
      console.log('[Claudesidian] Final result:', result);

    } catch (error) {
      console.error('[Claudesidian] Migration failed:', error);
      result.errors.push(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    result.migrationTime = Date.now() - startTime;
    return result;
  }

  /**
   * Get detailed information about the migration for debugging
   */
  async getMigrationInfo(): Promise<{
    chromaDataSummary?: any;
    newDataExists: boolean;
    accessTest?: any;
    errors: string[];
  }> {
    const info: {
      chromaDataSummary?: any;
      newDataExists: boolean;
      accessTest?: any;
      errors: string[];
    } = {
      newDataExists: false,
      errors: []
    };

    try {
      // Check if new structure exists
      info.newDataExists = await this.fileSystem.fileExists('workspace-data.json');

      // Test ChromaDB access
      info.accessTest = await this.chromaLoader.testCollectionAccess();

      // Get data summary if possible
      if (info.accessTest && info.accessTest.accessible.length > 0) {
        info.chromaDataSummary = await this.chromaLoader.getDataSummary();
      }
    } catch (error) {
      info.errors.push(`Error getting migration info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return info;
  }

  /**
   * Rebuild search indexes for existing data
   */
  async rebuildIndexes(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('[Claudesidian] Rebuilding search indexes...');

      // Load existing data
      const workspaceData = await this.fileSystem.readJSON('workspace-data.json');
      const conversationData = await this.fileSystem.readJSON('conversations.json');

      if (!workspaceData || !conversationData) {
        throw new Error('No existing data found to rebuild indexes');
      }

      // Rebuild indexes
      const { workspaceIndex, conversationIndex } = await this.indexBuilder.rebuildIndexes(
        workspaceData,
        conversationData
      );

      // Write updated indexes
      await Promise.all([
        this.fileSystem.writeJSON('workspace-index.json', workspaceIndex),
        this.fileSystem.writeJSON('conversations-index.json', conversationIndex)
      ]);

      console.log('[Claudesidian] Search indexes rebuilt successfully');
      return { success: true };
    } catch (error) {
      console.error('[Claudesidian] Failed to rebuild indexes:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check if settings cleanup is needed
   */
  async needsSettingsCleanup(): Promise<boolean> {
    try {
      const currentData = await this.plugin.loadData() || {};

      // Check if any obsolete settings exist
      const obsoleteChecks = [
        currentData.memory?.enabled !== undefined,
        currentData.memory?.embeddingsEnabled !== undefined,
        currentData.memory?.apiProvider !== undefined,
        currentData.memory?.providerSettings !== undefined,
        currentData.incompleteFiles !== undefined,
        currentData.fileEventQueue !== undefined,
        currentData.memory?.openaiApiKey !== undefined,
        currentData.memory?.embeddingModel !== undefined
      ];

      return obsoleteChecks.some(check => check);
    } catch (error) {
      console.error('[Claudesidian] Error checking if settings cleanup needed:', error);
      return false;
    }
  }

  /**
   * Clean up obsolete embedding and vector-related settings from plugin data
   */
  async cleanupObsoleteSettings(): Promise<{
    success: boolean;
    removedSettings: string[];
    error?: string;
  }> {
    const result = {
      success: false,
      removedSettings: [] as string[],
      error: undefined as string | undefined
    };

    try {
      // Load current plugin data
      const currentData = await this.plugin.loadData() || {};
      console.log('[Claudesidian] Loaded current plugin settings for cleanup');

      // Define obsolete settings to remove
      const obsoleteSettings = [
        'memory.enabled',
        // Embedding provider settings
        'memory.embeddingsEnabled',
        'memory.apiProvider',
        'memory.providerSettings',
        'memory.maxTokensPerMonth',
        'memory.apiRateLimitPerMinute',
        'memory.chunkStrategy',
        'memory.chunkSize',
        'memory.chunkOverlap',
        'memory.maxTokensPerChunk',
        'memory.embeddingStrategy',
        'memory.dbStoragePath',
        'memory.vectorStoreType',
        'memory.costPerThousandTokens',
        'memory.contextualEmbedding',
        'memory.autoCleanOrphaned',
        'memory.maxDbSize',
        'memory.pruningStrategy',
        'memory.defaultResultLimit',
        'memory.includeNeighbors',
        'memory.graphBoostFactor',
        'memory.backlinksEnabled',
        'memory.useFilters',
        'memory.defaultThreshold',
        'memory.semanticThreshold',
        'memory.batchSize',
        'memory.concurrentRequests',
        'memory.processingDelay',
        'memory.openaiApiKey',
        'memory.embeddingModel',
        'memory.dimensions',
        'memory.indexingSchedule',
        'memory.backlinksWeight',
        'memory.hasEverConfiguredEmbeddings',
        'memory.lastIndexedDate',
        'memory.monthlyBudget',
        // File processing state (old vector-based)
        'incompleteFiles',
        'fileEventQueue'
      ];

      // Remove obsolete settings
      const updatedData = { ...currentData };

      for (const settingPath of obsoleteSettings) {
        if (this.removeSetting(updatedData, settingPath)) {
          result.removedSettings.push(settingPath);
        }
      }

      // If memory object is now empty, remove it entirely
      if (updatedData.memory && Object.keys(updatedData.memory).length === 0) {
        delete updatedData.memory;
        result.removedSettings.push('memory (entire section)');
      }

      // Save the cleaned-up settings
      await this.plugin.saveData(updatedData);
      console.log('[Claudesidian] Saved cleaned plugin settings');

      result.success = true;

    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Claudesidian] Error during settings cleanup:', error);
    }

    return result;
  }

  /**
   * Helper method to remove a nested setting by dot notation path
   */
  private removeSetting(obj: any, path: string): boolean {
    const parts = path.split('.');
    let current = obj;

    // Navigate to the parent object
    for (let i = 0; i < parts.length - 1; i++) {
      if (current[parts[i]] === undefined) {
        return false; // Path doesn't exist
      }
      current = current[parts[i]];
    }

    // Remove the final property
    const finalKey = parts[parts.length - 1];
    if (current[finalKey] !== undefined) {
      delete current[finalKey];
      return true;
    }

    return false;
  }

  /**
   * Clear migration data for testing (development only)
   */
  async clearMigrationData(): Promise<void> {
    console.warn('[Claudesidian] DEVELOPMENT: Clearing migration data...');

    const files = ['workspace-data.json', 'conversations.json', 'workspace-index.json', 'conversations-index.json'];

    for (const filename of files) {
      try {
        const filePath = `${this.fileSystem.getDataPath()}/${filename}`;
        await this.plugin.app.vault.adapter.remove(filePath);
        console.log(`[Claudesidian] Removed: ${filename}`);
      } catch (error) {
        // File might not exist, which is fine
        console.log(`[Claudesidian] Could not remove ${filename} (probably doesn't exist)`);
      }
    }
  }
}