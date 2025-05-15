import { ProjectWorkspace, WorkspaceMemoryTrace, HierarchyType, WorkspaceStatus } from '../workspace-types';

/**
 * Workspace database interface
 * Handles storage and retrieval of workspace data and memory traces
 */
export interface WorkspaceDatabase {
  /**
   * Initialize the database
   */
  initialize(): Promise<void>;
  
  /**
   * Close the database connection
   */
  close(): Promise<void>;
  
  /**
   * Get all workspaces
   * @param params Optional filter parameters
   */
  getWorkspaces(params?: {
    parentId?: string;
    hierarchyType?: HierarchyType;
    sortBy?: 'name' | 'created' | 'lastAccessed';
    sortOrder?: 'asc' | 'desc';
  }): Promise<ProjectWorkspace[]>;
  
  /**
   * Get a specific workspace by ID
   * @param id Workspace ID
   */
  getWorkspace(id: string): Promise<ProjectWorkspace | undefined>;
  
  /**
   * Create a new workspace
   * @param workspace Workspace data to save
   */
  createWorkspace(workspace: ProjectWorkspace): Promise<string>;
  
  /**
   * Update an existing workspace
   * @param id Workspace ID
   * @param updates Partial workspace data to update
   */
  updateWorkspace(id: string, updates: Partial<ProjectWorkspace>): Promise<void>;
  
  /**
   * Delete a workspace
   * @param id Workspace ID
   * @param options Delete options
   */
  deleteWorkspace(id: string, options?: {
    deleteChildren?: boolean;
    preserveSettings?: boolean;
  }): Promise<void>;
  
  /**
   * Add an activity to a workspace's history
   * @param workspaceId Workspace ID
   * @param activity Activity data
   */
  addActivity(workspaceId: string, activity: ProjectWorkspace['activityHistory'][0]): Promise<void>;
  
  /**
   * Add a checkpoint to a workspace
   * @param workspaceId Workspace ID
   * @param checkpoint Checkpoint data
   */
  addCheckpoint(workspaceId: string, checkpoint: { id: string; date: number; description: string; completed: boolean; hierarchyPath?: string[] }): Promise<string>;
  
  /**
   * Update a checkpoint
   * @param workspaceId Workspace ID
   * @param checkpointId Checkpoint ID
   * @param completed Whether the checkpoint is completed
   */
  updateCheckpoint(workspaceId: string, checkpointId: string, completed: boolean): Promise<void>;
  
  /**
   * Update completion status for a workspace item
   * @param workspaceId Workspace ID
   * @param itemId Item ID
   * @param status New status
   * @param notes Optional completion notes
   */
  updateCompletionStatus(
    workspaceId: string, 
    itemId: string, 
    status: WorkspaceStatus, 
    notes?: string
  ): Promise<void>;
  
  /**
   * Store a memory trace
   * @param trace Memory trace to store
   */
  storeMemoryTrace(trace: WorkspaceMemoryTrace): Promise<string>;
  
  /**
   * Get memory traces for a workspace
   * @param workspaceId Workspace ID
   * @param limit Maximum number of traces to return
   */
  getMemoryTraces(workspaceId: string, limit?: number): Promise<WorkspaceMemoryTrace[]>;
  
  /**
   * Search memory traces by similarity
   * @param embedding Query embedding
   * @param options Search options
   */
  searchMemoryTraces(embedding: number[], options?: {
    workspaceId?: string;
    workspacePath?: string[];
    limit?: number;
    threshold?: number;
  }): Promise<Array<{
    trace: WorkspaceMemoryTrace;
    similarity: number;
  }>>;
  
  /**
   * Get a workspace by path
   * @param path Path to search for
   */
  getWorkspaceByPath(path: string[]): Promise<ProjectWorkspace | undefined>;
  
  /**
   * Update last accessed timestamp for a workspace
   * @param id Workspace ID
   */
  updateLastAccessed(id: string): Promise<void>;
}

/**
 * IndexedDB implementation of workspace database
 */
export class IndexedDBWorkspaceDatabase implements WorkspaceDatabase {
  private db: IDBDatabase | null = null;
  private dbName: string;
  private dbVersion: number;
  
  /**
   * Create a new IndexedDB workspace database
   * @param dbName Database name
   * @param dbVersion Database version
   */
  constructor(dbName = 'workspace-memory-db', dbVersion = 1) {
    this.dbName = dbName;
    this.dbVersion = dbVersion;
  }
  
  /**
   * Initialize the database
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = (event) => {
        reject(new Error(`Failed to open database: ${(event.target as any).error}`));
      };
      
      request.onsuccess = (event) => {
        this.db = (event.target as any).result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as any).result;
        
        // Create workspaces store
        if (!db.objectStoreNames.contains('workspaces')) {
          const workspaceStore = db.createObjectStore('workspaces', { keyPath: 'id' });
          workspaceStore.createIndex('hierarchyType', 'hierarchyType', { unique: false });
          workspaceStore.createIndex('parentId', 'parentId', { unique: false });
          workspaceStore.createIndex('status', 'status', { unique: false });
          workspaceStore.createIndex('lastAccessed', 'lastAccessed', { unique: false });
        }
        
        // Create memory traces store
        if (!db.objectStoreNames.contains('memoryTraces')) {
          const tracesStore = db.createObjectStore('memoryTraces', { keyPath: 'id' });
          tracesStore.createIndex('workspaceId', 'workspaceId', { unique: false });
          tracesStore.createIndex('timestamp', 'timestamp', { unique: false });
          tracesStore.createIndex('activityType', 'activityType', { unique: false });
          tracesStore.createIndex('importance', 'importance', { unique: false });
        }
      };
    });
  }
  
  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
  
  /**
   * Get all workspaces with optional filtering
   */
  async getWorkspaces(params?: {
    parentId?: string;
    hierarchyType?: HierarchyType;
    sortBy?: 'name' | 'created' | 'lastAccessed';
    sortOrder?: 'asc' | 'desc';
  }): Promise<ProjectWorkspace[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['workspaces'], 'readonly');
      const store = transaction.objectStore('workspaces');
      let request: IDBRequest;
      
      // Apply filters if provided
      if (params?.parentId) {
        const index = store.index('parentId');
        request = index.getAll(params.parentId);
      } else if (params?.hierarchyType) {
        const index = store.index('hierarchyType');
        request = index.getAll(params.hierarchyType);
      } else {
        request = store.getAll();
      }
      
      request.onerror = (event) => {
        reject(new Error(`Failed to retrieve workspaces: ${(event.target as any).error}`));
      };
      
      request.onsuccess = (event) => {
        let workspaces = (event.target as any).result as ProjectWorkspace[];
        
        // Apply sorting if requested
        if (params?.sortBy) {
          const sortOrder = params.sortOrder === 'desc' ? -1 : 1;
          workspaces.sort((a, b) => {
            if (params.sortBy === 'name') {
              return sortOrder * a.name.localeCompare(b.name);
            } else if (params.sortBy === 'created') {
              return sortOrder * (a.created - b.created);
            } else if (params.sortBy === 'lastAccessed') {
              return sortOrder * (a.lastAccessed - b.lastAccessed);
            }
            return 0;
          });
        }
        
        resolve(workspaces);
      };
    });
  }
  
  /**
   * Get a specific workspace by ID
   */
  async getWorkspace(id: string): Promise<ProjectWorkspace | undefined> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['workspaces'], 'readonly');
      const store = transaction.objectStore('workspaces');
      const request = store.get(id);
      
      request.onerror = (event) => {
        reject(new Error(`Failed to retrieve workspace: ${(event.target as any).error}`));
      };
      
      request.onsuccess = (event) => {
        resolve((event.target as any).result as ProjectWorkspace | undefined);
      };
    });
  }
  
  /**
   * Create a new workspace
   */
  async createWorkspace(workspace: ProjectWorkspace): Promise<string> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['workspaces'], 'readwrite');
      const store = transaction.objectStore('workspaces');
      const request = store.add(workspace);
      
      request.onerror = (event) => {
        reject(new Error(`Failed to create workspace: ${(event.target as any).error}`));
      };
      
      request.onsuccess = () => {
        resolve(workspace.id);
      };
    });
  }
  
  /**
   * Update an existing workspace
   */
  async updateWorkspace(id: string, updates: Partial<ProjectWorkspace>): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    const workspace = await this.getWorkspace(id);
    if (!workspace) {
      throw new Error(`Workspace with ID ${id} not found`);
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['workspaces'], 'readwrite');
      const store = transaction.objectStore('workspaces');
      
      // Apply updates to the workspace object
      const updatedWorkspace = { ...workspace, ...updates };
      
      const request = store.put(updatedWorkspace);
      
      request.onerror = (event) => {
        reject(new Error(`Failed to update workspace: ${(event.target as any).error}`));
      };
      
      request.onsuccess = () => {
        resolve();
      };
    });
  }
  
  /**
   * Delete a workspace and optionally its children
   */
  async deleteWorkspace(id: string, options?: {
    deleteChildren?: boolean;
    preserveSettings?: boolean;
  }): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    const workspace = await this.getWorkspace(id);
    if (!workspace) {
      throw new Error(`Workspace with ID ${id} not found`);
    }
    
    // If deleteChildren is true, recursively delete child workspaces
    if (options?.deleteChildren && workspace.childWorkspaces.length > 0) {
      for (const childId of workspace.childWorkspaces) {
        await this.deleteWorkspace(childId, options);
      }
    } else if (workspace.childWorkspaces.length > 0) {
      // If not deleting children, update their parentId to the parent of this workspace
      for (const childId of workspace.childWorkspaces) {
        const child = await this.getWorkspace(childId);
        if (child) {
          await this.updateWorkspace(childId, { parentId: workspace.parentId });
        }
      }
    }
    
    // Delete this workspace
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['workspaces'], 'readwrite');
      const store = transaction.objectStore('workspaces');
      const request = store.delete(id);
      
      request.onerror = (event) => {
        reject(new Error(`Failed to delete workspace: ${(event.target as any).error}`));
      };
      
      request.onsuccess = () => {
        resolve();
      };
    });
  }
  
  /**
   * Add an activity to a workspace's history
   */
  async addActivity(workspaceId: string, activity: ProjectWorkspace['activityHistory'][0]): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace with ID ${workspaceId} not found`);
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['workspaces'], 'readwrite');
      const store = transaction.objectStore('workspaces');
      
      // Add the activity to the workspace's history
      const updatedWorkspace = {
        ...workspace,
        activityHistory: [...workspace.activityHistory, activity],
        lastAccessed: activity.timestamp // Update last accessed timestamp
      };
      
      const request = store.put(updatedWorkspace);
      
      request.onerror = (event) => {
        reject(new Error(`Failed to add activity: ${(event.target as any).error}`));
      };
      
      request.onsuccess = () => {
        resolve();
      };
    });
  }
  
  /**
   * Add a checkpoint to a workspace
   */
  async addCheckpoint(workspaceId: string, checkpoint: { id: string; date: number; description: string; completed: boolean; hierarchyPath?: string[] }): Promise<string> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace with ID ${workspaceId} not found`);
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['workspaces'], 'readwrite');
      const store = transaction.objectStore('workspaces');
      
      // Add the checkpoint to the workspace
      const checkpoints = workspace.checkpoints || [];
      const updatedWorkspace = {
        ...workspace,
        checkpoints: [...checkpoints, checkpoint],
        lastAccessed: Date.now() // Update last accessed timestamp
      };
      
      const request = store.put(updatedWorkspace);
      
      request.onerror = (event) => {
        reject(new Error(`Failed to add checkpoint: ${(event.target as any).error}`));
      };
      
      request.onsuccess = () => {
        resolve(checkpoint.id);
      };
    });
  }
  
  /**
   * Update a checkpoint's completion status
   */
  async updateCheckpoint(workspaceId: string, checkpointId: string, completed: boolean): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace with ID ${workspaceId} not found`);
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['workspaces'], 'readwrite');
      const store = transaction.objectStore('workspaces');
      
      const checkpoints = workspace.checkpoints || [];
      const updatedCheckpoints = checkpoints.map(cp => 
        cp.id === checkpointId ? { ...cp, completed } : cp
      );
      
      const updatedWorkspace = {
        ...workspace,
        checkpoints: updatedCheckpoints,
        lastAccessed: Date.now() // Update last accessed timestamp
      };
      
      const request = store.put(updatedWorkspace);
      
      request.onerror = (event) => {
        reject(new Error(`Failed to update checkpoint: ${(event.target as any).error}`));
      };
      
      request.onsuccess = () => {
        resolve();
      };
    });
  }
  
  /**
   * Update completion status for a workspace item
   */
  async updateCompletionStatus(
    workspaceId: string, 
    itemId: string, 
    status: WorkspaceStatus, 
    notes?: string
  ): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace with ID ${workspaceId} not found`);
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['workspaces'], 'readwrite');
      const store = transaction.objectStore('workspaces');
      
      const completionStatus = { 
        ...workspace.completionStatus,
        [itemId]: {
          status: status === 'completed' ? 'completed' : status === 'paused' ? 'in_progress' : 'not_started',
          completedDate: status === 'completed' ? Date.now() : undefined,
          completionNotes: notes
        }
      };
      
      const updatedWorkspace = {
        ...workspace,
        completionStatus,
        lastAccessed: Date.now() // Update last accessed timestamp
      };
      
      const request = store.put(updatedWorkspace);
      
      request.onerror = (event) => {
        reject(new Error(`Failed to update completion status: ${(event.target as any).error}`));
      };
      
      request.onsuccess = () => {
        resolve();
      };
    });
  }
  
  /**
   * Store a memory trace
   */
  async storeMemoryTrace(trace: WorkspaceMemoryTrace): Promise<string> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['memoryTraces'], 'readwrite');
      const store = transaction.objectStore('memoryTraces');
      const request = store.add(trace);
      
      request.onerror = (event) => {
        reject(new Error(`Failed to store memory trace: ${(event.target as any).error}`));
      };
      
      request.onsuccess = () => {
        resolve(trace.id);
      };
    });
  }
  
  /**
   * Get memory traces for a workspace
   */
  async getMemoryTraces(workspaceId: string, limit = 100): Promise<WorkspaceMemoryTrace[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['memoryTraces'], 'readonly');
      const store = transaction.objectStore('memoryTraces');
      const index = store.index('workspaceId');
      const request = index.getAll(workspaceId);
      
      request.onerror = (event) => {
        reject(new Error(`Failed to retrieve memory traces: ${(event.target as any).error}`));
      };
      
      request.onsuccess = (event) => {
        let traces = (event.target as any).result as WorkspaceMemoryTrace[];
        
        // Sort by timestamp (newest first) and apply limit
        traces.sort((a, b) => b.timestamp - a.timestamp);
        traces = traces.slice(0, limit);
        
        resolve(traces);
      };
    });
  }
  
  /**
   * Search memory traces by similarity
   * This is a simplified implementation. For production, use a proper vector similarity search.
   */
  async searchMemoryTraces(embedding: number[], options?: {
    workspaceId?: string;
    workspacePath?: string[];
    limit?: number;
    threshold?: number;
  }): Promise<Array<{
    trace: WorkspaceMemoryTrace;
    similarity: number;
  }>> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    const limit = options?.limit || 10;
    const threshold = options?.threshold || 0.7;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['memoryTraces'], 'readonly');
      const store = transaction.objectStore('memoryTraces');
      
      let request: IDBRequest;
      
      // Filter by workspace if specified
      if (options?.workspaceId) {
        const index = store.index('workspaceId');
        request = index.getAll(options.workspaceId);
      } else {
        request = store.getAll();
      }
      
      request.onerror = (event) => {
        reject(new Error(`Failed to search memory traces: ${(event.target as any).error}`));
      };
      
      request.onsuccess = (event) => {
        let traces = (event.target as any).result as WorkspaceMemoryTrace[];
        
        // Filter by workspace path if specified
        if (options?.workspacePath && options.workspacePath.length > 0) {
          const pathString = options.workspacePath.join('/');
          traces = traces.filter(trace => {
            const tracePathString = trace.workspacePath.join('/');
            return tracePathString.startsWith(pathString);
          });
        }
        
        // Calculate cosine similarity for each trace
        const results = traces.map(trace => {
          const similarity = this.calculateCosineSimilarity(embedding, trace.embedding);
          return { trace, similarity };
        });
        
        // Filter by threshold
        const filteredResults = results.filter(result => result.similarity >= threshold);
        
        // Sort by similarity (highest first) and apply limit
        filteredResults.sort((a, b) => b.similarity - a.similarity);
        
        resolve(filteredResults.slice(0, limit));
      };
    });
  }
  
  /**
   * Get a workspace by path
   */
  async getWorkspaceByPath(path: string[]): Promise<ProjectWorkspace | undefined> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    // Get all workspaces and find the one with the matching path
    const workspaces = await this.getWorkspaces();
    return workspaces.find(ws => {
      if (ws.path.length !== path.length) return false;
      return ws.path.every((p, i) => p === path[i]);
    });
  }
  
  /**
   * Update last accessed timestamp for a workspace
   */
  async updateLastAccessed(id: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    const workspace = await this.getWorkspace(id);
    if (!workspace) {
      throw new Error(`Workspace with ID ${id} not found`);
    }
    
    return this.updateWorkspace(id, { lastAccessed: Date.now() });
  }
  
  /**
   * Calculate cosine similarity between two vectors
   * @param a First vector
   * @param b Second vector
   * @returns Similarity score (0-1)
   */
  private calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimensions');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}