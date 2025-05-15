import { EmbeddingRecord, MemoryQueryParams, MemoryQueryResult } from '../../../types';
import { VectorStore } from './memory-db';

/**
 * Options for the IndexedDB Vector Store
 */
interface IndexedDBVectorStoreOptions {
    dbName: string;
    storeName?: string;
    version?: number;
}

/**
 * Vector store implementation using IndexedDB
 */
export class IndexedDBVectorStore implements VectorStore {
    private db: IDBDatabase | null = null;
    private dbName: string;
    private storeName: string;
    private version: number;
    private ready: Promise<void>;
    
    /**
     * Create a new IndexedDB Vector Store
     * @param options Options for the IndexedDB store
     */
    constructor(options: IndexedDBVectorStoreOptions) {
        this.dbName = options.dbName;
        this.storeName = options.storeName || 'embeddings';
        this.version = options.version || 1;
        this.ready = this.initialize();
    }
    
    /**
     * Initialize the database
     * Sets up the database schema and indexes
     */
    async initialize(): Promise<void> {
        if (this.db) {
            return; // Already initialized
        }
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                
                // Create object store for embeddings if it doesn't exist
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    
                    // Create indexes for common queries
                    store.createIndex('filePath', 'filePath', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                    store.createIndex('updatedAt', 'updatedAt', { unique: false });
                    
                    // Create indexes for metadata searches
                    store.createIndex('metadata.tags', 'metadata.tags', { unique: false, multiEntry: true });
                }
            };
            
            request.onsuccess = (event) => {
                this.db = (event.target as IDBOpenDBRequest).result;
                resolve();
            };
            
            request.onerror = (event) => {
                console.error('IndexedDB error:', event);
                reject(new Error('Failed to open IndexedDB database'));
            };
        });
    }
    
    /**
     * Wait for the database to be initialized
     * Used internally to ensure DB is ready before operations
     */
    private async ensureReady(): Promise<void> {
        if (!this.db) {
            await this.ready;
        }
    }
    
    /**
     * Add an embedding record to the database
     * @param record The embedding record to add
     */
    async addEmbedding(record: EmbeddingRecord): Promise<void> {
        await this.ensureReady();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            const request = store.add(record);
            
            request.onsuccess = () => resolve();
            request.onerror = (event) => {
                console.error('Error adding embedding:', event);
                reject(new Error('Failed to add embedding'));
            };
        });
    }
    
    /**
     * Add multiple embedding records to the database
     * @param records The embedding records to add
     */
    async addEmbeddings(records: EmbeddingRecord[]): Promise<void> {
        await this.ensureReady();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            let completed = 0;
            let hasError = false;
            
            records.forEach(record => {
                const request = store.add(record);
                
                request.onsuccess = () => {
                    completed++;
                    if (completed === records.length && !hasError) {
                        resolve();
                    }
                };
                
                request.onerror = (event) => {
                    console.error('Error adding embedding:', event);
                    if (!hasError) {
                        hasError = true;
                        reject(new Error('Failed to add embeddings'));
                    }
                };
            });
            
            // If no records, resolve immediately
            if (records.length === 0) {
                resolve();
            }
        });
    }
    
    /**
     * Update an existing embedding record
     * @param id The ID of the record to update
     * @param updates The partial record with updated fields
     */
    async updateEmbedding(id: string, updates: Partial<EmbeddingRecord>): Promise<void> {
        await this.ensureReady();
        
        return new Promise<void>(async (resolve, reject) => {
            const transaction = this.db!.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            // First get the existing record
            const getRequest = store.get(id);
            
            getRequest.onsuccess = () => {
                const existingRecord = getRequest.result;
                
                if (!existingRecord) {
                    reject(new Error(`Embedding with ID ${id} not found`));
                    return;
                }
                
                // Merge the updates with the existing record
                const updatedRecord = {
                    ...existingRecord,
                    ...updates,
                    updatedAt: Date.now() // Always update the updatedAt timestamp
                };
                
                // Put the updated record back
                const putRequest = store.put(updatedRecord);
                
                putRequest.onsuccess = () => resolve();
                putRequest.onerror = (event) => {
                    console.error('Error updating embedding:', event);
                    reject(new Error('Failed to update embedding'));
                };
            };
            
            getRequest.onerror = (event) => {
                console.error('Error getting embedding for update:', event);
                reject(new Error('Failed to get embedding for update'));
            };
        });
    }
    
    /**
     * Delete an embedding record
     * @param id The ID of the record to delete
     */
    async deleteEmbedding(id: string): Promise<void> {
        await this.ensureReady();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = (event) => {
                console.error('Error deleting embedding:', event);
                reject(new Error('Failed to delete embedding'));
            };
        });
    }
    
    /**
     * Delete all embeddings for a file
     * @param filePath The file path to delete embeddings for
     */
    async deleteEmbeddingsForFile(filePath: string): Promise<void> {
        await this.ensureReady();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('filePath');
            
            const request = index.getAll(filePath);
            
            request.onsuccess = () => {
                const records = request.result;
                let completed = 0;
                let hasError = false;
                
                // If no records, resolve immediately
                if (records.length === 0) {
                    resolve();
                    return;
                }
                
                records.forEach(record => {
                    const deleteRequest = store.delete(record.id);
                    
                    deleteRequest.onsuccess = () => {
                        completed++;
                        if (completed === records.length && !hasError) {
                            resolve();
                        }
                    };
                    
                    deleteRequest.onerror = (event) => {
                        console.error('Error deleting embedding for file:', event);
                        if (!hasError) {
                            hasError = true;
                            reject(new Error('Failed to delete embeddings for file'));
                        }
                    };
                });
            };
            
            request.onerror = (event) => {
                console.error('Error getting embeddings for file deletion:', event);
                reject(new Error('Failed to get embeddings for file deletion'));
            };
        });
    }
    
    /**
     * Get embedding by ID
     * @param id The ID of the embedding to retrieve
     */
    async getEmbedding(id: string): Promise<EmbeddingRecord | null> {
        await this.ensureReady();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            
            const request = store.get(id);
            
            request.onsuccess = () => {
                resolve(request.result || null);
            };
            
            request.onerror = (event) => {
                console.error('Error getting embedding:', event);
                reject(new Error('Failed to get embedding'));
            };
        });
    }
    
    /**
     * Get all embeddings for a file
     * @param filePath The file path to get embeddings for
     */
    async getEmbeddingsForFile(filePath: string): Promise<EmbeddingRecord[]> {
        await this.ensureReady();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('filePath');
            
            const request = index.getAll(filePath);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = (event) => {
                console.error('Error getting embeddings for file:', event);
                reject(new Error('Failed to get embeddings for file'));
            };
        });
    }
    
    /**
     * Get database statistics
     */
    async getStats(): Promise<{ totalEmbeddings: number; dbSizeMB: number }> {
        await this.ensureReady();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            
            const countRequest = store.count();
            
            countRequest.onsuccess = () => {
                const count = countRequest.result;
                
                // Estimate size - this is just an approximation
                // In a more complete implementation, we'd track size during inserts
                const estimatedSizePerRecord = 4 * 1536; // Average embedding size in bytes
                const estimatedSize = (count * estimatedSizePerRecord) / (1024 * 1024); // Convert to MB
                
                resolve({
                    totalEmbeddings: count,
                    dbSizeMB: estimatedSize
                });
            };
            
            countRequest.onerror = (event) => {
                console.error('Error getting embedding count:', event);
                reject(new Error('Failed to get embedding count'));
            };
        });
    }
    
    /**
     * Find similar embeddings using vector similarity search
     * @param embedding The query embedding vector
     * @param params Query parameters including filters and limits
     */
    async findSimilar(embedding: number[], params: MemoryQueryParams): Promise<MemoryQueryResult> {
        await this.ensureReady();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            
            const request = store.getAll();
            
            request.onsuccess = () => {
                const records = request.result as EmbeddingRecord[];
                
                try {
                    // Calculate similarity scores for all records
                    const scoredRecords = records.map(record => {
                        // Calculate cosine similarity
                        const similarity = this.cosineSimilarity(embedding, record.embedding);
                        return { record, similarity };
                    });
                    
                    // Apply filters if provided
                    let filteredRecords = scoredRecords;
                    if (params.filters) {
                        filteredRecords = this.applyFilters(filteredRecords, params.filters);
                    }
                    
                    // Apply threshold if provided
                    if (params.threshold !== undefined) {
                        filteredRecords = filteredRecords.filter(item => 
                            item.similarity >= params.threshold!
                        );
                    }
                    
                    // Sort by similarity (highest first)
                    filteredRecords.sort((a, b) => b.similarity - a.similarity);
                    
                    // Apply graph-based boost if requested
                    if (params.graphOptions?.useGraphBoost) {
                        filteredRecords = this.applyGraphBoost(filteredRecords, params.graphOptions);
                    }
                    
                    // Limit results
                    const limit = params.limit || 10;
                    filteredRecords = filteredRecords.slice(0, limit);
                    
                    // Format results
                    const matches = filteredRecords.map(item => ({
                        similarity: item.similarity,
                        content: item.record.content,
                        filePath: item.record.filePath,
                        lineStart: item.record.lineStart,
                        lineEnd: item.record.lineEnd,
                        metadata: {
                            frontmatter: item.record.metadata.frontmatter,
                            tags: item.record.metadata.tags,
                            links: {
                                outgoing: item.record.metadata.links.outgoing.map(link => ({
                                    displayText: link.displayText,
                                    targetPath: link.targetPath
                                })),
                                incoming: item.record.metadata.links.incoming.map(link => ({
                                    sourcePath: link.sourcePath,
                                    displayText: link.displayText
                                }))
                            }
                        }
                    }));
                    
                    resolve({ matches });
                } catch (error) {
                    console.error('Error processing search results:', error);
                    reject(new Error('Failed to process search results'));
                }
            };
            
            request.onerror = (event) => {
                console.error('Error searching embeddings:', event);
                reject(new Error('Failed to search embeddings'));
            };
        });
    }
    
    /**
     * Apply filters to search results
     * @param records Records with similarity scores
     * @param filters Filters to apply
     */
    private applyFilters(
        records: Array<{ record: EmbeddingRecord; similarity: number }>,
        filters: MemoryQueryParams['filters']
    ): Array<{ record: EmbeddingRecord; similarity: number }> {
        if (!filters) return records;
        
        return records.filter(item => {
            const record = item.record;
            
            // Filter by tags
            if (filters.tags && filters.tags.length > 0) {
                const recordTags = record.metadata.tags || [];
                // Check if the record has at least one of the requested tags
                if (!filters.tags.some(tag => recordTags.includes(tag))) {
                    return false;
                }
            }
            
            // Filter by paths
            if (filters.paths && filters.paths.length > 0) {
                // Check if the record matches any of the path patterns
                if (!filters.paths.some(path => {
                    // Simple glob-like matching (supports * wildcard)
                    const pattern = path.replace(/\*/g, '.*');
                    const regex = new RegExp(`^${pattern}$`);
                    return regex.test(record.filePath);
                })) {
                    return false;
                }
            }
            
            // Filter by properties (frontmatter)
            if (filters.properties) {
                for (const [key, value] of Object.entries(filters.properties)) {
                    // If the record doesn't have the property or it doesn't match
                    if (!record.metadata.frontmatter || 
                        record.metadata.frontmatter[key] !== value) {
                        return false;
                    }
                }
            }
            
            // Filter by date range (assuming createdDate or modifiedDate in metadata)
            if (filters.dateRange) {
                const { start, end } = filters.dateRange;
                const modifiedDate = record.metadata.modifiedDate || record.metadata.createdDate;
                
                if (!modifiedDate) return true; // Skip date filter if no date available
                
                const recordDate = new Date(modifiedDate).getTime();
                
                if (start && new Date(start).getTime() > recordDate) {
                    return false;
                }
                
                if (end && new Date(end).getTime() < recordDate) {
                    return false;
                }
            }
            
            return true;
        });
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
        records.forEach(item => {
            const filePath = item.record.filePath;
            const connections = new Set<string>();
            
            // Add outgoing links
            item.record.metadata.links.outgoing.forEach(link => {
                connections.add(link.targetPath);
            });
            
            // Add incoming links
            item.record.metadata.links.incoming.forEach(link => {
                connections.add(link.sourcePath);
            });
            
            graph.set(filePath, connections);
        });
        
        // Apply boost based on connections (simple version - only direct connections)
        // In a more complete implementation, we would implement a graph traversal algorithm
        // to consider connections at multiple levels of distance
        const boostedScores = new Map<string, number>();
        
        records.forEach(item => {
            const filePath = item.record.filePath;
            let score = item.similarity;
            
            // Get connections for this file
            const connections = graph.get(filePath) || new Set<string>();
            
            // For each connection, add a boost if it exists in our results
            connections.forEach(connectedPath => {
                const connected = fileScores.get(connectedPath);
                if (connected) {
                    // Add a boost proportional to the connection's score
                    score += connected.score * boostFactor;
                }
            });
            
            boostedScores.set(filePath, score);
        });
        
        // Update scores in the records array
        return records.map(item => ({
            record: item.record,
            similarity: boostedScores.get(item.record.filePath) || item.similarity
        }));
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
     * Compact the database to reclaim space
     */
    async compact(): Promise<void> {
        // IndexedDB doesn't have a built-in compaction method
        // This is a no-op, but in a real implementation you might
        // implement a strategy like copying all records to a new store
        await this.ensureReady();
    }
    
    /**
     * Get a transaction for the database
     * @param storeName The store to use for the transaction
     * @param mode Transaction mode (readonly or readwrite)
     */
    getTransaction(storeName: string, mode: 'readonly' | 'readwrite'): IDBTransaction {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        return this.db.transaction([storeName], mode);
    }
    
    /**
     * Get the name of the primary store
     */
    getStoreName(): string {
        return this.storeName;
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
}