import { ISizeCalculatorService } from './interfaces/ISizeCalculatorService';
import { IDirectoryService } from './interfaces/IDirectoryService';
import { ICollectionManager } from './interfaces/ICollectionManager';

/**
 * Size calculator service implementation
 * Handles various size metrics and storage analysis
 * Follows SRP - only responsible for size calculations and storage analysis
 */
export class SizeCalculatorService implements ISizeCalculatorService {
  private directoryService: IDirectoryService;
  private collectionManager: ICollectionManager;
  private persistentPath: string | null;

  constructor(
    directoryService: IDirectoryService,
    collectionManager: ICollectionManager,
    persistentPath: string | null = null
  ) {
    this.directoryService = directoryService;
    this.collectionManager = collectionManager;
    this.persistentPath = persistentPath;
  }

  /**
   * Calculate the total database size in MB
   */
  async calculateTotalDatabaseSize(): Promise<number> {
    if (!this.persistentPath) {
      return 0;
    }

    try {
      if (!this.directoryService.directoryExists(this.persistentPath)) {
        return 0;
      }

      return await this.directoryService.calculateDirectorySize(this.persistentPath);
    } catch (error) {
      console.error('Error calculating total database size:', error);
      return 0;
    }
  }

  /**
   * Calculate the size of memory-related collections only
   */
  async calculateMemoryDatabaseSize(): Promise<number> {
    if (!this.persistentPath) {
      return 0;
    }

    try {
      const path = require('path');
      const collectionsDir = path.join(this.persistentPath, 'collections');
      
      if (!this.directoryService.directoryExists(collectionsDir)) {
        return 0;
      }

      return await this.directoryService.calculateMemoryCollectionsSize(collectionsDir);
    } catch (error) {
      console.error('Error calculating memory database size:', error);
      return 0;
    }
  }

  /**
   * Calculate the size of a specific collection
   */
  async calculateCollectionSize(collectionName: string): Promise<number> {
    if (!this.persistentPath) {
      return 0;
    }

    try {
      const path = require('path');
      const collectionsDir = path.join(this.persistentPath, 'collections');
      
      return await this.directoryService.calculateCollectionSize(collectionsDir, collectionName);
    } catch (error) {
      console.error(`Error calculating size for collection ${collectionName}:`, error);
      return 0;
    }
  }

  /**
   * Get storage usage breakdown by collection
   */
  async getStorageBreakdown(): Promise<Record<string, number>> {
    if (!this.persistentPath) {
      return {};
    }

    try {
      const path = require('path');
      const collectionsDir = path.join(this.persistentPath, 'collections');
      
      if (!this.directoryService.directoryExists(collectionsDir)) {
        return {};
      }

      return await this.directoryService.getCollectionSizeBreakdown(collectionsDir);
    } catch (error) {
      console.error('Error getting storage breakdown:', error);
      return {};
    }
  }

  /**
   * Check if database size exceeds a threshold
   */
  async exceedsThreshold(thresholdMB: number): Promise<boolean> {
    try {
      const totalSize = await this.calculateTotalDatabaseSize();
      return totalSize > thresholdMB;
    } catch (error) {
      console.error('Error checking size threshold:', error);
      return false;
    }
  }

  /**
   * Get storage efficiency metrics
   */
  async getStorageEfficiency(): Promise<{
    totalSize: number;
    itemCount: number;
    averageItemSize: number;
    compression: number;
  }> {
    try {
      const totalSize = await this.calculateTotalDatabaseSize();
      const itemCount = await this.getTotalItemCount();
      const averageItemSize = itemCount > 0 ? totalSize / itemCount : 0;
      
      // Calculate compression ratio (compared to theoretical uncompressed size)
      // This is a rough estimate based on average embedding size
      const estimatedUncompressedSize = itemCount * 0.01; // Assume 10KB per item uncompressed
      const compression = estimatedUncompressedSize > 0 ? totalSize / estimatedUncompressedSize : 1;

      return {
        totalSize,
        itemCount,
        averageItemSize,
        compression
      };
    } catch (error) {
      console.error('Error calculating storage efficiency:', error);
      return {
        totalSize: 0,
        itemCount: 0,
        averageItemSize: 0,
        compression: 1
      };
    }
  }

  /**
   * Get size trend over time (if we have historical data)
   */
  async getSizeTrend(days: number = 7): Promise<Record<string, number>> {
    // This would require historical tracking, for now return current size
    const currentSize = await this.calculateTotalDatabaseSize();
    const today = new Date().toISOString().split('T')[0];
    
    return {
      [today]: currentSize
    };
  }

  /**
   * Get collection size ranking
   */
  async getCollectionSizeRanking(): Promise<Array<{ name: string; size: number; percentage: number }>> {
    try {
      const breakdown = await this.getStorageBreakdown();
      const totalSize = Object.values(breakdown).reduce((sum, size) => sum + size, 0);
      
      const ranking = Object.entries(breakdown)
        .map(([name, size]) => ({
          name,
          size,
          percentage: totalSize > 0 ? (size / totalSize) * 100 : 0
        }))
        .sort((a, b) => b.size - a.size);

      return ranking;
    } catch (error) {
      console.error('Error getting collection size ranking:', error);
      return [];
    }
  }

  /**
   * Estimate storage growth rate
   */
  async estimateGrowthRate(): Promise<{
    dailyGrowth: number;
    weeklyGrowth: number;
    monthlyGrowth: number;
  }> {
    // This would require historical tracking
    // For now, return zero growth estimates
    return {
      dailyGrowth: 0,
      weeklyGrowth: 0,
      monthlyGrowth: 0
    };
  }

  /**
   * Get storage optimization suggestions
   */
  async getOptimizationSuggestions(): Promise<string[]> {
    const suggestions: string[] = [];
    
    try {
      const totalSize = await this.calculateTotalDatabaseSize();
      const breakdown = await this.getStorageBreakdown();
      const ranking = await this.getCollectionSizeRanking();

      // Size-based suggestions
      if (totalSize > 1000) { // > 1GB
        suggestions.push('Consider archiving old data to reduce database size');
      }

      if (totalSize > 500) { // > 500MB
        suggestions.push('Consider implementing data pruning strategies');
      }

      // Collection-based suggestions
      if (ranking.length > 0) {
        const largestCollection = ranking[0];
        if (largestCollection.percentage > 70) {
          suggestions.push(`Collection '${largestCollection.name}' takes up ${largestCollection.percentage.toFixed(1)}% of storage - consider optimization`);
        }
      }

      // Check for empty or very small collections
      const emptyCollections = ranking.filter(c => c.size < 0.01); // < 10KB
      if (emptyCollections.length > 0) {
        suggestions.push(`Found ${emptyCollections.length} nearly empty collections that could be cleaned up`);
      }

      // Memory-specific suggestions
      const memorySize = await this.calculateMemoryDatabaseSize();
      const memoryPercentage = totalSize > 0 ? (memorySize / totalSize) * 100 : 0;
      
      if (memoryPercentage > 50) {
        suggestions.push('Memory traces and sessions take up significant space - consider implementing retention policies');
      }

    } catch (error) {
      console.error('Error generating optimization suggestions:', error);
      suggestions.push('Unable to analyze storage for optimization suggestions');
    }

    return suggestions;
  }

  /**
   * Get total item count across all collections
   */
  private async getTotalItemCount(): Promise<number> {
    try {
      const collections = await this.collectionManager.listCollections();
      let totalCount = 0;

      for (const collectionName of collections) {
        try {
          const collection = await this.collectionManager.getOrCreateCollection(collectionName);
          const count = await collection.count();
          totalCount += count;
        } catch (error) {
          // Continue with other collections if one fails
          console.warn(`Failed to count items in collection ${collectionName}:`, error);
        }
      }

      return totalCount;
    } catch (error) {
      console.error('Error getting total item count:', error);
      return 0;
    }
  }

  /**
   * Check if storage needs maintenance
   */
  async needsMaintenance(): Promise<{
    needsMaintenance: boolean;
    reasons: string[];
    severity: 'low' | 'medium' | 'high';
  }> {
    const reasons: string[] = [];
    let severity: 'low' | 'medium' | 'high' = 'low';

    try {
      const totalSize = await this.calculateTotalDatabaseSize();
      const efficiency = await this.getStorageEfficiency();

      // Size checks
      if (totalSize > 2000) { // > 2GB
        reasons.push('Database size exceeds 2GB');
        severity = 'high';
      } else if (totalSize > 1000) { // > 1GB
        reasons.push('Database size exceeds 1GB');
        severity = severity === 'low' ? 'medium' : severity;
      }

      // Efficiency checks
      if (efficiency.compression > 2) {
        reasons.push('Storage compression ratio suggests inefficient storage');
        severity = severity === 'low' ? 'medium' : severity;
      }

      // Item distribution checks
      const ranking = await this.getCollectionSizeRanking();
      if (ranking.length > 0 && ranking[0].percentage > 90) {
        reasons.push('Single collection dominates storage (>90%)');
        severity = severity === 'low' ? 'medium' : severity;
      }

    } catch (error) {
      reasons.push('Unable to analyze storage health');
      severity = 'medium';
    }

    return {
      needsMaintenance: reasons.length > 0,
      reasons,
      severity
    };
  }
}