/**
 * HnswIndexHealthChecker - Fast metadata-only health checks for HNSW indexes without WASM loading
 * 
 * This service provides rapid health validation of HNSW indexes by comparing metadata between
 * ChromaDB collections and IndexedDB persistence layers. Used during startup to determine
 * if indexes need building/updating without the overhead of loading WASM libraries or processing vectors.
 * 
 * Key responsibilities:
 * - Validate ChromaDB collection metadata against IndexedDB index metadata
 * - Check for index staleness, corruption, or missing indexes
 * - Generate structured health reports for startup coordination
 * - Provide recommendations for index maintenance
 * 
 * Dependencies:
 * - HnswMetadataManager: IndexedDB metadata access
 * - MetadataManager: ChromaDB collection metadata  
 * - IndexedDbUtils: Storage validation utilities
 * - No WASM dependencies for fast startup performance
 */

import { HnswMetadataManager } from '../persistence/HnswMetadataManager';
import { MetadataManager } from '../../../providers/chroma/collection/metadata/MetadataManager';
import { IndexedDbUtils } from '../persistence/IndexedDbUtils';

// Local interfaces for HNSW-specific types
export interface IndexMetadata {
    collectionName: string;
    itemCount: number;
    dimension: number;
    lastModified: number;
    contentHash: string;
    isPartitioned: boolean;
    version: string;
    indexFilename: string;
    estimatedSize: number;
}

export interface StorageInfo {
    quota: number;
    usage: number;
    available: number;
    supported: boolean;
}

export interface IndexHealthStatus {
    collectionName: string;
    isHealthy: boolean;
    needsBuilding: boolean;
    needsUpdate: boolean;
    status: 'healthy' | 'stale' | 'missing' | 'corrupted' | 'error';
    reason?: string;
    chromaItemCount?: number;
    indexItemCount?: number;
    chromaHash?: string;
    indexHash?: string;
    lastChecked: number;
    errors: HealthCheckError[];
    recommendations: string[];
}

export interface HealthCheckError {
    code: string;
    message: string;
    collectionName?: string;
    path?: string[];
    hint?: string;
}

export interface IndexHealthSummary {
    allHealthy: boolean;
    healthyCollections: string[];
    needsBuildingCollections: string[];
    needsUpdateCollections: string[];
    corruptedCollections: string[];
    totalCollections: number;
    totalCheckTime: number;
    storageInfo?: StorageInfo;
    globalRecommendations: string[];
    errors: HealthCheckError[];
}

export interface HealthCheckOptions {
    includeStorageInfo?: boolean;
    checkContentHash?: boolean;
    validateItemCounts?: boolean;
    tolerance?: number; // Item count tolerance percentage (default: 5%)
}

/**
 * Fast HNSW index health checker for startup optimization
 * Performs metadata-only validation without WASM loading
 */
export class HnswIndexHealthChecker {
    private metadataManager: HnswMetadataManager;
    private chromaMetadataManager: MetadataManager;
    
    constructor(
        metadataManager: HnswMetadataManager,
        chromaMetadataManager: MetadataManager
    ) {
        this.metadataManager = metadataManager;
        this.chromaMetadataManager = chromaMetadataManager;
    }

    /**
     * Check health status of a specific collection's HNSW index
     * Fast operation using only metadata comparison
     */
    async checkCollectionHealth(
        collectionName: string, 
        options: HealthCheckOptions = {}
    ): Promise<IndexHealthStatus> {
        const startTime = Date.now();
        const result: IndexHealthStatus = {
            collectionName,
            isHealthy: false,
            needsBuilding: false,
            needsUpdate: false,
            status: 'error',
            lastChecked: startTime,
            errors: [],
            recommendations: []
        };

        try {
            // Step 1: Check if IndexedDB metadata exists
            const indexMetadata = await this.metadataManager.loadMetadata(collectionName);
            if (!indexMetadata) {
                result.status = 'missing';
                result.needsBuilding = true;
                result.reason = 'No IndexedDB metadata found - index needs building';
                result.recommendations.push(`Build HNSW index for collection '${collectionName}'`);
                return result;
            }

            // Step 2: Get ChromaDB collection metadata  
            const chromaResult = await this.chromaMetadataManager.getMetadata();
            if (!chromaResult.success || !chromaResult.metadata) {
                result.status = 'error';
                result.reason = `ChromaDB metadata unavailable: ${chromaResult.error}`;
                result.errors.push({
                    code: 'metadata_error',
                    message: `Failed to retrieve ChromaDB metadata: ${chromaResult.error}`,
                    collectionName
                });
                return result;
            }

            const chromaMetadata = chromaResult.metadata;
            
            // Step 3: Extract item counts for comparison
            result.chromaItemCount = chromaMetadata.itemCount || 0;
            result.indexItemCount = indexMetadata.itemCount || 0;

            // Step 4: Validate item counts (with tolerance)
            if (options.validateItemCounts !== false) {
                const tolerance = options.tolerance || 0.05; // 5% default tolerance
                const chromaCount = result.chromaItemCount || 0;
                const indexCount = result.indexItemCount || 0;
                const countDifference = Math.abs(chromaCount - indexCount);
                const maxTolerance = Math.max(1, chromaCount * tolerance);
                
                if (countDifference > maxTolerance) {
                    result.status = 'stale';
                    result.needsUpdate = true;
                    result.reason = `Item count mismatch: ChromaDB(${chromaCount}) vs Index(${indexCount})`;
                    result.recommendations.push(`Update index for '${collectionName}' - item count changed significantly`);
                    return result;
                }
            }

            // Step 5: Check content hash if available and requested
            if (options.checkContentHash !== false) {
                const chromaHash = chromaMetadata.contentHash;
                const indexHash = indexMetadata.contentHash;
                
                if (chromaHash && indexHash) {
                    result.chromaHash = chromaHash;
                    result.indexHash = indexHash;
                    
                    if (chromaHash !== indexHash) {
                        result.status = 'stale';
                        result.needsUpdate = true;
                        result.reason = 'Content hash mismatch - collection content has changed';
                        result.recommendations.push(`Rebuild index for '${collectionName}' - content has changed`);
                        return result;
                    }
                }
            }

            // Step 6: Validate filename (skip file existence check for now)
            if (!IndexedDbUtils.validateFilename(indexMetadata.indexFilename)) {
                result.status = 'corrupted';
                result.needsBuilding = true;
                result.reason = 'Invalid index filename format';
                result.errors.push({
                    code: 'filename_error',
                    message: `Invalid index filename: '${indexMetadata.indexFilename}'`,
                    collectionName
                });
                result.recommendations.push(`Rebuild index with valid filename for '${collectionName}'`);
                return result;
            }

            // Step 7: Validate basic metadata consistency
            if (indexMetadata.dimension && chromaMetadata.dimension) {
                if (indexMetadata.dimension !== chromaMetadata.dimension) {
                    result.status = 'corrupted';
                    result.needsBuilding = true;
                    result.reason = `Dimension mismatch: ChromaDB(${chromaMetadata.dimension}) vs Index(${indexMetadata.dimension})`;
                    result.errors.push({
                        code: 'dimension_error',
                        message: result.reason,
                        collectionName
                    });
                    result.recommendations.push(`Rebuild index for '${collectionName}' - embedding dimensions changed`);
                    return result;
                }
            }

            // Step 8: All checks passed - mark as healthy
            result.isHealthy = true;
            result.status = 'healthy';
            result.reason = 'Index metadata consistent with collection state';
            result.recommendations.push(`Index for '${collectionName}' is ready for fast loading`);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.status = 'error';
            result.reason = `Health check failed: ${errorMessage}`;
            result.errors.push({
                code: 'check_error',
                message: `Unexpected error during health check: ${errorMessage}`,
                collectionName
            });
            result.recommendations.push(`Investigate health check error for '${collectionName}'`);
        }

        return result;
    }

    /**
     * Check health of all available HNSW indexes
     * Returns comprehensive summary for startup coordination
     */
    async checkAllIndexes(options: HealthCheckOptions = {}): Promise<IndexHealthSummary> {
        const startTime = Date.now();
        const summary: IndexHealthSummary = {
            allHealthy: true,
            healthyCollections: [],
            needsBuildingCollections: [],
            needsUpdateCollections: [],
            corruptedCollections: [],
            totalCollections: 0,
            totalCheckTime: 0,
            globalRecommendations: [],
            errors: []
        };

        try {
            // Get all collections that have metadata in IndexedDB
            const collections = await this.metadataManager.listCollectionsWithMetadata();
            summary.totalCollections = collections.length;

            // Check each collection in parallel for speed
            const healthChecks = await Promise.allSettled(
                collections.map((name: string) => this.checkCollectionHealth(name, options))
            );

            // Process results
            for (let i = 0; i < healthChecks.length; i++) {
                const check = healthChecks[i];
                const collectionName = collections[i];

                if (check.status === 'fulfilled') {
                    const result = check.value;
                    
                    // Categorize results
                    if (result.isHealthy) {
                        summary.healthyCollections.push(collectionName);
                    } else if (result.needsBuilding) {
                        summary.needsBuildingCollections.push(collectionName);
                        summary.allHealthy = false;
                    } else if (result.needsUpdate) {
                        summary.needsUpdateCollections.push(collectionName);
                        summary.allHealthy = false;
                    }

                    if (result.status === 'corrupted') {
                        summary.corruptedCollections.push(collectionName);
                    }

                    // Collect errors
                    summary.errors.push(...result.errors);
                } else {
                    // Handle rejected promises
                    summary.allHealthy = false;
                    const reason = check.reason || 'Unknown error';
                    summary.errors.push({
                        code: 'check_error',
                        message: `Failed to check collection '${collectionName}': ${reason}`,
                        collectionName
                    });
                }
            }

            // Generate global recommendations
            if (summary.needsBuildingCollections.length > 0) {
                summary.globalRecommendations.push(
                    `Schedule background building for ${summary.needsBuildingCollections.length} missing indexes`
                );
            }
            
            if (summary.needsUpdateCollections.length > 0) {
                summary.globalRecommendations.push(
                    `Schedule background updates for ${summary.needsUpdateCollections.length} stale indexes`
                );
            }

            if (summary.corruptedCollections.length > 0) {
                summary.globalRecommendations.push(
                    `Critical: Rebuild ${summary.corruptedCollections.length} corrupted indexes immediately`
                );
            }

            if (summary.allHealthy) {
                summary.globalRecommendations.push('All indexes healthy - ready for fast loading on search');
            }

            // Include storage info if requested
            if (options.includeStorageInfo) {
                const storageCheck = await IndexedDbUtils.checkIndexedDbSupport();
                summary.storageInfo = {
                    quota: storageCheck.quota || 0,
                    usage: storageCheck.usage || 0,
                    available: (storageCheck.quota || 0) - (storageCheck.usage || 0),
                    supported: storageCheck.supported
                };
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            summary.allHealthy = false;
            summary.errors.push({
                code: 'global_error',
                message: `Global health check failed: ${errorMessage}`,
                collectionName: '*'
            });
            summary.globalRecommendations.push('Fallback to full HNSW initialization due to health check failure');
        }

        summary.totalCheckTime = Date.now() - startTime;
        return summary;
    }

    /**
     * Quick boolean check if all indexes are healthy
     * Optimized for startup performance
     */
    async areAllIndexesHealthy(): Promise<boolean> {
        try {
            const summary = await this.checkAllIndexes({ 
                includeStorageInfo: false,
                checkContentHash: true,
                validateItemCounts: true 
            });
            return summary.allHealthy;
        } catch (error) {
            console.warn('[HnswIndexHealthChecker] Quick health check failed:', error);
            return false; // Assume unhealthy on error
        }
    }

    /**
     * Validate metadata consistency between ChromaDB and IndexedDB
     * Used for diagnostic purposes
     */
    async validateMetadataConsistency(): Promise<boolean> {
        try {
            const collections = await this.metadataManager.listCollectionsWithMetadata();
            
            for (const collectionName of collections) {
                const result = await this.checkCollectionHealth(collectionName, {
                    checkContentHash: true,
                    validateItemCounts: true,
                    tolerance: 0.01 // Strict 1% tolerance for consistency check
                });
                
                if (!result.isHealthy) {
                    return false;
                }
            }
            
            return true;
        } catch (error) {
            console.warn('[HnswIndexHealthChecker] Metadata consistency check failed:', error);
            return false;
        }
    }
}