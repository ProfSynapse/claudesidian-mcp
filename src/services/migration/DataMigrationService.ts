// Location: src/services/migration/DataMigrationService.ts
// Migration service for converting ChromaDB to split-file architecture
// Used by: main.ts during plugin initialization to migrate from ChromaDB to conversations/ and workspaces/
// Dependencies: FileSystemService, IndexManager, ChromaDataLoader, DataTransformer

import { Plugin } from 'obsidian';
import { FileSystemService } from '../storage/FileSystemService';
import { IndexManager } from '../storage/IndexManager';
import { ChromaDataLoader } from './ChromaDataLoader';
import { DataTransformer } from './DataTransformer';

export interface MigrationStatus {
  isRequired: boolean;
  hasLegacyData: boolean;
  migrationComplete: boolean;
}

export interface MigrationResult {
  success: boolean;
  conversationsMigrated: number;
  workspacesMigrated: number;
  sessionsMigrated: number;
  tracesMigrated: number;
  errors: string[];
  migrationTime: number;
}

export class DataMigrationService {
  private chromaLoader: ChromaDataLoader;
  private transformer: DataTransformer;

  constructor(
    private plugin: Plugin,
    private fileSystem: FileSystemService,
    private indexManager: IndexManager
  ) {
    this.chromaLoader = new ChromaDataLoader(fileSystem);
    this.transformer = new DataTransformer();
    console.log('[DataMigrationService] Initialized with split-file architecture');
  }

  /**
   * Check if migration is needed
   */
  async checkMigrationStatus(): Promise<MigrationStatus> {
    console.log('[DataMigrationService] ========== MIGRATION STATUS CHECK START ==========');
    console.log('[DataMigrationService] Checking migration status...');

    // Check if new structure already exists
    console.log('[DataMigrationService] Checking if split-file structure exists...');
    const conversationsExist = await this.fileSystem.conversationsDirectoryExists();
    const workspacesExist = await this.fileSystem.workspacesDirectoryExists();

    console.log(`[DataMigrationService] Directory check results: conversations=${conversationsExist}, workspaces=${workspacesExist}`);

    if (conversationsExist && workspacesExist) {
      console.log('[DataMigrationService] Split-file structure already exists - migration complete');
      console.log('[DataMigrationService] ========== MIGRATION STATUS CHECK END (NOT REQUIRED) ==========');
      return {
        isRequired: false,
        hasLegacyData: false,
        migrationComplete: true
      };
    }

    // Check for legacy ChromaDB data
    console.log('[DataMigrationService] Checking for legacy ChromaDB data...');
    const hasLegacyData = await this.chromaLoader.detectLegacyData();

    console.log(`[DataMigrationService] Migration status: required=${hasLegacyData}, hasLegacy=${hasLegacyData}`);
    console.log('[DataMigrationService] ========== MIGRATION STATUS CHECK END ==========');

    return {
      isRequired: hasLegacyData,
      hasLegacyData,
      migrationComplete: false
    };
  }

  /**
   * Perform migration from ChromaDB to split-file structure
   */
  async performMigration(): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: false,
      conversationsMigrated: 0,
      workspacesMigrated: 0,
      sessionsMigrated: 0,
      tracesMigrated: 0,
      errors: [],
      migrationTime: 0
    };

    try {
      console.log('[DataMigrationService] Starting migration to split-file architecture...');

      // Step 1: Create conversations/ and workspaces/ directories
      await this.fileSystem.ensureConversationsDirectory();
      await this.fileSystem.ensureWorkspacesDirectory();
      console.log('[DataMigrationService] Directories created');

      // Step 2: Get data summary for reporting
      const dataSummary = await this.chromaLoader.getDataSummary();
      console.log('[DataMigrationService] Data summary:', dataSummary);

      // Step 3: Load all ChromaDB collections
      const chromaData = await this.chromaLoader.loadAllCollections();
      console.log('[DataMigrationService] ChromaDB collections loaded');

      // Step 4: Transform to split-file structure
      const { conversations, workspaces } = this.transformer.transformToNewStructure(chromaData);
      console.log('[DataMigrationService] Data transformation completed');

      // Step 5: Write conversation files
      console.log('[DataMigrationService] Writing conversation files...');
      for (const conversation of conversations) {
        try {
          await this.fileSystem.writeConversation(conversation.id, conversation);
          result.conversationsMigrated++;
        } catch (error) {
          console.error(`[DataMigrationService] Failed to write conversation ${conversation.id}:`, error);
          result.errors.push(`Failed to write conversation ${conversation.id}`);
        }
      }

      // Step 6: Build and write conversation index
      console.log('[DataMigrationService] Building conversation index...');
      const conversationIndex = this.indexManager.buildConversationSearchIndices(conversations);
      await this.fileSystem.writeConversationIndex(conversationIndex);

      // Step 7: Write workspace files
      console.log('[DataMigrationService] Writing workspace files...');
      for (const workspace of workspaces) {
        try {
          await this.fileSystem.writeWorkspace(workspace.id, workspace);
          result.workspacesMigrated++;

          // Count sessions and traces
          result.sessionsMigrated += Object.keys(workspace.sessions).length;
          for (const session of Object.values(workspace.sessions)) {
            result.tracesMigrated += Object.keys(session.memoryTraces).length;
          }
        } catch (error) {
          console.error(`[DataMigrationService] Failed to write workspace ${workspace.id}:`, error);
          result.errors.push(`Failed to write workspace ${workspace.id}`);
        }
      }

      // Step 8: Build and write workspace index
      console.log('[DataMigrationService] Building workspace index...');
      const workspaceIndex = this.indexManager.buildWorkspaceSearchIndices(workspaces);
      await this.fileSystem.writeWorkspaceIndex(workspaceIndex);

      // Step 9: Clean up legacy data folder (optional - can be done manually)
      console.log('[DataMigrationService] Migration complete - legacy data/ folder can be manually removed');

      result.success = true;
      result.migrationTime = Date.now() - startTime;

      console.log('[DataMigrationService] Migration completed successfully in', result.migrationTime, 'ms');
      console.log('[DataMigrationService] Results:', {
        conversations: result.conversationsMigrated,
        workspaces: result.workspacesMigrated,
        sessions: result.sessionsMigrated,
        traces: result.tracesMigrated,
        errors: result.errors.length
      });

    } catch (error) {
      console.error('[DataMigrationService] Migration failed:', error);
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
    conversationsExist: boolean;
    workspacesExist: boolean;
    accessTest?: any;
    errors: string[];
  }> {
    const info: {
      chromaDataSummary?: any;
      conversationsExist: boolean;
      workspacesExist: boolean;
      accessTest?: any;
      errors: string[];
    } = {
      conversationsExist: false,
      workspacesExist: false,
      errors: []
    };

    try {
      // Check if new structure exists
      info.conversationsExist = await this.fileSystem.conversationsDirectoryExists();
      info.workspacesExist = await this.fileSystem.workspacesDirectoryExists();

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
   * Rebuild indexes from existing split-file structure
   */
  async rebuildIndexes(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('[DataMigrationService] Rebuilding search indexes...');

      // Rebuild conversation index
      await this.indexManager.rebuildConversationIndex();

      // Rebuild workspace index
      await this.indexManager.rebuildWorkspaceIndex();

      console.log('[DataMigrationService] Search indexes rebuilt successfully');
      return { success: true };
    } catch (error) {
      console.error('[DataMigrationService] Failed to rebuild indexes:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}