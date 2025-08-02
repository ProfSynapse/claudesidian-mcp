/**
 * Comprehensive unit tests for PathManager
 * Tests path validation, conversion, and normalization functions
 * to ensure path duplication errors are eliminated
 */

import { PathManager, PathValidationResult, ConversionResult } from '@/utils/PathManager';
import { App, Plugin, FileSystemAdapter, normalizePath } from 'obsidian';

// Mock Obsidian objects
const mockApp = {
  vault: {
    adapter: {
      getBasePath: jest.fn(),
    }
  }
} as unknown as App;

const mockPlugin = {
  manifest: {
    id: 'claudesidian-mcp'
  },
  app: mockApp
} as unknown as Plugin;

describe('PathManager', () => {
  let pathManager: PathManager;
  let mockFileSystemAdapter: jest.Mocked<FileSystemAdapter>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock FileSystemAdapter
    mockFileSystemAdapter = {
      getBasePath: jest.fn()
    } as unknown as jest.Mocked<FileSystemAdapter>;
    
    // Set up mock to return FileSystemAdapter
    (mockApp.vault.adapter as any) = mockFileSystemAdapter;
    
    // Default mock behavior - return a test vault path
    mockFileSystemAdapter.getBasePath.mockReturnValue('C:\\Users\\jrose\\Documents\\Plugin Tester');
    
    pathManager = new PathManager(mockApp, mockPlugin);
  });

  describe('Path Creation', () => {
    describe('createPluginPath()', () => {
      it('should create correct plugin base path', () => {
        const result = pathManager.createPluginPath();
        expect(result).toBe('.obsidian/plugins/claudesidian-mcp');
      });

      it('should create plugin subpath correctly', () => {
        const result = pathManager.createPluginPath('config');
        expect(result).toBe('.obsidian/plugins/claudesidian-mcp/config');
      });

      it('should sanitize subpath', () => {
        const result = pathManager.createPluginPath('test<>:|?*');
        expect(result).toBe('.obsidian/plugins/claudesidian-mcp/test_______');
      });

      it('should handle empty subpath', () => {
        const result = pathManager.createPluginPath('');
        expect(result).toBe('.obsidian/plugins/claudesidian-mcp');
      });
    });

    describe('createDataPath()', () => {
      it('should create correct data base path', () => {
        const result = pathManager.createDataPath();
        expect(result).toBe('.obsidian/plugins/claudesidian-mcp/data');
      });

      it('should create data subpath correctly', () => {
        const result = pathManager.createDataPath('chroma-db');
        expect(result).toBe('.obsidian/plugins/claudesidian-mcp/data/chroma-db');
      });

      it('should handle complex nested paths', () => {
        const result = pathManager.createDataPath('chroma-db/collections');
        expect(result).toBe('.obsidian/plugins/claudesidian-mcp/data/chroma-db/collections');
      });
    });

    describe('createCollectionPath()', () => {
      it('should create correct collection path', () => {
        const result = pathManager.createCollectionPath('test_collection');
        expect(result).toBe('.obsidian/plugins/claudesidian-mcp/data/chroma-db/collections/test_collection');
      });

      it('should sanitize collection name', () => {
        const result = pathManager.createCollectionPath('test<>collection');
        expect(result).toBe('.obsidian/plugins/claudesidian-mcp/data/chroma-db/collections/test__collection');
      });

      it('should handle special characters in collection name', () => {
        const result = pathManager.createCollectionPath('test:collection|data');
        expect(result).toBe('.obsidian/plugins/claudesidian-mcp/data/chroma-db/collections/test_collection_data');
      });
    });
  });

  describe('Path Conversion', () => {
    describe('makeVaultRelative()', () => {
      it('should convert absolute path to relative - Windows style', () => {
        const absolutePath = 'C:\\Users\\jrose\\Documents\\Plugin Tester\\.obsidian\\plugins\\claudesidian-mcp\\data\\chroma-db';
        const result = pathManager.makeVaultRelative(absolutePath);
        expect(result).toBe('.obsidian/plugins/claudesidian-mcp/data/chroma-db');
      });

      it('should convert absolute path to relative - Unix style', () => {
        mockFileSystemAdapter.getBasePath.mockReturnValue('/home/user/vault');
        pathManager = new PathManager(mockApp, mockPlugin);
        
        const absolutePath = '/home/user/vault/.obsidian/plugins/claudesidian-mcp/data/chroma-db';
        const result = pathManager.makeVaultRelative(absolutePath);
        expect(result).toBe('.obsidian/plugins/claudesidian-mcp/data/chroma-db');
      });

      it('should handle duplicated path issue - the critical test', () => {
        // This is the main issue we're fixing - duplicated base paths
        const duplicatedPath = 'C:\\Users\\jrose\\Documents\\Plugin Tester\\C:\\Users\\jrose\\Documents\\Plugin Tester\\.obsidian\\plugins\\claudesidian-mcp\\data\\chroma-db';
        const result = pathManager.makeVaultRelative(duplicatedPath);
        expect(result).toBe('.obsidian/plugins/claudesidian-mcp/data/chroma-db');
      });

      it('should use regex strategy when direct conversion fails', () => {
        const weirdPath = 'some/other/prefix/C:\\Users\\jrose\\Documents\\Plugin Tester\\.obsidian\\plugins\\claudesidian-mcp\\data';
        const result = pathManager.makeVaultRelative(weirdPath);
        expect(result).toBe('.obsidian/plugins/claudesidian-mcp/data');
      });

      it('should fallback gracefully when vault base path unavailable', () => {
        mockFileSystemAdapter.getBasePath.mockReturnValue(null as any);
        pathManager = new PathManager(mockApp, mockPlugin);
        
        const result = pathManager.makeVaultRelative('any/path/.obsidian/plugins/claudesidian-mcp/data');
        expect(result).toBe('.obsidian/plugins/claudesidian-mcp/data');
      });

      it('should fallback to safe default when all strategies fail', () => {
        const incompatiblePath = '/completely/different/path/structure';
        const result = pathManager.makeVaultRelative(incompatiblePath);
        expect(result).toBe('.obsidian/plugins/claudesidian-mcp/data/chroma-db');
      });
    });
  });

  describe('Path Validation', () => {
    describe('validatePath()', () => {
      it('should validate correct relative path', () => {
        const result = pathManager.validatePath('.obsidian/plugins/claudesidian-mcp/data');
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.normalizedPath).toBe('.obsidian/plugins/claudesidian-mcp/data');
      });

      it('should reject absolute paths', () => {
        const result = pathManager.validatePath('C:\\Users\\test\\file.txt');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Path should be relative to vault root, not absolute');
      });

      it('should reject Unix absolute paths', () => {
        const result = pathManager.validatePath('/home/user/file.txt');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Path should be relative to vault root, not absolute');
      });

      it('should warn about backslashes', () => {
        const result = pathManager.validatePath('.obsidian\\plugins\\test');
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContain('Path contains backslashes, should use forward slashes');
        expect(result.normalizedPath).toBe('.obsidian/plugins/test');
      });

      it('should reject path traversal', () => {
        const result = pathManager.validatePath('../../../dangerous/path');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Path traversal sequences (..) are not allowed');
      });

      it('should detect duplicated base paths', () => {
        const duplicatedPath = 'C:\\Users\\jrose\\Documents\\Plugin Tester\\C:\\Users\\jrose\\Documents\\Plugin Tester\\.obsidian';
        const result = pathManager.validatePath(duplicatedPath);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Duplicated base path detected');
      });

      it('should warn about long paths', () => {
        const longPath = 'a'.repeat(300);
        const result = pathManager.validatePath(longPath);
        expect(result.warnings).toContain('Path length exceeds recommended limits for cross-platform compatibility');
      });
    });
  });

  describe('Safe Path Operations', () => {
    describe('safePathOperation()', () => {
      it('should execute operation with valid relative path', async () => {
        const mockOperation = jest.fn().mockResolvedValue('success');
        const result = await pathManager.safePathOperation(
          '.obsidian/plugins/test', 
          mockOperation, 
          'test'
        );
        
        expect(result).toBe('success');
        expect(mockOperation).toHaveBeenCalledWith('.obsidian/plugins/test');
      });

      it('should convert absolute path before operation', async () => {
        const mockOperation = jest.fn().mockResolvedValue('success');
        const absolutePath = 'C:\\Users\\jrose\\Documents\\Plugin Tester\\.obsidian\\plugins\\test';
        
        const result = await pathManager.safePathOperation(
          absolutePath, 
          mockOperation, 
          'test'
        );
        
        expect(result).toBe('success');
        expect(mockOperation).toHaveBeenCalledWith('.obsidian/plugins/test');
      });

      it('should reject invalid paths', async () => {
        const mockOperation = jest.fn();
        
        await expect(pathManager.safePathOperation(
          '../dangerous/path', 
          mockOperation, 
          'test'
        )).rejects.toThrow('Path validation failed');
        
        expect(mockOperation).not.toHaveBeenCalled();
      });

      it('should propagate operation errors', async () => {
        const mockOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
        
        await expect(pathManager.safePathOperation(
          '.obsidian/plugins/test', 
          mockOperation, 
          'test'
        )).rejects.toThrow('Operation failed');
      });
    });
  });

  describe('Utility Methods', () => {
    describe('getVaultBasePath()', () => {
      it('should return vault base path when available', () => {
        const result = pathManager.getVaultBasePath();
        expect(result).toBe('C:\\Users\\jrose\\Documents\\Plugin Tester');
      });

      it('should return null when vault base path unavailable', () => {
        mockFileSystemAdapter.getBasePath.mockReturnValue(null as any);
        pathManager = new PathManager(mockApp, mockPlugin);
        
        const result = pathManager.getVaultBasePath();
        expect(result).toBeNull();
      });
    });

    describe('isVaultPathAvailable()', () => {
      it('should return true when vault path is available', () => {
        const result = pathManager.isVaultPathAvailable();
        expect(result).toBe(true);
      });

      it('should return false when vault path is unavailable', () => {
        mockFileSystemAdapter.getBasePath.mockReturnValue(null as any);
        pathManager = new PathManager(mockApp, mockPlugin);
        
        const result = pathManager.isVaultPathAvailable();
        expect(result).toBe(false);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle FileSystemAdapter errors gracefully', () => {
      mockFileSystemAdapter.getBasePath.mockImplementation(() => {
        throw new Error('FileSystem error');
      });
      
      // Should not throw during construction
      expect(() => new PathManager(mockApp, mockPlugin)).not.toThrow();
      
      pathManager = new PathManager(mockApp, mockPlugin);
      expect(pathManager.getVaultBasePath()).toBeNull();
    });

    it('should handle non-FileSystemAdapter gracefully', () => {
      (mockApp.vault.adapter as any) = {}; // Not a FileSystemAdapter
      
      expect(() => new PathManager(mockApp, mockPlugin)).not.toThrow();
      
      pathManager = new PathManager(mockApp, mockPlugin);
      expect(pathManager.getVaultBasePath()).toBeNull();
    });
  });

  describe('Path Sanitization', () => {
    it('should sanitize filesystem-unsafe characters', () => {
      const result = pathManager.createPluginPath('test<>:"|?*file');
      expect(result).toBe('.obsidian/plugins/claudesidian-mcp/test_______file');
    });

    it('should normalize path separators', () => {
      const result = pathManager.createPluginPath('folder\\\\subfolder\\file');
      expect(result).toBe('.obsidian/plugins/claudesidian-mcp/folder/subfolder/file');
    });

    it('should remove duplicate separators', () => {
      const result = pathManager.createPluginPath('folder//subfolder///file');
      expect(result).toBe('.obsidian/plugins/claudesidian-mcp/folder/subfolder/file');
    });

    it('should limit path length', () => {
      const longName = 'a'.repeat(300);
      const result = pathManager.createPluginPath(longName);
      expect(result.length).toBeLessThanOrEqual('.obsidian/plugins/claudesidian-mcp/'.length + 255);
    });
  });

  describe('Cross-Platform Compatibility', () => {
    it('should handle Windows-style paths', () => {
      mockFileSystemAdapter.getBasePath.mockReturnValue('C:\\Users\\test\\vault');
      pathManager = new PathManager(mockApp, mockPlugin);
      
      const result = pathManager.makeVaultRelative('C:\\Users\\test\\vault\\.obsidian\\plugins\\test');
      expect(result).toBe('.obsidian/plugins/test');
    });

    it('should handle Unix-style paths', () => {
      mockFileSystemAdapter.getBasePath.mockReturnValue('/home/user/vault');
      pathManager = new PathManager(mockApp, mockPlugin);
      
      const result = pathManager.makeVaultRelative('/home/user/vault/.obsidian/plugins/test');
      expect(result).toBe('.obsidian/plugins/test');
    });

    it('should handle mixed path separators', () => {
      const result = pathManager.makeVaultRelative('C:\\Users\\test\\vault/.obsidian\\plugins/test');
      expect(result).toBe('.obsidian/plugins/test');
    });
  });

  describe('Critical Path Duplication Prevention', () => {
    it('should prevent double vault base path in collection creation', () => {
      // This is the specific issue that was causing errors
      const mockDuplicatedPath = 'C:\\Users\\jrose\\Documents\\Plugin Tester\\C:\\Users\\jrose\\Documents\\Plugin Tester\\.obsidian\\plugins\\claudesidian-mcp\\data\\chroma-db\\collections\\test';
      
      const result = pathManager.makeVaultRelative(mockDuplicatedPath);
      expect(result).toBe('.obsidian/plugins/claudesidian-mcp/data/chroma-db/collections/test');
      expect(result).not.toContain('C:\\Users\\jrose\\Documents\\Plugin Tester\\C:\\Users\\jrose\\Documents\\Plugin Tester');
    });

    it('should detect when path contains multiple base path occurrences', () => {
      const duplicatedPath = 'C:\\Users\\test\\vault\\C:\\Users\\test\\vault\\.obsidian';
      const validation = pathManager.validatePath(duplicatedPath);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Duplicated base path detected');
    });

    it('should handle edge case where base path appears in different contexts', () => {
      mockFileSystemAdapter.getBasePath.mockReturnValue('/Users/test');
      pathManager = new PathManager(mockApp, mockPlugin);
      
      // Path that contains base path name but in different context
      const edgeCasePath = '/Users/test/vault/backup/Users/test/old-data/.obsidian/plugins/test';
      const result = pathManager.makeVaultRelative(edgeCasePath);
      
      // Should still extract the correct plugin path
      expect(result).toBe('.obsidian/plugins/test');
    });
  });
});