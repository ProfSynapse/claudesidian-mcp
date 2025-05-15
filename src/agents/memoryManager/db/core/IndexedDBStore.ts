import { IDBStore, IDBPDatabase, MemoryDB, DatabaseStats } from '../interfaces';
import { DEFAULT_DB_NAME, DB_VERSION, STORE_NAMES, INDEX_NAMES, EMBEDDING_SIZE_KB } from '../constants';

/**
 * Core database class that handles IndexedDB operations
 * Provides a wrapper around the native IndexedDB API
 */
export class IndexedDBStore implements IDBStore {
    private db: IDBPDatabase<MemoryDB> | null = null;
    private dbName: string;
    private storeName = STORE_NAMES.EMBEDDINGS;
    
    /**
     * Create a new IndexedDB store
     * @param dbName The name of the database to use
     */
    constructor(dbName: string = DEFAULT_DB_NAME) {
        this.dbName = dbName;
    }
    
    /**
     * Get the store name
     * @returns The name of the store
     */
    getStoreName(): string {
        return this.storeName;
    }
    
    /**
     * Get a transaction for the database
     * @param storeName The name of the store
     * @param mode The transaction mode (readonly or readwrite)
     * @returns A transaction object
     */
    getTransaction(storeName: string, mode: 'readonly' | 'readwrite'): any {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        return this.db.transaction(storeName, mode);
    }
    
    /**
     * Initialize the database connection
     * Creates the database and object stores if they don't exist
     */
    async initialize(): Promise<void> {
        if (this.db) {
            return; // Already initialized
        }
        
        try {
            this.db = await this.openDatabase();
            console.log(`Vector store initialized: ${this.dbName}`);
        } catch (error: any) {
            console.error('Failed to initialize vector store:', error);
            throw new Error(`Failed to initialize vector store: ${error.message}`);
        }
    }
    
    /**
     * Open the database
     * This is a simplified version that would normally use the idb package
     */
    private async openDatabase(): Promise<IDBPDatabase<MemoryDB>> {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error('IndexedDB not supported'));
                return;
            }
            
            const request = window.indexedDB.open(this.dbName, DB_VERSION);
            
            request.onerror = (event) => {
                reject(new Error('Failed to open database'));
            };
            
            request.onsuccess = (event) => {
                const db = request.result;
                
                // Create a simple wrapper around the native IDBDatabase
                const dbWrapper: IDBPDatabase<MemoryDB> = {
                    transaction: (store: string, mode: 'readonly' | 'readwrite') => {
                        const tx = db.transaction(store, mode);
                        const storObj = tx.objectStore(store);
                        
                        return {
                            objectStore: () => ({
                                put: (value: any) => new Promise((resolve, reject) => {
                                    const req = storObj.put(value);
                                    req.onsuccess = () => resolve(req.result);
                                    req.onerror = () => reject(req.error);
                                }),
                                delete: (key: string) => new Promise((resolve, reject) => {
                                    const req = storObj.delete(key);
                                    req.onsuccess = () => resolve(req.result);
                                    req.onerror = () => reject(req.error);
                                }),
                                count: () => new Promise((resolve, reject) => {
                                    const req = storObj.count();
                                    req.onsuccess = () => resolve(req.result);
                                    req.onerror = () => reject(req.error);
                                }),
                                getAll: () => new Promise((resolve, reject) => {
                                    const req = storObj.getAll();
                                    req.onsuccess = () => resolve(req.result);
                                    req.onerror = () => reject(req.error);
                                }),
                                clear: () => new Promise((resolve, reject) => {
                                    const req = storObj.clear();
                                    req.onsuccess = () => resolve(req.result);
                                    req.onerror = () => reject(req.error);
                                }),
                                index: (indexName: string) => ({
                                    get: (key: any) => new Promise((resolve, reject) => {
                                        const req = storObj.index(indexName).get(key);
                                        req.onsuccess = () => resolve(req.result);
                                        req.onerror = () => reject(req.error);
                                    }),
                                    getAll: (key: any) => new Promise((resolve, reject) => {
                                        const req = storObj.index(indexName).getAll(key);
                                        req.onsuccess = () => resolve(req.result);
                                        req.onerror = () => reject(req.error);
                                    }),
                                    count: (key: any) => new Promise((resolve, reject) => {
                                        const req = storObj.index(indexName).count(key);
                                        req.onsuccess = () => resolve(req.result);
                                        req.onerror = () => reject(req.error);
                                    }),
                                    openCursor: (key?: any) => new Promise((resolve, reject) => {
                                        let cursor: any = null;
                                        const req = key !== undefined
                                            ? storObj.index(indexName).openCursor(key)
                                            : storObj.index(indexName).openCursor();
                                        
                                        req.onsuccess = () => {
                                            if (req.result) {
                                                cursor = {
                                                    value: req.result.value,
                                                    delete: () => new Promise((resolveDelete, rejectDelete) => {
                                                        // Make sure req.result is not null
                                                        if (!req.result) {
                                                            resolveDelete(undefined);
                                                            return;
                                                        }
                                                        
                                                        const delReq = req.result.delete();
                                                        delReq.onsuccess = () => resolveDelete(undefined);
                                                        delReq.onerror = (err: any) => rejectDelete(err);
                                                    }),
                                                    continue: () => new Promise((resolveContinue, rejectContinue) => {
                                                        // Make sure req.result is not null
                                                        if (!req.result) {
                                                            resolveContinue(null);
                                                            return;
                                                        }
                                                        
                                                        try {
                                                            req.result.continue();
                                                            // The cursor's next value will be picked up
                                                            // by this cursor's onsuccess handler
                                                            resolveContinue(cursor);
                                                        } catch (error) {
                                                            console.error('Error in cursor continue:', error);
                                                            // Resolve with null instead of rejecting to allow 
                                                            // the loop to terminate gracefully
                                                            resolveContinue(null);
                                                        }
                                                    })
                                                };
                                            } else {
                                                cursor = null;
                                            }
                                            resolve(cursor);
                                        };
                                        
                                        req.onerror = (err: any) => {
                                            console.error('Error opening cursor:', err);
                                            // Resolve with null instead of rejecting to prevent promise chain from breaking
                                            resolve(null);
                                        };
                                    })
                                })
                            }),
                            done: new Promise((resolve) => {
                                tx.oncomplete = () => resolve(undefined);
                            })
                        };
                    },
                    get: (store: string, key: string) => new Promise((resolve, reject) => {
                        const tx = db.transaction(store, 'readonly');
                        const req = tx.objectStore(store).get(key);
                        req.onsuccess = () => resolve(req.result);
                        req.onerror = () => reject(req.error);
                    }),
                    delete: (store: string, key: string) => new Promise((resolve, reject) => {
                        const tx = db.transaction(store, 'readwrite');
                        const req = tx.objectStore(store).delete(key);
                        req.onsuccess = () => resolve();
                        req.onerror = () => reject(req.error);
                    }),
                    count: (store: string) => new Promise((resolve, reject) => {
                        const tx = db.transaction(store, 'readonly');
                        const req = tx.objectStore(store).count();
                        req.onsuccess = () => resolve(req.result);
                        req.onerror = () => reject(req.error);
                    }),
                    getAll: (store: string) => new Promise((resolve, reject) => {
                        const tx = db.transaction(store, 'readonly');
                        const req = tx.objectStore(store).getAll();
                        req.onsuccess = () => resolve(req.result);
                        req.onerror = () => reject(req.error);
                    }),
                    close: () => db.close()
                };
                
                resolve(dbWrapper);
            };
            
            request.onupgradeneeded = (event: any) => {
                const db = event.target.result;
                
                // Create the embeddings store
                const store = db.createObjectStore(this.storeName, {
                    keyPath: 'id'
                });
                
                // Create indexes for efficient queries
                store.createIndex(INDEX_NAMES.BY_FILE, 'filePath');
                store.createIndex(INDEX_NAMES.BY_TIMESTAMP, 'updatedAt');
            };
        });
    }
    
    /**
     * Get database statistics
     * @returns Database statistics
     */
    async getStats(): Promise<DatabaseStats> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        
        try {
            const total = await this.countEmbeddings();
            
            // Estimate size - this is a rough approximation
            // In a real implementation, we would use more accurate size estimation
            const dbSizeMB = total * EMBEDDING_SIZE_KB / 1024; // Convert KB to MB
            
            return {
                totalEmbeddings: total,
                dbSizeMB
            };
        } catch (error: any) {
            console.error('Failed to get database stats:', error);
            throw new Error(`Failed to get database stats: ${error.message}`);
        }
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
     * Count total number of embeddings in the database
     */
    private async countEmbeddings(): Promise<number> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        
        try {
            return await this.db.count(this.storeName);
        } catch (error: any) {
            console.error('Failed to count embeddings:', error);
            throw new Error(`Failed to count embeddings: ${error.message}`);
        }
    }
    
    /**
     * Clear all data from the database
     */
    async clearDatabase(): Promise<void> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        
        try {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            await tx.objectStore(this.storeName).clear();
            await tx.done;
        } catch (error: any) {
            console.error('Failed to clear database:', error);
            throw new Error(`Failed to clear database: ${error.message}`);
        }
    }
}