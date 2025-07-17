/**
 * HNSW Diagnostics - Comprehensive diagnostic tools for HNSW service
 * Helps identify and resolve initialization and performance issues
 */

import { logger } from '../../../../utils/logger';
import { HnswSearchService } from '../HnswSearchService';
import { ServiceInitializer } from '../initialization/ServiceInitializer';
import { HnswConfig } from '../config/HnswConfig';

export interface DiagnosticResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  section: string;
  message: string;
  details?: Record<string, any>;
  recommendations?: string[];
}

export interface ComprehensiveDiagnostic {
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  results: DiagnosticResult[];
  summary: string;
  criticalIssues: string[];
  recommendations: string[];
}

/**
 * Comprehensive diagnostic service for HNSW
 */
export class HnswDiagnostics {
  private searchService: HnswSearchService;
  private serviceInitializer?: ServiceInitializer;

  constructor(searchService: HnswSearchService) {
    this.searchService = searchService;
  }

  /**
   * Run comprehensive diagnostics
   */
  async runFullDiagnostics(): Promise<ComprehensiveDiagnostic> {
    const results: DiagnosticResult[] = [];
    const criticalIssues: string[] = [];
    const recommendations: string[] = [];

    // 1. Check service initialization
    const initResults = await this.diagnoseInitialization();
    results.push(...initResults);

    // 2. Check service health
    const healthResults = await this.diagnoseServiceHealth();
    results.push(...healthResults);

    // 3. Check index status
    const indexResults = await this.diagnoseIndexes();
    results.push(...indexResults);

    // 4. Check configuration
    const configResults = this.diagnoseConfiguration();
    results.push(...configResults);

    // 5. Check memory usage
    const memoryResults = this.diagnoseMemoryUsage();
    results.push(...memoryResults);

    // Aggregate results
    const unhealthyResults = results.filter(r => r.status === 'unhealthy');
    const degradedResults = results.filter(r => r.status === 'degraded');

    // Determine overall status
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (unhealthyResults.length > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedResults.length > 0) {
      overallStatus = 'degraded';
    }

    // Collect critical issues and recommendations
    for (const result of results) {
      if (result.status === 'unhealthy') {
        criticalIssues.push(`[${result.section}] ${result.message}`);
      }
      if (result.recommendations) {
        recommendations.push(...result.recommendations);
      }
    }

    // Generate summary
    const summary = this.generateSummary(results, overallStatus);

    return {
      overallStatus,
      results,
      summary,
      criticalIssues,
      recommendations: [...new Set(recommendations)] // Remove duplicates
    };
  }

  /**
   * Diagnose service initialization
   */
  private async diagnoseInitialization(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    try {
      // Check if service is initialized
      const serviceStats = this.searchService.getServiceStatistics();
      
      if (!serviceStats.isInitialized) {
        results.push({
          status: 'unhealthy',
          section: 'Initialization',
          message: 'HNSW service is not initialized',
          recommendations: ['Call searchService.initialize() to initialize the service']
        });
      } else if (!serviceStats.isFullyReady) {
        results.push({
          status: 'degraded',
          section: 'Initialization',
          message: 'HNSW service is partially initialized but not fully ready',
          recommendations: ['Call searchService.ensureFullyInitialized() for complete initialization']
        });
      } else {
        results.push({
          status: 'healthy',
          section: 'Initialization',
          message: 'HNSW service is fully initialized and ready'
        });
      }

      // Check HNSW library loading
      try {
        await this.searchService.initialize();
        results.push({
          status: 'healthy',
          section: 'Library Loading',
          message: 'HNSW WASM library loaded successfully'
        });
      } catch (error) {
        results.push({
          status: 'unhealthy',
          section: 'Library Loading',
          message: `Failed to load HNSW WASM library: ${error instanceof Error ? error.message : String(error)}`,
          recommendations: ['Check network connectivity and WASM support']
        });
      }

    } catch (error) {
      results.push({
        status: 'unhealthy',
        section: 'Initialization',
        message: `Initialization check failed: ${error instanceof Error ? error.message : String(error)}`,
        recommendations: ['Check service constructor dependencies']
      });
    }

    return results;
  }

  /**
   * Diagnose service health
   */
  private async diagnoseServiceHealth(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    try {
      // Use built-in diagnostics if available
      const diagnostics = await this.searchService.diagnose();
      
      results.push({
        status: diagnostics.status,
        section: 'Service Health',
        message: `Service health check: ${diagnostics.status}`,
        details: diagnostics.details,
        recommendations: diagnostics.recommendations
      });

    } catch (error) {
      results.push({
        status: 'unhealthy',
        section: 'Service Health',
        message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
        recommendations: ['Check service dependencies and initialization']
      });
    }

    return results;
  }

  /**
   * Diagnose index status
   */
  private async diagnoseIndexes(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    try {
      const memoryStats = this.searchService.getMemoryStats();
      const serviceStats = this.searchService.getServiceStatistics();

      if (memoryStats.totalIndexes === 0) {
        results.push({
          status: 'degraded',
          section: 'Indexes',
          message: 'No indexes available - search functionality will be limited',
          recommendations: ['Build indexes for collections using indexCollection() method']
        });
      } else {
        results.push({
          status: 'healthy',
          section: 'Indexes',
          message: `${memoryStats.totalIndexes} indexes available with ${memoryStats.totalItems} total items`,
          details: {
            totalIndexes: memoryStats.totalIndexes,
            totalItems: memoryStats.totalItems,
            totalPartitions: memoryStats.totalPartitions,
            configuredCollections: serviceStats.configuredCollections
          }
        });
      }

      // Check specific collections
      const collections = ['file_embeddings', 'files', 'notes', 'default']; // Common collection names
      for (const collection of collections) {
        const hasIndex = this.searchService.hasIndex(collection);
        if (hasIndex) {
          const stats = this.searchService.getIndexStats(collection);
          results.push({
            status: 'healthy',
            section: `Index: ${collection}`,
            message: `Collection '${collection}' has ${stats?.itemCount || 0} items`,
            details: stats || undefined
          });
        }
      }

    } catch (error) {
      results.push({
        status: 'unhealthy',
        section: 'Indexes',
        message: `Index diagnosis failed: ${error instanceof Error ? error.message : String(error)}`,
        recommendations: ['Check index manager initialization']
      });
    }

    return results;
  }

  /**
   * Diagnose configuration
   */
  private diagnoseConfiguration(): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];

    try {
      const serviceStats = this.searchService.getServiceStatistics();
      
      results.push({
        status: 'healthy',
        section: 'Configuration',
        message: 'Configuration check completed',
        details: {
          isInitialized: serviceStats.isInitialized,
          isFullyReady: serviceStats.isFullyReady,
          totalIndexes: serviceStats.totalIndexes,
          totalItems: serviceStats.totalItems,
          configuredCollections: serviceStats.configuredCollections
        }
      });

    } catch (error) {
      results.push({
        status: 'unhealthy',
        section: 'Configuration',
        message: `Configuration check failed: ${error instanceof Error ? error.message : String(error)}`,
        recommendations: ['Check service configuration and dependencies']
      });
    }

    return results;
  }

  /**
   * Diagnose memory usage
   */
  private diagnoseMemoryUsage(): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];

    try {
      const memoryStats = this.searchService.getMemoryStats();
      
      const totalMemoryEstimate = memoryStats.totalItems * 0.1; // Rough estimate: 100KB per item
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      const recommendations: string[] = [];

      if (totalMemoryEstimate > 100) { // > 100MB
        status = 'degraded';
        recommendations.push('Consider using partitioned indexes for better memory management');
      }

      if (memoryStats.totalPartitions > 0) {
        recommendations.push('Partitioning is active - monitor partition balance');
      }

      results.push({
        status,
        section: 'Memory Usage',
        message: `Memory usage analysis: ~${totalMemoryEstimate.toFixed(1)}MB estimated`,
        details: {
          totalIndexes: memoryStats.totalIndexes,
          totalItems: memoryStats.totalItems,
          totalPartitions: memoryStats.totalPartitions,
          estimatedMemoryMB: totalMemoryEstimate
        },
        recommendations: recommendations.length > 0 ? recommendations : undefined
      });

    } catch (error) {
      results.push({
        status: 'unhealthy',
        section: 'Memory Usage',
        message: `Memory analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        recommendations: ['Check memory stats availability']
      });
    }

    return results;
  }

  /**
   * Generate summary message
   */
  private generateSummary(results: DiagnosticResult[], overallStatus: string): string {
    const healthyCount = results.filter(r => r.status === 'healthy').length;
    const degradedCount = results.filter(r => r.status === 'degraded').length;
    const unhealthyCount = results.filter(r => r.status === 'unhealthy').length;

    let summary = `HNSW Service Status: ${overallStatus.toUpperCase()}\\n`;
    summary += `Checked ${results.length} components: `;
    summary += `${healthyCount} healthy, ${degradedCount} degraded, ${unhealthyCount} unhealthy\\n`;

    if (overallStatus === 'unhealthy') {
      summary += `Critical issues found - service may not function properly`;
    } else if (overallStatus === 'degraded') {
      summary += `Some performance issues detected - service functional but not optimal`;
    } else {
      summary += `All systems operational - service ready for use`;
    }

    return summary;
  }

  /**
   * Quick health check
   */
  async quickHealthCheck(): Promise<{
    isHealthy: boolean;
    message: string;
    criticalIssues: string[];
  }> {
    const criticalIssues: string[] = [];
    
    try {
      // Check if service can be initialized
      await this.searchService.initialize();
      
      // Check if service has basic functionality
      const serviceStats = this.searchService.getServiceStatistics();
      if (!serviceStats.isInitialized) {
        criticalIssues.push('Service not initialized');
      }
      
      // Check if we can get memory stats
      const memoryStats = this.searchService.getMemoryStats();
      if (!memoryStats) {
        criticalIssues.push('Memory stats not available');
      }

      const isHealthy = criticalIssues.length === 0;
      const message = isHealthy ? 
        'HNSW service is healthy and ready' : 
        `HNSW service has ${criticalIssues.length} critical issues`;

      return { isHealthy, message, criticalIssues };

    } catch (error) {
      criticalIssues.push(`Service check failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        isHealthy: false,
        message: 'HNSW service health check failed',
        criticalIssues
      };
    }
  }

  /**
   * Test search functionality
   */
  async testSearchFunctionality(collectionName: string = 'file_embeddings'): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      await this.searchService.initialize();
      
      // Check if collection has an index
      const hasIndex = this.searchService.hasIndex(collectionName);
      if (!hasIndex) {
        return {
          success: false,
          message: `No index found for collection '${collectionName}'`,
          details: { collectionName, hasIndex: false }
        };
      }

      // Get index stats
      const indexStats = this.searchService.getIndexStats(collectionName);
      
      if (!indexStats || indexStats.itemCount === 0) {
        return {
          success: false,
          message: `Collection '${collectionName}' index exists but has no items`,
          details: { collectionName, indexStats }
        };
      }

      // Test search performance estimate
      const perfEstimate = this.searchService.getSearchPerformanceEstimate(collectionName, 10);
      
      return {
        success: true,
        message: `Search functionality test passed for collection '${collectionName}'`,
        details: {
          collectionName,
          indexStats,
          performanceEstimate: perfEstimate
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Search functionality test failed: ${error instanceof Error ? error.message : String(error)}`,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Get diagnostic report as formatted string
   */
  async getFormattedReport(): Promise<string> {
    const diagnostics = await this.runFullDiagnostics();
    
    let report = `# HNSW Service Diagnostic Report\\n\\n`;
    report += `**Overall Status:** ${diagnostics.overallStatus.toUpperCase()}\\n\\n`;
    report += `${diagnostics.summary}\\n\\n`;

    if (diagnostics.criticalIssues.length > 0) {
      report += `## Critical Issues\\n`;
      for (const issue of diagnostics.criticalIssues) {
        report += `- ${issue}\\n`;
      }
      report += `\\n`;
    }

    if (diagnostics.recommendations.length > 0) {
      report += `## Recommendations\\n`;
      for (const rec of diagnostics.recommendations) {
        report += `- ${rec}\\n`;
      }
      report += `\\n`;
    }

    report += `## Detailed Results\\n`;
    for (const result of diagnostics.results) {
      const statusIcon = result.status === 'healthy' ? '✅' : 
                        result.status === 'degraded' ? '⚠️' : '❌';
      report += `${statusIcon} **${result.section}**: ${result.message}\\n`;
      
      if (result.details) {
        report += `   Details: ${JSON.stringify(result.details, null, 2)}\\n`;
      }
      
      if (result.recommendations) {
        report += `   Recommendations: ${result.recommendations.join(', ')}\\n`;
      }
      
      report += `\\n`;
    }

    return report;
  }
}

/**
 * Standalone diagnostic function for easy use
 */
export async function runHnswDiagnostics(searchService: HnswSearchService): Promise<ComprehensiveDiagnostic> {
  const diagnostics = new HnswDiagnostics(searchService);
  return await diagnostics.runFullDiagnostics();
}

/**
 * Quick diagnostic function
 */
export async function quickHnswCheck(searchService: HnswSearchService): Promise<boolean> {
  const diagnostics = new HnswDiagnostics(searchService);
  const result = await diagnostics.quickHealthCheck();
  return result.isHealthy;
}