/**
 * Result type for repair operations
 */
export interface RepairResult {
  success: boolean;
  repairedCollections: string[];
  errors: string[];
}

/**
 * Result type for validation operations
 */
export interface ValidationResult {
  success: boolean;
  validatedCollections: string[];
  errors: string[];
}

/**
 * Interface for diagnostics and repair operations
 * Handles system health checks, repairs, and validation
 */
export interface IDiagnosticsService {
  /**
   * Get comprehensive diagnostics about the vector store
   * @returns Diagnostics information object
   */
  getDiagnostics(): Promise<Record<string, any>>;

  /**
   * Repair and reload collections from storage
   * @returns Result of the repair operation
   */
  repairCollections(): Promise<RepairResult>;

  /**
   * Validate all collections to ensure they're accessible
   * @returns Result of the validation operation
   */
  validateCollections(): Promise<ValidationResult>;

  /**
   * Check if the storage system is healthy
   * @returns true if system is healthy, false otherwise
   */
  isHealthy(): Promise<boolean>;

  /**
   * Get detailed collection information
   * @param collectionName Name of the collection
   * @returns Collection details object
   */
  getCollectionDetails(collectionName: string): Promise<Record<string, any>>;

  /**
   * Perform a basic connectivity test
   * @returns true if connectivity test passes, false otherwise
   */
  testConnectivity(): Promise<boolean>;

  /**
   * Run comprehensive health check
   * @returns Health check results with issues and recommendations
   */
  runHealthCheck(): Promise<{
    isHealthy: boolean;
    issues: string[];
    recommendations: string[];
    severity: 'low' | 'medium' | 'high';
  }>;
}