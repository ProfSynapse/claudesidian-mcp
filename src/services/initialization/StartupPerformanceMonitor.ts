/**
 * StartupPerformanceMonitor - Monitor startup performance and catch regressions
 * Follows Single Responsibility Principle - only monitors startup performance
 * Implements Boy Scout Rule - provides clean performance monitoring
 */

export interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  category: 'initialization' | 'collection-loading' | 'service-startup' | 'agent-registration';
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export interface PerformanceThreshold {
  component: string;
  warningThreshold: number;  // milliseconds
  errorThreshold: number;    // milliseconds
}

export interface PerformanceReport {
  totalStartupTime: number;
  metrics: PerformanceMetric[];
  thresholdViolations: Array<{
    metric: PerformanceMetric;
    threshold: PerformanceThreshold;
    severity: 'warning' | 'error';
  }>;
  bottlenecks: Array<{
    component: string;
    duration: number;
    percentOfTotal: number;
  }>;
  recommendations: string[];
}

/**
 * Service for monitoring startup performance and detecting regressions
 */
export class StartupPerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private startupStartTime: number = Date.now();
  private thresholds: Map<string, PerformanceThreshold> = new Map();
  
  constructor() {
    this.initializeDefaultThresholds();
  }

  /**
   * Initialize default performance thresholds
   */
  private initializeDefaultThresholds(): void {
    const defaultThresholds: PerformanceThreshold[] = [
      { component: 'plugin-onload', warningThreshold: 50, errorThreshold: 100 },
      { component: 'service-manager-start', warningThreshold: 100, errorThreshold: 500 },
      { component: 'collections-loading', warningThreshold: 2000, errorThreshold: 10000 },
      { component: 'vector-store-init', warningThreshold: 1000, errorThreshold: 5000 },
      { component: 'hnsw-basic-init', warningThreshold: 2000, errorThreshold: 8000 },
      { component: 'hnsw-full-init', warningThreshold: 5000, errorThreshold: 15000 },
      { component: 'agent-registration', warningThreshold: 500, errorThreshold: 2000 },
      { component: 'connector-start', warningThreshold: 200, errorThreshold: 1000 }
    ];
    
    defaultThresholds.forEach(threshold => {
      this.thresholds.set(threshold.component, threshold);
    });
  }

  /**
   * Set custom threshold for a component
   */
  setThreshold(component: string, warningThreshold: number, errorThreshold: number): void {
    this.thresholds.set(component, {
      component,
      warningThreshold,
      errorThreshold
    });
  }

  /**
   * Measure initialization time for a component
   */
  async measureInitializationTime<T>(
    componentName: string,
    category: PerformanceMetric['category'],
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = Date.now();
    let success = false;
    let error: string | undefined;
    let result: T;

    try {
      result = await fn();
      success = true;
      return result;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      success = false;
      throw err;
    } finally {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      this.metrics.push({
        name: componentName,
        startTime,
        endTime,
        duration,
        category,
        success,
        error,
        metadata
      });
      
      // Check thresholds and log warnings
      this.checkThresholds(componentName, duration);
    }
  }

  /**
   * Check if a component's duration exceeds thresholds
   */
  private checkThresholds(componentName: string, duration: number): void {
    const threshold = this.thresholds.get(componentName);
    if (!threshold) return;

    if (duration > threshold.errorThreshold) {
      console.error(`[StartupPerformanceMonitor] 🔴 ${componentName} exceeded error threshold: ${duration}ms > ${threshold.errorThreshold}ms`);
    } else if (duration > threshold.warningThreshold) {
      console.warn(`[StartupPerformanceMonitor] 🟡 ${componentName} exceeded warning threshold: ${duration}ms > ${threshold.warningThreshold}ms`);
    }
  }

  /**
   * Record a metric manually
   */
  recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);
    this.checkThresholds(metric.name, metric.duration);
  }

  /**
   * Generate startup performance report
   */
  reportStartupMetrics(): PerformanceReport {
    const totalStartupTime = Date.now() - this.startupStartTime;
    const thresholdViolations: PerformanceReport['thresholdViolations'] = [];
    
    // Check for threshold violations
    for (const metric of this.metrics) {
      const threshold = this.thresholds.get(metric.name);
      if (threshold) {
        if (metric.duration > threshold.errorThreshold) {
          thresholdViolations.push({
            metric,
            threshold,
            severity: 'error'
          });
        } else if (metric.duration > threshold.warningThreshold) {
          thresholdViolations.push({
            metric,
            threshold,
            severity: 'warning'
          });
        }
      }
    }
    
    // Identify bottlenecks (components taking >5% of total time)
    const bottlenecks = this.metrics
      .filter(m => m.success && m.duration > 0)
      .map(m => ({
        component: m.name,
        duration: m.duration,
        percentOfTotal: (m.duration / totalStartupTime) * 100
      }))
      .filter(b => b.percentOfTotal > 5)
      .sort((a, b) => b.duration - a.duration);
    
    const recommendations = this.generateRecommendations(totalStartupTime, thresholdViolations, bottlenecks);
    
    return {
      totalStartupTime,
      metrics: [...this.metrics],
      thresholdViolations,
      bottlenecks,
      recommendations
    };
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(
    totalTime: number,
    violations: PerformanceReport['thresholdViolations'],
    bottlenecks: PerformanceReport['bottlenecks']
  ): string[] {
    const recommendations: string[] = [];
    
    // Overall startup time assessment
    if (totalTime > 10000) { // > 10 seconds
      recommendations.push('🚨 Startup time is very slow (>10s) - investigate major bottlenecks');
    } else if (totalTime > 5000) { // > 5 seconds
      recommendations.push('⚠️  Startup time is slow (>5s) - consider optimizations');
    } else if (totalTime > 2000) { // > 2 seconds
      recommendations.push('💡 Startup time is moderate (>2s) - some optimizations possible');
    } else {
      recommendations.push('✅ Startup time is good (<2s)');
    }
    
    // Threshold violations
    const errorViolations = violations.filter(v => v.severity === 'error');
    const warningViolations = violations.filter(v => v.severity === 'warning');
    
    if (errorViolations.length > 0) {
      recommendations.push(`🔴 ${errorViolations.length} components exceeded error thresholds`);
      errorViolations.forEach(v => {
        recommendations.push(`   ${v.metric.name}: ${v.metric.duration}ms (threshold: ${v.threshold.errorThreshold}ms)`);
      });
    }
    
    if (warningViolations.length > 0) {
      recommendations.push(`🟡 ${warningViolations.length} components exceeded warning thresholds`);
      warningViolations.forEach(v => {
        recommendations.push(`   ${v.metric.name}: ${v.metric.duration}ms (threshold: ${v.threshold.warningThreshold}ms)`);
      });
    }
    
    // Bottleneck analysis
    if (bottlenecks.length > 0) {
      recommendations.push(`🔍 Found ${bottlenecks.length} startup bottlenecks (>5% of total time)`);
      bottlenecks.forEach(b => {
        recommendations.push(`   ${b.component}: ${b.duration}ms (${b.percentOfTotal.toFixed(1)}%)`);
      });
    }
    
    // Specific recommendations based on metrics
    const collectionLoadingMetrics = this.metrics.filter(m => m.category === 'collection-loading');
    const avgCollectionLoadingTime = collectionLoadingMetrics.reduce((sum, m) => sum + m.duration, 0) / collectionLoadingMetrics.length;
    
    if (avgCollectionLoadingTime > 3000) {
      recommendations.push('💾 Collection loading is slow - consider caching or lazy loading strategies');
    }
    
    const failedMetrics = this.metrics.filter(m => !m.success);
    if (failedMetrics.length > 0) {
      recommendations.push(`❌ ${failedMetrics.length} components failed to initialize`);
      failedMetrics.forEach(m => {
        recommendations.push(`   ${m.name}: ${m.error || 'Unknown error'}`);
      });
    }
    
    return recommendations;
  }

  /**
   * Detect initialization bottlenecks
   */
  detectInitializationBottlenecks(): Array<{
    component: string;
    duration: number;
    category: string;
    recommendation: string;
  }> {
    const bottlenecks: Array<{
      component: string;
      duration: number;
      category: string;
      recommendation: string;
    }> = [];
    
    // Sort metrics by duration (descending)
    const sortedMetrics = [...this.metrics]
      .filter(m => m.success)
      .sort((a, b) => b.duration - a.duration);
    
    // Top 3 slowest components
    const topSlow = sortedMetrics.slice(0, 3);
    
    for (const metric of topSlow) {
      let recommendation = '';
      
      switch (metric.category) {
        case 'collection-loading':
          recommendation = 'Consider implementing incremental loading or caching';
          break;
        case 'service-startup':
          recommendation = 'Review service dependencies and initialization order';
          break;
        case 'initialization':
          recommendation = 'Check for duplicate initialization or heavy computations';
          break;
        case 'agent-registration':
          recommendation = 'Consider lazy agent registration or parallel initialization';
          break;
        default:
          recommendation = 'Review implementation for optimization opportunities';
      }
      
      bottlenecks.push({
        component: metric.name,
        duration: metric.duration,
        category: metric.category,
        recommendation
      });
    }
    
    return bottlenecks;
  }

  /**
   * Print performance report to console
   */
  printPerformanceReport(): void {
    const report = this.reportStartupMetrics();
    
    console.log('\n=== STARTUP PERFORMANCE REPORT ===');
    console.log(`Total Startup Time: ${report.totalStartupTime}ms`);
    console.log(`Metrics Collected: ${report.metrics.length}`);
    console.log(`Threshold Violations: ${report.thresholdViolations.length}`);
    console.log(`Bottlenecks: ${report.bottlenecks.length}`);
    
    if (report.bottlenecks.length > 0) {
      console.log('\n--- BOTTLENECKS ---');
      report.bottlenecks.forEach(b => {
        console.log(`${b.component}: ${b.duration}ms (${b.percentOfTotal.toFixed(1)}%)`);
      });
    }
    
    if (report.thresholdViolations.length > 0) {
      console.log('\n--- THRESHOLD VIOLATIONS ---');
      report.thresholdViolations.forEach(v => {
        const emoji = v.severity === 'error' ? '🔴' : '🟡';
        const thresholdValue = v.severity === 'error' ? v.threshold.errorThreshold : v.threshold.warningThreshold;
        console.log(`${emoji} ${v.metric.name}: ${v.metric.duration}ms (threshold: ${thresholdValue}ms)`);
      });
    }
    
    console.log('\n--- RECOMMENDATIONS ---');
    report.recommendations.forEach(rec => {
      console.log(rec);
    });
    
    console.log('\n=== END PERFORMANCE REPORT ===\n');
  }

  /**
   * Reset performance tracking
   */
  reset(): void {
    this.metrics = [];
    this.startupStartTime = Date.now();
  }

  /**
   * Get current metrics
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }
}