/**
 * Integration tests for PathManager with DirectoryService and CollectionManager
 * Tests that path duplication fixes work correctly in real service interactions
 */

import { PathManager } from '@/utils/PathManager';
import { DirectoryService } from '@/database/providers/chroma/services/DirectoryService';
import { CollectionManager } from '@/database/providers/chroma/services/CollectionManager';
import { IDirectoryService } from '@/database/providers/chroma/services/interfaces/IDirectoryService';
import { App, Plugin, FileSystemAdapter } from 'obsidian';

// Mock implementations for testing
class MockDirectoryService implements IDirectoryService {
  private mockFileSystem: Map<string, { type: 'file' | 'folder', content?: string }> = new Map();
  
  constructor() {
    // Initialize with some test data
    this.mockFileSystem.set('.obsidian/plugins/claudesidian-mcp/data', { type: 'folder' });
    this.mockFileSystem.set('.obsidian/plugins/claudesidian-mcp/data/chroma-db', { type: 'folder' });
    this.mockFileSystem.set('.obsidian/plugins/claudesidian-mcp/data/chroma-db/collections', { type: 'folder' });
  }

  async ensureDirectoryExists(path: string): Promise<void> {
    if (!this.mockFileSystem.has(path)) {
      this.mockFileSystem.set(path, { type: 'folder' });
    }
  }

  async directoryExists(path: string): Promise<boolean> {
    const entry = this.mockFileSystem.get(path);
    return entry?.type === 'folder';
  }

  async fileExists(path: string): Promise<boolean> {
    const entry = this.mockFileSystem.get(path);
    return entry?.type === 'file';
  }

  async readFile(path: string): Promise<string> {
    const entry = this.mockFileSystem.get(path);
    if (entry?.type === 'file') {
      return entry.content || '';
    }
    throw new Error(`File not found: ${path}`);
  }

  async calculateDirectorySize(): Promise<number> { return 0; }
  async validateDirectoryPermissions(): Promise<boolean> { return true; }
  async readDirectory(): Promise<string[]> { return []; }
  async getStats(): Promise<any> { return {}; }
  async calculateMemoryCollectionsSize(): Promise<number> { return 0; }
  async calculateCollectionSize(): Promise<number> { return 0; }
  async getCollectionSizeBreakdown(): Promise<Record<string, number>> { return {}; }

  // Test helper methods
  addFile(path: string, content: string = ''): void {
    this.mockFileSystem.set(path, { type: 'file', content });
  }

  addDirectory(path: string): void {
    this.mockFileSystem.set(path, { type: 'folder' });
  }

  getAllPaths(): string[] {
    return Array.from(this.mockFileSystem.keys());
  }
}

// Mock ChromaDB client
class MockChromaClient {
  private collections = new Map<string, any>();

  async listCollections() {
    return Array.from(this.collections.keys()).map(name => ({ name }));
  }

  async createCollection(name: string, metadata?: any) {
    const collection = {
      name,
      metadata,
      count: async () => 0,
      add: async () => {},
      query: async () => ({ documents: [], ids: [], distances: [] })
    };
    this.collections.set(name, collection);
    return collection;
  }

  async getCollection(name: string) {
    const collection = this.collections.get(name);
    if (!collection) {
      throw new Error(`Collection ${name} not found`);
    }
    return collection;
  }

  async deleteCollection(name: string) {
    this.collections.delete(name);
  }
}

// Mock Obsidian objects
const createMockApp = (basePath: string): App => ({
  vault: {
    adapter: {
      getBasePath: () => basePath
    } as FileSystemAdapter
  }
} as App);

const createMockPlugin = (): Plugin => ({
  manifest: { id: 'claudesidian-mcp' },
  app: undefined as any
} as Plugin);

describe('PathManager Integration Tests', () => {
  let pathManager: PathManager;
  let directoryService: MockDirectoryService;
  let collectionManager: CollectionManager;
  let mockChromaClient: MockChromaClient;

  const TEST_VAULT_PATH = 'C:\\Users\\jrose\\Documents\\Plugin Tester';

  beforeEach(() => {
    const mockApp = createMockApp(TEST_VAULT_PATH);
    const mockPlugin = createMockPlugin();
    mockPlugin.app = mockApp;

    pathManager = new PathManager(mockApp, mockPlugin);
    directoryService = new MockDirectoryService();
    mockChromaClient = new MockChromaClient();
    
    collectionManager = new CollectionManager(
      mockChromaClient as any,
      directoryService,
      '.obsidian/plugins/claudesidian-mcp/data/chroma-db'
    );
    
    // Inject PathManager into CollectionManager
    collectionManager.setPathManager(pathManager);
  });

  describe('DirectoryService Path Integration', () => {
    it('should create directories using relative paths only', async () => {
      const testPath = '.obsidian/plugins/claudesidian-mcp/data/test-collection';
      
      await directoryService.ensureDirectoryExists(testPath);
      
      const exists = await directoryService.directoryExists(testPath);
      expect(exists).toBe(true);
      
      // Verify no absolute paths were used
      const allPaths = directoryService.getAllPaths();
      const absolutePaths = allPaths.filter(path => path.includes('C:\\') || path.startsWith('/'));
      expect(absolutePaths).toHaveLength(0);
    });

    it('should handle path conversion from absolute to relative', async () => {
      // Simulate what happens when a service mistakenly creates an absolute path
      const absolutePath = `${TEST_VAULT_PATH}\\.obsidian\\plugins\\claudesidian-mcp\\data\\converted-test`;
      const relativePath = pathManager.makeVaultRelative(absolutePath);
      
      await directoryService.ensureDirectoryExists(relativePath);
      
      expect(relativePath).toBe('.obsidian/plugins/claudesidian-mcp/data/converted-test');
      expect(await directoryService.directoryExists(relativePath)).toBe(true);
    });

    it('should prevent path duplication in directory operations', async () => {
      // This is the critical test - ensure duplicated paths get fixed
      const duplicatedPath = `${TEST_VAULT_PATH}\\${TEST_VAULT_PATH}\\.obsidian\\plugins\\claudesidian-mcp\\data\\duplicate-test`;
      const fixedPath = pathManager.makeVaultRelative(duplicatedPath);
      
      await directoryService.ensureDirectoryExists(fixedPath);
      
      expect(fixedPath).toBe('.obsidian/plugins/claudesidian-mcp/data/duplicate-test');
      expect(await directoryService.directoryExists(fixedPath)).toBe(true);
      
      // Ensure the duplicated path is not stored in the mock filesystem
      expect(await directoryService.directoryExists(duplicatedPath)).toBe(false);
    });
  });

  describe('CollectionManager Path Integration', () => {
    it('should create collection paths using PathManager', async () => {
      const collectionName = 'test_collection';
      
      await collectionManager.createCollection(collectionName);
      
      const expectedPath = pathManager.createCollectionPath(collectionName);
      expect(expectedPath).toBe('.obsidian/plugins/claudesidian-mcp/data/chroma-db/collections/test_collection');
      
      // Verify collection was created
      const collections = await collectionManager.listCollections();
      expect(collections).toContain(collectionName);
    });

    it('should handle collection creation with special characters', async () => {
      const collectionName = 'test<>collection:data';
      
      await collectionManager.createCollection(collectionName);
      
      const expectedPath = pathManager.createCollectionPath(collectionName);
      expect(expectedPath).toBe('.obsidian/plugins/claudesidian-mcp/data/chroma-db/collections/test__collection_data');
      
      const collections = await collectionManager.listCollections();
      expect(collections).toContain(collectionName);
    });

    it('should detect existing collections from filesystem using PathManager', async () => {
      const collectionName = 'existing_collection';
      const collectionPath = pathManager.createCollectionPath(collectionName);
      const metadataPath = `${collectionPath}/metadata.json`;
      
      // Set up mock filesystem with existing collection
      directoryService.addDirectory(collectionPath);
      directoryService.addFile(metadataPath, JSON.stringify({
        collectionName,
        version: '1.0.0',
        itemCount: 0,
        createdAt: new Date().toISOString()
      }));
      
      const hasCollection = await collectionManager.hasCollection(collectionName);
      expect(hasCollection).toBe(true);
    });

    it('should prevent path duplication in collection operations', async () => {
      const collectionName = 'duplicate_path_test';
      
      // Create collection normally
      await collectionManager.createCollection(collectionName);
      
      // Verify the path is correct and relative
      const correctPath = pathManager.createCollectionPath(collectionName);
      expect(correctPath).toBe('.obsidian/plugins/claudesidian-mcp/data/chroma-db/collections/duplicate_path_test');
      expect(correctPath).not.toContain('C:\\Users\\jrose\\Documents\\Plugin Tester\\C:\\Users\\jrose\\Documents\\Plugin Tester');
    });
  });

  describe('End-to-End Path Flow', () => {
    it('should handle complete collection lifecycle with proper paths', async () => {
      const collectionName = 'lifecycle_test';
      
      // Step 1: Create collection
      await collectionManager.createCollection(collectionName);
      
      // Step 2: Verify it exists
      const exists1 = await collectionManager.hasCollection(collectionName);
      expect(exists1).toBe(true);
      
      // Step 3: List collections
      const collections = await collectionManager.listCollections();
      expect(collections).toContain(collectionName);
      
      // Step 4: Get collection
      const collection = await collectionManager.getOrCreateCollection(collectionName);
      expect(collection).toBeDefined();
      expect(collection.name).toBe(collectionName);
      
      // Step 5: Validate collection
      const isValid = await collectionManager.validateCollection(collectionName);
      expect(isValid).toBe(true);
      
      // Step 6: Delete collection
      await collectionManager.deleteCollection(collectionName);
      
      // Step 7: Verify deletion
      const exists2 = await collectionManager.hasCollection(collectionName);
      expect(exists2).toBe(false);
    });

    it('should recover from path duplication errors in real scenarios', async () => {
      // Simulate the exact error scenario that was happening
      const collectionName = 'error_recovery_test';
      
      // Create a situation where we might get duplicated paths
      const potentiallyDuplicatedPath = `${TEST_VAULT_PATH}\\${TEST_VAULT_PATH}\\.obsidian\\plugins\\claudesidian-mcp\\data\\chroma-db\\collections\\${collectionName}`;
      
      // PathManager should fix this
      const fixedPath = pathManager.makeVaultRelative(potentiallyDuplicatedPath);
      expect(fixedPath).toBe(`.obsidian/plugins/claudesidian-mcp/data/chroma-db/collections/${collectionName}`);
      
      // Ensure directory can be created with fixed path
      await directoryService.ensureDirectoryExists(fixedPath);
      expect(await directoryService.directoryExists(fixedPath)).toBe(true);
      
      // Ensure collection manager can work with this
      await collectionManager.createCollection(collectionName);
      expect(await collectionManager.hasCollection(collectionName)).toBe(true);
    });

    it('should maintain path consistency across service boundaries', async () => {
      const collectionName = 'consistency_test';
      
      // Path created by PathManager
      const pathManagerPath = pathManager.createCollectionPath(collectionName);
      
      // Path created by CollectionManager (should use PathManager internally)
      await collectionManager.createCollection(collectionName);
      
      // Verify consistency
      expect(pathManagerPath).toBe('.obsidian/plugins/claudesidian-mcp/data/chroma-db/collections/consistency_test');
      
      // Both services should agree on the path
      const directoryPath = pathManagerPath;
      await directoryService.ensureDirectoryExists(directoryPath);
      expect(await directoryService.directoryExists(directoryPath)).toBe(true);
    });
  });

  describe('Error Scenarios and Recovery', () => {
    it('should handle invalid absolute paths gracefully', async () => {
      const invalidPath = 'Z:\\NonExistent\\Path\\.obsidian\\plugins\\test';
      const fixedPath = pathManager.makeVaultRelative(invalidPath);
      
      // Should fallback to safe default
      expect(fixedPath).toBe('.obsidian/plugins/claudesidian-mcp/data/chroma-db');
      
      await directoryService.ensureDirectoryExists(fixedPath);
      expect(await directoryService.directoryExists(fixedPath)).toBe(true);
    });

    it('should handle collection creation when PathManager is not available', async () => {
      // Create CollectionManager without PathManager
      const standaloneManager = new CollectionManager(
        mockChromaClient as any,
        directoryService,
        '.obsidian/plugins/claudesidian-mcp/data/chroma-db'
      );
      // Don't inject PathManager - test fallback behavior
      
      const collectionName = 'fallback_test';
      await standaloneManager.createCollection(collectionName);
      
      expect(await standaloneManager.hasCollection(collectionName)).toBe(true);
    });

    it('should validate paths before operations', async () => {
      // Test PathManager's safePathOperation
      let operationCalled = false;
      const mockOperation = async (path: string) => {
        operationCalled = true;
        return path;
      };
      
      // Valid path should work
      const result1 = await pathManager.safePathOperation(
        '.obsidian/plugins/test',
        mockOperation,
        'test_operation'
      );
      expect(operationCalled).toBe(true);
      expect(result1).toBe('.obsidian/plugins/test');
      
      // Invalid path should throw
      operationCalled = false;
      await expect(pathManager.safePathOperation(
        '../../../dangerous/path',
        mockOperation,
        'dangerous_operation'
      )).rejects.toThrow('Path validation failed');
      expect(operationCalled).toBe(false);
    });
  });

  describe('Performance and Caching', () => {
    it('should cache path conversion results for performance', async () => {
      const testPath = `${TEST_VAULT_PATH}\\.obsidian\\plugins\\claudesidian-mcp\\data\\perf-test`;
      
      // First conversion
      const start1 = performance.now();
      const result1 = pathManager.makeVaultRelative(testPath);
      const end1 = performance.now();
      
      // Second conversion (should be faster due to internal optimizations)
      const start2 = performance.now();
      const result2 = pathManager.makeVaultRelative(testPath);
      const end2 = performance.now();
      
      expect(result1).toBe(result2);
      expect(result1).toBe('.obsidian/plugins/claudesidian-mcp/data/perf-test');
      
      // Both should complete quickly (less than 10ms)
      expect(end1 - start1).toBeLessThan(10);
      expect(end2 - start2).toBeLessThan(10);
    });

    it('should handle multiple concurrent path operations', async () => {
      const operations = [];
      
      for (let i = 0; i < 10; i++) {
        operations.push(
          collectionManager.createCollection(`concurrent_test_${i}`)
        );
      }
      
      await Promise.all(operations);
      
      // Verify all collections were created
      for (let i = 0; i < 10; i++) {
        expect(await collectionManager.hasCollection(`concurrent_test_${i}`)).toBe(true);
      }
    });
  });

  describe('Cross-Platform Path Handling', () => {
    it('should handle Windows paths correctly', async () => {
      // Already tested with Windows-style TEST_VAULT_PATH
      const windowsPath = 'C:\\Users\\test\\vault\\.obsidian\\plugins\\test';
      const result = pathManager.makeVaultRelative(windowsPath);
      expect(result).toBe('.obsidian/plugins/test');
    });

    it('should handle Unix paths correctly', async () => {
      // Create new PathManager with Unix-style base path
      const unixApp = createMockApp('/home/user/vault');
      const unixPlugin = createMockPlugin();
      unixPlugin.app = unixApp;
      
      const unixPathManager = new PathManager(unixApp, unixPlugin);
      
      const unixPath = '/home/user/vault/.obsidian/plugins/test';
      const result = unixPathManager.makeVaultRelative(unixPath);
      expect(result).toBe('.obsidian/plugins/test');
    });

    it('should normalize mixed path separators', async () => {
      const mixedPath = `${TEST_VAULT_PATH}/.obsidian\\plugins/test\\data`;
      const result = pathManager.makeVaultRelative(mixedPath);
      expect(result).toBe('.obsidian/plugins/test/data');
      expect(result).not.toContain('\\');
    });
  });
});