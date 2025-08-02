import { IDiagnosticsService, RepairResult, ValidationResult } from './interfaces/IDiagnosticsService';
import { IDirectoryService } from './interfaces/IDirectoryService';
import { ICollectionManager } from './interfaces/ICollectionManager';
import { ISizeCalculatorService } from './interfaces/ISizeCalculatorService';
import { ChromaClient } from '../PersistentChromaClient';
import { IStorageOptions } from '../../../interfaces/IStorageOptions';

/**
 * Diagnostics service implementation
 * Handles system health checks, repairs, and validation
 * Follows SRP - only responsible for diagnostics and repair operations
 */
export class DiagnosticsService implements IDiagnosticsService {
  private client: InstanceType<typeof ChromaClient>;
  private directoryService: IDirectoryService;
  private collectionManager: ICollectionManager;
  private sizeCalculatorService: ISizeCalculatorService;
  private config: IStorageOptions;

  constructor(
    client: InstanceType<typeof ChromaClient>,
    directoryService: IDirectoryService,
    collectionManager: ICollectionManager,
    sizeCalculatorService: ISizeCalculatorService,
    config: IStorageOptions
  ) {
    this.client = client;
    this.directoryService = directoryService;
    this.collectionManager = collectionManager;
    this.sizeCalculatorService = sizeCalculatorService;
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
    const result: RepairResult = {
      success: true,
      repairedCollections: [],
      errors: []
    };

    try {
      // Check if client supports repair operations
      if (typeof (this.client as any).repairAndReloadCollections === 'function') {
        const clientResult = await (this.client as any).repairAndReloadCollections();
        
        // Refresh collections after repair
        await this.collectionManager.refreshCollections();
        
        return {
          success: clientResult.errors.length === 0,
          repairedCollections: clientResult.repairedCollections,
          errors: clientResult.errors
        };
      } else {
        // Manual repair process
        return await this.performManualRepair();
      }
    } catch (error) {
      result.success = false;
      result.errors.push(`Repair failed: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }
  }

  /**
   * Validate all collections to ensure they're accessible
   */
  async validateCollections(): Promise<ValidationResult> {
    const result: ValidationResult = {
      success: true,
      validatedCollections: [],
      errors: []
    };

    try {
      // Get all known collections
      await this.collectionManager.refreshCollections();
      const collections = await this.collectionManager.listCollections();
      
      // Validate each collection
      const validationResults = await this.collectionManager.batchValidateCollections(collections);
      
      for (const [collectionName, isValid] of Object.entries(validationResults)) {
        if (isValid) {
          result.validatedCollections.push(collectionName);
        } else {
          result.errors.push(`Collection ${collectionName} failed validation`);
          result.success = false;
        }
      }

      return result;
    } catch (error) {
      result.success = false;
      result.errors.push(`Validation failed: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }
  }

  /**
   * Check if the storage system is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const diagnostics = await this.getDiagnostics();
      
      // Check basic health indicators
      if (diagnostics.status !== 'ok') {
        return false;
      }

      // Check connectivity
      if (!(await this.testConnectivity())) {
        return false;
      }

      // Check storage permissions
      if (diagnostics.storage && !diagnostics.storage.filePermissionsOk) {
        return false;
      }

      // Check if critical collections are accessible
      const criticalCollections = ['file_embeddings', 'memory_traces', 'sessions'];
      for (const collectionName of criticalCollections) {
        if (!(await this.collectionManager.validateCollection(collectionName))) {
          return false;
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get detailed collection information
   */
  async getCollectionDetails(collectionName: string): Promise<Record<string, any>> {
    try {
      const collection = await this.collectionManager.getOrCreateCollection(collectionName);
      const itemCount = await collection.count();
      const size = await this.sizeCalculatorService.calculateCollectionSize(collectionName);
      
      const details: Record<string, any> = {
        name: collectionName,
        itemCount,
        sizeInMB: size,
        isHealthy: await this.collectionManager.validateCollection(collectionName)
      };

      // Get metadata if available
      if (collection.metadata) {
        try {
          details.metadata = collection.metadata;
        } catch (metadataError) {
          details.metadataError = 'Unable to retrieve metadata';
        }
      }

      return details;
    } catch (error) {
      return {
        name: collectionName,
        error: error instanceof Error ? error.message : String(error),
        isHealthy: false
      };
    }
  }

  /**
   * Perform a basic connectivity test
   */
  async testConnectivity(): Promise<boolean> {
    try {
      // Try a simple heartbeat operation
      await this.client.heartbeat();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get basic system diagnostics
   */
  private async getBasicDiagnostics(): Promise<Record<string, any>> {
    return {
      initialized: true,
      storageMode: this.config.inMemory ? 'in-memory' : 'persistent',
      persistentPath: this.config.persistentPath || 'none',
      connectivity: await this.testConnectivity()
    };
  }

  /**
   * Get collection-specific diagnostics
   */
  private async getCollectionDiagnostics(): Promise<Record<string, any>> {
    try {
      const collections = await this.collectionManager.listCollections();
      const collectionDetails: Array<Record<string, any>> = [];
      
      for (const collectionName of collections) {
        const details = await this.getCollectionDetails(collectionName);
        collectionDetails.push(details);
      }

      const cacheStats = this.collectionManager.getCacheStats();

      return {
        totalCollections: collections.length,
        collections: collectionDetails,
        cache: cacheStats
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get storage-specific diagnostics
   */
  private async getStorageDiagnostics(): Promise<Record<string, any>> {
    if (this.config.inMemory || !this.config.persistentPath) {
      return {
        mode: 'in-memory',
        persistent: false
      };
    }

    try {
      const dataDirectoryExists = await this.directoryService.directoryExists(this.config.persistentPath);
      const filePermissionsOk = dataDirectoryExists ? 
        await this.directoryService.validateDirectoryPermissions(this.config.persistentPath) : false;
      
      const totalSize = await this.sizeCalculatorService.calculateTotalDatabaseSize();
      const memorySize = await this.sizeCalculatorService.calculateMemoryDatabaseSize();
      const storageBreakdown = await this.sizeCalculatorService.getStorageBreakdown();
      const efficiency = await this.sizeCalculatorService.getStorageEfficiency();

      return {
        mode: 'persistent',
        persistent: true,
        dataDirectoryExists,
        filePermissionsOk,
        totalSizeMB: totalSize,
        memorySizeMB: memorySize,
        breakdown: storageBreakdown,
        efficiency
      };
    } catch (error) {
      return {
        mode: 'persistent',
        persistent: true,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get performance diagnostics
   */
  private async getPerformanceDiagnostics(): Promise<Record<string, any>> {
    try {
      const startTime = Date.now();
      
      // Test basic operations
      const connectivityTest = await this.testConnectivity();
      const connectivityTime = Date.now() - startTime;

      // Test collection listing
      const listStart = Date.now();
      const collections = await this.collectionManager.listCollections();
      const listTime = Date.now() - listStart;

      // Cache performance
      const cacheStats = this.collectionManager.getCacheStats();

      return {
        connectivityTestMs: connectivityTime,
        collectionListMs: listTime,
        totalCollections: collections.length,
        cacheHitRate: cacheStats.hitRate,
        cacheSize: cacheStats.size
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Perform manual repair process
   */
  private async performManualRepair(): Promise<RepairResult> {
    const result: RepairResult = {
      success: true,
      repairedCollections: [],
      errors: []
    };

    try {
      // Clear cache to force fresh connections
      this.collectionManager.clearCache();
      
      // Refresh collections from storage
      await this.collectionManager.refreshCollections();
      
      // Validate all collections
      const collections = await this.collectionManager.listCollections();
      const validationResults = await this.collectionManager.batchValidateCollections(collections);
      
      for (const [collectionName, isValid] of Object.entries(validationResults)) {
        if (isValid) {
          result.repairedCollections.push(collectionName);
        } else {
          result.errors.push(`Failed to repair collection: ${collectionName}`);
          result.success = false;
        }
      }

      return result;
    } catch (error) {
      result.success = false;
      result.errors.push(`Manual repair failed: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }
  }

  /**
   * Run comprehensive health check
   */
  async runHealthCheck(): Promise<{
    isHealthy: boolean;
    issues: string[];
    recommendations: string[];
    severity: 'low' | 'medium' | 'high';
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let severity: 'low' | 'medium' | 'high' = 'low';

    try {
      // Test connectivity
      if (!(await this.testConnectivity())) {
        issues.push('Database connectivity test failed');
        recommendations.push('Check database configuration and network connectivity');
        severity = 'high';
      }

      // Check storage health
      if (!this.config.inMemory && this.config.persistentPath) {
        if (!this.directoryService.directoryExists(this.config.persistentPath)) {
          issues.push('Persistent storage directory does not exist');
          recommendations.push('Verify storage path configuration');
          severity = 'high';
        } else if (!this.directoryService.validateDirectoryPermissions(this.config.persistentPath)) {
          issues.push('Insufficient storage permissions');
          recommendations.push('Check file system permissions for storage directory');
          severity = 'high';
        }
      }

      // Check collection health
      const validationResult = await this.validateCollections();
      if (!validationResult.success) {
        issues.push(`${validationResult.errors.length} collections failed validation`);
        recommendations.push('Run collection repair operation');
        severity = severity === 'low' ? 'medium' : severity;
      }

      // Check storage size
      const totalSize = await this.sizeCalculatorService.calculateTotalDatabaseSize();
      if (totalSize > 2000) { // > 2GB
        issues.push('Database size exceeds 2GB');
        recommendations.push('Consider implementing data archival or pruning strategies');
        severity = severity === 'low' ? 'medium' : severity;
      }

      return {
        isHealthy: issues.length === 0,
        issues,
        recommendations,
        severity
      };
    } catch (error) {
      return {
        isHealthy: false,
        issues: [`Health check failed: ${error instanceof Error ? error.message : String(error)}`],
        recommendations: ['Review system logs and configuration'],
        severity: 'high'
      };
    }
  }
}