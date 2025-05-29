/**
 * File operation types
 */
export type FileOperation = 'create' | 'modify' | 'delete';

/**
 * File event structure for unified processing
 */
export interface FileEvent {
  path: string;
  operation: FileOperation;
  timestamp: number;
  isSystemOperation: boolean;
  source: 'vault' | 'manual';
  priority: 'high' | 'normal' | 'low';
}

/**
 * Processing result for a file
 */
export interface ProcessingResult {
  success: boolean;
  embeddingCreated?: boolean;
  activityRecorded?: boolean;
  error?: string;
}

/**
 * Embedding strategy configuration
 */
export interface EmbeddingStrategy {
  type: 'manual' | 'idle' | 'startup';
  idleTimeThreshold: number;
  batchSize: number;
  processingDelay: number;
}

/**
 * File event manager configuration
 */
export interface FileEventManagerConfig {
  embeddingStrategy: EmbeddingStrategy;
  excludePaths: string[];
  activityRateLimit: number;
  cacheExpiry: number;
}