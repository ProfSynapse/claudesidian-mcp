/**
 * SearchMetadata.ts - Type definitions for search performance and metadata interfaces
 * Location: src/types/search/SearchMetadata.ts
 * Purpose: Provides interfaces for performance tracking, caching, and search metadata
 * Used by: SearchMetrics, HybridSearchCache, and performance monitoring systems
 */

export interface PerformanceMetrics {
  /** Hybrid search operations */
  hybridSearches: OperationMetric[];
  
  /** Semantic search operations */
  semanticSearches: OperationMetric[];
  
  /** Cache hit count */
  cacheHits: number;
  
  /** Cache miss count */
  cacheMisses: number;
  
  /** Error metrics */
  errors: ErrorMetric[];
}

export interface OperationMetric {
  /** Operation timestamp */
  timestamp: number;
  
  /** Operation duration in milliseconds */
  duration: number;
  
  /** Number of results returned */
  resultCount: number;
  
  /** Search methods used */
  methods?: string[];
  
  /** Operation was successful */
  success?: boolean;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

export interface ErrorMetric {
  /** Error timestamp */
  timestamp: number;
  
  /** Error type */
  type: string;
  
  /** Error message */
  message: string;
  
  /** Operation that failed */
  operation?: string;
  
  /** Error stack trace */
  stack?: string;
}

export interface PerformanceReport {
  /** Report time range */
  timeRange: TimeRange;
  
  /** Total number of searches performed */
  totalSearches: number;
  
  /** Average search duration */
  averageSearchTime: number;
  
  /** Median search duration */
  medianSearchTime: number;
  
  /** 95th percentile search time */
  p95SearchTime: number;
  
  /** Cache performance statistics */
  cacheStats: CachePerformanceStats;
  
  /** Error statistics */
  errorStats: ErrorStats;
  
  /** Search type distribution */
  searchTypeDistribution: Record<string, number>;
  
  /** Performance trends */
  trends: PerformanceTrends;
}

export interface TimeRange {
  /** Start time */
  start: Date;
  
  /** End time */
  end: Date;
}

export interface CachePerformanceStats {
  /** Total cache operations */
  totalOperations: number;
  
  /** Cache hits */
  hits: number;
  
  /** Cache misses */
  misses: number;
  
  /** Cache hit rate (0-1) */
  hitRate: number;
  
  /** Cache miss rate (0-1) */
  missRate: number;
  
  /** Average get operation time */
  averageGetTime: number;
  
  /** Average set operation time */
  averageSetTime: number;
}

export interface ErrorStats {
  /** Total number of errors */
  totalErrors: number;
  
  /** Errors by type */
  errorsByType: Record<string, number>;
  
  /** Error rate */
  errorRate: number;
  
  /** Most common error type */
  mostCommonError?: string;
  
  /** Recent errors */
  recentErrors: Array<{
    timestamp: Date;
    operation: string;
    error: string;
  }>;
}

export interface PerformanceTrends {
  /** Performance over time */
  performanceOverTime: Array<{
    timestamp: Date;
    averageDuration: number;
    operationCount: number;
  }>;
  
  /** Performance change information */
  performanceChange: {
    percentage: number;
    direction: 'improvement' | 'degradation';
  };
}

export interface CacheConfiguration {
  /** Maximum cache size */
  maxSize: number;
  
  /** Time-to-live in milliseconds */
  ttl: number;
  
  /** Enable cache compression */
  enableCompression: boolean;
  
  /** Cache eviction strategy */
  evictionStrategy: 'lru' | 'fifo' | 'ttl';
  
  /** Enable cache persistence */
  enablePersistence: boolean;
}

export interface CacheStats {
  /** Current cache size */
  size: number;
  
  /** Cache hit rate */
  hitRate: number;
  
  /** Cache miss rate */
  missRate: number;
  
  /** Total cache hits */
  totalHits: number;
  
  /** Total cache misses */
  totalMisses: number;
  
  /** Number of evicted entries */
  evictions: number;
  
  /** Memory usage in bytes */
  memoryUsage: number;
  
  /** Average entry size */
  averageEntrySize: number;
}

export interface FusionConfiguration {
  /** Default fusion strategy */
  defaultStrategy: 'rrf' | 'weighted' | 'simple';
  
  /** Default RRF k parameter */
  defaultK: number;
  
  /** Default type weights */
  defaultTypeWeights: Record<string, number>;
  
  /** Enable fusion metrics collection */
  enableMetrics: boolean;
  
  /** Algorithm-specific parameters */
  algorithmParameters: Record<string, any>;
}

export interface FusionMetrics {
  /** Total fusion operations */
  totalOperations: number;
  
  /** Average fusion time */
  averageFusionTime: number;
  
  /** Fusion strategy usage */
  strategyUsage: Record<string, number>;
  
  /** Average result set sizes */
  averageInputSize: number;
  
  /** Average output size */
  averageOutputSize: number;
}

export interface SearchValidationResult {
  /** Validation passed */
  valid: boolean;
  
  /** Missing collections */
  missingCollections: string[];
  
  /** Corrupted collections */
  corruptedCollections: string[];
  
  /** Fallback options available */
  fallbackAvailable: boolean;
  
  /** Error messages */
  errors: string[];
}

export interface QualityAssessment {
  /** Quality tier */
  tier: 'high' | 'medium' | 'low' | 'minimal';
  
  /** Confidence score */
  confidence: number;
  
  /** Match type */
  matchType: string;
  
  /** Quality description */
  description: string;
}

export interface SearchHealthStatus {
  /** Semantic search available */
  semantic: boolean;
  
  /** Keyword search available */
  keyword: boolean;
  
  /** Fuzzy search available */
  fuzzy: boolean;
  
  /** Collection validation available */
  collectionValidation: boolean;
  
  /** Collection health details */
  collections?: Record<string, any>;
  
  /** Overall health score */
  healthScore?: number;
}