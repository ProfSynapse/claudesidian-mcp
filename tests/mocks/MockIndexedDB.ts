/**
 * MockIndexedDB - In-memory IndexedDB simulation for testing HNSW persistence
 * Supports IDBFS filesystem simulation for WASM compatibility
 * Provides comprehensive debugging and failure simulation capabilities
 */

export interface MockDBTransaction {
  objectStore(storeName: string): MockObjectStore;
}

export interface MockObjectStore {
  get(key: string): MockRequest;
  put(value: any, key?: string): MockRequest;
  delete(key: string): MockRequest;
  clear(): MockRequest;
  getAll(): MockRequest;
  getAllKeys(): MockRequest;
}

export interface MockRequest {
  onsuccess: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  result: any;
}

/**
 * In-memory IndexedDB implementation with IDBFS simulation
 * Tracks all operations for debugging and supports failure injection
 */
export class MockIndexedDB {
  private databases: Map<string, Map<string, Map<string, any>>> = new Map();
  private operations: Array<{
    timestamp: number;
    operation: string;
    database: string;
    store: string;
    key?: string;
    success: boolean;
  }> = [];
  
  private failureConfig: {
    failOnGet?: boolean;
    failOnPut?: boolean;
    failOnDelete?: boolean;
    quotaExceeded?: boolean;
  } = {};

  constructor() {
    this.setupGlobalIndexedDB();
  }

  /**
   * Setup global IndexedDB mock for WASM compatibility
   */
  private setupGlobalIndexedDB(): void {
    // @ts-ignore - Mock global IndexedDB
    global.indexedDB = {
      open: (name: string, version?: number) => this.open(name, version),
      deleteDatabase: (name: string) => this.deleteDatabase(name)
    };

    // @ts-ignore - Mock IDBKeyRange for queries
    global.IDBKeyRange = {
      bound: (lower: any, upper: any) => ({ lower, upper }),
      only: (value: any) => ({ value }),
      lowerBound: (bound: any) => ({ lower: bound }),
      upperBound: (bound: any) => ({ upper: bound })
    };
  }

  /**
   * Open database connection (returns mock DB)
   */
  open(name: string, version: number = 1): MockRequest {
    const request = this.createRequest();

    setTimeout(() => {
      if (!this.databases.has(name)) {
        this.databases.set(name, new Map());
      }
      
      const mockDB = {
        name,
        version,
        transaction: (storeNames: string[], mode: string = 'readonly') => 
          this.createTransaction(name, storeNames, mode),
        createObjectStore: (storeName: string, options?: any) => 
          this.createObjectStore(name, storeName, options),
        close: () => {}
      };

      this.recordOperation('open', name, '', undefined, true);
      request.result = mockDB;
      request.onsuccess?.({ target: request });
    }, 0);

    return request;
  }

  /**
   * Delete database
   */
  deleteDatabase(name: string): MockRequest {
    const request = this.createRequest();

    setTimeout(() => {
      const existed = this.databases.has(name);
      this.databases.delete(name);
      
      this.recordOperation('deleteDatabase', name, '', undefined, true);
      request.result = undefined;
      request.onsuccess?.({ target: request });
    }, 0);

    return request;
  }

  /**
   * Create object store
   */
  private createObjectStore(dbName: string, storeName: string, options?: any): MockObjectStore {
    const database = this.databases.get(dbName);
    if (!database) {
      throw new Error(`Database ${dbName} not found`);
    }

    if (!database.has(storeName)) {
      database.set(storeName, new Map());
    }

    return this.createMockObjectStore(dbName, storeName);
  }

  /**
   * Create transaction
   */
  private createTransaction(dbName: string, storeNames: string[], mode: string): MockDBTransaction {
    return {
      objectStore: (storeName: string) => this.createMockObjectStore(dbName, storeName)
    };
  }

  /**
   * Create mock object store with full CRUD operations
   */
  private createMockObjectStore(dbName: string, storeName: string): MockObjectStore {
    return {
      get: (key: string) => this.get(dbName, storeName, key),
      put: (value: any, key?: string) => this.put(dbName, storeName, value, key),
      delete: (key: string) => this.delete(dbName, storeName, key),
      clear: () => this.clear(dbName, storeName),
      getAll: () => this.getAll(dbName, storeName),
      getAllKeys: () => this.getAllKeys(dbName, storeName)
    };
  }

  /**
   * Get value from store
   */
  private get(dbName: string, storeName: string, key: string): MockRequest {
    const request = this.createRequest();

    setTimeout(() => {
      if (this.failureConfig.failOnGet) {
        this.recordOperation('get', dbName, storeName, key, false);
        request.onerror?.({ target: request });
        return;
      }

      const database = this.databases.get(dbName);
      const store = database?.get(storeName);
      const value = store?.get(key);

      this.recordOperation('get', dbName, storeName, key, true);
      request.result = value;
      request.onsuccess?.({ target: request });
    }, 0);

    return request;
  }

  /**
   * Put value into store
   */
  private put(dbName: string, storeName: string, value: any, key?: string): MockRequest {
    const request = this.createRequest();

    setTimeout(() => {
      if (this.failureConfig.failOnPut || this.failureConfig.quotaExceeded) {
        this.recordOperation('put', dbName, storeName, key, false);
        const error = this.failureConfig.quotaExceeded 
          ? new Error('QuotaExceededError') 
          : new Error('Put operation failed');
        request.onerror?.({ target: request, error });
        return;
      }

      const database = this.databases.get(dbName);
      if (!database) {
        this.recordOperation('put', dbName, storeName, key, false);
        request.onerror?.({ target: request });
        return;
      }

      if (!database.has(storeName)) {
        database.set(storeName, new Map());
      }

      const store = database.get(storeName)!;
      const finalKey = key || `auto-${Date.now()}-${Math.random()}`;
      store.set(finalKey, value);

      this.recordOperation('put', dbName, storeName, finalKey, true);
      request.result = finalKey;
      request.onsuccess?.({ target: request });
    }, 0);

    return request;
  }

  /**
   * Delete value from store
   */
  private delete(dbName: string, storeName: string, key: string): MockRequest {
    const request = this.createRequest();

    setTimeout(() => {
      if (this.failureConfig.failOnDelete) {
        this.recordOperation('delete', dbName, storeName, key, false);
        request.onerror?.({ target: request });
        return;
      }

      const database = this.databases.get(dbName);
      const store = database?.get(storeName);
      const deleted = store?.delete(key) || false;

      this.recordOperation('delete', dbName, storeName, key, true);
      request.result = undefined;
      request.onsuccess?.({ target: request });
    }, 0);

    return request;
  }

  /**
   * Clear all values from store
   */
  private clear(dbName: string, storeName: string): MockRequest {
    const request = this.createRequest();

    setTimeout(() => {
      const database = this.databases.get(dbName);
      const store = database?.get(storeName);
      store?.clear();

      this.recordOperation('clear', dbName, storeName, undefined, true);
      request.result = undefined;
      request.onsuccess?.({ target: request });
    }, 0);

    return request;
  }

  /**
   * Get all values from store
   */
  private getAll(dbName: string, storeName: string): MockRequest {
    const request = this.createRequest();

    setTimeout(() => {
      const database = this.databases.get(dbName);
      const store = database?.get(storeName);
      const values = store ? Array.from(store.values()) : [];

      this.recordOperation('getAll', dbName, storeName, undefined, true);
      request.result = values;
      request.onsuccess?.({ target: request });
    }, 0);

    return request;
  }

  /**
   * Get all keys from store
   */
  private getAllKeys(dbName: string, storeName: string): MockRequest {
    const request = this.createRequest();

    setTimeout(() => {
      const database = this.databases.get(dbName);
      const store = database?.get(storeName);
      const keys = store ? Array.from(store.keys()) : [];

      this.recordOperation('getAllKeys', dbName, storeName, undefined, true);
      request.result = keys;
      request.onsuccess?.({ target: request });
    }, 0);

    return request;
  }

  /**
   * Create mock request object
   */
  private createRequest(): MockRequest {
    return {
      onsuccess: null,
      onerror: null,
      result: undefined
    };
  }

  /**
   * Record operation for debugging
   */
  private recordOperation(
    operation: string, 
    database: string, 
    store: string, 
    key?: string, 
    success: boolean = true
  ): void {
    this.operations.push({
      timestamp: Date.now(),
      operation,
      database,
      store,
      key,
      success
    });
  }

  // === Testing Utilities ===

  /**
   * Configure failure simulation
   */
  setFailureMode(config: typeof this.failureConfig): void {
    this.failureConfig = { ...config };
  }

  /**
   * Get all recorded operations for debugging
   */
  getOperationHistory(): typeof this.operations {
    return [...this.operations];
  }

  /**
   * Get current database state for verification
   */
  getDatabaseState(dbName?: string): any {
    if (dbName) {
      const database = this.databases.get(dbName);
      if (!database) return null;
      
      const state: any = {};
      for (const [storeName, store] of database.entries()) {
        state[storeName] = Object.fromEntries(store.entries());
      }
      return state;
    }

    const allDatabases: any = {};
    for (const [dbName, database] of this.databases.entries()) {
      allDatabases[dbName] = {};
      for (const [storeName, store] of database.entries()) {
        allDatabases[dbName][storeName] = Object.fromEntries(store.entries());
      }
    }
    return allDatabases;
  }

  /**
   * Reset all data and operations
   */
  reset(): void {
    this.databases.clear();
    this.operations.length = 0;
    this.failureConfig = {};
  }

  /**
   * Check if data exists
   */
  hasData(dbName: string, storeName: string, key?: string): boolean {
    const database = this.databases.get(dbName);
    if (!database) return false;
    
    const store = database.get(storeName);
    if (!store) return false;
    
    if (key) {
      return store.has(key);
    }
    
    return store.size > 0;
  }

  /**
   * Get storage size estimate (for quota testing)
   */
  getStorageSize(): number {
    let totalSize = 0;
    
    for (const [dbName, database] of this.databases.entries()) {
      for (const [storeName, store] of database.entries()) {
        for (const [key, value] of store.entries()) {
          totalSize += JSON.stringify({ key, value }).length;
        }
      }
    }
    
    return totalSize;
  }
}