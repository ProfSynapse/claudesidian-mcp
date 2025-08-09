/**
 * Location: /src/database/services/monitoring/ChromaVectorStoreDiagnosticsService.ts
 * 
 * ChromaDB Vector Store Diagnostics Service - MOVED from ChromaDB provider
 * This service was moved from database/providers/chroma/services/DiagnosticsService.ts
 * to the monitoring layer as part of the ChromaDB provider consolidation project.
 * 
 * Handles system health checks, repairs, and validation for ChromaDB vector stores.
 * Works with the consolidated ChromaDB provider services and types.
 */

import type { 
  RepairResult, 
  ValidationResult, 
  HealthCheckResult,
  IDiagnosticsService 
} from '../../providers/chroma/types/ChromaTypes';
import type { IStorageOptions } from '../../interfaces/IStorageOptions';

/**
 * ChromaDB Vector Store Diagnostics Service
 * Provides comprehensive health monitoring and repair capabilities for ChromaDB instances
 */
export class ChromaVectorStoreDiagnosticsService implements IDiagnosticsService {
  private client: any; // ChromaClient instance
  private persistenceManager?: any; // PersistenceManager with directory operations
  private collectionRepository?: any; // CollectionRepository with size calculation features
  private config: IStorageOptions;

  constructor(
    client: any,
    persistenceManager: any,
    collectionRepository: any,
    config: IStorageOptions
  ) {
    this.client = client;
    this.persistenceManager = persistenceManager;
    this.collectionRepository = collectionRepository;
    this.config = config;
  }

  /**
   * Get comprehensive diagnostics about the vector store
   */
  async getDiagnostics(): Promise<Record<string, any>> {
    try {
      const basicDiagnostics = await this.getBasicDiagnostics();
      const collectionDiagnostics = await this.getCollectionDiagnostics();
      const storageDiagnostics = await this.getStorageDiagnostics();
      const performanceDiagnostics = await this.getPerformanceDiagnostics();

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        ...basicDiagnostics,
        collections: collectionDiagnostics,
        storage: storageDiagnostics,
        performance: performanceDiagnostics
      };
    } catch (error) {
      console.error('[ChromaVectorStoreDiagnosticsService] Error getting diagnostics:', error);
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Repair and reload collections from storage
   */
  async repairCollections(): Promise<RepairResult> {
    const repairedCollections: string[] = [];
    const errors: string[] = [];

    try {
      // Basic connectivity test
      const isConnected = await this.testConnectivity();
      if (!isConnected) {
        errors.push('Cannot connect to ChromaDB client');
        return { success: false, repairedCollections, errors };
      }

      // Attempt to refresh all collections
      try {
        const collections = await this.client.listCollections?.() || [];
        
        for (const collection of collections) {
          try {
            const collectionName = typeof collection === 'string' ? collection : collection.name;
            
            // Basic collection validation
            const collectionObj = await this.client.getCollection?.(collectionName);
            if (collectionObj) {
              const count = await collectionObj.count?.();
              console.log(`[Diagnostics] Collection ${collectionName} has ${count || 0} items`);
              repairedCollections.push(collectionName);
            }
          } catch (collectionError) {
            const errorMsg = `Failed to repair collection ${collection}: ${collectionError instanceof Error ? collectionError.message : String(collectionError)}`;
            console.error('[ChromaVectorStoreDiagnosticsService]', errorMsg);
            errors.push(errorMsg);
          }
        }
      } catch (error) {
        errors.push(`Failed to list collections: ${error instanceof Error ? error.message : String(error)}`);
      }

      return {
        success: errors.length === 0,
        repairedCollections,
        errors
      };
    } catch (error) {
      const errorMsg = `Repair operation failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error('[ChromaVectorStoreDiagnosticsService]', errorMsg);
      return {
        success: false,
        repairedCollections,
        errors: [errorMsg]
      };
    }
  }

  /**
   * Validate all collections to ensure they're accessible
   */
  async validateCollections(): Promise<ValidationResult> {
    const validatedCollections: string[] = [];
    const errors: string[] = [];

    try {
      const collections = await this.client.listCollections?.() || [];
      
      for (const collection of collections) {
        try {
          const collectionName = typeof collection === 'string' ? collection : collection.name;
          const collectionObj = await this.client.getCollection?.(collectionName);
          
          if (collectionObj) {
            // Test basic operations
            await collectionObj.count?.();
            validatedCollections.push(collectionName);
          } else {
            errors.push(`Collection ${collectionName} is not accessible`);
          }
        } catch (error) {
          const errorMsg = `Validation failed for collection: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
        }
      }

      return {
        success: errors.length === 0,
        validatedCollections,
        errors
      };
    } catch (error) {
      return {
        success: false,
        validatedCollections,
        errors: [`Collection validation failed: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  /**
   * Check if the storage system is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const connectivityOk = await this.testConnectivity();
      if (!connectivityOk) return false;

      const validation = await this.validateCollections();
      return validation.success;
    } catch (error) {
      console.error('[ChromaVectorStoreDiagnosticsService] Health check failed:', error);
      return false;
    }
  }

  /**
   * Get detailed collection information
   */
  async getCollectionDetails(collectionName: string): Promise<Record<string, any>> {
    try {
      const collection = await this.client.getCollection?.(collectionName);
      if (!collection) {
        return { error: `Collection ${collectionName} not found` };
      }

      const count = await collection.count?.();
      const metadata = await collection.metadata || {};

      return {
        name: collectionName,
        itemCount: count || 0,
        metadata,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        name: collectionName,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Perform a basic connectivity test
   */
  async testConnectivity(): Promise<boolean> {
    try {
      if (!this.client) return false;
      
      // Try to list collections as a connectivity test
      await this.client.listCollections?.();
      return true;
    } catch (error) {
      console.error('[ChromaVectorStoreDiagnosticsService] Connectivity test failed:', error);
      return false;
    }
  }

  /**
   * Run comprehensive health check
   */
  async runHealthCheck(): Promise<HealthCheckResult> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let severity: 'low' | 'medium' | 'high' = 'low';

    try {
      // Connectivity check
      const connectivityOk = await this.testConnectivity();
      if (!connectivityOk) {
        issues.push('Cannot connect to ChromaDB client');
        severity = 'high';
        recommendations.push('Check ChromaDB server status and configuration');
      }

      // Collection validation
      const validation = await this.validateCollections();
      if (!validation.success) {
        issues.push(`Collection validation failed: ${validation.errors.join(', ')}`);
        severity = severity === 'low' ? 'medium' : severity;
        recommendations.push('Run collection repair to fix accessibility issues');
      }

      // Storage checks (if available)
      if (this.collectionRepository) {
        try {
          const totalSize = await this.collectionRepository.calculateTotalDatabaseSize?.();
          if (totalSize > 2000) { // > 2GB
            issues.push('Database size exceeds 2GB');
            severity = 'high';
            recommendations.push('Consider archiving old data or implementing data retention policies');
          } else if (totalSize > 1000) { // > 1GB
            issues.push('Database size exceeds 1GB');
            severity = severity === 'low' ? 'medium' : severity;
            recommendations.push('Monitor database growth and plan for optimization');
          }
        } catch (error) {
          console.warn('[ChromaVectorStoreDiagnosticsService] Could not check storage size:', error);
        }
      }

    } catch (error) {
      issues.push(`Health check failed: ${error instanceof Error ? error.message : String(error)}`);
      severity = 'high';
      recommendations.push('Investigate system errors and configuration issues');
    }

    return {
      isHealthy: issues.length === 0,
      issues,
      recommendations,
      severity
    };
  }

  // Private helper methods

  private async getBasicDiagnostics(): Promise<Record<string, any>> {
    try {
      const connected = await this.testConnectivity();
      
      return {
        connected,
        clientType: 'ChromaDB',
        configPath: this.config.persistentPath || 'Not configured'
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async getCollectionDiagnostics(): Promise<Record<string, any>> {
    try {
      const collections = await this.client.listCollections?.() || [];
      const collectionDetails: Record<string, any> = {};

      for (const collection of collections) {
        const name = typeof collection === 'string' ? collection : collection.name;
        collectionDetails[name] = await this.getCollectionDetails(name);
      }

      return {
        count: collections.length,
        collections: collectionDetails
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async getStorageDiagnostics(): Promise<Record<string, any>> {
    if (!this.collectionRepository) {
      return { error: 'Storage diagnostics not available - CollectionRepository not provided' };
    }

    try {
      const totalSize = await this.collectionRepository.calculateTotalDatabaseSize?.();
      const breakdown = await this.collectionRepository.getStorageBreakdown?.();
      const efficiency = await this.collectionRepository.getStorageEfficiency?.();
      
      return {
        totalSizeMB: totalSize || 0,
        breakdown: breakdown || {},
        efficiency: efficiency || {}
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async getPerformanceDiagnostics(): Promise<Record<string, any>> {
    // Basic performance metrics
    return {
      memoryUsage: this.getMemoryUsage(),
      timestamp: new Date().toISOString()
    };
  }

  private getMemoryUsage(): Record<string, any> {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      if (memory) {
        return {
          usedJSHeapSize: Math.round(memory.usedJSHeapSize / 1024 / 1024), // MB
          totalJSHeapSize: Math.round(memory.totalJSHeapSize / 1024 / 1024), // MB
          jsHeapSizeLimit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024) // MB
        };
      }
    }
    return { available: false };
  }
}