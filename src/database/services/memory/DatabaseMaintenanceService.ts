import { IVectorStore } from '../../interfaces/IVectorStore';
import { MemoryTraceCollection } from '../../collections/MemoryTraceCollection';
import { SessionCollection } from '../../collections/SessionCollection';

export type PruningStrategy = 'oldest' | 'least-used' | 'manual';

export interface DatabaseMaintenanceSettings {
  /** Maximum database size in MB (always 500MB) */
  maxDbSize?: number;
  /** Strategy for pruning data when over limit (always 'oldest') */
  pruningStrategy?: PruningStrategy;
}

/**
 * Service responsible for database size management and maintenance operations.
 * Handles database size enforcement, pruning strategies, and cleanup operations.
 * 
 * @remarks
 * This service follows the Single Responsibility Principle by focusing solely
 * on database maintenance concerns. It provides configurable pruning strategies
 * and monitors database size to prevent excessive memory usage.
 */
export class DatabaseMaintenanceService {
  /**
   * Creates a new DatabaseMaintenanceService instance
   * @param vectorStore - Vector store instance to monitor and maintain
   * @param memoryTraces - Memory traces collection for pruning operations
   * @param sessions - Sessions collection for pruning operations
   * @param settings - Database maintenance settings
   */
  constructor(
    private readonly vectorStore: IVectorStore,
    private readonly memoryTraces: MemoryTraceCollection,
    private readonly sessions: SessionCollection,
    private readonly settings: DatabaseMaintenanceSettings = {}
  ) {}

  /**
   * Check if the memory database is within configured size limits
   * @returns Promise resolving to true if within limits, false if over limit
   * 
   * @example
   * ```typescript
   * const isWithinLimits = await maintenanceService.isWithinSizeLimit();
   * if (!isWithinLimits) {
   *   await maintenanceService.enforceDbSizeLimit();
   * }
   * ```
   */
  async isWithinSizeLimit(): Promise<boolean> {
    try {
      const diagnostics = await this.vectorStore.getDiagnostics();
      const currentSize = diagnostics.memoryDbSizeMB || 0;
      const maxSize = 500; // Fixed at 500MB, no user configuration needed
      
      console.log(`Memory database size: ${currentSize.toFixed(2)} MB / ${maxSize} MB`);
      return currentSize <= maxSize;
    } catch (error) {
      console.error('Error checking memory database size:', error);
      return true; // Allow operation if we can't check
    }
  }

  /**
   * Enforce database size limits by applying the configured pruning strategy.
   * Only prunes data if the database exceeds the configured size limit.
   * 
   * @returns Promise that resolves when size enforcement is complete
   * 
   * @remarks
   * This method supports three pruning strategies:
   * - 'oldest': Removes the oldest 10% of entries
   * - 'least-used': Removes least accessed entries (falls back to oldest for now)
   * - 'manual': Logs warning but takes no action
   */
  async enforceDbSizeLimit(): Promise<void> {
    try {
      if (await this.isWithinSizeLimit()) {
        return; // Within limits, no action needed
      }
      
      console.log('Memory database over limit, applying automatic pruning (oldest entries first)');
      
      // Always prune oldest entries - no user configuration needed
      await this.pruneOldestEntries();
    } catch (error) {
      console.error('Error enforcing database size limit:', error);
    }
  }

  /**
   * Prune the oldest entries to free up database space.
   * Removes approximately 10% of the oldest memory traces and sessions.
   * 
   * @returns Promise that resolves when pruning is complete
   * 
   * @remarks
   * This method:
   * - Sorts entries by timestamp/creation date in ascending order
   * - Removes the oldest 10% of memory traces
   * - Removes the oldest 10% of sessions
   * - Logs the number of entries removed
   */
  async pruneOldestEntries(): Promise<void> {
    try {
      console.log('Pruning oldest memory entries...');
      
      // Delete oldest memory traces
      const memoryTraces = await this.memoryTraces.getAll({ sortBy: 'timestamp', sortOrder: 'asc' });
      
      // Remove oldest 10% of traces
      const tracesToRemove = Math.ceil(memoryTraces.length * 0.1);
      if (tracesToRemove > 0) {
        const tracesToDelete = memoryTraces.slice(0, tracesToRemove);
        const traceIds = tracesToDelete.map((trace: any) => trace.id);
        if (traceIds.length > 0) {
          await this.memoryTraces.deleteBatch(traceIds);
        }
      }
      
      // Delete oldest sessions
      const sessions = await this.sessions.getAll({ sortBy: 'created', sortOrder: 'asc' });
      
      // Remove oldest 10% of sessions
      const sessionsToRemove = Math.ceil(sessions.length * 0.1);
      if (sessionsToRemove > 0) {
        const sessionsToDelete = sessions.slice(0, sessionsToRemove);
        const sessionIds = sessionsToDelete.map((session: any) => session.id);
        if (sessionIds.length > 0) {
          await this.sessions.deleteBatch(sessionIds);
        }
      }
      
      console.log(`Pruned ${tracesToRemove} memory traces and ${sessionsToRemove} sessions`);
    } catch (error) {
      console.error('Error pruning oldest entries:', error);
    }
  }

  /**
   * Prune least used entries to free up database space.
   * Currently falls back to oldest entries pruning since usage tracking
   * is not yet implemented.
   * 
   * @returns Promise that resolves when pruning is complete
   * 
   * @todo Implement usage tracking for more sophisticated pruning
   */
  async pruneLeastUsedEntries(): Promise<void> {
    try {
      console.log('Pruning least used memory entries...');
      
      // For now, fall back to oldest entries since we don't track usage
      // TODO: Implement usage tracking for more sophisticated pruning
      await this.pruneOldestEntries();
    } catch (error) {
      console.error('Error pruning least used entries:', error);
    }
  }

  /**
   * Get current database size and usage statistics
   * @returns Promise resolving to database diagnostics
   */
  async getDatabaseStats(): Promise<{
    currentSizeMB: number;
    maxSizeMB: number;
    utilizationPercent: number;
    withinLimits: boolean;
  }> {
    try {
      const diagnostics = await this.vectorStore.getDiagnostics();
      const currentSizeMB = diagnostics.memoryDbSizeMB || 0;
      const maxSizeMB = this.settings.maxDbSize || 500;
      const utilizationPercent = (currentSizeMB / maxSizeMB) * 100;
      const withinLimits = currentSizeMB <= maxSizeMB;

      return {
        currentSizeMB,
        maxSizeMB,
        utilizationPercent,
        withinLimits
      };
    } catch (error) {
      console.error('Error getting database stats:', error);
      throw error;
    }
  }
}