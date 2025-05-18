import { MemoryService } from '../MemoryService';
import { EmbeddingService } from '../EmbeddingService';
import { IVectorStore } from '../../interfaces/IVectorStore';

// Mock the dependencies
jest.mock('obsidian');
jest.mock('../../factory/VectorStoreFactory', () => ({
  VectorStoreFactory: {
    createMemoryTraceCollection: jest.fn().mockReturnValue({
      initialize: jest.fn().mockResolvedValue(undefined),
      add: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      getAll: jest.fn(),
      getTracesByWorkspace: jest.fn().mockResolvedValue([]),
      getTracesBySession: jest.fn().mockResolvedValue([]),
      searchTraces: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      createMemoryTrace: jest.fn().mockImplementation((trace) => Promise.resolve({ ...trace, id: 'trace-id' })),
    }),
    createSessionCollection: jest.fn().mockReturnValue({
      initialize: jest.fn().mockResolvedValue(undefined),
      add: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      getAll: jest.fn(),
      getSessionsByWorkspace: jest.fn().mockResolvedValue([]),
      getActiveSessions: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      createSession: jest.fn().mockImplementation((session) => Promise.resolve({ ...session, id: 'session-id' })),
      endSession: jest.fn().mockResolvedValue(undefined),
      incrementToolCalls: jest.fn().mockResolvedValue(undefined),
    }),
    createSnapshotCollection: jest.fn().mockReturnValue({
      initialize: jest.fn().mockResolvedValue(undefined),
      add: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      getAll: jest.fn().mockResolvedValue([]),
      getSnapshotsByWorkspace: jest.fn().mockResolvedValue([]),
      getSnapshotsBySession: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      createSnapshot: jest.fn().mockImplementation((snapshot) => Promise.resolve({ ...snapshot, id: 'snapshot-id' })),
    }),
  },
}));

describe('MemoryService', () => {
  let memoryService: MemoryService;
  let mockPlugin: any;
  let mockVectorStore: IVectorStore;
  let mockEmbeddingService: EmbeddingService;
  let mockSnapshots: any;

  beforeEach(() => {
    mockPlugin = {
      app: {
        plugins: {
          getPlugin: jest.fn().mockReturnValue({
            services: {
              workspaceService: {
                getWorkspace: jest.fn().mockResolvedValue({
                  id: 'workspace-id',
                  name: 'Test Workspace',
                  rootFolder: '/test',
                  path: [],
                  hierarchyType: 'workspace',
                  status: 'active',
                }),
              },
            },
          }),
        },
      },
    };

    mockVectorStore = {
      initialize: jest.fn().mockResolvedValue(undefined),
      createCollection: jest.fn().mockResolvedValue(undefined),
      upsert: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]),
      get: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(0),
    } as unknown as IVectorStore;

    mockEmbeddingService = {
      getEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    } as unknown as EmbeddingService;

    memoryService = new MemoryService(mockPlugin, mockVectorStore, mockEmbeddingService);

    // Access the snapshots property to override the get method for testing
    mockSnapshots = (memoryService as any).snapshots;
  });

  describe('restoreStateSnapshot', () => {
    it('should restore a state snapshot', async () => {
      // Mock the snapshot to be returned
      const mockSnapshot = {
        id: 'snapshot-id',
        workspaceId: 'workspace-id',
        sessionId: 'session-id',
        timestamp: Date.now(),
        name: 'Test Snapshot',
        state: {
          workspace: {
            id: 'workspace-id',
            name: 'Test Workspace',
          },
          recentTraces: ['trace-1', 'trace-2'],
          contextFiles: ['file1.md', 'file2.md'],
          metadata: {
            key: 'value',
          },
        },
      };

      // Mock the getSnapshot method to return our test snapshot
      jest.spyOn(memoryService, 'getSnapshot').mockResolvedValue(mockSnapshot);

      // Mock the getSession method to return a session
      jest.spyOn(memoryService, 'getSession').mockResolvedValue({
        id: 'session-id',
        workspaceId: 'workspace-id',
        name: 'Test Session',
        startTime: Date.now(),
        isActive: true,
        toolCalls: 0,
      });

      // Call the method
      const result = await memoryService.restoreStateSnapshot('snapshot-id');

      // Verify the result
      expect(result).toEqual({
        stateId: 'snapshot-id',
        name: 'Test Snapshot',
        workspaceId: 'workspace-id',
        sessionId: 'session-id',
        sessionName: 'Test Session',
        timestamp: expect.any(Number),
        recentTraces: ['trace-1', 'trace-2'],
        contextFiles: ['file1.md', 'file2.md'],
        workspace: {
          id: 'workspace-id',
          name: 'Test Workspace',
        },
        metadata: {
          key: 'value',
        },
      });

      // Verify that getSnapshot was called with the correct ID
      expect(memoryService.getSnapshot).toHaveBeenCalledWith('snapshot-id');
      
      // Verify that getSession was called with the correct ID
      expect(memoryService.getSession).toHaveBeenCalledWith('session-id');
    });

    it('should throw an error if the snapshot is not found', async () => {
      // Mock the getSnapshot method to return undefined (not found)
      jest.spyOn(memoryService, 'getSnapshot').mockResolvedValue(undefined);

      // Call the method and expect it to throw
      await expect(memoryService.restoreStateSnapshot('non-existent-id')).rejects.toThrow(
        'State snapshot with ID non-existent-id not found'
      );
    });

    it('should handle session retrieval errors gracefully', async () => {
      // Mock the snapshot to be returned
      const mockSnapshot = {
        id: 'snapshot-id',
        workspaceId: 'workspace-id',
        sessionId: 'session-id',
        timestamp: Date.now(),
        name: 'Test Snapshot',
        state: {
          workspace: {
            id: 'workspace-id',
            name: 'Test Workspace',
          },
          recentTraces: ['trace-1', 'trace-2'],
          contextFiles: ['file1.md', 'file2.md'],
          metadata: {
            key: 'value',
          },
        },
      };

      // Mock the getSnapshot method to return our test snapshot
      jest.spyOn(memoryService, 'getSnapshot').mockResolvedValue(mockSnapshot);

      // Mock the getSession method to throw an error
      jest.spyOn(memoryService, 'getSession').mockRejectedValue(new Error('Session not found'));

      // Call the method - it should still work but without session name
      const result = await memoryService.restoreStateSnapshot('snapshot-id');

      // Verify the result still contains the expected data without sessionName
      expect(result).toEqual({
        stateId: 'snapshot-id',
        name: 'Test Snapshot',
        workspaceId: 'workspace-id',
        sessionId: 'session-id',
        timestamp: expect.any(Number),
        recentTraces: ['trace-1', 'trace-2'],
        contextFiles: ['file1.md', 'file2.md'],
        workspace: {
          id: 'workspace-id',
          name: 'Test Workspace',
        },
        metadata: {
          key: 'value',
        },
      });
    });
  });
});