/**
 * Location: /src/database/providers/chroma/types/ChromaTypes.ts
 * 
 * Consolidated type definitions for the ChromaDB provider.
 * This file consolidates interfaces and types that were previously scattered across multiple interface files.
 * Used by all ChromaDB provider services to ensure type consistency and reduce file complexity.
 */

// ============================================================================
// CORE DATABASE TYPES
// ============================================================================

/**
 * Core database item structure used throughout ChromaDB operations
 */
export interface DatabaseItem {
  id: string;
  embedding: number[];
  metadata: Record<string, any>;
  document: string;
}

/**
 * Where clause interface for filtering operations
 */
export interface WhereClause {
  [key: string]: any;
}

/**
 * Collection data structure for in-memory operations
 */
export interface CollectionData {
  items: Map<string, DatabaseItem>;
  metadata: Record<string, any>;
}

/**
 * Item with calculated distance for similarity searches
 */
export interface ItemWithDistance {
  item: DatabaseItem;
  distance: number;
}

/**
 * Standard include types for vector store compatibility
 */
export type StoreIncludeType = 'embeddings' | 'metadatas' | 'documents' | 'distances';

// ============================================================================
// DIRECTORY SERVICE TYPES
// ============================================================================

/**
 * Directory service interface - will be merged into PersistenceManager
 */
export interface IDirectoryService {
  ensureDirectoryExists(path: string): Promise<void>;
  calculateDirectorySize(directoryPath: string): Promise<number>;
  validateDirectoryPermissions(path: string): Promise<boolean>;
  directoryExists(path: string): Promise<boolean>;
  readDirectory(path: string): Promise<string[]>;
  getStats(path: string): Promise<any>;
  calculateMemoryCollectionsSize(collectionsPath: string): Promise<number>;
  calculateCollectionSize(collectionsPath: string, collectionName: string): Promise<number>;
  getCollectionSizeBreakdown(collectionsPath: string): Promise<Record<string, number>>;
  fileExists(filePath: string): Promise<boolean>;
  readFile(filePath: string, encoding?: string): Promise<string>;
}

// ============================================================================
// SIZE CALCULATOR TYPES
// ============================================================================

/**
 * Storage efficiency metrics for size analysis
 */
export interface StorageEfficiency {
  totalSize: number;
  itemCount: number;
  averageItemSize: number;
  compression: number;
}

/**
 * Size calculator service interface - will be merged into CollectionRepository
 */
export interface ISizeCalculatorService {
  calculateTotalDatabaseSize(): Promise<number>;
  calculateMemoryDatabaseSize(): Promise<number>;
  calculateCollectionSize(collectionName: string): Promise<number>;
  getStorageBreakdown(): Promise<Record<string, number>>;
  exceedsThreshold(thresholdMB: number): Promise<boolean>;
  getStorageEfficiency(): Promise<StorageEfficiency>;
}

// ============================================================================
// DIAGNOSTICS TYPES
// ============================================================================

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
 * Health check results with comprehensive analysis
 */
export interface HealthCheckResult {
  isHealthy: boolean;
  issues: string[];
  recommendations: string[];
  severity: 'low' | 'medium' | 'high';
}

/**
 * Diagnostics service interface - will be moved to monitoring layer
 */
export interface IDiagnosticsService {
  getDiagnostics(): Promise<Record<string, any>>;
  repairCollections(): Promise<RepairResult>;
  validateCollections(): Promise<ValidationResult>;
  isHealthy(): Promise<boolean>;
  getCollectionDetails(collectionName: string): Promise<Record<string, any>>;
  testConnectivity(): Promise<boolean>;
  runHealthCheck(): Promise<HealthCheckResult>;
}

// ============================================================================
// CLIENT FACTORY TYPES
// ============================================================================

/**
 * Client factory interface for ChromaDB client creation
 */
export interface IChromaClientFactory {
  createClient(options: any): Promise<any>; // Using 'any' to match existing implementation - takes IStorageOptions and returns Promise
  validateClientConfiguration(config: any): boolean;
  validateConfiguration(config?: any): boolean; // Method referenced in VectorStoreInitializer - may take config parameter
  getClientVersion(): string;
  getStoragePath(config?: any): string; // Method referenced in VectorStoreInitializer - may take config parameter
}

// ============================================================================
// COLLECTION MANAGER TYPES
// ============================================================================

/**
 * Collection manager interface for collection lifecycle management
 */
export interface ICollectionManager {
  ensureCollection(name: string, metadata?: Record<string, any>): Promise<any>;
  createCollection(name: string, metadata?: Record<string, any>, contextAware?: boolean): Promise<void>;
  deleteCollection(name: string): Promise<void>;
  listCollections(): Promise<string[]>;
  getCollectionMetadata(name: string): Promise<Record<string, any>>;
  collectionExists(name: string): Promise<boolean>;
  hasCollection(name: string): Promise<boolean>;
  getOrCreateCollection(name: string, contextAware?: boolean): Promise<any>;
  registerCollection(name: string, collection?: any): void; // Method referenced in VectorStoreInitializer - may take collection parameter
  setPathManager(pathManager: any): void; // Method referenced in ServiceCoordinator
  clearCache(): void; // Method referenced in ServiceCoordinator
}

// ============================================================================
// VECTOR CALCULATIONS
// ============================================================================

/**
 * Distance calculation methods for vector similarity
 */
export enum DistanceMethod {
  COSINE = 'cosine',
  EUCLIDEAN = 'euclidean',
  MANHATTAN = 'manhattan'
}

/**
 * Vector similarity calculation result
 */
export interface SimilarityResult {
  distance: number;
  similarity: number;
  method: DistanceMethod;
}