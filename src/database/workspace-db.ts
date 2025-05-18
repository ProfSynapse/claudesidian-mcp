import { ProjectWorkspace, WorkspaceMemoryTrace, HierarchyType, WorkspaceStatus, WorkspaceSession, WorkspaceStateSnapshot, FileEmbedding } from './workspace-types';

// Using FileEmbedding from workspace-types.ts

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
    sessionId?: string;
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
  
  /**
   * Create a new session
   * @param session Session data
   */
  createSession(session: WorkspaceSession): Promise<string>;
  
  /**
   * Update an existing session
   * @param id Session ID
   * @param updates Partial session data to update
   */
  updateSession(id: string, updates: Partial<WorkspaceSession>): Promise<void>;
  
  /**
   * Get a session by ID
   * @param id Session ID
   */
  getSession(id: string): Promise<WorkspaceSession | undefined>;
  
  /**
   * Get all sessions for a workspace
   * @param workspaceId Workspace ID
   * @param activeOnly Whether to only return active sessions
   */
  getSessions(workspaceId: string, activeOnly?: boolean): Promise<WorkspaceSession[]>;
  
  /**
   * Get all sessions across all workspaces
   * @param activeOnly Whether to only return active sessions
   */
  getAllSessions(activeOnly?: boolean): Promise<WorkspaceSession[]>;
  
  /**
   * End an active session
   * @param id Session ID
   * @param summary Optional summary of the session
   */
  endSession(id: string, summary?: string): Promise<void>;
  
  /**
   * Get memory traces for a specific session
   * @param sessionId Session ID
   * @param limit Maximum number of traces to return
   */
  getSessionTraces(sessionId: string, limit?: number): Promise<WorkspaceMemoryTrace[]>;
  
  /**
   * Create a workspace state snapshot
   * @param snapshot Snapshot data
   */
  createSnapshot(snapshot: WorkspaceStateSnapshot): Promise<string>;
  
  /**
   * Get a snapshot by ID
   * @param id Snapshot ID
   */
  getSnapshot(id: string): Promise<WorkspaceStateSnapshot | undefined>;
  
  /**
   * Get all snapshots for a workspace
   * @param workspaceId Workspace ID
   * @param sessionId Optional session ID to filter by
   */
  getSnapshots(workspaceId: string, sessionId?: string): Promise<WorkspaceStateSnapshot[]>;
  
  /**
   * Delete a snapshot
   * @param id Snapshot ID
   */
  deleteSnapshot(id: string): Promise<void>;
  
  /**
   * Store an embedding
   * @param embedding Embedding data to store
   */
  storeEmbedding(embedding: FileEmbedding): Promise<string>;
  
  /**
   * Get an embedding by file path
   * @param filePath File path to get embedding for
   */
  getEmbeddingByPath(filePath: string): Promise<FileEmbedding | undefined>;
  
  /**
   * Get all embeddings
   */
  getAllEmbeddings(): Promise<FileEmbedding[]>;
  
  /**
   * Delete embedding for a file
   * @param filePath File path to delete embedding for
   */
  deleteEmbeddingByPath(filePath: string): Promise<void>;
}

/**
 * IndexedDB implementation of workspace database
 */
export class IndexedDBWorkspaceDatabase implements WorkspaceDatabase {
  public db: IDBDatabase | null = null;
  private dbName: string;
  private dbVersion: number;
  
  /**
   * Create a new IndexedDB workspace database
   * @param dbName Database name
   * @param dbVersion Database version
   */
  constructor(dbName = 'workspace-memory-db', dbVersion = 7) { // Further increased version to force a fresh upgrade
    this.dbName = dbName;
    this.dbVersion = dbVersion;
    console.log(`Initializing workspace database ${dbName} with version ${dbVersion}`);
  }
  
  /**
   * Initialize the database
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`Opening database ${this.dbName} with version ${this.dbVersion}`);
      
      try {
        const request = indexedDB.open(this.dbName, this.dbVersion);
        
        request.onerror = (event) => {
          console.error("Database error:", (event.target as any).error);
          reject(new Error(`Failed to open database: ${(event.target as any).error}`));
        };
        
        request.onsuccess = (event) => {
          this.db = (event.target as any).result;
          console.log(`Successfully opened database ${this.dbName} version ${this.db?.version || 'unknown'}`);
          
          // Verify database structure, but don't fail if verification fails
          if (!this.verifyDatabaseStructure()) {
            console.warn(`Database structure verification failed for ${this.dbName}. Some features may not work correctly.`);
          }
          
          resolve();
        };
        
        request.onupgradeneeded = (event) => {
          console.log(`Database upgrade needed - from version ${event.oldVersion} to ${this.dbVersion}`);
          const db = (event.target as any).result;
          
          try {
            this.setupDatabaseSchema(db, event.oldVersion);
          } catch (error) {
            console.error("Error during database upgrade:", error);
            request.transaction?.abort();
            reject(new Error(`Database upgrade failed: ${error.message}`));
          }
        };
        
        request.onblocked = (event) => {
          console.warn("Database upgrade was blocked. Please close other tabs using this application.");
          // We could show a user-facing message here if needed
        };
      } catch (error) {
        console.error("Error initializing database:", error);
        reject(new Error(`Failed to initialize database: ${error.message}`));
      }
    });
  }
  
  /**
   * Verify that the database has the expected object stores
   * This is a simplified verification that just checks store existence, not indexes
   */
  private verifyDatabaseStructure(): boolean {
    if (!this.db) {
      console.warn('Database not initialized');
      return false;
    }
    
    // List of required stores
    const requiredStores = ['workspaces', 'memoryTraces', 'sessions', 'snapshots', 'embeddings'];
    
    // Check each store exists
    for (const storeName of requiredStores) {
      if (!this.db.objectStoreNames.contains(storeName)) {
        console.warn(`Required object store '${storeName}' not found`);
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Set up the database schema
   * @param db The database connection
   * @param oldVersion The old database version
   */
  private setupDatabaseSchema(db: IDBDatabase, oldVersion: number): void {
    // Note: During onupgradeneeded, a version change transaction is automatically created,
    // so we don't need to (and shouldn't) create additional transactions
    
    // Setup workspaces store
    let workspaceStore: IDBObjectStore;
    if (!db.objectStoreNames.contains('workspaces')) {
      workspaceStore = db.createObjectStore('workspaces', { keyPath: 'id' });
      
      // Create indexes for new store
      workspaceStore.createIndex('hierarchyType', 'hierarchyType', { unique: false });
      workspaceStore.createIndex('parentId', 'parentId', { unique: false });
      workspaceStore.createIndex('status', 'status', { unique: false });
      workspaceStore.createIndex('lastAccessed', 'lastAccessed', { unique: false });
    }
    
    // Setup memory traces store
    let tracesStore: IDBObjectStore;
    if (!db.objectStoreNames.contains('memoryTraces')) {
      tracesStore = db.createObjectStore('memoryTraces', { keyPath: 'id' });
      
      // Create indexes for new store
      tracesStore.createIndex('workspaceId', 'workspaceId', { unique: false });
      tracesStore.createIndex('timestamp', 'timestamp', { unique: false });
      tracesStore.createIndex('activityType', 'activityType', { unique: false });
      tracesStore.createIndex('importance', 'importance', { unique: false });
      tracesStore.createIndex('sessionId', 'sessionId', { unique: false });
      tracesStore.createIndex('sequenceNumber', 'sequenceNumber', { unique: false });
    }
    
    // Setup sessions store
    let sessionsStore: IDBObjectStore;
    if (!db.objectStoreNames.contains('sessions')) {
      sessionsStore = db.createObjectStore('sessions', { keyPath: 'id' });
      
      // Create indexes for new store
      sessionsStore.createIndex('workspaceId', 'workspaceId', { unique: false });
      sessionsStore.createIndex('startTime', 'startTime', { unique: false });
      sessionsStore.createIndex('isActive', 'isActive', { unique: false });
    }
    
    // Setup snapshots store
    let snapshotsStore: IDBObjectStore;
    if (!db.objectStoreNames.contains('snapshots')) {
      snapshotsStore = db.createObjectStore('snapshots', { keyPath: 'id' });
      
      // Create indexes for new store
      snapshotsStore.createIndex('workspaceId', 'workspaceId', { unique: false });
      snapshotsStore.createIndex('sessionId', 'sessionId', { unique: false });
      snapshotsStore.createIndex('timestamp', 'timestamp', { unique: false });
      snapshotsStore.createIndex('name', 'name', { unique: false });
    }
    
    // Setup embeddings store
    let embeddingsStore: IDBObjectStore;
    if (!db.objectStoreNames.contains('embeddings')) {
      embeddingsStore = db.createObjectStore('embeddings', { keyPath: 'id' });
      
      // Create indexes for new store
      embeddingsStore.createIndex('filePath', 'filePath', { unique: true });
      embeddingsStore.createIndex('timestamp', 'timestamp', { unique: false });
      embeddingsStore.createIndex('workspaceId', 'workspaceId', { unique: false });
    }
    
    console.log(`Database schema setup complete for version ${db.version}`);
  }
  
  // We no longer need the ensureIndexExists method since we're creating indexes
  // directly during object store creation in the onupgradeneeded event handler
  
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
    sessionId?: string;
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
  
  /**
   * Create a new session
   * @param session Session data to save
   */
  async createSession(session: WorkspaceSession): Promise<string> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions'], 'readwrite');
      const store = transaction.objectStore('sessions');
      const request = store.add(session);
      
      request.onerror = (event) => {
        reject(new Error(`Failed to create session: ${(event.target as any).error}`));
      };
      
      request.onsuccess = () => {
        resolve(session.id);
      };
    });
  }
  
  /**
   * Update an existing session
   * @param id Session ID
   * @param updates Partial session data to update
   */
  async updateSession(id: string, updates: Partial<WorkspaceSession>): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    const session = await this.getSession(id);
    if (!session) {
      throw new Error(`Session with ID ${id} not found`);
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions'], 'readwrite');
      const store = transaction.objectStore('sessions');
      
      // Apply updates to the session object
      const updatedSession = { ...session, ...updates };
      
      const request = store.put(updatedSession);
      
      request.onerror = (event) => {
        reject(new Error(`Failed to update session: ${(event.target as any).error}`));
      };
      
      request.onsuccess = () => {
        resolve();
      };
    });
  }
  
  /**
   * Get a session by ID
   * @param id Session ID
   */
  async getSession(id: string): Promise<WorkspaceSession | undefined> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const request = store.get(id);
      
      request.onerror = (event) => {
        reject(new Error(`Failed to retrieve session: ${(event.target as any).error}`));
      };
      
      request.onsuccess = (event) => {
        resolve((event.target as any).result as WorkspaceSession | undefined);
      };
    });
  }
  
  /**
   * Get all sessions for a workspace
   * @param workspaceId Workspace ID
   * @param activeOnly Whether to only return active sessions
   */
  async getSessions(workspaceId: string, activeOnly: boolean = false): Promise<WorkspaceSession[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const index = store.index('workspaceId');
      const request = index.getAll(workspaceId);
      
      request.onerror = (event) => {
        reject(new Error(`Failed to retrieve sessions: ${(event.target as any).error}`));
      };
      
      request.onsuccess = (event) => {
        let sessions = (event.target as any).result as WorkspaceSession[];
        
        // Filter by active status if requested
        if (activeOnly) {
          sessions = sessions.filter(session => session.isActive);
        }
        
        // Sort by start time (newest first)
        sessions.sort((a, b) => b.startTime - a.startTime);
        
        resolve(sessions);
      };
    });
  }
  
  /**
   * Get all sessions across all workspaces
   * @param activeOnly Whether to only return active sessions
   */
  async getAllSessions(activeOnly: boolean = false): Promise<WorkspaceSession[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const request = store.getAll();
      
      request.onerror = (event) => {
        reject(new Error(`Failed to retrieve all sessions: ${(event.target as any).error}`));
      };
      
      request.onsuccess = (event) => {
        let sessions = (event.target as any).result as WorkspaceSession[];
        
        // Filter by active status if requested
        if (activeOnly) {
          sessions = sessions.filter(session => session.isActive);
        }
        
        // Sort by start time (newest first)
        sessions.sort((a, b) => b.startTime - a.startTime);
        
        resolve(sessions);
      };
    });
  }
  
  /**
   * End an active session
   * @param id Session ID
   * @param summary Optional summary of the session
   */
  async endSession(id: string, summary?: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    const session = await this.getSession(id);
    if (!session) {
      throw new Error(`Session with ID ${id} not found`);
    }
    
    return this.updateSession(id, {
      isActive: false,
      endTime: Date.now(),
      activitySummary: summary
    });
  }
  
  /**
   * Get memory traces for a specific session
   * @param sessionId Session ID
   * @param limit Maximum number of traces to return
   */
  async getSessionTraces(sessionId: string, limit: number = 100): Promise<WorkspaceMemoryTrace[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    try {
      return await this.getSessionTracesUsingIndex(sessionId, limit);
    } catch (error) {
      console.warn(`Error getting session traces using index: ${error.message}`);
      console.warn('Falling back to filtering all traces');
      
      // Fallback: get all traces and filter by sessionId in memory
      try {
        const allTraces = await this.getAllMemoryTraces();
        const sessionTraces = allTraces.filter(trace => trace.sessionId === sessionId);
        
        // Sort by sequence number if available, otherwise by timestamp
        sessionTraces.sort((a, b) => {
          if (a.sequenceNumber !== undefined && b.sequenceNumber !== undefined) {
            return a.sequenceNumber - b.sequenceNumber;
          }
          return a.timestamp - b.timestamp;
        });
        
        return sessionTraces.slice(0, limit);
      } catch (fallbackError) {
        console.error(`Fallback also failed: ${fallbackError.message}`);
        // Return empty array as last resort
        return [];
      }
    }
  }
  
  /**
   * Internal method that uses the sessionId index to get traces
   * @param sessionId Session ID
   * @param limit Maximum number of traces to return
   */
  private async getSessionTracesUsingIndex(sessionId: string, limit: number = 100): Promise<WorkspaceMemoryTrace[]> {
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(['memoryTraces'], 'readonly');
        const store = transaction.objectStore('memoryTraces');
        
        // Try to get the sessionId index
        let index;
        try {
          index = store.index('sessionId');
        } catch (indexError) {
          reject(new Error(`Index 'sessionId' not found: ${indexError.message}`));
          return;
        }
        
        const request = index.getAll(sessionId);
        
        request.onerror = (event) => {
          reject(new Error(`Failed to retrieve session traces: ${(event.target as any).error}`));
        };
        
        request.onsuccess = (event) => {
          let traces = (event.target as any).result as WorkspaceMemoryTrace[];
          
          // Sort by sequence number if available, otherwise by timestamp
          traces.sort((a, b) => {
            if (a.sequenceNumber !== undefined && b.sequenceNumber !== undefined) {
              return a.sequenceNumber - b.sequenceNumber;
            }
            return a.timestamp - b.timestamp;
          });
          
          traces = traces.slice(0, limit);
          
          resolve(traces);
        };
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Get all memory traces (used as a fallback)
   */
  private async getAllMemoryTraces(): Promise<WorkspaceMemoryTrace[]> {
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(['memoryTraces'], 'readonly');
        const store = transaction.objectStore('memoryTraces');
        const request = store.getAll();
        
        request.onerror = (event) => {
          reject(new Error(`Failed to retrieve all memory traces: ${(event.target as any).error}`));
        };
        
        request.onsuccess = (event) => {
          resolve((event.target as any).result as WorkspaceMemoryTrace[]);
        };
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Create a workspace state snapshot
   * @param snapshot Snapshot data
   */
  async createSnapshot(snapshot: WorkspaceStateSnapshot): Promise<string> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['snapshots'], 'readwrite');
      const store = transaction.objectStore('snapshots');
      const request = store.add(snapshot);
      
      request.onerror = (event) => {
        reject(new Error(`Failed to create snapshot: ${(event.target as any).error}`));
      };
      
      request.onsuccess = () => {
        resolve(snapshot.id);
      };
    });
  }
  
  /**
   * Get a snapshot by ID
   * @param id Snapshot ID
   */
  async getSnapshot(id: string): Promise<WorkspaceStateSnapshot | undefined> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['snapshots'], 'readonly');
      const store = transaction.objectStore('snapshots');
      const request = store.get(id);
      
      request.onerror = (event) => {
        reject(new Error(`Failed to retrieve snapshot: ${(event.target as any).error}`));
      };
      
      request.onsuccess = (event) => {
        resolve((event.target as any).result as WorkspaceStateSnapshot | undefined);
      };
    });
  }
  
  /**
   * Get all snapshots for a workspace
   * @param workspaceId Workspace ID
   * @param sessionId Optional session ID to filter by
   */
  async getSnapshots(workspaceId: string, sessionId?: string): Promise<WorkspaceStateSnapshot[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    // First check if the snapshots store and workspaceId index exist
    if (!this.db.objectStoreNames.contains('snapshots')) {
      console.error('Snapshots object store does not exist');
      return []; // Return empty array instead of failing
    }

    // Use a more robust approach that doesn't rely on the index
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(['snapshots'], 'readonly');
        const store = transaction.objectStore('snapshots');
        
        // First try using the index if it exists
        let request: IDBRequest;
        let errorUsingIndex = false;

        try {
          const index = store.index('workspaceId');
          request = index.getAll(workspaceId);
        } catch (indexError) {
          console.warn(`Error using workspaceId index: ${indexError.message}, falling back to full scan`);
          errorUsingIndex = true;
          request = store.getAll();
        }
        
        request.onerror = (event) => {
          console.error(`Failed to retrieve snapshots: ${(event.target as any).error}`);
          // Instead of rejecting, return an empty array
          resolve([]);
        };
        
        request.onsuccess = (event) => {
          try {
            let snapshots = (event.target as any).result as WorkspaceStateSnapshot[];
            
            // If we did a full scan due to index error, filter by workspaceId
            if (errorUsingIndex) {
              snapshots = snapshots.filter(snapshot => snapshot.workspaceId === workspaceId);
            }
            
            // Filter by session ID if requested
            if (sessionId) {
              snapshots = snapshots.filter(snapshot => snapshot.sessionId === sessionId);
            }
            
            // Sort by timestamp (newest first)
            snapshots.sort((a, b) => b.timestamp - a.timestamp);
            
            console.log(`Found ${snapshots.length} snapshots for workspace ${workspaceId}`);
            resolve(snapshots);
          } catch (processingError) {
            console.error(`Error processing snapshots: ${processingError.message}`);
            resolve([]);
          }
        };
      } catch (transactionError) {
        console.error(`Error creating transaction: ${transactionError.message}`);
        resolve([]);
      }
    });
  }
  
  /**
   * Delete a snapshot
   * @param id Snapshot ID
   */
  async deleteSnapshot(id: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['snapshots'], 'readwrite');
      const store = transaction.objectStore('snapshots');
      const request = store.delete(id);
      
      request.onerror = (event) => {
        reject(new Error(`Failed to delete snapshot: ${(event.target as any).error}`));
      };
      
      request.onsuccess = () => {
        resolve();
      };
    });
  }
  
  /**
   * Store an embedding
   * @param embedding Embedding data to store
   */
  async storeEmbedding(embedding: {
    id: string;
    filePath: string;
    timestamp: number;
    workspaceId?: string;
    vector: number[];
    metadata?: any;
  }): Promise<string> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['embeddings'], 'readwrite');
      const store = transaction.objectStore('embeddings');
      const request = store.put(embedding);
      
      request.onerror = (event) => {
        reject(new Error(`Failed to store embedding: ${(event.target as any).error}`));
      };
      
      request.onsuccess = () => {
        resolve(embedding.id);
      };
    });
  }
  
  /**
   * Get an embedding by file path
   * @param filePath File path to get embedding for
   */
  async getEmbeddingByPath(filePath: string): Promise<{
    id: string;
    filePath: string;
    timestamp: number;
    workspaceId?: string;
    vector: number[];
    metadata?: any;
  } | undefined> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['embeddings'], 'readonly');
      const store = transaction.objectStore('embeddings');
      const index = store.index('filePath');
      const request = index.get(filePath);
      
      request.onerror = (event) => {
        reject(new Error(`Failed to get embedding: ${(event.target as any).error}`));
      };
      
      request.onsuccess = (event) => {
        resolve((event.target as any).result);
      };
    });
  }
  
  /**
   * Get all embeddings
   */
  async getAllEmbeddings(): Promise<Array<{
    id: string;
    filePath: string;
    timestamp: number;
    workspaceId?: string;
    vector: number[];
    metadata?: any;
  }>> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['embeddings'], 'readonly');
      const store = transaction.objectStore('embeddings');
      const request = store.getAll();
      
      request.onerror = (event) => {
        reject(new Error(`Failed to get embeddings: ${(event.target as any).error}`));
      };
      
      request.onsuccess = (event) => {
        resolve((event.target as any).result);
      };
    });
  }
  
  /**
   * Delete embedding for a file
   * @param filePath File path to delete embedding for
   */
  async deleteEmbeddingByPath(filePath: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    // First get the embedding to find its ID
    const embedding = await this.getEmbeddingByPath(filePath);
    if (!embedding) {
      return; // Nothing to delete
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['embeddings'], 'readwrite');
      const store = transaction.objectStore('embeddings');
      const request = store.delete(embedding.id);
      
      request.onerror = (event) => {
        reject(new Error(`Failed to delete embedding: ${(event.target as any).error}`));
      };
      
      request.onsuccess = () => {
        resolve();
      };
    });
  }
}