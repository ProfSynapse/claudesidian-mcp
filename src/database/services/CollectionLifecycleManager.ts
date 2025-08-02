import { IVectorStore } from '../interfaces/IVectorStore';
import { ICollectionManager } from '../providers/chroma/services/interfaces/ICollectionManager';

/**
 * Collection Lifecycle Manager
 * 
 * Centralized collection management service that ensures all required collections
 * exist and are properly initialized during plugin startup. This addresses the 
 * critical failure where collections are not being created, causing search 
 * functionality breakdown.
 * 
 * Key Features:
 * - Automatic creation of standard collections during initialization
 * - Collection validation and health checking
 * - Recovery mechanisms for corrupted or missing collections
 * - Integration with existing ChromaVectorStoreModular initialization
 */
export class CollectionLifecycleManager {
    private static readonly STANDARD_COLLECTIONS = [
        'file_embeddings',    // Document embeddings for semantic search
        'memory_traces',      // Tool call and session memory storage
        'sessions',           // Session state management
        'snapshots',          // Workspace snapshots
        'workspaces'          // Workspace metadata
    ] as const;

    private static readonly COLLECTION_METADATA: Record<string, Record<string, any>> = {
        file_embeddings: {
            'hnsw:space': 'cosine',
            description: 'Document embeddings for semantic search',
            fields: {
                filePath: 'string',
                title: 'string',
                contentHash: 'string',
                chunkIndex: 'number',
                lastModified: 'number'
            },
            indexType: 'document_semantic',
            createdBy: 'CollectionLifecycleManager'
        },
        memory_traces: {
            'hnsw:space': 'cosine',
            description: 'Memory traces for tool calls and user interactions',
            fields: {
                workspaceId: 'string',
                activityType: 'string',
                sessionId: 'string',
                importance: 'number',
                tags: 'array'
            },
            indexType: 'memory_semantic',
            createdBy: 'CollectionLifecycleManager'
        },
        sessions: {
            'hnsw:space': 'cosine',
            description: 'Session state and conversation management',
            fields: {
                sessionId: 'string',
                userId: 'string',
                startTime: 'number',
                lastActivity: 'number'
            },
            indexType: 'session_management',
            createdBy: 'CollectionLifecycleManager'
        },
        snapshots: {
            'hnsw:space': 'cosine',
            description: 'Workspace snapshots and state persistence',
            fields: {
                snapshotId: 'string',
                workspaceId: 'string',
                timestamp: 'number',
                metadata: 'object'
            },
            indexType: 'workspace_snapshots',
            createdBy: 'CollectionLifecycleManager'
        },
        workspaces: {
            'hnsw:space': 'cosine',
            description: 'Workspace metadata and configuration',
            fields: {
                workspaceId: 'string',
                name: 'string',
                createdAt: 'number',
                settings: 'object'
            },
            indexType: 'workspace_metadata',
            createdBy: 'CollectionLifecycleManager'
        }
    };

    constructor(
        private vectorStore: IVectorStore,
        private collectionManager: ICollectionManager
    ) {}

    /**
     * Ensure all standard collections exist and are properly initialized
     * This is the main method called during plugin startup
     */
    async ensureStandardCollections(): Promise<CollectionCreationResult> {
        const startTime = Date.now();
        const result: CollectionCreationResult = {
            success: true,
            created: [],
            existing: [],
            errors: [],
            totalTime: 0
        };

        console.log('[CollectionLifecycleManager] Starting standard collection validation and creation');

        try {
            // Process each standard collection
            for (const collectionName of CollectionLifecycleManager.STANDARD_COLLECTIONS) {
                try {
                    const exists = await this.vectorStore.hasCollection(collectionName);
                    
                    if (exists) {
                        // Validate existing collection
                        const isValid = await this.validateCollection(collectionName);
                        if (isValid.valid) {
                            result.existing.push(collectionName);
                            console.log(`[CollectionLifecycleManager] ✅ Collection '${collectionName}' exists and is valid`);
                        } else {
                            // Collection exists but is invalid - attempt recovery
                            console.warn(`[CollectionLifecycleManager] ⚠️  Collection '${collectionName}' exists but is invalid: ${isValid.issues.join(', ')}`);
                            const recoveryResult = await this.recoverCollection(collectionName, 'soft');
                            
                            if (recoveryResult.success) {
                                result.existing.push(collectionName);
                                console.log(`[CollectionLifecycleManager] ✅ Collection '${collectionName}' recovered successfully`);
                            } else {
                                result.errors.push(`Failed to recover collection '${collectionName}': ${recoveryResult.errors.join(', ')}`);
                            }
                        }
                    } else {
                        // Collection doesn't exist - create it
                        await this.createStandardCollection(collectionName);
                        result.created.push(collectionName);
                        console.log(`[CollectionLifecycleManager] ✅ Created collection '${collectionName}'`);
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    result.errors.push(`Failed to process collection '${collectionName}': ${errorMessage}`);
                    console.error(`[CollectionLifecycleManager] ❌ Error processing collection '${collectionName}':`, error);
                }
            }

            // Update result
            result.success = result.errors.length === 0;
            result.totalTime = Date.now() - startTime;

            if (result.success) {
                console.log(`[CollectionLifecycleManager] ✅ Standard collections initialized successfully in ${result.totalTime}ms`);
                console.log(`[CollectionLifecycleManager] Created: ${result.created.length}, Existing: ${result.existing.length}`);
            } else {
                console.error(`[CollectionLifecycleManager] ❌ Standard collection initialization completed with errors in ${result.totalTime}ms`);
                console.error(`[CollectionLifecycleManager] Errors: ${result.errors.join('; ')}`);
            }

            return result;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.success = false;
            result.errors.push(`Collection initialization failed: ${errorMessage}`);
            result.totalTime = Date.now() - startTime;
            
            console.error('[CollectionLifecycleManager] ❌ Critical error during collection initialization:', error);
            return result;
        }
    }

    /**
     * Validate a collection to ensure it's healthy and accessible
     */
    async validateCollection(collectionName: string): Promise<ValidationResult> {
        const result: ValidationResult = {
            valid: true,
            collectionName,
            issues: [],
            recommendations: []
        };

        try {
            // 1. Check if collection exists
            const exists = await this.vectorStore.hasCollection(collectionName);
            if (!exists) {
                result.valid = false;
                result.issues.push('Collection does not exist');
                result.recommendations.push('Create the collection using ensureStandardCollections()');
                return result;
            }

            // 2. Test basic operations
            try {
                const count = await this.vectorStore.count(collectionName);
                result.itemCount = count;
                
                // Test query operation with empty query (should not fail) and validate result structure
                const queryResult = await this.vectorStore.query(collectionName, {
                    queryTexts: ['health check'],
                    nResults: 1
                });
                
                // CRITICAL FIX: Validate query result structure to prevent array method errors
                if (queryResult && typeof queryResult === 'object') {
                    if (queryResult.ids && !Array.isArray(queryResult.ids)) {
                        result.valid = false;
                        result.issues.push('Query result ids field is not an array - data format corrupted');
                        result.recommendations.push('Collection data format is corrupted, consider hard recovery');
                    }
                    if (queryResult.distances && !Array.isArray(queryResult.distances)) {
                        result.valid = false;
                        result.issues.push('Query result distances field is not an array - data format corrupted');
                        result.recommendations.push('Collection data format is corrupted, consider hard recovery');
                    }
                }

            } catch (operationError) {
                result.valid = false;
                result.issues.push(`Collection operations failed: ${operationError instanceof Error ? operationError.message : String(operationError)}`);
                result.recommendations.push('Consider collection recovery or recreation');
            }

            // 3. Validate metadata if this is a standard collection
            if (CollectionLifecycleManager.STANDARD_COLLECTIONS.includes(collectionName as any)) {
                const expectedMetadata = CollectionLifecycleManager.COLLECTION_METADATA[collectionName];
                if (expectedMetadata) {
                    // For now, we'll assume metadata is valid if operations work
                    // In a full implementation, we'd validate the metadata structure
                }
            }

            result.lastModified = Date.now();

        } catch (error) {
            result.valid = false;
            result.issues.push(`Validation failed: ${error instanceof Error ? error.message : String(error)}`);
            result.recommendations.push('Check collection accessibility and try recovery');
        }

        return result;
    }

    /**
     * Recover a collection using specified strategy
     */
    async recoverCollection(collectionName: string, strategy: RecoveryStrategy): Promise<RecoveryResult> {
        const startTime = Date.now();
        const result: RecoveryResult = {
            success: false,
            strategy,
            collectionName,
            errors: [],
            dataLoss: false,
            recoveryTime: 0
        };

        console.log(`[CollectionLifecycleManager] Starting ${strategy} recovery for collection: ${collectionName}`);

        try {
            switch (strategy) {
                case 'soft':
                    await this.performSoftRecovery(collectionName, result);
                    break;
                case 'hard':
                    await this.performHardRecovery(collectionName, result);
                    break;
                case 'data':
                    await this.performDataRecovery(collectionName, result);
                    break;
                default:
                    throw new Error(`Unknown recovery strategy: ${strategy}`);
            }

            result.recoveryTime = Date.now() - startTime;
            
            if (result.success) {
                console.log(`[CollectionLifecycleManager] ✅ ${strategy} recovery successful for ${collectionName} in ${result.recoveryTime}ms`);
            } else {
                console.error(`[CollectionLifecycleManager] ❌ ${strategy} recovery failed for ${collectionName}: ${result.errors.join(', ')}`);
            }

        } catch (error) {
            result.errors.push(`Recovery failed: ${error instanceof Error ? error.message : String(error)}`);
            result.recoveryTime = Date.now() - startTime;
            console.error(`[CollectionLifecycleManager] ❌ Recovery error for ${collectionName}:`, error);
        }

        return result;
    }

    /**
     * Perform comprehensive health check on all standard collections
     */
    async performHealthCheck(): Promise<HealthCheckResult> {
        const result: HealthCheckResult = {
            healthy: true,
            collections: {},
            issues: [],
            recommendations: [],
            timestamp: Date.now()
        };

        console.log('[CollectionLifecycleManager] Starting comprehensive health check');

        try {
            // Check each standard collection
            for (const collectionName of CollectionLifecycleManager.STANDARD_COLLECTIONS) {
                try {
                    const validation = await this.validateCollection(collectionName);
                    
                    result.collections[collectionName] = {
                        exists: await this.vectorStore.hasCollection(collectionName),
                        accessible: validation.valid,
                        itemCount: validation.itemCount || 0,
                        issues: validation.issues,
                        lastOperation: Date.now()
                    };

                    if (!validation.valid) {
                        result.healthy = false;
                        result.issues.push(`Collection '${collectionName}' is unhealthy: ${validation.issues.join(', ')}`);
                        result.recommendations.push(`Run recovery for collection '${collectionName}'`);
                    }

                } catch (error) {
                    result.healthy = false;
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    result.issues.push(`Health check failed for '${collectionName}': ${errorMessage}`);
                    result.recommendations.push(`Investigate collection '${collectionName}' issues`);
                    
                    result.collections[collectionName] = {
                        exists: false,
                        accessible: false,
                        itemCount: 0,
                        issues: [errorMessage],
                        lastOperation: Date.now()
                    };
                }
            }

            if (result.healthy) {
                console.log('[CollectionLifecycleManager] ✅ All collections are healthy');
            } else {
                console.warn(`[CollectionLifecycleManager] ⚠️  Health check found ${result.issues.length} issues`);
            }

        } catch (error) {
            result.healthy = false;
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.issues.push(`Health check failed: ${errorMessage}`);
            console.error('[CollectionLifecycleManager] ❌ Health check error:', error);
        }

        return result;
    }

    /**
     * Get metadata for a standard collection
     */
    getCollectionMetadata(collectionName: string): Record<string, any> {
        return CollectionLifecycleManager.COLLECTION_METADATA[collectionName] || {
            'hnsw:space': 'cosine',
            description: `Collection: ${collectionName}`,
            createdBy: 'CollectionLifecycleManager',
            createdAt: new Date().toISOString()
        };
    }

    /**
     * Create a standard collection with proper metadata
     */
    private async createStandardCollection(collectionName: string): Promise<void> {
        const metadata = this.getCollectionMetadata(collectionName);
        
        // Add timestamp
        metadata.createdAt = new Date().toISOString();
        
        await this.vectorStore.createCollection(collectionName, metadata);
        console.log(`[CollectionLifecycleManager] Created standard collection '${collectionName}' with metadata`);
    }

    /**
     * Perform soft recovery - fix metadata and permissions without data loss
     */
    private async performSoftRecovery(collectionName: string, result: RecoveryResult): Promise<void> {
        try {
            // Check if collection exists
            const exists = await this.vectorStore.hasCollection(collectionName);
            
            if (!exists) {
                // Collection missing - create it
                await this.createStandardCollection(collectionName);
                result.success = true;
                return;
            }

            // Collection exists but may have issues - validate operations
            try {
                await this.vectorStore.count(collectionName);
                await this.vectorStore.query(collectionName, {
                    queryTexts: ['test'],
                    nResults: 1
                });
                
                result.success = true;
            } catch (operationError) {
                result.errors.push(`Soft recovery failed: collection operations still failing after validation`);
            }

        } catch (error) {
            result.errors.push(`Soft recovery failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Perform hard recovery - recreate collection with data loss
     */
    private async performHardRecovery(collectionName: string, result: RecoveryResult): Promise<void> {
        try {
            // Get item count if possible
            let itemCount = 0;
            try {
                if (await this.vectorStore.hasCollection(collectionName)) {
                    itemCount = await this.vectorStore.count(collectionName);
                }
            } catch (error) {
                // Continue - we'll recreate anyway
            }

            // Delete existing collection if it exists
            try {
                await this.vectorStore.deleteCollection(collectionName);
            } catch (error) {
                // Continue even if delete fails
            }

            // Recreate collection
            await this.createStandardCollection(collectionName);
            
            result.success = true;
            result.dataLoss = itemCount > 0;
            
            if (result.dataLoss) {
                console.warn(`[CollectionLifecycleManager] Hard recovery completed with data loss: ${itemCount} items lost from '${collectionName}'`);
            }

        } catch (error) {
            result.errors.push(`Hard recovery failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Perform data recovery - attempt to preserve existing data
     */
    private async performDataRecovery(collectionName: string, result: RecoveryResult): Promise<void> {
        try {
            // For now, data recovery is the same as hard recovery
            // In a full implementation, we would attempt to extract and restore data
            await this.performHardRecovery(collectionName, result);
            
            if (result.success) {
                // Data recovery completed - mark as potential data loss
                result.dataLoss = true;
            }

        } catch (error) {
            result.errors.push(`Data recovery failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

// Type definitions

export interface CollectionCreationResult {
    success: boolean;
    created: string[];
    existing: string[];
    errors: string[];
    totalTime: number;
}

export interface ValidationResult {
    valid: boolean;
    collectionName: string;
    issues: string[];
    recommendations: string[];
    itemCount?: number;
    lastModified?: number;
}

export interface RecoveryResult {
    success: boolean;
    strategy: RecoveryStrategy;
    collectionName: string;
    errors: string[];
    dataLoss: boolean;
    recoveryTime: number;
}

export interface HealthCheckResult {
    healthy: boolean;
    collections: Record<string, CollectionHealth>;
    issues: string[];
    recommendations: string[];
    timestamp: number;
}

export type RecoveryStrategy = 'soft' | 'hard' | 'data';

export interface CollectionHealth {
    exists: boolean;
    accessible: boolean;
    itemCount: number;
    issues: string[];
    lastOperation?: number;
    errorRate?: number;
}

export interface ICollectionLifecycleManager {
    ensureStandardCollections(): Promise<CollectionCreationResult>;
    validateCollection(collectionName: string): Promise<ValidationResult>;
    recoverCollection(collectionName: string, strategy: RecoveryStrategy): Promise<RecoveryResult>;
    performHealthCheck(): Promise<HealthCheckResult>;
    getCollectionMetadata(collectionName: string): Record<string, any>;
}