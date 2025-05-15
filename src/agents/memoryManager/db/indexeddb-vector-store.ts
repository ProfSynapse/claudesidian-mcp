import { EmbeddingRecord, MemoryQueryParams, MemoryQueryResult } from '../../../types';

/**
 * Placeholder type for IndexedDB operations
 * We use a simple implementation without external dependencies
 */
interface IDBPDatabase<T> {
    transaction(store: string, mode: 'readonly' | 'readwrite'): any;
    get(store: string, key: string): Promise<any>;
    delete(store: string, key: string): Promise<void>;
    count(store: string): Promise<number>;
    getAll(store: string): Promise<any[]>;
    close(): void;
}

/**
 * Interface for our database store structure
 */
interface MemoryDB {
    embeddings: { 
        key: string;
        value: EmbeddingRecord;
        indexes: {
            'by-file': string;
            'by-timestamp': number;
        };
    };
}

/**
 * Database statistics interface for reporting
 */
interface DatabaseStats {
    totalEmbeddings: number;
    dbSizeMB: number;
}

/**
 * Vector store implementation using IndexedDB
 * Provides persistence for embeddings and semantic search capabilities
 */
export class VectorStore {
    private db: IDBPDatabase<MemoryDB> | null = null;
    private dbName: string;
    private storeName = 'embeddings';
    
    /**
     * Create a new vector store
     * @param dbName The name of the database to use
     */
    constructor(dbName: string = 'memory-store') {
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
            // Use a simple implementation without external dependencies
            // In a real implementation, this would use the openDB function from idb
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
            
            const request = window.indexedDB.open(this.dbName, 1);
            
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
                store.createIndex('by-file', 'filePath');
                store.createIndex('by-timestamp', 'updatedAt');
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
            const dbSizeMB = total * 0.02; // Assuming average of 20KB per embedding
            
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
     * Add or update embeddings in the database
     * @param embeddings Array of embedding records to add
     */
    async addEmbeddings(embeddings: EmbeddingRecord[]): Promise<void> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        
        try {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            
            for (const embedding of embeddings) {
                await store.put(embedding);
            }
            
            await tx.done;
        } catch (error: any) {
            console.error('Failed to add embeddings:', error);
            throw new Error(`Failed to add embeddings: ${error.message}`);
        }
    }
    
    /**
     * Delete an embedding from the database
     * @param id The ID of the embedding to delete
     */
    async deleteEmbedding(id: string): Promise<void> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        
        try {
            await this.db.delete(this.storeName, id);
        } catch (error: any) {
            console.error(`Failed to delete embedding ${id}:`, error);
            throw new Error(`Failed to delete embedding: ${error.message}`);
        }
    }
    
    /**
     * Delete all embeddings for a specific file
     * @param filePath The file path to delete embeddings for
     */
    async deleteEmbeddingsForFile(filePath: string): Promise<void> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        
        try {
            // First try to get all embeddings for this file
            // This is safer than using a cursor
            const embeddings = await this.getEmbeddingsForFile(filePath);
            
            if (embeddings.length === 0) {
                // No embeddings to delete
                return;
            }
            
            // Delete each embedding by ID
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            
            // Delete each embedding individually
            for (const embedding of embeddings) {
                try {
                    await store.delete(embedding.id);
                } catch (deleteError) {
                    console.error(`Error deleting individual embedding ${embedding.id}:`, deleteError);
                    // Continue with other deletions
                }
            }
            
            // Wait for transaction to complete
            await tx.done;
        } catch (error: any) {
            console.error(`Failed to delete embeddings for file ${filePath}:`, error);
            throw new Error(`Failed to delete embeddings for file: ${error.message}`);
        }
    }
    
    /**
     * Get all embeddings for a specific file
     * @param filePath The file path to get embeddings for
     */
    async getEmbeddingsForFile(filePath: string): Promise<EmbeddingRecord[]> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        
        try {
            const tx = this.db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const index = store.index('by-file');
            
            return await index.getAll(filePath);
        } catch (error: any) {
            console.error(`Failed to get embeddings for file ${filePath}:`, error);
            throw new Error(`Failed to get embeddings for file: ${error.message}`);
        }
    }
    
    /**
     * Get an embedding by ID
     * @param id The ID of the embedding to get
     */
    async getEmbedding(id: string): Promise<EmbeddingRecord | undefined> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        
        try {
            return await this.db.get(this.storeName, id);
        } catch (error: any) {
            console.error(`Failed to get embedding ${id}:`, error);
            throw new Error(`Failed to get embedding: ${error.message}`);
        }
    }
    
    /**
     * Get all embeddings in the database
     */
    async getAllEmbeddings(): Promise<EmbeddingRecord[]> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        
        try {
            return await this.db.getAll(this.storeName);
        } catch (error: any) {
            console.error('Failed to get all embeddings:', error);
            throw new Error(`Failed to get all embeddings: ${error.message}`);
        }
    }
    
    /**
     * Get all file paths that have embeddings
     */
    async getAllFilePaths(): Promise<string[]> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        
        try {
            const tx = this.db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const index = store.index('by-file');
            
            // Use getAll instead of cursor for more reliable operation
            const allRecords = await index.getAll();
            const filePaths = new Set<string>();
            
            // Extract unique file paths from all records
            for (const record of allRecords) {
                if (record && record.filePath) {
                    filePaths.add(record.filePath);
                }
            }
            
            // Wait for transaction to complete before returning
            await tx.done;
            return Array.from(filePaths);
        } catch (error: any) {
            console.error('Failed to get all file paths:', error);
            throw new Error(`Failed to get all file paths: ${error.message}`);
        }
    }
    
    /**
     * Count total number of embeddings in the database
     */
    async countEmbeddings(): Promise<number> {
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
     * Find records similar to the given embedding
     * @param queryEmbedding Query embedding to compare against
     * @param params Query parameters
     */
    async findSimilar(
        queryEmbedding: number[],
        params: MemoryQueryParams
    ): Promise<MemoryQueryResult> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        
        try {
            // Apply default values
            const limit = params.limit || 10;
            const threshold = params.threshold || 0.5;
            
            // Get all embeddings
            const allEmbeddings = await this.getAllEmbeddings();
            
            // Filter out embeddings based on filters
            let filteredEmbeddings = allEmbeddings;
            
            // Calculate similarity scores
            const scoredEmbeddings = filteredEmbeddings.map(record => ({
                record,
                similarity: this.cosineSimilarity(queryEmbedding, record.embedding)
            }));
            
            // Filter by threshold
            let resultEmbeddings = scoredEmbeddings.filter(item => 
                item.similarity >= threshold
            );
            
            // Apply graph boost if enabled
            if (params.graphOptions && params.graphOptions.useGraphBoost) {
                resultEmbeddings = this.applyGraphBoost(resultEmbeddings, params.graphOptions);
            }
            
            // Sort by similarity (highest first)
            resultEmbeddings.sort((a, b) => b.similarity - a.similarity);
            
            // Limit results
            resultEmbeddings = resultEmbeddings.slice(0, limit);
            
            // Format results
            return {
                matches: resultEmbeddings.map(item => ({
                    similarity: item.similarity,
                    content: item.record.content,
                    filePath: item.record.filePath,
                    lineStart: item.record.lineStart,
                    lineEnd: item.record.lineEnd,
                    metadata: item.record.metadata
                }))
            };
        } catch (error: any) {
            console.error('Failed to find similar embeddings:', error);
            throw new Error(`Failed to find similar embeddings: ${error.message}`);
        }
    }
    
    /**
     * Apply graph-based boost to search results
     * Increases scores for records that are connected to high-scoring records
     * 
     * @param records Records with similarity scores
     * @param graphOptions Graph boosting options
     */
    private applyGraphBoost(
        records: Array<{ record: EmbeddingRecord; similarity: number }>,
        graphOptions: NonNullable<MemoryQueryParams['graphOptions']>
    ): Array<{ record: EmbeddingRecord; similarity: number }> {
        const boostFactor = graphOptions.boostFactor || 0.3;
        const maxDistance = graphOptions.maxDistance || 1;
        const seedNotes = graphOptions.seedNotes || [];
        
        // Create a map of file paths to their records and scores
        const fileScores = new Map<string, { record: EmbeddingRecord; score: number }>();
        records.forEach(item => {
            fileScores.set(item.record.filePath, {
                record: item.record,
                score: item.similarity
            });
        });
        
        // Create a graph of connections
        const graph = new Map<string, Set<string>>();
        
        // Create a map of normalized link text to file paths
        // This helps with resolving unresolved links
        const normalizedLinkMap = new Map<string, string[]>();
        const fullPathMap = new Map<string, string>(); // Map from filename to full path
        
        // First pass: build normalized link map
        records.forEach(item => {
            const filePath = item.record.filePath;
            const fileName = filePath.split('/').pop() || '';
            const baseName = fileName.replace(/\.[^/.]+$/, '');
            
            // Store multiple ways to reference this file
            this.addToLinkMap(normalizedLinkMap, baseName, filePath);
            this.addToLinkMap(normalizedLinkMap, fileName, filePath);
            
            // Also store the path components
            const pathParts = filePath.split('/');
            if (pathParts.length > 1) {
                // Store combinations of folder+filename
                for (let i = 0; i < pathParts.length - 1; i++) {
                    const folderName = pathParts[i];
                    this.addToLinkMap(normalizedLinkMap, `${folderName}_${baseName}`, filePath);
                    this.addToLinkMap(normalizedLinkMap, `${folderName}/${baseName}`, filePath);
                }
            }
            
            // Store mapping from filename to full path for exact matches
            fullPathMap.set(baseName.toLowerCase(), filePath);
            fullPathMap.set(fileName.toLowerCase(), filePath);
        });
        
        // Second pass: create graph connections
        records.forEach(item => {
            const filePath = item.record.filePath;
            const connections = new Set<string>();
            
            // Add outgoing links
            item.record.metadata.links.outgoing.forEach(link => {
                if (link.targetPath.startsWith('unresolved:')) {
                    // Try to match unresolved link to a file
                    const unresolvedText = link.targetPath.replace('unresolved:', '');
                    
                    // Try exact match first
                    const exactPath = fullPathMap.get(unresolvedText.toLowerCase());
                    if (exactPath) {
                        connections.add(exactPath);
                        return;
                    }
                    
                    // Try all normalizations
                    const normalizedVariants = this.getNormalizedVariants(unresolvedText);
                    
                    for (const normalizedVariant of normalizedVariants) {
                        const possibleMatches = normalizedLinkMap.get(normalizedVariant) || [];
                        possibleMatches.forEach(match => {
                            connections.add(match);
                        });
                    }
                    
                    // If still no matches, try fuzzy matching
                    if (connections.size === 0) {
                        this.findFuzzyMatches(normalizedLinkMap, unresolvedText).forEach(match => {
                            connections.add(match);
                        });
                    }
                } else {
                    connections.add(link.targetPath);
                }
            });
            
            // Add incoming links
            item.record.metadata.links.incoming.forEach(link => {
                connections.add(link.sourcePath);
            });
            
            graph.set(filePath, connections);
        });
        
        // Apply boost to seed notes
        let resultEmbeddings = records;
        if (seedNotes.length > 0) {
            resultEmbeddings = this.applySeedBoost(resultEmbeddings, seedNotes);
        }
        
        // Apply multi-level graph boosting
        // Start with initial scores
        let currentScores = new Map<string, number>();
        resultEmbeddings.forEach(item => {
            currentScores.set(item.record.filePath, item.similarity);
        });
        
        // Apply boost for each level of depth up to maxDistance
        for (let distance = 1; distance <= maxDistance; distance++) {
            const nextScores = new Map<string, number>();
            
            // Start with current scores
            for (const [filePath, score] of currentScores.entries()) {
                nextScores.set(filePath, score);
            }
            
            // Apply boost for this distance level
            for (const [filePath, score] of currentScores.entries()) {
                const connections = graph.get(filePath) || new Set<string>();
                const levelBoostFactor = boostFactor / distance; // Reduce boost for higher distances
                
                connections.forEach(connectedPath => {
                    // Only boost if the connected path is in our results
                    if (currentScores.has(connectedPath)) {
                        const currentScore = nextScores.get(connectedPath) || 0;
                        // Add a boost proportional to this file's score
                        const boost = score * levelBoostFactor;
                        nextScores.set(connectedPath, currentScore + boost);
                    }
                });
            }
            
            // Update current scores for next iteration
            currentScores = nextScores;
        }
        
        // Apply final boosted scores
        return resultEmbeddings.map(item => ({
            record: item.record,
            similarity: currentScores.get(item.record.filePath) || item.similarity
        }));
    }
    
    /**
     * Apply seed note boosting to search results
     * @param records Records with similarity scores
     * @param seedNotes Array of seed note paths
     */
    private applySeedBoost(
        records: Array<{ record: EmbeddingRecord; similarity: number }>,
        seedNotes: string[]
    ): Array<{ record: EmbeddingRecord; similarity: number }> {
        // If no seed notes, return as-is
        if (!seedNotes.length) {
            return records;
        }
        
        // Create a set of seed note paths for quick lookup
        const seedNoteSet = new Set(seedNotes);
        
        // Create a map of file paths to base name (without extension) for fuzzy matching
        const fileBaseNames = new Map<string, string>();
        records.forEach(item => {
            const baseName = item.record.filePath.split('/').pop()?.replace(/\.[^/.]+$/, '') || '';
            fileBaseNames.set(item.record.filePath, baseName.toLowerCase());
        });
        
        // Create a set of normalized seed note names for fuzzy matching
        const normalizedSeedNames = new Set<string>();
        seedNotes.forEach(path => {
            const baseName = path.split('/').pop()?.replace(/\.[^/.]+$/, '') || '';
            normalizedSeedNames.add(baseName.toLowerCase());
        });
        
        // Apply boost to seed notes and their connections
        return records.map(item => {
            let boostFactor = 1.0; // No boost by default
            
            // Direct exact match with seed note
            if (seedNoteSet.has(item.record.filePath)) {
                boostFactor = 1.5; // 50% boost for direct seed note match
            } 
            // Fuzzy match with seed note name
            else if (normalizedSeedNames.has(fileBaseNames.get(item.record.filePath) || '')) {
                boostFactor = 1.3; // 30% boost for fuzzy seed note match
            }
            
            return {
                record: item.record,
                similarity: item.similarity * boostFactor
            };
        });
    }
    
    /**
     * Normalize link text for more robust matching
     * Removes spaces, special characters, and converts to lowercase
     * 
     * @param linkText The link text to normalize
     * @returns Normalized link text
     */
    private normalizeLinkText(linkText: string): string {
        return linkText
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^\w\s-]/g, '');
    }
    
    /**
     * Add a filename to the normalized link map
     * 
     * @param linkMap The map to add to
     * @param text The text to normalize and add
     * @param filePath The file path to associate with the text
     */
    private addToLinkMap(linkMap: Map<string, string[]>, text: string, filePath: string): void {
        const normalizedText = this.normalizeLinkText(text);
        
        if (!linkMap.has(normalizedText)) {
            linkMap.set(normalizedText, []);
        }
        
        const paths = linkMap.get(normalizedText);
        if (paths && !paths.includes(filePath)) {
            paths.push(filePath);
        }
    }
    
    /**
     * Generate different normalized variants of a link text
     * 
     * @param text The text to generate variants for
     * @returns Array of normalized variants
     */
    private getNormalizedVariants(text: string): string[] {
        const variants = new Set<string>();
        
        // Add original
        variants.add(this.normalizeLinkText(text));
        
        // Add with spaces replaced by underscores
        variants.add(this.normalizeLinkText(text.replace(/\s+/g, '_')));
        
        // Add with spaces replaced by hyphens
        variants.add(this.normalizeLinkText(text.replace(/\s+/g, '-')));
        
        // Add without special characters
        variants.add(this.normalizeLinkText(text.replace(/[^\w\s]/g, '')));
        
        // Handle common file extensions (.md)
        const withoutExt = text.endsWith('.md') ? text.slice(0, -3) : text;
        variants.add(this.normalizeLinkText(withoutExt));
        
        return Array.from(variants);
    }
    
    /**
     * Find fuzzy matches for a link text
     * 
     * @param linkMap The normalized link map
     * @param text The text to find fuzzy matches for
     * @returns Array of matching file paths
     */
    private findFuzzyMatches(linkMap: Map<string, string[]>, text: string): string[] {
        const matches = new Set<string>();
        const normalizedText = this.normalizeLinkText(text);
        
        // For each key in the map, check if either contains the other
        for (const [key, paths] of linkMap.entries()) {
            // If the key contains our text or our text contains the key
            if (key.includes(normalizedText) || normalizedText.includes(key)) {
                paths.forEach(path => matches.add(path));
            }
        }
        
        return Array.from(matches);
    }
    
    /**
     * Calculate cosine similarity between two vectors
     * @param a First vector
     * @param b Second vector
     */
    private cosineSimilarity(a: number[], b: number[]): number {
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
            return 0; // Handle zero vectors
        }
        
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
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
    
    /**
     * Check if a file exists in the database
     * @param filePath The file path to check
     */
    async hasFile(filePath: string): Promise<boolean> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        
        try {
            const tx = this.db.transaction(this.storeName, 'readonly');
            const index = tx.objectStore(this.storeName).index('by-file');
            const count = await index.count(filePath);
            return count > 0;
        } catch (error: any) {
            console.error(`Failed to check if file ${filePath} exists:`, error);
            throw new Error(`Failed to check if file exists: ${error.message}`);
        }
    }
    
    /**
     * Delete embeddings that don't match any existing file
     * @param existingFilePaths Array of file paths that exist
     */
    async deleteOrphanedEmbeddings(existingFilePaths: string[]): Promise<number> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        
        try {
            // Create a set of existing files for efficient lookup
            const existingSet = new Set(existingFilePaths);
            
            // Get all file paths in the database with improved error handling
            let allFilePaths: string[] = [];
            try {
                allFilePaths = await this.getAllFilePaths();
            } catch (pathError: any) {
                console.error('Error getting file paths during orphaned cleanup:', pathError);
                return 0; // Return 0 deletions if we can't get file paths
            }
            
            // Find orphaned paths (paths in DB but not in the vault)
            const orphanedPaths = allFilePaths.filter(path => !existingSet.has(path));
            
            // Delete each orphaned path
            let deletedCount = 0;
            for (const path of orphanedPaths) {
                try {
                    await this.deleteEmbeddingsForFile(path);
                    deletedCount++;
                } catch (deleteError: any) {
                    console.error(`Error deleting embeddings for orphaned path ${path}:`, deleteError);
                    // Continue with other deletions even if one fails
                }
            }
            
            return deletedCount;
        } catch (error: any) {
            console.error('Failed to delete orphaned embeddings:', error);
            throw new Error(`Failed to delete orphaned embeddings: ${error.message}`);
        }
    }
    
    /**
     * Check if a file needs to be reindexed
     * @param filePath The file path to check
     * @param modifiedTime The file's modified timestamp
     */
    async shouldReindexFile(filePath: string, modifiedTime: number): Promise<boolean> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        
        try {
            // Check if we have any embeddings for this file
            const embeddings = await this.getEmbeddingsForFile(filePath);
            
            if (embeddings.length === 0) {
                return true; // No embeddings, need to index
            }
            
            // Check if the file has been modified since last indexed
            // We compare the file's modified time to the newest embedding's updated time
            const newestEmbedding = embeddings.reduce((newest, current) => {
                return current.updatedAt > newest.updatedAt ? current : newest;
            }, embeddings[0]);
            
            return modifiedTime > newestEmbedding.updatedAt;
        } catch (error: any) {
            console.error(`Failed to check if file ${filePath} needs reindexing:`, error);
            throw new Error(`Failed to check if file needs reindexing: ${error.message}`);
        }
    }
}