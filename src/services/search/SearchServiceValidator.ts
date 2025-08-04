/**
 * SearchServiceValidator
 * 
 * This service validates search dependencies before operations begin, ensuring
 * that required collections exist and are healthy. Implements proactive validation
 * with automatic recovery mechanisms to prevent search operation failures.
 * 
 * Location: /mnt/c/Users/jrose/Documents/Plugin Tester/.obsidian/plugins/claudesidian-mcp/src/services/search/SearchServiceValidator.ts
 * 
 * Usage: Used by HybridSearchService and other search services to validate
 * collection dependencies before executing search operations. Integrates with
 * CollectionLifecycleManager for collection management operations.
 */

import { IVectorStore } from '../../database/interfaces/IVectorStore';
import { CollectionLifecycleManager } from '../../database/services/CollectionLifecycleManager';

export type SearchType = 'hybrid' | 'semantic' | 'fuzzy' | 'memory' | 'session' | 'workspace';

export interface ValidationResult {
    valid: boolean;
    missingCollections: string[];
    corruptedCollections: string[];
    readyCollections: string[];
    fallbackAvailable?: boolean;
    recommendations?: string[];
}

export interface CollectionHealth {
    healthy: boolean;
    exists: boolean;
    accessible: boolean;
    itemCount: number;
    lastChecked: number;
    issues: string[];
}

export class SearchDependencyError extends Error {
    constructor(
        message: string,
        public missingCollections: string[] = [],
        public corruptedCollections: string[] = [],
        public fallbackOptions: string[] = []
    ) {
        super(message);
        this.name = 'SearchDependencyError';
    }
}

export class SearchServiceValidator {
    private static readonly COLLECTION_DEPENDENCIES: Record<SearchType, {
        requiredCollections: string[];
        fallbackServices: string[];
        minimumRequirements: string[];
    }> = {
        'hybrid': {
            requiredCollections: ['file_embeddings'],
            fallbackServices: ['fuzzy'],
            minimumRequirements: ['file_embeddings']
        },
        'semantic': {
            requiredCollections: ['file_embeddings'],
            fallbackServices: ['fuzzy'],
            minimumRequirements: ['file_embeddings']
        },
        'memory': {
            requiredCollections: ['memory_traces'],
            fallbackServices: ['hybrid', 'fuzzy'],
            minimumRequirements: ['memory_traces']
        },
        'session': {
            requiredCollections: ['sessions', 'memory_traces'],
            fallbackServices: ['memory', 'hybrid'],
            minimumRequirements: ['sessions']
        },
        'workspace': {
            requiredCollections: ['workspaces', 'file_embeddings'],
            fallbackServices: ['hybrid', 'fuzzy'],
            minimumRequirements: ['workspaces']
        },
        'fuzzy': {
            requiredCollections: [], // Fuzzy search doesn't require vector collections
            fallbackServices: [],
            minimumRequirements: []
        }
    };

    private healthCache = new Map<string, { health: CollectionHealth; expiry: number }>();
    private readonly HEALTH_CACHE_TTL = 30000; // 30 seconds

    constructor(
        private vectorStore: IVectorStore,
        private collectionLifecycleManager: CollectionLifecycleManager
    ) {}

    /**
     * Validate search dependencies for a specific search type
     */
    async validateSearchDependencies(searchType: SearchType): Promise<ValidationResult> {
        const dependencies = SearchServiceValidator.COLLECTION_DEPENDENCIES[searchType];
        const results: ValidationResult = {
            valid: true,
            missingCollections: [],
            corruptedCollections: [],
            readyCollections: [],
            fallbackAvailable: dependencies.fallbackServices.length > 0,
            recommendations: []
        };


        // If no collections required (e.g., fuzzy search), mark as valid
        if (dependencies.requiredCollections.length === 0) {
            return results;
        }

        // Check each required collection
        for (const collectionName of dependencies.requiredCollections) {
            try {
                const health = await this.checkCollectionHealth(collectionName);
                
                if (!health.exists) {
                    results.missingCollections.push(collectionName);
                    results.valid = false;
                    console.warn(`[SearchServiceValidator] Collection missing: ${collectionName}`);
                } else if (!health.healthy) {
                    results.corruptedCollections.push(collectionName);
                    results.valid = false;
                    console.warn(`[SearchServiceValidator] Collection unhealthy: ${collectionName}, issues: ${health.issues.join(', ')}`);
                } else {
                    results.readyCollections.push(collectionName);
                }
            } catch (error) {
                console.error(`[SearchServiceValidator] Error checking collection ${collectionName}:`, error);
                results.missingCollections.push(collectionName);
                results.valid = false;
            }
        }

        // Add recommendations based on results
        if (!results.valid) {
            if (results.missingCollections.length > 0) {
                results.recommendations?.push(`Create missing collections: ${results.missingCollections.join(', ')}`);
            }
            if (results.corruptedCollections.length > 0) {
                results.recommendations?.push(`Recover corrupted collections: ${results.corruptedCollections.join(', ')}`);
            }
            if (results.fallbackAvailable) {
                results.recommendations?.push(`Consider fallback search methods: ${dependencies.fallbackServices.join(', ')}`);
            }
        }


        return results;
    }

    /**
     * Ensure all required collections are ready for the search type
     * Attempts to create missing collections and recover corrupted ones
     */
    async ensureCollectionsReady(searchType: SearchType): Promise<void> {
        const validation = await this.validateSearchDependencies(searchType);
        
        if (validation.valid) {
            return;
        }

        console.log(`[SearchServiceValidator] Attempting to resolve collection issues for ${searchType} search`);

        // Attempt to create missing collections
        for (const collectionName of validation.missingCollections) {
            try {
                console.log(`[SearchServiceValidator] Creating missing collection: ${collectionName}`);
                await this.collectionLifecycleManager.ensureStandardCollections();
                console.log(`[SearchServiceValidator] Successfully created collection: ${collectionName}`);
            } catch (error) {
                console.error(`[SearchServiceValidator] Failed to create collection ${collectionName}:`, error);
            }
        }

        // Attempt to recover corrupted collections
        for (const collectionName of validation.corruptedCollections) {
            try {
                console.log(`[SearchServiceValidator] Attempting to recover collection: ${collectionName}`);
                await this.collectionLifecycleManager.recoverCollection(collectionName, 'soft');
                console.log(`[SearchServiceValidator] Successfully recovered collection: ${collectionName}`);
            } catch (error) {
                console.error(`[SearchServiceValidator] Failed to recover collection ${collectionName}:`, error);
            }
        }

        // Re-validate after recovery attempts
        const revalidation = await this.validateSearchDependencies(searchType);
        if (!revalidation.valid) {
            const dependencies = SearchServiceValidator.COLLECTION_DEPENDENCIES[searchType];
            throw new SearchDependencyError(
                `Search dependencies not available for ${searchType}: missing ${revalidation.missingCollections.join(', ')}, corrupted ${revalidation.corruptedCollections.join(', ')}`,
                revalidation.missingCollections,
                revalidation.corruptedCollections,
                dependencies.fallbackServices
            );
        }

        console.log(`[SearchServiceValidator] Successfully resolved all collection issues for ${searchType} search`);
    }

    /**
     * Get required collections for a search type
     */
    getRequiredCollections(searchType: SearchType): string[] {
        return SearchServiceValidator.COLLECTION_DEPENDENCIES[searchType]?.requiredCollections || [];
    }

    /**
     * Get fallback search services for a search type
     */
    getFallbackServices(searchType: SearchType): string[] {
        return SearchServiceValidator.COLLECTION_DEPENDENCIES[searchType]?.fallbackServices || [];
    }

    /**
     * Check the health of a specific collection with caching
     */
    async checkCollectionHealth(collectionName: string): Promise<CollectionHealth> {
        // Check cache first
        const cached = this.healthCache.get(collectionName);
        if (cached && Date.now() < cached.expiry) {
            return cached.health;
        }

        const health: CollectionHealth = {
            healthy: false,
            exists: false,
            accessible: false,
            itemCount: 0,
            lastChecked: Date.now(),
            issues: []
        };

        try {
            // Check if collection exists
            health.exists = await this.vectorStore.hasCollection(collectionName);
            
            if (!health.exists) {
                health.issues.push('Collection does not exist');
            } else {
                // Test collection accessibility and get count
                try {
                    health.itemCount = await this.vectorStore.count(collectionName);
                    health.accessible = true;

                    // Test basic query capability
                    await this.vectorStore.query(collectionName, {
                        queryTexts: ['test'],
                        nResults: 1
                    });

                    health.healthy = true;
                } catch (error) {
                    health.issues.push(`Collection access error: ${error instanceof Error ? error.message : String(error)}`);
                    health.accessible = false;
                }
            }
        } catch (error) {
            health.issues.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Cache the result
        this.healthCache.set(collectionName, {
            health,
            expiry: Date.now() + this.HEALTH_CACHE_TTL
        });

        return health;
    }

    /**
     * Clear health cache for a specific collection or all collections
     */
    clearHealthCache(collectionName?: string): void {
        if (collectionName) {
            this.healthCache.delete(collectionName);
        } else {
            this.healthCache.clear();
        }
    }

    /**
     * Get comprehensive health status for all collections used in search
     */
    async getSearchHealthStatus(): Promise<Record<string, CollectionHealth>> {
        const allCollections = new Set<string>();
        
        // Collect all unique collections from all search types
        Object.values(SearchServiceValidator.COLLECTION_DEPENDENCIES).forEach(deps => {
            deps.requiredCollections.forEach(col => allCollections.add(col));
        });

        const healthStatus: Record<string, CollectionHealth> = {};

        for (const collectionName of allCollections) {
            try {
                healthStatus[collectionName] = await this.checkCollectionHealth(collectionName);
            } catch (error) {
                healthStatus[collectionName] = {
                    healthy: false,
                    exists: false,
                    accessible: false,
                    itemCount: 0,
                    lastChecked: Date.now(),
                    issues: [`Health check failed: ${error instanceof Error ? error.message : String(error)}`]
                };
            }
        }

        return healthStatus;
    }

    /**
     * Handle search failure by attempting recovery and providing fallback options
     */
    async handleSearchFailure(searchType: SearchType, error: Error): Promise<{
        canRecover: boolean;
        fallbackOptions: string[];
        recommendations: string[];
        recoveryAttempted: boolean;
    }> {
        console.warn(`[SearchServiceValidator] Handling search failure for ${searchType}:`, error.message);

        const dependencies = SearchServiceValidator.COLLECTION_DEPENDENCIES[searchType];
        const result = {
            canRecover: false,
            fallbackOptions: dependencies.fallbackServices,
            recommendations: [] as string[],
            recoveryAttempted: false
        };

        // Clear health cache to get fresh status
        this.clearHealthCache();

        try {
            // Attempt to recover collections
            await this.ensureCollectionsReady(searchType);
            result.canRecover = true;
            result.recoveryAttempted = true;
            result.recommendations.push(`Collections recovered for ${searchType} search - retry operation`);
        } catch (recoveryError) {
            console.error(`[SearchServiceValidator] Recovery failed for ${searchType}:`, recoveryError);
            result.recoveryAttempted = true;
            
            if (result.fallbackOptions.length > 0) {
                result.recommendations.push(`Use fallback search methods: ${result.fallbackOptions.join(', ')}`);
            } else {
                result.recommendations.push('No fallback options available - manual intervention required');
            }
        }

        return result;
    }
}