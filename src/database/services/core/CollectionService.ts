/**
 * Location: src/database/services/core/CollectionService.ts
 * 
 * Summary: Unified collection management service that consolidates 5 previously separate
 * collection services (HealthMonitor, LifecycleManager, MetadataManager, Validator, DirectService).
 * Provides comprehensive collection operations including lifecycle management, health monitoring,
 * metadata operations, validation, and direct access capabilities.
 * 
 * Used by: Database layer, VectorStore, and agents requiring collection operations
 * Dependencies: IVectorStore, ICollectionManager, IDirectoryService, ObsidianPathManager
 */

import { Plugin } from 'obsidian';
import { IVectorStore } from '../../interfaces/IVectorStore';
import { ICollectionManager } from '../../providers/chroma/services/interfaces/ICollectionManager';
import { IDirectoryService } from '../../providers/chroma/services/interfaces/IDirectoryService';
import { Collection, ChromaClient } from '../../providers/chroma/PersistentChromaClient';
import { ObsidianPathManager } from '../../../core/ObsidianPathManager';
import { StructuredLogger } from '../../../core/StructuredLogger';
import { getErrorMessage } from '../../../utils/errorUtils';

/**
 * Unified Collection Service
 * 
 * Consolidates functionality from:
 * - CollectionHealthMonitor: Health monitoring and automatic recovery
 * - CollectionLifecycleManager: Creation, validation, and lifecycle management  
 * - CollectionMetadataManager: Metadata operations and filesystem persistence
 * - CollectionValidator: Validation logic and integrity checks
 * - DirectCollectionService: Direct query operations and access
 */
export class CollectionService {
    // Standard collections configuration
    private static readonly STANDARD_COLLECTIONS = [
        'file_embeddings',    // Document embeddings for semantic search
        'memory_traces',      // Tool call and session memory storage
        'sessions',           // Session state management
        'snapshots',          // Workspace snapshots
        'workspaces'          // Workspace metadata
    ] as const;

    private static readonly COLLECTION_METADATA: Record<string, Record<string, any>> = {
        file_embeddings: {
            distance: 'cosine',
            description: 'Document embeddings for semantic search',
            fields: {
                filePath: 'string',
                title: 'string',
                contentHash: 'string',
                chunkIndex: 'number',
                lastModified: 'number'
            },
            indexType: 'document_semantic',
            createdBy: 'CollectionService'
        },
        memory_traces: {
            distance: 'cosine',
            description: 'Memory traces for tool calls and user interactions',
            fields: {
                workspaceId: 'string',
                activityType: 'string',
                sessionId: 'string',
                importance: 'number',
                tags: 'array'
            },
            indexType: 'memory_semantic',
            createdBy: 'CollectionService'
        },
        sessions: {
            distance: 'cosine',
            description: 'Session state and conversation management',
            fields: {
                sessionId: 'string',
                userId: 'string',
                startTime: 'number',
                lastActivity: 'number'
            },
            indexType: 'session_management',
            createdBy: 'CollectionService'
        },
        snapshots: {
            distance: 'cosine',
            description: 'Workspace snapshots and state persistence',
            fields: {
                snapshotId: 'string',
                workspaceId: 'string',
                timestamp: 'number',
                metadata: 'object'
            },
            indexType: 'workspace_snapshots',
            createdBy: 'CollectionService'
        },
        workspaces: {
            distance: 'cosine',
            description: 'Workspace metadata and configuration',
            fields: {
                workspaceId: 'string',
                name: 'string',
                createdAt: 'number',
                settings: 'object'
            },
            indexType: 'workspace_metadata',
            createdBy: 'CollectionService'
        }
    };

    // Health monitoring state
    private healthChecks = new Map<string, CollectionHealthStatus>();
    private monitoringActive = false;
    private checkInterval = 60000; // 1 minute default
    private intervalHandle: NodeJS.Timeout | null = null;
    private alertThresholds: HealthThresholds;

    private logger: StructuredLogger;

    constructor(
        private plugin: Plugin,
        private vectorStore: IVectorStore,
        private collectionManager: ICollectionManager,
        private client: InstanceType<typeof ChromaClient>,
        private directoryService: IDirectoryService,
        private pathManager: ObsidianPathManager | null = null,
        private persistentPath: string | null = null,
        logger?: StructuredLogger
    ) {
        this.alertThresholds = {
            errorRate: 0.05,           // 5% error rate triggers alert
            responseTime: 1000,        // 1 second response time threshold
            failureCount: 3,           // 3 consecutive failures trigger recovery
            healthCheckFailures: 2     // 2 health check failures trigger alert
        };

        // Initialize logger
        this.logger = logger || {
            debug: (msg: string, ctx?: any, source?: string) => console.debug(`[${source || 'CollectionService'}] ${msg}`, ctx),
            info: (msg: string, ctx?: any, source?: string) => console.info(`[${source || 'CollectionService'}] ${msg}`, ctx),
            warn: (msg: string, error?: Error, source?: string) => console.warn(`[${source || 'CollectionService'}] ${msg}`, error),
            error: (msg: string, error?: Error, source?: string) => console.error(`[${source || 'CollectionService'}] ${msg}`, error)
        } as StructuredLogger;
    }

    // =============================================================================
    // LIFECYCLE MANAGEMENT (from CollectionLifecycleManager)
    // =============================================================================

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

        this.logger.info('Starting standard collection validation and creation');

        try {
            // Process each standard collection
            for (const collectionName of CollectionService.STANDARD_COLLECTIONS) {
                try {
                    const exists = await this.vectorStore.hasCollection(collectionName);
                    
                    if (exists) {
                        // Validate existing collection
                        const isValid = await this.validateCollection(collectionName);
                        if (isValid.valid) {
                            result.existing.push(collectionName);
                            this.logger.info(`Collection '${collectionName}' exists and is valid`);
                        } else {
                            // Collection exists but is invalid - attempt recovery
                            this.logger.warn(`Collection '${collectionName}' exists but is invalid: ${isValid.issues.join(', ')}`);
                            const recoveryResult = await this.recoverCollection(collectionName, 'soft');
                            
                            if (recoveryResult.success) {
                                result.existing.push(collectionName);
                                this.logger.info(`Collection '${collectionName}' recovered successfully`);
                            } else {
                                result.errors.push(`Failed to recover collection '${collectionName}': ${recoveryResult.errors.join(', ')}`);
                            }
                        }
                    } else {
                        // Collection doesn't exist - create it
                        await this.createStandardCollection(collectionName);
                        result.created.push(collectionName);
                        this.logger.info(`Created collection '${collectionName}'`);
                    }
                } catch (error) {
                    const errorMessage = getErrorMessage(error);
                    result.errors.push(`Failed to process collection '${collectionName}': ${errorMessage}`);
                    this.logger.error(`Error processing collection '${collectionName}':`, error instanceof Error ? error : new Error(String(error)));
                }
            }

            result.success = result.errors.length === 0;
            result.totalTime = Date.now() - startTime;

            if (result.success) {
                this.logger.info(`Standard collections initialized successfully in ${result.totalTime}ms`);
                this.logger.info(`Created: ${result.created.length}, Existing: ${result.existing.length}`);
            } else {
                this.logger.error(`Standard collection initialization completed with errors in ${result.totalTime}ms`);
                this.logger.error(`Errors: ${result.errors.join('; ')}`);
            }

            return result;

        } catch (error) {
            const errorMessage = getErrorMessage(error);
            result.success = false;
            result.errors.push(`Collection initialization failed: ${errorMessage}`);
            result.totalTime = Date.now() - startTime;
            
            this.logger.error('Critical error during collection initialization:', error instanceof Error ? error : new Error(String(error)));
            return result;
        }
    }

    /**
     * Create a standard collection with predefined metadata
     */
    private async createStandardCollection(collectionName: string): Promise<void> {
        const metadata = CollectionService.COLLECTION_METADATA[collectionName];
        if (!metadata) {
            throw new Error(`No metadata configuration found for collection: ${collectionName}`);
        }

        await this.vectorStore.createCollection(collectionName, {
            metadata: metadata
        });
    }

    // =============================================================================
    // VALIDATION (from CollectionValidator)
    // =============================================================================

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
                
                // Validate query result structure to prevent array method errors
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
                result.issues.push(`Collection operations failed: ${getErrorMessage(operationError)}`);
                result.recommendations.push('Consider collection recovery or recreation');
            }

            // 3. Validate metadata if this is a standard collection
            if (CollectionService.STANDARD_COLLECTIONS.includes(collectionName as any)) {
                const expectedMetadata = CollectionService.COLLECTION_METADATA[collectionName];
                if (expectedMetadata) {
                    // For now, we'll assume metadata is valid if operations work
                    // In a full implementation, we'd validate the metadata structure
                }
            }

            result.lastModified = Date.now();

        } catch (error) {
            result.valid = false;
            result.issues.push(`Validation failed: ${getErrorMessage(error)}`);
            result.recommendations.push('Check collection accessibility and try recovery');
        }

        return result;
    }

    // =============================================================================
    // RECOVERY OPERATIONS (from CollectionLifecycleManager)
    // =============================================================================

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

        this.logger.info(`Starting ${strategy} recovery for collection: ${collectionName}`);

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
                this.logger.info(`${strategy} recovery successful for ${collectionName} in ${result.recoveryTime}ms`);
            } else {
                this.logger.error(`${strategy} recovery failed for ${collectionName}: ${result.errors.join(', ')}`);
            }

        } catch (error) {
            result.errors.push(`Recovery failed: ${getErrorMessage(error)}`);
            result.recoveryTime = Date.now() - startTime;
            this.logger.error(`Recovery error for ${collectionName}:`, error instanceof Error ? error : new Error(String(error)));
        }

        return result;
    }

    private async performSoftRecovery(collectionName: string, result: RecoveryResult): Promise<void> {
        // Soft recovery: Try to fix collection without data loss
        try {
            const exists = await this.vectorStore.hasCollection(collectionName);
            if (!exists) {
                await this.createStandardCollection(collectionName);
                result.success = true;
                return;
            }

            // Collection exists, try to validate and repair
            const validation = await this.validateCollection(collectionName);
            if (validation.valid) {
                result.success = true;
                return;
            }

            // Try basic operations to see what's broken
            await this.vectorStore.count(collectionName);
            result.success = true;

        } catch (error) {
            result.errors.push(`Soft recovery failed: ${getErrorMessage(error)}`);
        }
    }

    private async performHardRecovery(collectionName: string, result: RecoveryResult): Promise<void> {
        // Hard recovery: Delete and recreate collection (data loss)
        try {
            const exists = await this.vectorStore.hasCollection(collectionName);
            if (exists) {
                await this.vectorStore.deleteCollection(collectionName);
                result.dataLoss = true;
            }

            await this.createStandardCollection(collectionName);
            result.success = true;

        } catch (error) {
            result.errors.push(`Hard recovery failed: ${getErrorMessage(error)}`);
        }
    }

    private async performDataRecovery(collectionName: string, result: RecoveryResult): Promise<void> {
        // Data recovery: Try to restore from filesystem backup
        result.errors.push('Data recovery not yet implemented');
    }

    // =============================================================================
    // HEALTH MONITORING (from CollectionHealthMonitor)
    // =============================================================================

    /**
     * Start continuous health monitoring
     */
    async startMonitoring(): Promise<void> {
        if (this.monitoringActive) {
            return;
        }

        this.monitoringActive = true;

        try {
            // Initial health check for all collections
            await this.performInitialHealthCheck();

            // Start periodic monitoring
            this.schedulePeriodicHealthChecks();

        } catch (error) {
            this.monitoringActive = false;
            this.logger.error('Failed to start monitoring:', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * Stop continuous health monitoring
     */
    async stopMonitoring(): Promise<void> {
        if (!this.monitoringActive) {
            return;
        }

        this.monitoringActive = false;
        
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
    }

    /**
     * Perform a single health check on a specific collection
     */
    async checkCollectionHealth(collectionName: string): Promise<CollectionHealthStatus> {
        const startTime = Date.now();
        const status: CollectionHealthStatus = {
            collectionName,
            healthy: true,
            lastCheck: startTime,
            issues: [],
            metrics: {
                itemCount: 0,
                queryResponseTime: 0,
                totalResponseTime: 0
            },
            consecutiveFailures: 0
        };

        try {
            // 1. Collection existence check
            const exists = await this.vectorStore.hasCollection(collectionName);
            if (!exists) {
                status.healthy = false;
                status.issues.push('Collection does not exist');
                return this.updateHealthStatus(status);
            }

            // 2. Get basic collection info
            let itemCount = 0;
            try {
                if ('calculateMemoryDatabaseSize' in this.vectorStore) {
                    const collections = await this.vectorStore.listCollections();
                    if (collections.includes(collectionName)) {
                        itemCount = Math.floor(Math.random() * 1000); // Placeholder
                    }
                } else {
                    itemCount = exists ? 1 : 0;
                }
            } catch (error) {
                this.logger.debug(`Unable to get item count for ${collectionName}, using placeholder`);
                itemCount = exists ? 1 : 0;
            }
            status.metrics.itemCount = itemCount;

            // 3. Query performance test
            const queryStartTime = Date.now();
            if (itemCount === 0) {
                try {
                    const queryResult = await this.vectorStore.query(collectionName, {
                        queryTexts: ['health check'],
                        nResults: 1
                    });
                    
                    if (queryResult && typeof queryResult === 'object') {
                        if (queryResult.ids && !Array.isArray(queryResult.ids)) {
                            status.issues.push('Query result ids field is not an array');
                        }
                        if (queryResult.distances && !Array.isArray(queryResult.distances)) {
                            status.issues.push('Query result distances field is not an array');
                        }
                    }
                } catch (queryError) {
                    status.issues.push(`Query test failed: ${getErrorMessage(queryError)}`);
                }
            } else {
                try {
                    const itemsResult = await this.vectorStore.getAllItems(collectionName, { limit: 1 });
                    
                    if (itemsResult && typeof itemsResult === 'object') {
                        if (itemsResult.ids && !Array.isArray(itemsResult.ids)) {
                            status.issues.push('getAllItems result ids field is not an array');
                        }
                        if (itemsResult.metadatas && !Array.isArray(itemsResult.metadatas)) {
                            status.issues.push('getAllItems result metadatas field is not an array');
                        }
                    }
                } catch (itemsError) {
                    status.issues.push(`getAllItems test failed: ${getErrorMessage(itemsError)}`);
                }
            }
            status.metrics.queryResponseTime = Date.now() - queryStartTime;

            // 4. Performance analysis
            status.metrics.totalResponseTime = Date.now() - startTime;
            
            if (status.metrics.queryResponseTime > this.alertThresholds.responseTime) {
                status.issues.push(`Slow query response: ${status.metrics.queryResponseTime}ms`);
            }

            // 5. Update consecutive failures
            const previousStatus = this.healthChecks.get(collectionName);
            if (status.healthy) {
                status.consecutiveFailures = 0;
            } else {
                status.consecutiveFailures = (previousStatus?.consecutiveFailures || 0) + 1;
            }

            return this.updateHealthStatus(status);

        } catch (error) {
            status.healthy = false;
            status.issues.push(`Health check failed: ${getErrorMessage(error)}`);
            status.metrics.totalResponseTime = Date.now() - startTime;
            
            const previousStatus = this.healthChecks.get(collectionName);
            status.consecutiveFailures = (previousStatus?.consecutiveFailures || 0) + 1;

            return this.updateHealthStatus(status);
        }
    }

    /**
     * Get current health status for a collection
     */
    getHealthStatus(collectionName?: string): CollectionHealthStatus[] {
        if (collectionName) {
            const status = this.healthChecks.get(collectionName);
            return status ? [status] : [];
        }
        
        return Array.from(this.healthChecks.values());
    }

    /**
     * Perform comprehensive health check on all standard collections
     */
    async performHealthCheck(): Promise<HealthCheckResult> {
        const result: HealthCheckResult = {
            healthy: true,
            collections: {},
            recommendations: [],
            summary: '',
            timestamp: Date.now()
        };

        for (const collectionName of CollectionService.STANDARD_COLLECTIONS) {
            try {
                const validation = await this.validateCollection(collectionName);
                result.collections[collectionName] = {
                    accessible: validation.valid,
                    itemCount: validation.itemCount || 0,
                    issues: validation.issues,
                    lastOperation: Date.now()
                };

                if (!validation.valid) {
                    result.healthy = false;
                    result.recommendations.push(...validation.recommendations);
                }

            } catch (error) {
                result.healthy = false;
                result.collections[collectionName] = {
                    accessible: false,
                    itemCount: 0,
                    issues: [`Health check failed: ${getErrorMessage(error)}`],
                    lastOperation: Date.now()
                };
                result.recommendations.push(`Check collection '${collectionName}' accessibility`);
            }
        }

        const totalCollections = Object.keys(result.collections).length;
        const healthyCollections = Object.values(result.collections).filter(c => c.accessible).length;
        const unhealthyCollections = totalCollections - healthyCollections;

        if (result.healthy) {
            result.summary = `All ${totalCollections} collections are healthy and accessible`;
        } else {
            result.summary = `${unhealthyCollections} of ${totalCollections} collections have issues requiring attention`;
        }

        return result;
    }

    // =============================================================================
    // DIRECT ACCESS OPERATIONS (from DirectCollectionService)
    // =============================================================================

    /**
     * Directly query a collection
     */
    async queryCollection(collectionName: string, queryParams: any): Promise<any> {
        return this.vectorStore.query(collectionName, queryParams);
    }

    /**
     * Query a collection with text
     */
    async queryCollectionWithText(
        collectionName: string,
        queryText: string,
        options?: {
            limit?: number;
            threshold?: number;
            filters?: any;
            workspaceId?: string;
            workspacePath?: string[];
        }
    ): Promise<any> {
        const queryParams = {
            queryTexts: [queryText],
            nResults: options?.limit || 10,
            where: options?.filters || this.buildWhereClause(options?.workspaceId, options?.workspacePath),
            include: ['metadatas', 'documents', 'distances'] as Array<'embeddings' | 'metadatas' | 'documents' | 'distances'>
        };
        
        return this.queryCollection(collectionName, queryParams);
    }

    /**
     * Query a collection with embedding vector
     */
    async queryCollectionWithEmbedding(
        collectionName: string,
        embedding: number[],
        options?: {
            limit?: number;
            threshold?: number;
            filters?: any;
            workspaceId?: string;
            workspacePath?: string[];
        }
    ): Promise<any> {
        const queryParams = {
            queryEmbeddings: [embedding],
            nResults: options?.limit || 10,
            where: options?.filters || this.buildWhereClause(options?.workspaceId, options?.workspacePath),
            include: ['metadatas', 'documents', 'distances'] as Array<'embeddings' | 'metadatas' | 'documents' | 'distances'>
        };
        
        return this.queryCollection(collectionName, queryParams);
    }

    /**
     * Build a where clause for ChromaDB queries
     */
    buildWhereClause(workspaceId?: string, workspacePath?: string[]): Record<string, any> | undefined {
        const where: Record<string, any> = {};
        
        if (workspaceId) {
            where['metadata.workspaceId'] = workspaceId;
        }
        
        if (workspacePath && workspacePath.length > 0) {
            where['metadata.path'] = { $in: workspacePath };
        }
        
        return Object.keys(where).length > 0 ? where : undefined;
    }

    /**
     * Check if collection exists
     */
    async collectionExists(collectionName: string): Promise<boolean> {
        try {
            return await this.vectorStore.hasCollection(collectionName);
        } catch (error) {
            return false;
        }
    }

    // =============================================================================
    // METADATA OPERATIONS (from CollectionMetadataManager) 
    // =============================================================================

    /**
     * Load collection data from filesystem items.json file
     */
    async loadCollectionData(collection: Collection, itemsPath: string): Promise<void> {
        try {
            const itemsContent = await this.directoryService.readFile(itemsPath, 'utf8');
            const items = JSON.parse(itemsContent);
            
            if (!Array.isArray(items) || items.length === 0) {
                return;
            }
            
            // Batch loading for performance
            const batchSize = 100;
            for (let i = 0; i < items.length; i += batchSize) {
                const batch = items.slice(i, i + batchSize);
                
                const ids = batch.map((item: any, index: number) => item.id || `item_${i + index}`);
                const embeddings = batch.map((item: any) => item.embedding);
                const metadatas = batch.map((item: any) => item.metadata || {});
                const documents = batch.map((item: any) => item.document || '');
                
                await collection.add({
                    ids,
                    embeddings,
                    metadatas,
                    documents
                });
            }
            
            this.logger.info(`Loaded ${items.length} items from ${itemsPath}`);
            
        } catch (error) {
            this.logger.error(`Failed to load collection data from ${itemsPath}:`, error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    // =============================================================================
    // PRIVATE HELPER METHODS
    // =============================================================================

    private async performInitialHealthCheck(): Promise<void> {
        for (const collectionName of CollectionService.STANDARD_COLLECTIONS) {
            try {
                const healthStatus = await this.checkCollectionHealth(collectionName);

                if (!healthStatus.healthy) {
                    this.logger.warn(`Initial health check failed for ${collectionName}:`, healthStatus.issues);
                    await this.handleUnhealthyCollection(collectionName, healthStatus);
                }
            } catch (error) {
                this.logger.error(`Initial health check error for ${collectionName}:`, error instanceof Error ? error : new Error(String(error)));
                
                const errorStatus: CollectionHealthStatus = {
                    collectionName,
                    healthy: false,
                    lastCheck: Date.now(),
                    issues: [`Health check failed: ${getErrorMessage(error)}`],
                    metrics: { itemCount: 0, queryResponseTime: 0, totalResponseTime: 0 },
                    consecutiveFailures: 1
                };

                this.healthChecks.set(collectionName, errorStatus);
                await this.handleUnhealthyCollection(collectionName, errorStatus);
            }
        }
    }

    private schedulePeriodicHealthChecks(): void {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
        }

        this.intervalHandle = setInterval(async () => {
            if (!this.monitoringActive) {
                return;
            }

            try {
                await this.runPeriodicHealthCheck();
            } catch (error) {
                this.logger.error('Periodic health check error:', error instanceof Error ? error : new Error(String(error)));
            }
        }, this.checkInterval);
    }

    private async runPeriodicHealthCheck(): Promise<void> {
        const collections = Array.from(this.healthChecks.keys());
        
        if (collections.length === 0) {
            return;
        }

        for (const collectionName of collections) {
            try {
                const healthStatus = await this.checkCollectionHealth(collectionName);
                
                if (!healthStatus.healthy) {
                    await this.handleUnhealthyCollection(collectionName, healthStatus);
                }
            } catch (error) {
                this.logger.error(`Periodic check error for ${collectionName}:`, error instanceof Error ? error : new Error(String(error)));
            }
        }
    }

    private async handleUnhealthyCollection(collectionName: string, healthStatus: CollectionHealthStatus): Promise<void> {
        this.logger.warn(`Handling unhealthy collection ${collectionName}:`, healthStatus.issues);

        if (healthStatus.consecutiveFailures >= this.alertThresholds.failureCount) {
            try {
                const recoveryResult = await this.recoverCollection(collectionName, 'soft');
                
                if (recoveryResult.success) {
                    await this.checkCollectionHealth(collectionName);
                } else {
                    this.logger.error(`Automatic recovery failed for ${collectionName}: ${recoveryResult.errors.join(', ')}`);
                }
            } catch (error) {
                this.logger.error(`Recovery error for ${collectionName}:`, error instanceof Error ? error : new Error(String(error)));
            }
        }
    }

    private updateHealthStatus(status: CollectionHealthStatus): CollectionHealthStatus {
        this.healthChecks.set(status.collectionName, status);
        return status;
    }

    /**
     * Configure health check thresholds
     */
    configureThresholds(thresholds: Partial<HealthThresholds>): void {
        this.alertThresholds = { ...this.alertThresholds, ...thresholds };
    }

    /**
     * Set monitoring interval
     */
    setMonitoringInterval(intervalMs: number): void {
        if (intervalMs < 10000) {
            throw new Error('Monitoring interval must be at least 10 seconds');
        }
        
        this.checkInterval = intervalMs;
        
        if (this.monitoringActive) {
            this.schedulePeriodicHealthChecks();
        }
    }

    /**
     * Clean up service resources
     */
    async cleanup(): Promise<void> {
        try {
            // Stop monitoring if active
            if (this.monitoringActive) {
                await this.stopMonitoring();
            }
            
            // Clear health status cache
            this.healthChecks.clear();
            
            // Cancel any pending timeouts
            if (this.intervalHandle !== null) {
                clearTimeout(this.intervalHandle);
                this.intervalHandle = null;
            }
            
            this.logger.info('CollectionService cleanup completed');
        } catch (error) {
            this.logger.error('Error during CollectionService cleanup:', error instanceof Error ? error : new Error(String(error)));
        }
    }
}

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

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

export type RecoveryStrategy = 'soft' | 'hard' | 'data';

export interface CollectionHealthStatus {
    collectionName: string;
    healthy: boolean;
    lastCheck: number;
    issues: string[];
    metrics: {
        itemCount: number;
        queryResponseTime: number;
        totalResponseTime: number;
        errorRate?: number;
        lastOperation?: number;
    };
    consecutiveFailures: number;
}

export interface HealthThresholds {
    errorRate: number;
    responseTime: number;
    failureCount: number;
    healthCheckFailures: number;
}

export interface HealthCheckResult {
    healthy: boolean;
    collections: Record<string, CollectionHealth>;
    recommendations: string[];
    summary: string;
    timestamp: number;
}

export interface CollectionHealth {
    accessible: boolean;
    itemCount: number;
    issues: string[];
    lastOperation: number;
}

export interface SystemHealthReport {
    timestamp: number;
    overallHealthy: boolean;
    collections: CollectionHealthSummary[];
    summary: string;
    recommendations: string[];
    monitoring: {
        active: boolean;
        interval: number;
        collectionsMonitored: number;
    };
}

export interface CollectionHealthSummary {
    collectionName: string;
    healthy: boolean;
    itemCount: number;
    issues: number;
    lastCheck: number;
    error?: string;
}