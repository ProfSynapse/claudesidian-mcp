/**
 * src/database/services/contextual/index.ts
 * 
 * Export barrel for context-aware embedding loading services.
 * These services implement the memory optimization architecture that reduces
 * embedding memory usage from 1.1GB+ to ~50-100MB through contextual loading.
 */

export { RecentFilesTracker, type FilePriority } from './RecentFilesTracker';
export { 
  ContextualEmbeddingManager,
  type MemoryUsageStats,
  type ContextualLoadingResult,
  type EnsureFilesResult
} from './ContextualEmbeddingManager';

// Re-export types that are commonly used together
import { RecentFilesTracker } from './RecentFilesTracker';
import { ContextualEmbeddingManager } from './ContextualEmbeddingManager';

export type ContextualEmbeddingServices = {
  recentFilesTracker: RecentFilesTracker;
  contextualEmbeddingManager: ContextualEmbeddingManager;
};