/**
 * Location: src/database/services/core/VectorStoreService.ts
 * 
 * Summary: Vector store coordination service that provides high-level operations
 * for vector database management. Coordinates between different vector store providers,
 * handles operation routing, manages transactions, and provides unified interface
 * for vector operations across the application.
 * 
 * Used by: All agents and services requiring vector database operations
 * Dependencies: IVectorStore, CollectionService, various vector store providers
 */

import { Plugin } from 'obsidian';
import { IVectorStore } from '../../interfaces/IVectorStore';
import { CollectionService } from './CollectionService';
import { getErrorMessage } from '../../../utils/errorUtils';

/**
 * Vector Store Service
 * 
 * Provides high-level coordination and management of vector store operations.
 * Acts as a facade/coordinator for complex vector operations, transaction management,
 * and multi-collection operations.
 */
export class VectorStoreService {
    private systemOperationCount = 0;
    private readonly maxConcurrentOperations = 10;

    constructor(
        private plugin: Plugin,
        private vectorStore: IVectorStore,
        private collectionService: CollectionService
    ) {}

    // =============================================================================
    // TRANSACTION AND OPERATION MANAGEMENT
    // =============================================================================

    /**
     * Start a system operation (prevents recursive operations)
     * Returns operation ID for tracking
     */
    startSystemOperation(operationName: string): string {
        if (this.systemOperationCount >= this.maxConcurrentOperations) {
            throw new Error(`Maximum concurrent operations (${this.maxConcurrentOperations}) exceeded`);
        }

        this.systemOperationCount++;
        const operationId = `${operationName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        console.debug(`[VectorStoreService] Starting system operation: ${operationId} (active: ${this.systemOperationCount})`);
        
        // Notify vector store if it supports system operation tracking
        if ('startSystemOperation' in this.vectorStore && typeof this.vectorStore.startSystemOperation === 'function') {
            this.vectorStore.startSystemOperation();
        }

        return operationId;
    }

    /**
     * End a system operation
     */
    endSystemOperation(operationId: string): void {
        this.systemOperationCount = Math.max(0, this.systemOperationCount - 1);
        
        console.debug(`[VectorStoreService] Ending system operation: ${operationId} (remaining: ${this.systemOperationCount})`);
        
        // Notify vector store if it supports system operation tracking
        if ('endSystemOperation' in this.vectorStore && typeof this.vectorStore.endSystemOperation === 'function') {
            this.vectorStore.endSystemOperation();
        }
    }

    /**
     * Execute operation with system operation tracking
     */
    async executeSystemOperation<T>(
        operationName: string, 
        operation: () => Promise<T>
    ): Promise<T> {
        const operationId = this.startSystemOperation(operationName);
        
        try {
            return await operation();
        } finally {
            this.endSystemOperation(operationId);
        }
    }

    /**
     * Check if system operations are currently active
     */
    hasActiveSystemOperations(): boolean {
        return this.systemOperationCount > 0;
    }

    /**
     * Get current system operation count
     */
    getSystemOperationCount(): number {
        return this.systemOperationCount;
    }

    // =============================================================================
    // HIGH-LEVEL VECTOR OPERATIONS
    // =============================================================================

    /**
     * Initialize vector store with standard collections
     */
    async initializeVectorStore(): Promise<VectorStoreInitResult> {
        const result: VectorStoreInitResult = {
            success: false,
            collectionsInitialized: 0,
            errors: [],
            totalTime: 0
        };

        const startTime = Date.now();

        try {
            // Ensure collections exist
            const collectionResult = await this.collectionService.ensureStandardCollections();
            result.collectionsInitialized = collectionResult.created.length + collectionResult.existing.length;
            
            if (!collectionResult.success) {
                result.errors.push(...collectionResult.errors);
            }

            // Start health monitoring if successful
            if (collectionResult.success) {
                await this.collectionService.startMonitoring();
                result.success = true;
            }

            result.totalTime = Date.now() - startTime;
            return result;

        } catch (error) {
            result.errors.push(`Vector store initialization failed: ${getErrorMessage(error)}`);
            result.totalTime = Date.now() - startTime;
            return result;
        }
    }

    /**
     * Perform comprehensive health check on vector store
     */
    async performHealthCheck(): Promise<VectorStoreHealthResult> {
        const result: VectorStoreHealthResult = {
            healthy: true,
            collections: {},
            vectorStoreInfo: {
                provider: 'chroma',
                version: '1.0.0',
                collections: [],
                totalItems: 0,
                memoryUsage: 0,
                diskUsage: 0
            },
            recommendations: [],
            timestamp: Date.now()
        };

        try {
            // Get collection health
            const healthCheckResult = await this.collectionService.performHealthCheck();
            result.collections = healthCheckResult.collections;
            result.recommendations = healthCheckResult.recommendations;
            result.healthy = healthCheckResult.healthy;

            // Get vector store specific information
            result.vectorStoreInfo = await this.getVectorStoreInfo();

            return result;

        } catch (error) {
            result.healthy = false;
            result.recommendations.push(`Health check failed: ${getErrorMessage(error)}`);
            return result;
        }
    }

    /**
     * Get vector store information and statistics
     */
    async getVectorStoreInfo(): Promise<VectorStoreInfo> {
        const info: VectorStoreInfo = {
            provider: 'unknown',
            version: 'unknown',
            collections: [],
            totalItems: 0,
            memoryUsage: 0,
            diskUsage: 0
        };

        try {
            // Get collections list
            info.collections = await this.vectorStore.listCollections();
            
            // Calculate total items
            let totalItems = 0;
            for (const collectionName of info.collections) {
                try {
                    const count = await this.vectorStore.count(collectionName);
                    totalItems += count;
                } catch (error) {
                    // Skip collections that can't be counted
                }
            }
            info.totalItems = totalItems;

            // Get memory usage if available
            if ('calculateMemoryDatabaseSize' in this.vectorStore && typeof this.vectorStore.calculateMemoryDatabaseSize === 'function') {
                info.memoryUsage = this.vectorStore.calculateMemoryDatabaseSize();
            }

            // Detect provider type
            if (this.vectorStore.constructor.name.includes('Chroma')) {
                info.provider = 'ChromaDB';
            }

            return info;

        } catch (error) {
            console.warn('[VectorStoreService] Failed to get vector store info:', error);
            return info;
        }
    }

    // =============================================================================
    // BULK OPERATIONS
    // =============================================================================

    /**
     * Bulk add items across multiple collections
     */
    async bulkAdd(operations: BulkAddOperation[]): Promise<BulkOperationResult[]> {
        const results: BulkOperationResult[] = [];

        for (const operation of operations) {
            const result: BulkOperationResult = {
                collectionName: operation.collectionName,
                success: false,
                itemsProcessed: 0,
                errors: []
            };

            try {
                // Ensure collection exists
                const exists = await this.vectorStore.hasCollection(operation.collectionName);
                if (!exists) {
                    await this.vectorStore.createCollection(operation.collectionName, operation.collectionOptions);
                }

                // Add items
                await this.vectorStore.addItems(operation.collectionName, {
                    ids: operation.ids,
                    embeddings: operation.embeddings,
                    metadatas: operation.metadatas,
                    documents: operation.documents
                });

                result.success = true;
                result.itemsProcessed = operation.ids.length;

            } catch (error) {
                result.errors.push(getErrorMessage(error));
            }

            results.push(result);
        }

        return results;
    }

    /**
     * Bulk query across multiple collections
     */
    async bulkQuery(queries: BulkQueryOperation[]): Promise<BulkQueryResult[]> {
        const results: BulkQueryResult[] = [];

        for (const query of queries) {
            const result: BulkQueryResult = {
                collectionName: query.collectionName,
                success: false,
                results: null,
                errors: []
            };

            try {
                result.results = await this.vectorStore.query(query.collectionName, query.queryParams);
                result.success = true;

            } catch (error) {
                result.errors.push(getErrorMessage(error));
            }

            results.push(result);
        }

        return results;
    }

    /**
     * Bulk delete across multiple collections
     */
    async bulkDelete(operations: BulkDeleteOperation[]): Promise<BulkOperationResult[]> {
        const results: BulkOperationResult[] = [];

        for (const operation of operations) {
            const result: BulkOperationResult = {
                collectionName: operation.collectionName,
                success: false,
                itemsProcessed: 0,
                errors: []
            };

            try {
                if (operation.ids) {
                    await this.vectorStore.deleteItems(operation.collectionName, operation.ids);
                    result.itemsProcessed = operation.ids.length;
                } else if (operation.where) {
                    // Delete by filter - we don't know how many items will be deleted
                    // Delete by filter not directly supported - would need to query first then delete
                    throw new Error('Delete by filter not supported in current interface');
                    result.itemsProcessed = -1; // Unknown count
                }

                result.success = true;

            } catch (error) {
                result.errors.push(getErrorMessage(error));
            }

            results.push(result);
        }

        return results;
    }

    // =============================================================================
    // COLLECTION MANAGEMENT DELEGATION
    // =============================================================================

    /**
     * Create collection with validation
     */
    async createCollection(name: string, options?: any): Promise<void> {
        await this.executeSystemOperation('createCollection', async () => {
            await this.vectorStore.createCollection(name, options);
        });
    }

    /**
     * Delete collection with cleanup
     */
    async deleteCollection(name: string): Promise<void> {
        await this.executeSystemOperation('deleteCollection', async () => {
            await this.vectorStore.deleteCollection(name);
        });
    }

    /**
     * List all collections
     */
    async listCollections(): Promise<string[]> {
        return this.vectorStore.listCollections();
    }

    /**
     * Check if collection exists
     */
    async hasCollection(name: string): Promise<boolean> {
        return this.vectorStore.hasCollection(name);
    }

    // =============================================================================
    // SEARCH OPERATIONS DELEGATION
    // =============================================================================

    /**
     * Query collection with error handling
     */
    async query(collectionName: string, queryParams: any): Promise<any> {
        try {
            return await this.vectorStore.query(collectionName, queryParams);
        } catch (error) {
            console.error(`[VectorStoreService] Query failed for collection ${collectionName}:`, error);
            throw error;
        }
    }

    /**
     * Add items to collection with error handling
     */
    async add(collectionName: string, items: any): Promise<void> {
        try {
            await this.vectorStore.addItems(collectionName, items);
        } catch (error) {
            console.error(`[VectorStoreService] Add failed for collection ${collectionName}:`, error);
            throw error;
        }
    }

    /**
     * Delete items from collection with error handling
     */
    async delete(collectionName: string, filter: any): Promise<void> {
        try {
            if (filter.ids) {
                await this.vectorStore.deleteItems(collectionName, filter.ids);
            } else {
                throw new Error('Delete by filter not supported in current interface');
            }
        } catch (error) {
            console.error(`[VectorStoreService] Delete failed for collection ${collectionName}:`, error);
            throw error;
        }
    }

    /**
     * Get all items from collection
     */
    async getAllItems(collectionName: string, options?: any): Promise<any> {
        try {
            return await this.vectorStore.getAllItems(collectionName, options);
        } catch (error) {
            console.error(`[VectorStoreService] GetAllItems failed for collection ${collectionName}:`, error);
            throw error;
        }
    }

    /**
     * Count items in collection
     */
    async count(collectionName: string): Promise<number> {
        try {
            return await this.vectorStore.count(collectionName);
        } catch (error) {
            console.error(`[VectorStoreService] Count failed for collection ${collectionName}:`, error);
            throw error;
        }
    }

    // =============================================================================
    // CLEANUP AND MAINTENANCE
    // =============================================================================

    /**
     * Cleanup and shutdown vector store service
     */
    async cleanup(): Promise<void> {
        try {
            // Stop health monitoring
            await this.collectionService.stopMonitoring();

            // Wait for active operations to complete
            while (this.systemOperationCount > 0) {
                console.log(`[VectorStoreService] Waiting for ${this.systemOperationCount} operations to complete...`);
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            console.log('[VectorStoreService] Cleanup completed');

        } catch (error) {
            console.error('[VectorStoreService] Cleanup error:', error);
        }
    }
}

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface VectorStoreInitResult {
    success: boolean;
    collectionsInitialized: number;
    errors: string[];
    totalTime: number;
}

export interface VectorStoreHealthResult {
    healthy: boolean;
    collections: Record<string, any>;
    vectorStoreInfo: VectorStoreInfo;
    recommendations: string[];
    timestamp: number;
}

export interface VectorStoreInfo {
    provider: string;
    version: string;
    collections: string[];
    totalItems: number;
    memoryUsage: number;
    diskUsage: number;
}

export interface BulkAddOperation {
    collectionName: string;
    ids: string[];
    embeddings: number[][];
    metadatas: any[];
    documents: string[];
    collectionOptions?: any;
}

export interface BulkQueryOperation {
    collectionName: string;
    queryParams: any;
}

export interface BulkDeleteOperation {
    collectionName: string;
    ids?: string[];
    where?: any;
}

export interface BulkOperationResult {
    collectionName: string;
    success: boolean;
    itemsProcessed: number;
    errors: string[];
}

export interface BulkQueryResult {
    collectionName: string;
    success: boolean;
    results: any;
    errors: string[];
}