/**
 * SearchMetrics.ts - Performance metrics tracking service for search operations
 * Location: src/services/search/SearchMetrics.ts
 * Purpose: Tracks and analyzes search performance, caching effectiveness, and error rates
 * Used by: HybridSearchService for comprehensive performance monitoring and optimization
 */

import {
  PerformanceMetrics,
  OperationMetric,
  ErrorMetric,
  PerformanceReport,
  TimeRange,
  CachePerformanceStats,
  ErrorStats,
  PerformanceTrends
} from '../../types/search/SearchMetadata';

export interface SearchMetricsInterface {
  track(operation: string, duration: number, metadata?: Record<string, any>): void;
  trackError(operation: string, error: Error, metadata?: Record<string, any>): void;
  trackCache(hit: boolean, operation: 'get' | 'set' | 'invalidate', duration: number): void;
  getMetrics(timeframe?: TimeRange): Promise<PerformanceReport>;
  reset(preserveHistorical?: boolean): Promise<void>;
  export(format: 'json' | 'csv'): Promise<string>;
}

export class SearchMetrics implements SearchMetricsInterface {
  private metrics: PerformanceMetrics = {
    hybridSearches: [],
    semanticSearches: [],
    cacheHits: 0,
    cacheMisses: 0,
    errors: []
  };
  private startTime: Date = new Date();
  private readonly maxHistorySize = 1000;

  /**
   * Records a search operation metric
   */
  track(operation: string, duration: number, metadata?: Record<string, any>): void {
    const metric: OperationMetric = {
      timestamp: Date.now(),
      duration,
      resultCount: metadata?.resultCount || 0,
      methods: metadata?.methods,
      success: true,
      metadata: metadata || {}
    };

    // Store in appropriate category
    if (operation === 'hybrid_search') {
      this.metrics.hybridSearches.push(metric);
      this.trimHistory(this.metrics.hybridSearches);
    } else if (operation === 'semantic_search') {
      this.metrics.semanticSearches.push(metric);
      this.trimHistory(this.metrics.semanticSearches);
    }
  }

  /**
   * Records a search operation error
   */
  trackError(operation: string, error: Error, metadata?: Record<string, any>): void {
    const errorMetric: ErrorMetric = {
      timestamp: Date.now(),
      type: error.name || 'Unknown',
      message: error.message,
      operation,
      stack: error.stack
    };

    this.metrics.errors.push(errorMetric);
    this.trimHistory(this.metrics.errors);

    // Also record as failed operation
    const failedMetric: OperationMetric = {
      timestamp: Date.now(),
      duration: 0,
      resultCount: 0,
      success: false,
      metadata: { ...metadata, error: error.message }
    };

    if (operation === 'hybrid_search') {
      this.metrics.hybridSearches.push(failedMetric);
    } else if (operation === 'semantic_search') {
      this.metrics.semanticSearches.push(failedMetric);
    }
  }

  /**
   * Records cache performance metrics
   */
  trackCache(hit: boolean, operation: 'get' | 'set' | 'invalidate', duration: number): void {
    if (hit && operation === 'get') {
      this.metrics.cacheHits++;
    } else if (!hit && operation === 'get') {
      this.metrics.cacheMisses++;
    }
  }

  /**
   * Gets comprehensive performance report
   */
  async getMetrics(timeframe?: TimeRange): Promise<PerformanceReport> {
    const endTime = timeframe?.end || new Date();
    const startTime = timeframe?.start || this.startTime;

    // Filter metrics by timeframe
    const filteredHybridSearches = this.filterByTimeframe(this.metrics.hybridSearches, startTime, endTime);
    const filteredSemanticSearches = this.filterByTimeframe(this.metrics.semanticSearches, startTime, endTime);
    const filteredErrors = this.filterErrorsByTimeframe(this.metrics.errors, startTime, endTime);

    // Calculate aggregate metrics
    const allSearches = [...filteredHybridSearches, ...filteredSemanticSearches];
    const successfulSearches = allSearches.filter(m => m.success !== false);
    
    const totalSearches = successfulSearches.length;
    const totalDuration = successfulSearches.reduce((sum, m) => sum + m.duration, 0);
    const averageSearchTime = totalSearches > 0 ? totalDuration / totalSearches : 0;

    // Calculate percentiles
    const sortedDurations = successfulSearches
      .map(m => m.duration)
      .sort((a, b) => a - b);
    
    const medianSearchTime = this.calculatePercentile(sortedDurations, 50);
    const p95SearchTime = this.calculatePercentile(sortedDurations, 95);

    // Calculate cache stats
    const cacheStats = this.calculateCacheStats();

    // Calculate error stats
    const errorStats = this.calculateErrorStats(filteredErrors);

    // Calculate search type distribution
    const searchTypeDistribution = this.calculateSearchTypeDistribution(successfulSearches);

    // Calculate trends
    const trends = this.calculatePerformanceTrends(allSearches, startTime, endTime);

    return {
      timeRange: { start: startTime, end: endTime },
      totalSearches,
      averageSearchTime,
      medianSearchTime,
      p95SearchTime,
      cacheStats,
      errorStats,
      searchTypeDistribution,
      trends
    };
  }

  /**
   * Resets collected metrics
   */
  async reset(preserveHistorical?: boolean): Promise<void> {
    if (!preserveHistorical) {
      this.metrics = {
        hybridSearches: [],
        semanticSearches: [],
        cacheHits: 0,
        cacheMisses: 0,
        errors: []
      };
      this.startTime = new Date();
    }
  }

  /**
   * Exports metrics data
   */
  async export(format: 'json' | 'csv'): Promise<string> {
    const report = await this.getMetrics();

    switch (format) {
      case 'json':
        return JSON.stringify(report, null, 2);
      case 'csv':
        return this.exportToCsv(report);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  // Private helper methods
  private trimHistory(array: any[]): void {
    if (array.length > this.maxHistorySize) {
      array.splice(0, array.length - this.maxHistorySize);
    }
  }

  private filterByTimeframe(metrics: OperationMetric[], start: Date, end: Date): OperationMetric[] {
    return metrics.filter(m => {
      const metricDate = new Date(m.timestamp);
      return metricDate >= start && metricDate <= end;
    });
  }

  private filterErrorsByTimeframe(errors: ErrorMetric[], start: Date, end: Date): ErrorMetric[] {
    return errors.filter(e => {
      const errorDate = new Date(e.timestamp);
      return errorDate >= start && errorDate <= end;
    });
  }

  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }

  private calculateCacheStats(): CachePerformanceStats {
    const totalOperations = this.metrics.cacheHits + this.metrics.cacheMisses;
    const hitRate = totalOperations > 0 ? this.metrics.cacheHits / totalOperations : 0;
    const missRate = totalOperations > 0 ? this.metrics.cacheMisses / totalOperations : 0;

    return {
      totalOperations,
      hits: this.metrics.cacheHits,
      misses: this.metrics.cacheMisses,
      hitRate,
      missRate,
      averageGetTime: 0, // Would need more detailed cache timing
      averageSetTime: 0
    };
  }

  private calculateErrorStats(errors: ErrorMetric[]): ErrorStats {
    const totalErrors = errors.length;
    const errorsByType: Record<string, number> = {};
    
    errors.forEach(error => {
      errorsByType[error.type] = (errorsByType[error.type] || 0) + 1;
    });

    const mostCommonError = Object.entries(errorsByType)
      .sort(([, a], [, b]) => b - a)[0]?.[0];

    const recentErrors = errors
      .slice(-5)
      .map(e => ({
        timestamp: new Date(e.timestamp),
        operation: e.operation || 'unknown',
        error: e.message
      }));

    return {
      totalErrors,
      errorsByType,
      errorRate: totalErrors, // Will be calculated relative to total operations by caller
      mostCommonError,
      recentErrors
    };
  }

  private calculateSearchTypeDistribution(metrics: OperationMetric[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    metrics.forEach(metric => {
      const methods = metric.methods || ['unknown'];
      methods.forEach(method => {
        distribution[method] = (distribution[method] || 0) + 1;
      });
    });
    
    return distribution;
  }

  private calculatePerformanceTrends(
    metrics: OperationMetric[], 
    start: Date, 
    end: Date
  ): PerformanceTrends {
    // Divide timeframe into buckets for trend analysis
    const timeSpan = end.getTime() - start.getTime();
    const bucketCount = Math.min(10, Math.max(2, Math.floor(timeSpan / (60 * 60 * 1000)))); // Hourly buckets
    const bucketSize = timeSpan / bucketCount;
    
    const buckets = Array.from({ length: bucketCount }, (_, i) => ({
      start: new Date(start.getTime() + i * bucketSize),
      end: new Date(start.getTime() + (i + 1) * bucketSize),
      metrics: [] as OperationMetric[]
    }));

    // Distribute metrics into buckets
    metrics.forEach(metric => {
      const bucketIndex = Math.floor(
        (metric.timestamp - start.getTime()) / bucketSize
      );
      
      if (bucketIndex >= 0 && bucketIndex < buckets.length) {
        buckets[bucketIndex].metrics.push(metric);
      }
    });

    // Calculate trends
    const performanceOverTime = buckets.map(bucket => {
      const successfulMetrics = bucket.metrics.filter(m => m.success !== false);
      const avgDuration = successfulMetrics.length > 0 ? 
        successfulMetrics.reduce((sum, m) => sum + m.duration, 0) / successfulMetrics.length : 0;
      
      return {
        timestamp: bucket.start,
        averageDuration: avgDuration,
        operationCount: successfulMetrics.length
      };
    });

    // Calculate improvement/degradation
    const firstHalf = performanceOverTime.slice(0, Math.floor(bucketCount / 2));
    const secondHalf = performanceOverTime.slice(Math.floor(bucketCount / 2));
    
    const firstHalfAvg = firstHalf.length > 0 ? 
      firstHalf.reduce((sum, p) => sum + p.averageDuration, 0) / firstHalf.length : 0;
    const secondHalfAvg = secondHalf.length > 0 ? 
      secondHalf.reduce((sum, p) => sum + p.averageDuration, 0) / secondHalf.length : 0;
    
    const performanceChange = firstHalfAvg > 0 ? 
      ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100 : 0;

    return {
      performanceOverTime,
      performanceChange: {
        percentage: performanceChange,
        direction: performanceChange > 0 ? 'degradation' : 'improvement'
      }
    };
  }

  private exportToCsv(report: PerformanceReport): string {
    const lines = [
      'metric,value',
      `total_searches,${report.totalSearches}`,
      `average_search_time,${report.averageSearchTime}`,
      `median_search_time,${report.medianSearchTime}`,
      `p95_search_time,${report.p95SearchTime}`,
      `cache_hit_rate,${report.cacheStats.hitRate}`,
      `total_errors,${report.errorStats.totalErrors}`
    ];
    
    return lines.join('\n');
  }
}