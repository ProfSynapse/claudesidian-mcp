import { IDirectoryService } from '../interfaces/IDirectoryService';
import { ObsidianPathManager } from '../../../../../core/ObsidianPathManager';
import { VaultOperations } from '../../../../../core/VaultOperations';
import { StructuredLogger } from '../../../../../core/StructuredLogger';

/**
 * Location: src/database/providers/chroma/services/adapters/VaultOperationsDirectoryServiceAdapter.ts
 * 
 * Summary: Adapter that bridges VaultOperations to IDirectoryService interface for backward compatibility.
 * Provides consistent file system operations through Obsidian's vault API while maintaining the expected
 * directory service interface for ChromaDB collection management.
 * 
 * Used by: CollectionManager to perform file system operations through a consistent interface
 * Dependencies: VaultOperations, ObsidianPathManager, StructuredLogger
 */
export class VaultOperationsDirectoryServiceAdapter implements IDirectoryService {
  constructor(
    private vaultOps: VaultOperations,
    private pathManager: ObsidianPathManager,
    private logger: StructuredLogger
  ) {}

  async ensureDirectoryExists(path: string): Promise<void> {
    await this.vaultOps.ensureDirectory(path);
  }

  async calculateDirectorySize(directoryPath: string): Promise<number> {
    const sizeBytes = await this.vaultOps.calculateDirectorySize(directoryPath);
    return sizeBytes / (1024 * 1024); // Convert to MB
  }

  async validateDirectoryPermissions(path: string): Promise<boolean> {
    try {
      const exists = await this.vaultOps.folderExists(path);
      if (exists) {
        // Test by trying to create a temp file
        const testPath = this.pathManager.joinPath(path, '.test');
        const writeSuccess = await this.vaultOps.writeFile(testPath, 'test');
        if (writeSuccess) {
          await this.vaultOps.deleteFile(testPath);
        }
        return writeSuccess;
      }
      return false;
    } catch (error) {
      this.logger.warn('Permission validation failed', error, 'VaultOpsAdapter');
      return false;
    }
  }

  async directoryExists(path: string): Promise<boolean> {
    return await this.vaultOps.folderExists(path);
  }

  async readDirectory(path: string): Promise<string[]> {
    const listing = await this.vaultOps.listDirectory(path);
    return [...listing.files, ...listing.folders];
  }

  async getStats(path: string): Promise<any> {
    return await this.vaultOps.getStats(path);
  }

  async calculateMemoryCollectionsSize(collectionsPath: string): Promise<number> {
    const memoryCollections = ['memory_traces', 'sessions', 'snapshots'];
    let totalSize = 0;
    
    for (const collection of memoryCollections) {
      const collectionPath = this.pathManager.joinPath(collectionsPath, collection);
      if (await this.vaultOps.folderExists(collectionPath)) {
        const sizeBytes = await this.vaultOps.calculateDirectorySize(collectionPath);
        totalSize += sizeBytes;
      }
    }
    
    return totalSize / (1024 * 1024); // Convert to MB
  }

  async calculateCollectionSize(collectionsPath: string, collectionName: string): Promise<number> {
    const collectionPath = this.pathManager.joinPath(collectionsPath, collectionName);
    if (await this.vaultOps.folderExists(collectionPath)) {
      const sizeBytes = await this.vaultOps.calculateDirectorySize(collectionPath);
      return sizeBytes / (1024 * 1024); // Convert to MB
    }
    return 0;
  }

  async getCollectionSizeBreakdown(collectionsPath: string): Promise<Record<string, number>> {
    const breakdown: Record<string, number> = {};
    const listing = await this.vaultOps.listDirectory(collectionsPath);
    
    for (const folder of listing.folders) {
      const folderName = this.pathManager.getFileName(folder);
      const sizeBytes = await this.vaultOps.calculateDirectorySize(folder);
      breakdown[folderName] = sizeBytes / (1024 * 1024); // Convert to MB
    }
    
    return breakdown;
  }

  async fileExists(filePath: string): Promise<boolean> {
    return await this.vaultOps.fileExists(filePath);
  }

  async readFile(filePath: string, encoding?: string): Promise<string> {
    const content = await this.vaultOps.readFile(filePath, false);
    return content || '';
  }
}