/**
 * InitializationDiagnostics - Debug and validate initialization sequence
 * Follows Single Responsibility Principle - only diagnoses initialization issues
 * Implements Boy Scout Rule - provides clean diagnostic reporting
 */

import { IInitializationStateManager } from './interfaces/IInitializationStateManager';
import { ICollectionLoadingCoordinator } from './interfaces/ICollectionLoadingCoordinator';
import { IInitializationCoordinator } from './interfaces/IInitializationCoordinator';

export interface InitializationMetrics {
  component: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  error?: string;
  attempts: number;
}

export interface DuplicateInitializationReport {
  component: string;
  attempts: number;
  timeSpan: number;
  wastes: {
    duration: number;
    duplicateAttempts: number;
  };
}

export interface InitializationReport {
  totalDuration: number;
  componentsInitialized: string[];
  duplicateInitializations: DuplicateInitializationReport[];
  errors: Array<{ component: string; error: string }>;
  performanceMetrics: {
    fastestComponent: InitializationMetrics;
    slowestComponent: InitializationMetrics;
    averageDuration: number;
    totalWastedTime: number;
  };
  recommendations: string[];
}

/**
 * Service for diagnosing initialization issues and performance
 */
export class InitializationDiagnostics {
  private metrics: Map<string, InitializationMetrics[]> = new Map();
  private startTime: number = Date.now();

  constructor(
    private stateManager?: IInitializationStateManager,
    private collectionCoordinator?: ICollectionLoadingCoordinator,
    private coordinator?: IInitializationCoordinator
  ) {}

  /**
   * Track initialization of a component
   */
  trackInitialization(component: string, startTime: number, endTime: number, success: boolean, error?: string): void {
    const duration = endTime - startTime;
    
    if (!this.metrics.has(component)) {
      this.metrics.set(component, []);
    }
    
    const componentMetrics = this.metrics.get(component)!;
    const attempts = componentMetrics.length + 1;
    
    const metric: InitializationMetrics = {
      component,
      startTime,
      endTime,
      duration,
      success,
      error,
      attempts
    };
    
    componentMetrics.push(metric);
    
    // Log duplicate attempts
    if (attempts > 1) {
      console.warn(`[InitializationDiagnostics] Duplicate initialization detected for ${component} (attempt ${attempts})`);
    }
  }

  /**
   * Report duplicate initializations
   */
  reportDuplicateInitializations(): DuplicateInitializationReport[] {
    const duplicates: DuplicateInitializationReport[] = [];
    
    for (const [component, metrics] of this.metrics) {
      if (metrics.length > 1) {
        const firstAttempt = metrics[0];
        const lastAttempt = metrics[metrics.length - 1];
        const timeSpan = lastAttempt.endTime - firstAttempt.startTime;
        
        // Calculate wasted time (all attempts except the first)
        const wastedDuration = metrics.slice(1).reduce((sum, m) => sum + m.duration, 0);
        
        duplicates.push({
          component,
          attempts: metrics.length,
          timeSpan,
          wastes: {
            duration: wastedDuration,
            duplicateAttempts: metrics.length - 1
          }
        });
      }
    }
    
    return duplicates.sort((a, b) => b.wastes.duration - a.wastes.duration);
  }

  /**
   * Generate comprehensive initialization report
   */
  generateInitializationReport(): InitializationReport {
    const totalDuration = Date.now() - this.startTime;
    const componentsInitialized: string[] = [];
    const errors: Array<{ component: string; error: string }> = [];
    
    // Collect all metrics
    const allMetrics: InitializationMetrics[] = [];
    for (const [component, metrics] of this.metrics) {
      // Only count successful initializations
      const successfulMetrics = metrics.filter(m => m.success);
      if (successfulMetrics.length > 0) {
        componentsInitialized.push(component);
        allMetrics.push(...successfulMetrics);
      }
      
      // Collect errors
      const errorMetrics = metrics.filter(m => !m.success && m.error);
      for (const errorMetric of errorMetrics) {
        errors.push({
          component: errorMetric.component,
          error: errorMetric.error!
        });
      }
    }
    
    // Calculate performance metrics
    const durations = allMetrics.map(m => m.duration);
    const averageDuration = durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;
    const fastestComponent = allMetrics.reduce((fastest, current) => 
      current.duration < fastest.duration ? current : fastest, allMetrics[0]);
    const slowestComponent = allMetrics.reduce((slowest, current) => 
      current.duration > slowest.duration ? current : slowest, allMetrics[0]);
    
    // Calculate total wasted time from duplicates
    const duplicates = this.reportDuplicateInitializations();
    const totalWastedTime = duplicates.reduce((sum, d) => sum + d.wastes.duration, 0);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(duplicates, allMetrics);
    
    return {
      totalDuration,
      componentsInitialized,
      duplicateInitializations: duplicates,
      errors,
      performanceMetrics: {
        fastestComponent,
        slowestComponent,
        averageDuration,
        totalWastedTime
      },
      recommendations
    };
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(duplicates: DuplicateInitializationReport[], metrics: InitializationMetrics[]): string[] {
    const recommendations: string[] = [];
    
    // Check for duplicate initializations
    if (duplicates.length > 0) {
      recommendations.push(`⚠️  Found ${duplicates.length} components with duplicate initializations`);
      const topDuplicate = duplicates[0];
      recommendations.push(`   Most problematic: ${topDuplicate.component} (${topDuplicate.attempts} attempts, ${topDuplicate.wastes.duration}ms wasted)`);
    }
    
    // Check for slow components
    const slowComponents = metrics.filter(m => m.duration > 5000); // > 5 seconds
    if (slowComponents.length > 0) {
      recommendations.push(`🐌 Found ${slowComponents.length} slow components (>5s initialization)`);
      slowComponents.forEach(component => {
        recommendations.push(`   ${component.component}: ${component.duration}ms`);
      });
    }
    
    // Check coordination system usage
    if (this.stateManager) {
      const states = this.stateManager.getAllStates();
      const coordinatedComponents = Object.keys(states).length;
      const totalComponents = this.metrics.size;
      
      if (coordinatedComponents < totalComponents) {
        recommendations.push(`🔄 Only ${coordinatedComponents}/${totalComponents} components using coordination system`);
      }
    }
    
    // Overall performance assessment
    const totalWastedTime = duplicates.reduce((sum, d) => sum + d.wastes.duration, 0);
    if (totalWastedTime > 1000) { // > 1 second wasted
      recommendations.push(`⏱️  Total wasted time: ${totalWastedTime}ms - consider improving coordination`);
    }
    
    if (recommendations.length === 0) {
      recommendations.push('✅ No major initialization issues detected');
    }
    
    return recommendations;
  }

  /**
   * Print detailed diagnostic report to console
   */
  printReport(): void {
    const report = this.generateInitializationReport();
    
    console.log('\n=== INITIALIZATION DIAGNOSTIC REPORT ===');
    console.log(`Total Duration: ${report.totalDuration}ms`);
    console.log(`Components Initialized: ${report.componentsInitialized.length}`);
    console.log(`Duplicate Initializations: ${report.duplicateInitializations.length}`);
    console.log(`Errors: ${report.errors.length}`);
    console.log(`Total Wasted Time: ${report.performanceMetrics.totalWastedTime}ms`);
    
    if (report.duplicateInitializations.length > 0) {
      console.log('\n--- DUPLICATE INITIALIZATIONS ---');
      report.duplicateInitializations.forEach(dup => {
        console.log(`${dup.component}: ${dup.attempts} attempts, ${dup.wastes.duration}ms wasted`);
      });
    }
    
    if (report.errors.length > 0) {
      console.log('\n--- ERRORS ---');
      report.errors.forEach(error => {
        console.log(`${error.component}: ${error.error}`);
      });
    }
    
    console.log('\n--- RECOMMENDATIONS ---');
    report.recommendations.forEach(rec => {
      console.log(rec);
    });
    
    console.log('\n=== END DIAGNOSTIC REPORT ===\n');
  }

  /**
   * Reset diagnostic tracking
   */
  reset(): void {
    this.metrics.clear();
    this.startTime = Date.now();
  }

  /**
   * Get current metrics
   */
  getMetrics(): Map<string, InitializationMetrics[]> {
    return new Map(this.metrics);
  }
}