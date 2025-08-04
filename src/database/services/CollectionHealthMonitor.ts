import { IVectorStore } from '../interfaces/IVectorStore';
import { CollectionLifecycleManager, HealthCheckResult, CollectionHealth, RecoveryResult } from './CollectionLifecycleManager';

/**
 * Collection Health Monitor
 * 
 * Provides continuous monitoring of collection health with automatic recovery
 * capabilities. This service runs periodic health checks and can automatically
 * attempt recovery when issues are detected.
 * 
 * Key Features:
 * - Continuous background health monitoring
 * - Automatic recovery for failed collections  
 * - Configurable health check intervals and thresholds
 * - Comprehensive diagnostic reporting
 * - Alert system for critical collection issues
 */
export class CollectionHealthMonitor {
    private healthChecks = new Map<string, CollectionHealthStatus>();
    private monitoringActive = false;
    private checkInterval = 60000; // 1 minute default
    private intervalHandle: NodeJS.Timeout | null = null;
    private alertThresholds: HealthThresholds;

    constructor(
        private vectorStore: IVectorStore,
        private collectionLifecycleManager: CollectionLifecycleManager
    ) {
        this.alertThresholds = {
            errorRate: 0.05,           // 5% error rate triggers alert
            responseTime: 1000,        // 1 second response time threshold
            failureCount: 3,           // 3 consecutive failures trigger recovery
            healthCheckFailures: 2     // 2 health check failures trigger alert
        };
    }

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
            console.error('[CollectionHealthMonitor] ❌ Failed to start monitoring:', error);
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

            // 2. Basic operation tests
            const itemCount = await this.vectorStore.count(collectionName);
            status.metrics.itemCount = itemCount;

            // 3. Query performance test (skip for collections with content, as they may not have text embedding service)
            const queryStartTime = Date.now();
            if (itemCount === 0) {
                // Only test query on empty collections with proper validation
                try {
                    const queryResult = await this.vectorStore.query(collectionName, {
                        queryTexts: ['health check'],
                        nResults: 1
                    });
                    
                    // CRITICAL FIX: Validate query result structure to prevent array method errors
                    if (queryResult && typeof queryResult === 'object') {
                        if (queryResult.ids && !Array.isArray(queryResult.ids)) {
                            status.issues.push('Query result ids field is not an array');
                        }
                        if (queryResult.distances && !Array.isArray(queryResult.distances)) {
                            status.issues.push('Query result distances field is not an array');
                        }
                    }
                } catch (queryError) {
                    status.issues.push(`Query test failed: ${queryError instanceof Error ? queryError.message : String(queryError)}`);
                }
            } else {
                // For collections with content, test a simple getAllItems operation instead
                try {
                    const itemsResult = await this.vectorStore.getAllItems(collectionName, { limit: 1 });
                    
                    // CRITICAL FIX: Validate getAllItems result structure to prevent array method errors
                    if (itemsResult && typeof itemsResult === 'object') {
                        if (itemsResult.ids && !Array.isArray(itemsResult.ids)) {
                            status.issues.push('getAllItems result ids field is not an array');
                        }
                        if (itemsResult.metadatas && !Array.isArray(itemsResult.metadatas)) {
                            status.issues.push('getAllItems result metadatas field is not an array');
                        }
                        if (itemsResult.documents && !Array.isArray(itemsResult.documents)) {
                            status.issues.push('getAllItems result documents field is not an array');
                        }
                    }
                } catch (itemsError) {
                    status.issues.push(`getAllItems test failed: ${itemsError instanceof Error ? itemsError.message : String(itemsError)}`);
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
            status.issues.push(`Health check failed: ${error instanceof Error ? error.message : String(error)}`);
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
     * Get system-wide health report
     */
    async getSystemHealth(): Promise<SystemHealthReport> {
        const healthCheckResult = await this.collectionLifecycleManager.performHealthCheck();
        
        return {
            timestamp: Date.now(),
            overallHealthy: healthCheckResult.healthy,
            collections: Object.entries(healthCheckResult.collections).map(([name, health]) => ({
                collectionName: name,
                healthy: health.accessible,
                itemCount: health.itemCount,
                issues: health.issues.length,
                lastCheck: health.lastOperation || Date.now()
            })),
            summary: this.generateSystemSummary(healthCheckResult),
            recommendations: healthCheckResult.recommendations,
            monitoring: {
                active: this.monitoringActive,
                interval: this.checkInterval,
                collectionsMonitored: this.healthChecks.size
            }
        };
    }

    /**
     * Configure health check thresholds
     */
    configureThresholds(thresholds: Partial<HealthThresholds>): void {
        this.alertThresholds = { ...this.alertThresholds, ...thresholds };
    }

    /**
     * Configure monitoring interval
     */
    setMonitoringInterval(intervalMs: number): void {
        if (intervalMs < 10000) {
            throw new Error('Monitoring interval must be at least 10 seconds');
        }
        
        this.checkInterval = intervalMs;
        
        // Restart monitoring with new interval if active
        if (this.monitoringActive) {
            this.schedulePeriodicHealthChecks();
        }
        
    }

    /**
     * Perform initial health check for all standard collections
     */
    private async performInitialHealthCheck(): Promise<void> {
        const standardCollections = ['file_embeddings', 'memory_traces', 'sessions', 'snapshots', 'workspaces'];
        
        
        for (const collectionName of standardCollections) {
            try {
                const healthStatus = await this.checkCollectionHealth(collectionName);

                if (!healthStatus.healthy) {
                    console.warn(`[CollectionHealthMonitor] ⚠️  Initial health check failed for ${collectionName}:`, healthStatus.issues);
                    await this.handleUnhealthyCollection(collectionName, healthStatus);
                }

            } catch (error) {
                console.error(`[CollectionHealthMonitor] ❌ Initial health check error for ${collectionName}:`, error);
                
                const errorStatus: CollectionHealthStatus = {
                    collectionName,
                    healthy: false,
                    lastCheck: Date.now(),
                    issues: [`Health check failed: ${error instanceof Error ? error.message : String(error)}`],
                    metrics: { itemCount: 0, queryResponseTime: 0, totalResponseTime: 0 },
                    consecutiveFailures: 1
                };

                this.healthChecks.set(collectionName, errorStatus);
                await this.handleUnhealthyCollection(collectionName, errorStatus);
            }
        }
        
    }

    /**
     * Schedule periodic health checks
     */
    private schedulePeriodicHealthChecks(): void {
        // Clear existing interval
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
        }

        // Schedule new interval
        this.intervalHandle = setInterval(async () => {
            if (!this.monitoringActive) {
                return;
            }

            try {
                await this.runPeriodicHealthCheck();
            } catch (error) {
                console.error('[CollectionHealthMonitor] Periodic health check error:', error);
            }
        }, this.checkInterval);
    }

    /**
     * Run periodic health check on all monitored collections
     */
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
                console.error(`[CollectionHealthMonitor] Periodic check error for ${collectionName}:`, error);
            }
        }
    }

    /**
     * Handle unhealthy collection with automatic recovery
     */
    private async handleUnhealthyCollection(collectionName: string, healthStatus: CollectionHealthStatus): Promise<void> {
        console.warn(`[CollectionHealthMonitor] Handling unhealthy collection ${collectionName}:`, healthStatus.issues);

        // Check if automatic recovery should be triggered
        if (healthStatus.consecutiveFailures >= this.alertThresholds.failureCount) {
            
            try {
                const recoveryResult = await this.collectionLifecycleManager.recoverCollection(collectionName, 'soft');
                
                if (recoveryResult.success) {
                    // Reset failure count and re-check health
                    await this.checkCollectionHealth(collectionName);
                } else {
                    console.error(`[CollectionHealthMonitor] ❌ Automatic recovery failed for ${collectionName}:`, recoveryResult.errors);
                }

            } catch (error) {
                console.error(`[CollectionHealthMonitor] ❌ Recovery error for ${collectionName}:`, error);
            }
        }
    }

    /**
     * Update health status and return it
     */
    private updateHealthStatus(status: CollectionHealthStatus): CollectionHealthStatus {
        this.healthChecks.set(status.collectionName, status);
        return status;
    }

    /**
     * Generate system summary from health check result
     */
    private generateSystemSummary(healthCheckResult: HealthCheckResult): string {
        const totalCollections = Object.keys(healthCheckResult.collections).length;
        const healthyCollections = Object.values(healthCheckResult.collections).filter(c => c.accessible).length;
        const unhealthyCollections = totalCollections - healthyCollections;

        if (healthCheckResult.healthy) {
            return `All ${totalCollections} collections are healthy and accessible`;
        } else {
            return `${unhealthyCollections} of ${totalCollections} collections have issues requiring attention`;
        }
    }
}

// Type definitions

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

export interface ICollectionHealthMonitor {
    startMonitoring(): Promise<void>;
    stopMonitoring(): Promise<void>;
    checkCollectionHealth(collectionName: string): Promise<CollectionHealthStatus>;
    getHealthStatus(collectionName?: string): CollectionHealthStatus[];
    getSystemHealth(): Promise<SystemHealthReport>;
    configureThresholds(thresholds: Partial<HealthThresholds>): void;
    setMonitoringInterval(intervalMs: number): void;
}