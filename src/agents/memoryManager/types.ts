import { JSONSchema7 } from 'json-schema';
import { MemoryQueryParams, MemoryQueryResult } from '../../types';

/**
 * Parameters for searching memory
 */
export interface SearchMemoryParams {
    query: string;
    limit?: number;
    threshold?: number;
    filters?: {
        tags?: string[];
        paths?: string[];
        properties?: Record<string, any>;
        dateRange?: {
            start?: string;
            end?: string;
        }
    };
    graphOptions?: {
        useGraphBoost: boolean;
        boostFactor: number;
        includeNeighbors: boolean;
        maxDistance: number;
        seedNotes?: string[];
    };
}

/**
 * Parameters for indexing a file
 */
export interface IndexFileParams {
    filePath: string;
    force?: boolean;
}

/**
 * Result of indexing a file
 */
export interface IndexFileResult {
    success: boolean;
    chunks?: number;
    filePath: string;
    error?: string;
}

/**
 * Parameters for batch indexing multiple files
 */
export interface BatchIndexParams {
    filePaths: string[];
    force?: boolean;
}

/**
 * Result of batch indexing multiple files
 */
export interface BatchIndexResult {
    success: boolean;
    totalProcessed: number;
    successCount: number;
    failedCount: number;
    error?: string;
    results: Array<{
        filePath: string;
        success: boolean;
        chunks?: number;
        error?: string;
    }>;
}

/**
 * Parameters for batch querying multiple queries
 */
export interface BatchQueryParams {
    queries: MemoryQueryParams[];
}

/**
 * Result of batch querying
 */
export interface BatchQueryResult {
    success: boolean;
    totalProcessed: number;
    successCount: number;
    failedCount: number;
    error?: string;
    results: Array<{
        query: string;
        success: boolean;
        matches?: any[];
        error?: string;
    }>;
}

/**
 * Parameters for getting status
 */
export interface StatusParams {
    // No parameters needed
}

/**
 * Result of getting status
 */
export interface StatusResult {
    enabled: boolean;
    provider: string;
    model: string;
    dimensions: number;
    totalEmbeddings: number;
    tokenUsage: {
        tokensThisMonth: number;
        maxTokensPerMonth: number;
        percentUsed: number;
    };
    dbSizeMB: number;
    lastIndexed: string;
    indexingInProgress: boolean;
}

/**
 * Type for mode parameter schemas
 */
export type MemoryManagerParameterSchema = 
    | { mode: 'queryMemory', schema: JSONSchema7 }
    | { mode: 'indexFile', schema: JSONSchema7 }
    | { mode: 'batchIndex', schema: JSONSchema7 }
    | { mode: 'batchQuery', schema: JSONSchema7 }
    | { mode: 'getStatus', schema: JSONSchema7 };

/**
 * Type for mode result schemas
 */
export type MemoryManagerResultSchema = 
    | { mode: 'queryMemory', schema: JSONSchema7 }
    | { mode: 'indexFile', schema: JSONSchema7 }
    | { mode: 'batchIndex', schema: JSONSchema7 }
    | { mode: 'batchQuery', schema: JSONSchema7 }
    | { mode: 'getStatus', schema: JSONSchema7 };