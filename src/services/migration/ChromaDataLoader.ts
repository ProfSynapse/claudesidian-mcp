// Location: src/services/migration/ChromaDataLoader.ts
// Loads data from existing ChromaDB collections for migration to new JSON structure
// Used by: DataMigrationService to read legacy ChromaDB collection data
// Dependencies: FileSystemService for ChromaDB collection file reading

import { FileSystemService } from '../storage/FileSystemService';

export interface ChromaCollectionData {
  memoryTraces: any[];
  sessions: any[];
  conversations: any[];
  workspaces: any[];
  snapshots: any[];
}

export class ChromaDataLoader {
  private fileSystem: FileSystemService;

  constructor(fileSystem: FileSystemService) {
    this.fileSystem = fileSystem;
  }

  async loadAllCollections(): Promise<ChromaCollectionData> {
    console.log('[Claudesidian] Loading all ChromaDB collections...');

    const [memoryTraces, sessions, conversations, workspaces, snapshots] = await Promise.all([
      this.fileSystem.readChromaCollection('memory_traces'),
      this.fileSystem.readChromaCollection('sessions'),
      this.fileSystem.readChromaCollection('chat_conversations'),
      this.fileSystem.readChromaCollection('workspaces'),
      this.fileSystem.readChromaCollection('snapshots')
    ]);

    const result = {
      memoryTraces,
      sessions,
      conversations,
      workspaces,
      snapshots
    };

    console.log('[Claudesidian] Collection counts:', {
      memoryTraces: memoryTraces.length,
      sessions: sessions.length,
      conversations: conversations.length,
      workspaces: workspaces.length,
      snapshots: snapshots.length
    });

    console.log(`[Claudesidian] Loaded collections:`, {
      memoryTraces: result.memoryTraces.length,
      sessions: result.sessions.length,
      conversations: result.conversations.length,
      workspaces: result.workspaces.length,
      snapshots: result.snapshots.length
    });

    return result;
  }

  async detectLegacyData(): Promise<boolean> {
    console.log('[Claudesidian] Detecting legacy ChromaDB data...');

    try {
      const collections = await this.loadAllCollections();

      // Check if any collection has data
      const hasData = Object.values(collections).some(collection =>
        Array.isArray(collection) && collection.length > 0
      );

      console.log(`[Claudesidian] Legacy data detection result: ${hasData}`);
      return hasData;
    } catch (error) {
      console.warn('[Claudesidian] Error detecting legacy data:', error);
      return false;
    }
  }

  /**
   * Get summary statistics about the legacy data
   */
  async getDataSummary(): Promise<{
    totalItems: number;
    collections: Record<string, number>;
    oldestItem?: number;
    newestItem?: number;
  }> {
    const collections = await this.loadAllCollections();

    let totalItems = 0;
    let oldestTimestamp: number | undefined;
    let newestTimestamp: number | undefined;

    const collectionCounts: Record<string, number> = {};

    for (const [collectionName, items] of Object.entries(collections)) {
      collectionCounts[collectionName] = items.length;
      totalItems += items.length;

      // Find timestamp ranges
      for (const item of items) {
        const timestamp = item.metadata?.timestamp ||
                         item.metadata?.created ||
                         item.metadata?.created;

        if (timestamp) {
          if (!oldestTimestamp || timestamp < oldestTimestamp) {
            oldestTimestamp = timestamp;
          }
          if (!newestTimestamp || timestamp > newestTimestamp) {
            newestTimestamp = timestamp;
          }
        }
      }
    }

    return {
      totalItems,
      collections: collectionCounts,
      oldestItem: oldestTimestamp,
      newestItem: newestTimestamp
    };
  }

  /**
   * Test if ChromaDB collection files are accessible
   */
  async testCollectionAccess(): Promise<{
    accessible: string[];
    missing: string[];
    errors: string[];
  }> {
    const collectionNames = ['memory_traces', 'sessions', 'chat_conversations', 'workspaces', 'snapshots'];
    const accessible: string[] = [];
    const missing: string[] = [];
    const errors: string[] = [];

    for (const collectionName of collectionNames) {
      try {
        const items = await this.fileSystem.readChromaCollection(collectionName);
        if (Array.isArray(items)) {
          accessible.push(collectionName);
        } else {
          missing.push(collectionName);
        }
      } catch (error) {
        errors.push(`${collectionName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { accessible, missing, errors };
  }
}