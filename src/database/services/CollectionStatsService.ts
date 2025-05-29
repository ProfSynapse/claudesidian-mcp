import { IVectorStore } from '../interfaces/IVectorStore';
import { CollectionStats, CollectionStat } from '../interfaces/IUsageStatsService';
import { EventManager } from '../../services/EventManager';

/**
 * Service for managing collection statistics
 * Handles vector store collection counts, database size, and related metrics
 */
export class CollectionStatsService {
  private vectorStore: IVectorStore;
  private eventManager: EventManager;

  // Color palette for collection stats
  private colors = [
    '#4285F4', '#EA4335', '#FBBC05', '#34A853', // Google colors
    '#3498DB', '#E74C3C', '#2ECC71', '#F39C12', // Flat UI colors
    '#9B59B6', '#1ABC9C', '#D35400', '#C0392B', // More colors
    '#8E44AD', '#16A085', '#27AE60', '#E67E22', // Additional colors
    '#2980B9', '#F1C40F', '#7D3C98', '#2C3E50', // Even more colors
    '#1E8449', '#922B21', '#1F618D', '#F4D03F', // Deep colors
    '#5499C7', '#CD6155', '#52BE80', '#F5B041', // Pastel variations
    '#6C3483', '#117A65', '#A04000', '#839192', // Dark variations
    '#85C1E9', '#EC7063', '#ABEBC6', '#FAD7A0', // Light variations
    '#BB8FCE', '#76D7C4', '#F0B27A', '#BFC9CA'  // Soft variations
  ];

  constructor(vectorStore: IVectorStore, eventManager: EventManager) {
    this.vectorStore = vectorStore;
    this.eventManager = eventManager;
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(): Promise<CollectionStats> {
    try {
      // Check if vector store is initialized
      if (!this.vectorStore || !(this.vectorStore as any).initialized) {
        console.log('Vector store not initialized, returning default stats');
        return this.getDefaultStats();
      }

      // Get diagnostics for collection stats
      const diagnostics = await this.vectorStore.getDiagnostics();
      console.log('Vector store diagnostics:', diagnostics);

      const stats: CollectionStats = {
        totalEmbeddings: 0,
        dbSizeMB: diagnostics.dbSizeMB || 0,
        lastIndexedDate: '',
        indexingInProgress: false,
        collectionStats: []
      };

      // Check for collections data in diagnostics
      if (diagnostics.collections && diagnostics.collections.length > 0) {
        let totalEmbeddings = 0;
        
        diagnostics.collections.forEach((collection: any, index: number) => {
          if (collection.name && collection.itemCount !== undefined) {
            stats.collectionStats.push({
              name: collection.name,
              count: collection.itemCount,
              color: this.colors[index % this.colors.length]
            });
            totalEmbeddings += collection.itemCount;
          }
        });
        
        stats.totalEmbeddings = totalEmbeddings;
        console.log('Updated stats with collection data, total embeddings:', stats.totalEmbeddings);
      } else {
        // Fallback to manual collection stats gathering
        await this.getManualCollectionStats(stats);
      }

      return stats;
    } catch (error) {
      console.error('Error getting collection stats:', error);
      return this.getDefaultStats();
    }
  }

  /**
   * Manually gather collection statistics
   */
  private async getManualCollectionStats(stats: CollectionStats): Promise<void> {
    try {
      const collections = await this.vectorStore.listCollections();
      console.log('Found collections:', collections);
      
      if (!collections || collections.length === 0) {
        console.log('No collections found');
        return;
      }
      
      stats.collectionStats = [];
      let totalEmbeddings = 0;
      
      // Get count for each collection
      for (let i = 0; i < collections.length; i++) {
        const name = collections[i];
        try {
          const count = await this.vectorStore.count(name);
          stats.collectionStats.push({
            name,
            count,
            color: this.colors[i % this.colors.length]
          });
          totalEmbeddings += count;
        } catch (countError) {
          console.error(`Error getting count for collection ${name}:`, countError);
        }
      }
      
      stats.totalEmbeddings = totalEmbeddings;
      console.log('Updated stats with manual collection data, total embeddings:', stats.totalEmbeddings);
    } catch (error) {
      console.error('Error getting manual collection stats:', error);
    }
  }

  /**
   * Update collection statistics with new data
   */
  async updateCollectionStats(updates: Partial<CollectionStats>): Promise<void> {
    // This would typically update any cached collection stats
    // For now, we just emit an event that stats have changed
    this.eventManager.emit('collection-stats-updated', updates);
  }

  /**
   * Force refresh of collection cache
   */
  async refreshCollectionCache(): Promise<void> {
    try {
      // Force a complete cache reset if vector store supports it
      if (this.vectorStore && typeof (this.vectorStore as any).refreshCollections === 'function') {
        await (this.vectorStore as any).refreshCollections();
        console.log('Successfully refreshed vector store collections');
      }
    } catch (error) {
      console.error('Error refreshing collection cache:', error);
    }
  }

  /**
   * Get default collection statistics
   */
  private getDefaultStats(): CollectionStats {
    return {
      totalEmbeddings: 0,
      dbSizeMB: 0,
      lastIndexedDate: '',
      indexingInProgress: false,
      collectionStats: []
    };
  }
}
